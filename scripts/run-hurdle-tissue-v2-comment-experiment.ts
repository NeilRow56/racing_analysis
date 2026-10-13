import { writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { settleSelection } from "@/lib/racing/backtest";
import { loadBacktestFeatureCache } from "@/lib/racing/backtest-cache";
import type { HistoricalPreRaceFeatureRow, HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import { JUMP_TISSUE_MODEL_PATH, JUMP_TISSUE_VERSION, loadJumpTissueModel } from "@/lib/racing/jump-tissue-model";
import { classifyHandicapStatus } from "@/lib/racing/research-rule";
import {
  COMMENT_FEATURE_NAMES,
  COMMENT_NAMES,
  COMMENT_PATTERNS,
  commentVector,
  loadHistoricalComments,
  priorCommentsForTarget,
  raceSoftmax,
  type HistoricalComment,
  type Model,
} from "./diagnose-independent-tissue-feasibility";

const MARKDOWN_OUTPUT = "/tmp/hurdle-tissue-v2-comment-experiment.md";
const JSON_OUTPUT = "/tmp/hurdle-tissue-v2-comment-experiment.json";
const YEARS = ["2025", "2026"] as const;
const PERIODS = ["2025", "2026", "combined"] as const;
const CANDIDATES = ["CONTROL", "EXCUSE_HALF", "EXCUSE_ZERO", "ALL_COMMENTS_ZERO"] as const;
const PRICE_BANDS = [
  { label: "<4/1", min: 0, max: 5, minInclusive: true, maxInclusive: false },
  { label: "4/1 to <8/1", min: 5, max: 9, minInclusive: true, maxInclusive: false },
  { label: "8/1 to <=14/1", min: 9, max: 15, minInclusive: true, maxInclusive: true },
  { label: ">14/1 to 20/1", min: 15, max: 21, minInclusive: false, maxInclusive: true },
  { label: ">20/1 to 33/1", min: 21, max: 34, minInclusive: false, maxInclusive: true },
  { label: ">33/1 to 50/1", min: 34, max: 51, minInclusive: false, maxInclusive: true },
  { label: ">50/1", min: 51, max: Number.POSITIVE_INFINITY, minInclusive: false, maxInclusive: false },
] as const;

type Year = typeof YEARS[number];
type CandidateId = typeof CANDIDATES[number];
type CommentFamily = "positive_performance" | "running_style" | "adverse_excuse" | "negative_finish" | "equipment_context" | "volume";

type RunnerBase = {
  year: Year;
  raceId: string;
  runnerId: string;
  horseName: string;
  raceDate: string;
  courseName: string;
  raceName: string | null;
  sp: number;
  won: boolean;
  finalSpProfitLoss: number;
  rawInputs: number[];
  contributions: number[];
};

type RaceBase = {
  year: Year;
  raceId: string;
  raceDate: string;
  courseName: string;
  raceName: string | null;
  runners: RunnerBase[];
};

type RunnerEval = RunnerBase & {
  probability: number;
  rank: number;
  rawScore: number;
  removedExcuseContribution: number;
  removedAllCommentContribution: number;
};

type RaceEval = Omit<RaceBase, "runners"> & {
  runners: RunnerEval[];
};

type CandidateEvaluation = {
  id: CandidateId;
  description: string;
  races: RaceEval[];
  primary2026: ReturnType<typeof primaryMetrics>;
  longPrice2026: ReturnType<typeof runnerSummary>;
  rankOneLong: Array<ReturnType<typeof rankOneLongSummary> & { period: Year | "combined" }>;
  ordinaryRankOne: ReturnType<typeof ordinaryRankOneSummary>;
  priceBands2026: Array<ReturnType<typeof runnerSummary> & { band: string }>;
  winnerRanking: Array<ReturnType<typeof winnerRankDistribution> & { period: Year | "combined" }>;
  value: Array<ReturnType<typeof valueSummary> & { band: "all Hurdles" | "SP <=14/1" | "SP >14/1" }>;
  rankChanges: ReturnType<typeof rankChanges>;
};

type Report = {
  generatedAt: string;
  model: { version: typeof JUMP_TISSUE_VERSION; path: typeof JUMP_TISSUE_MODEL_PATH; checksum: string; featureCount: number };
  source: string;
  chronology: string;
  contributionMethod: string;
  commentFeatureFamilies: Record<CommentFamily, string[]>;
  adverseExcuseFeatures: string[];
  candidateDescriptions: Record<CandidateId, string>;
  population: { races: number; runners: number; byYear: Record<Year, { races: number; runners: number }> };
  evaluations: CandidateEvaluation[];
  originalLongRankOneIds: Record<Year | "combined", string[]>;
  longshotPromotions: ReturnType<typeof longshotPromotions>;
  exampleRaces: ReturnType<typeof exampleRaces>;
  interpretation: ReturnType<typeof interpretation>;
};

async function main() {
  const model = await loadJumpTissueModel(JUMP_TISSUE_MODEL_PATH);
  const caches = await Promise.all(YEARS.map((year) => loadBacktestFeatureCache({ from: `${year}-01-01`, to: `${year}-12-31`, family: "jump" })));
  if (caches.some((cache) => cache === null)) throw new Error("Missing compatible 2025/2026 jump backtest caches");

  const connection = createDbConnection();
  let comments: Map<string, HistoricalComment[]>;
  try {
    comments = await loadHistoricalComments(connection.client);
  } finally {
    await connection.client.end();
  }

  const commentFeatureFamilies = buildCommentFeatureFamilies();
  const adverseExcuseFeatures = commentFeatureFamilies.adverse_excuse;
  const adverseIndexes = indexesFor(model.model.names, adverseExcuseFeatures);
  const commentIndexes = indexesFor(model.model.names, [...COMMENT_FEATURE_NAMES]);
  const races = buildHurdleRaces(caches.flatMap((cache) => cache!.rows), comments, model.model);
  const initialEvaluations = CANDIDATES.map((candidate) => evaluateCandidate(candidate, races, model.model, adverseIndexes, commentIndexes));
  const evaluations = withOriginalCeaseRankOne(initialEvaluations);
  const control = evaluations.find((candidate) => candidate.id === "CONTROL")!;
  const originalLongRankOneIds = Object.fromEntries(PERIODS.map((period) => [period, longRankOneRunners(control.races, period).map((runner) => runner.runnerId)])) as Record<Year | "combined", string[]>;
  const report: Report = {
    generatedAt: new Date().toISOString(),
    model: { version: JUMP_TISSUE_VERSION, path: JUMP_TISSUE_MODEL_PATH, checksum: model.checksum, featureCount: model.model.names.length },
    source: "Frozen Jump Tissue v1 over 2025/2026 backtest_features_v4 Sporting Life jump caches; Hurdle races only; final SP used only for diagnostics/value segmentation.",
    chronology: "2025 Hurdles are development/context. Candidate definitions are pre-set; no candidate choices are fitted to 2026 outcomes. 2026 Hurdles are untouched holdout evaluation.",
    contributionMethod: "Exact linear raw-score contribution adjustment: ((raw - frozen mean) / frozen scale) * frozen coefficient. Adjusted race probabilities are rebuilt by softmax from adjusted raw scores.",
    commentFeatureFamilies,
    adverseExcuseFeatures,
    candidateDescriptions: Object.fromEntries(CANDIDATES.map((candidate) => [candidate, candidateDescription(candidate)])) as Record<CandidateId, string>,
    population: {
      races: races.length,
      runners: races.reduce((sum, race) => sum + race.runners.length, 0),
      byYear: Object.fromEntries(YEARS.map((year) => [year, {
        races: races.filter((race) => race.year === year).length,
        runners: races.filter((race) => race.year === year).reduce((sum, race) => sum + race.runners.length, 0),
      }])) as Record<Year, { races: number; runners: number }>,
    },
    evaluations,
    originalLongRankOneIds,
    longshotPromotions: longshotPromotions(evaluations, adverseIndexes, commentIndexes, model.model.names),
    exampleRaces: exampleRaces(evaluations, adverseIndexes, commentIndexes, model.model.names),
    interpretation: interpretation(evaluations),
  };

  await writeFile(JSON_OUTPUT, `${JSON.stringify(stripRacePayload(report), null, 2)}\n`, "utf8");
  await writeFile(MARKDOWN_OUTPUT, markdown(report), "utf8");
  printTerminalSummary(report);
}

function buildHurdleRaces(rows: HistoricalTargetRunnerMetricsRow[], commentsByHorse: Map<string, HistoricalComment[]>, model: Model): RaceBase[] {
  const byRace = groupBy(rows.filter((row) => row.features.raceCode === "jump" && classifyJumpRaceSubtype(row.features) === "hurdle"), (row) => row.features.targetRaceId);
  const races: RaceBase[] = [];
  for (const [raceId, raceRows] of byRace) {
    const active = raceRows.filter((row) => settleSelection({ ...row.outcome, startingPriceDecimal: "2" }) !== null);
    const settlements = active.map((row) => settleSelection(row.outcome));
    const expected = active[0]?.features.actualRunnerCount;
    if (
      active.length < 2 ||
      settlements.some((settlement) => settlement === null) ||
      expected == null ||
      (expected !== active.length && expected !== raceRows.length) ||
      active.filter((row) => row.outcome.won === true || row.outcome.finishingPosition === 1).length !== 1
    ) continue;
    const runners = active.map((row, index) => {
      const rawInputs = [...numericVector(row.features), ...commentVector(priorCommentsForTarget(commentsByHorse.get(row.features.horseId) ?? [], row.features.raceDateTime))];
      return {
        year: row.features.raceDate.slice(0, 4) as Year,
        raceId,
        runnerId: row.features.targetRunnerId,
        horseName: row.features.horseName,
        raceDate: row.features.raceDate,
        courseName: row.features.courseName,
        raceName: row.features.raceName,
        sp: settlements[index]!.settlementOddsDecimal,
        won: row.outcome.won === true || row.outcome.finishingPosition === 1,
        finalSpProfitLoss: settlements[index]!.profitLoss,
        rawInputs,
        contributions: contributionVector(model, rawInputs),
      };
    });
    races.push({ year: runners[0]!.year, raceId, raceDate: runners[0]!.raceDate, courseName: runners[0]!.courseName, raceName: runners[0]!.raceName, runners });
  }
  return races;
}

function evaluateCandidate(candidate: CandidateId, races: RaceBase[], model: Model, adverseIndexes: number[], commentIndexes: number[]): CandidateEvaluation {
  const evaluated = races.map((race): RaceEval => {
    const scores = race.runners.map((runner) => adjustedScore(candidate, runner.contributions, adverseIndexes, commentIndexes));
    const probabilities = raceSoftmax(scores);
    const order = [...race.runners.keys()].sort((left, right) => probabilities[right]! - probabilities[left]! || race.runners[left]!.runnerId.localeCompare(race.runners[right]!.runnerId));
    const ranks = new Map(order.map((index, position) => [race.runners[index]!.runnerId, position + 1]));
    return {
      ...race,
      runners: race.runners.map((runner, index) => ({
        ...runner,
        probability: probabilities[index]!,
        rank: ranks.get(runner.runnerId)!,
        rawScore: scores[index]!,
        removedExcuseContribution: removedContribution(candidate, runner.contributions, adverseIndexes),
        removedAllCommentContribution: candidate === "ALL_COMMENTS_ZERO" ? sum(commentIndexes.map((feature) => runner.contributions[feature]!)) : 0,
      })),
    };
  });
  return {
    id: candidate,
    description: candidateDescription(candidate),
    races: evaluated,
    primary2026: primaryMetrics(evaluated.filter((race) => race.year === "2026")),
    longPrice2026: runnerSummary(evaluated.filter((race) => race.year === "2026").flatMap((race) => race.runners).filter((runner) => isLongPrice(runner.sp))),
    rankOneLong: PERIODS.map((period) => ({ period, ...rankOneLongSummary(evaluated, period) })),
    ordinaryRankOne: ordinaryRankOneSummary(evaluated),
    priceBands2026: PRICE_BANDS.map((band) => ({ band: band.label, ...runnerSummary(evaluated.filter((race) => race.year === "2026").flatMap((race) => race.runners).filter((runner) => inPriceBand(runner.sp, band))) })),
    winnerRanking: PERIODS.map((period) => ({ period, ...winnerRankDistribution(evaluated, period) })),
    value: [
      { band: "all Hurdles" as const, ...valueSummary(evaluated.flatMap((race) => rankOneValueSelections(race))) },
      { band: "SP <=14/1" as const, ...valueSummary(evaluated.flatMap((race) => rankOneValueSelections(race)).filter((runner) => !isLongPrice(runner.sp))) },
      { band: "SP >14/1" as const, ...valueSummary(evaluated.flatMap((race) => rankOneValueSelections(race)).filter((runner) => isLongPrice(runner.sp))) },
    ],
    rankChanges: rankChanges(evaluated, races, model, adverseIndexes, commentIndexes),
  };
}

function adjustedScore(candidate: CandidateId, contributions: number[], adverseIndexes: number[], commentIndexes: number[]) {
  const base = sum(contributions);
  if (candidate === "CONTROL") return base;
  if (candidate === "EXCUSE_HALF") return base - (0.5 * sum(adverseIndexes.map((index) => contributions[index]!)));
  if (candidate === "EXCUSE_ZERO") return base - sum(adverseIndexes.map((index) => contributions[index]!));
  return base - sum(commentIndexes.map((index) => contributions[index]!));
}

function removedContribution(candidate: CandidateId, contributions: number[], adverseIndexes: number[]) {
  if (candidate === "EXCUSE_HALF") return 0.5 * sum(adverseIndexes.map((index) => contributions[index]!));
  if (candidate === "EXCUSE_ZERO") return sum(adverseIndexes.map((index) => contributions[index]!));
  return 0;
}

function primaryMetrics(races: RaceEval[]) {
  return {
    races: races.length,
    runners: races.reduce((total, race) => total + race.runners.length, 0),
    logLoss: mean(races.map((race) => -Math.log(Math.max(race.runners.find((runner) => runner.won)?.probability ?? 0, 1e-12)))),
    brier: mean(races.map((race) => race.runners.reduce((total, runner) => total + (runner.probability - (runner.won ? 1 : 0)) ** 2, 0))),
    calibrationError: calibrationError(races.flatMap((race) => race.runners)),
    rank1StrikeRate: capture(races, 1),
    top2WinnerCapture: capture(races, 2),
    top3WinnerCapture: capture(races, 3),
  };
}

function runnerSummary(rows: RunnerEval[]) {
  const winners = rows.filter((row) => row.won).length;
  const predictedWinners = sum(rows.map((row) => row.probability));
  const marketExpected = sum(rows.map((row) => 1 / row.sp));
  return {
    runners: rows.length,
    predictedWinners,
    actualWinners: winners,
    calibrationRatio: ratio(winners, predictedWinners),
    marketExpected,
    marketAe: ratio(winners, marketExpected),
  };
}

function rankOneLongSummary(races: RaceEval[], period: Year | "combined") {
  const scoped = period === "combined" ? races : races.filter((race) => race.year === period);
  const rankOne = scoped.flatMap((race) => race.runners.filter((runner) => runner.rank === 1));
  const long = rankOne.filter((runner) => isLongPrice(runner.sp));
  const summary = runnerSummary(long);
  return {
    becomingRank1: rankOne.length,
    selectionsAtLongPrice: long.length,
    winners: summary.actualWinners,
    expectedWinners: summary.predictedWinners,
    calibrationRatio: summary.calibrationRatio,
    marketExpected: summary.marketExpected,
    marketAe: summary.marketAe,
    originalCeaseRank1: 0,
  };
}

function withOriginalCeaseRankOne(evaluations: CandidateEvaluation[]) {
  const control = evaluations.find((candidate) => candidate.id === "CONTROL")!;
  return evaluations.map((candidate) => ({
    ...candidate,
    rankOneLong: candidate.rankOneLong.map((row) => {
      const original = new Set(longRankOneRunners(control.races, row.period).map((runner) => runner.runnerId));
      const still = new Set(longRankOneRunners(candidate.races, row.period).map((runner) => runner.runnerId));
      return { ...row, originalCeaseRank1: [...original].filter((runnerId) => !still.has(runnerId)).length };
    }),
  }));
}

function ordinaryRankOneSummary(races: RaceEval[]) {
  const rows = races.flatMap((race) => race.runners.filter((runner) => runner.rank === 1 && !isLongPrice(runner.sp)));
  const summary = runnerSummary(rows);
  return {
    selections: rows.length,
    winners: summary.actualWinners,
    strikeRate: ratio(summary.actualWinners, rows.length),
    predictedWinners: summary.predictedWinners,
    calibrationRatio: summary.calibrationRatio,
    marketAe: summary.marketAe,
  };
}

function winnerRankDistribution(races: RaceEval[], period: Year | "combined") {
  const scoped = period === "combined" ? races : races.filter((race) => race.year === period);
  return {
    winners: scoped.length,
    rank1: countWinnerAt(scoped, 1),
    rankLe2: countWinnerAt(scoped, 2),
    rankLe3: countWinnerAt(scoped, 3),
    rankLe5: countWinnerAt(scoped, 5),
  };
}

function valueSummary(rows: RunnerEval[]) {
  const winners = rows.filter((row) => row.won).length;
  const expectedWinners = sum(rows.map((row) => row.probability));
  const marketExpected = sum(rows.map((row) => 1 / row.sp));
  return {
    selections: rows.length,
    winners,
    expectedWinners,
    marketExpected,
    marketAe: ratio(winners, marketExpected),
    roi: ratio(sum(rows.map((row) => row.finalSpProfitLoss)), rows.length),
  };
}

function rankOneValueSelections(race: RaceEval) {
  return race.runners.filter((runner) => runner.rank === 1 && runner.probability > 1 / runner.sp);
}

function rankChanges(evaluated: RaceEval[], base: RaceBase[], model: Model, adverseIndexes: number[], commentIndexes: number[]) {
  const control = base.map((race) => evaluateControlRace(race, model));
  let changedRankOne = 0;
  let changedOrder = 0;
  for (const race of evaluated) {
    const before = control.find((candidate) => candidate.raceId === race.raceId)!;
    if (before.runners.find((runner) => runner.rank === 1)?.runnerId !== race.runners.find((runner) => runner.rank === 1)?.runnerId) changedRankOne += 1;
    if (before.runners.sort((a, b) => a.rank - b.rank).map((runner) => runner.runnerId).join("|") !== race.runners.sort((a, b) => a.rank - b.rank).map((runner) => runner.runnerId).join("|")) changedOrder += 1;
  }
  void adverseIndexes;
  void commentIndexes;
  return { changedRaceOrder: changedOrder, changedRankOne };
}

function evaluateControlRace(race: RaceBase, model: Model): RaceEval {
  const scores = race.runners.map((runner) => sum(runner.contributions));
  const probabilities = raceSoftmax(scores);
  const order = [...race.runners.keys()].sort((left, right) => probabilities[right]! - probabilities[left]! || race.runners[left]!.runnerId.localeCompare(race.runners[right]!.runnerId));
  const ranks = new Map(order.map((index, position) => [race.runners[index]!.runnerId, position + 1]));
  void model;
  return { ...race, runners: race.runners.map((runner, index) => ({ ...runner, probability: probabilities[index]!, rank: ranks.get(runner.runnerId)!, rawScore: scores[index]!, removedExcuseContribution: 0, removedAllCommentContribution: 0 })) };
}

function longshotPromotions(evaluations: CandidateEvaluation[], adverseIndexes: number[], commentIndexes: number[], names: string[]) {
  const control = evaluations.find((candidate) => candidate.id === "CONTROL")!;
  const controlLongRankOne = control.races.flatMap((race) => race.runners.filter((runner) => runner.rank === 1 && isLongPrice(runner.sp)).map((runner) => ({ race, runner })));
  return evaluations.filter((candidate) => candidate.id !== "CONTROL").map((candidate) => {
    const replacements = controlLongRankOne.map(({ race, runner }) => {
      const candidateRace = candidate.races.find((item) => item.raceId === race.raceId)!;
      const candidateTop = candidateRace.runners.find((item) => item.rank === 1)!;
      return { race, controlRunner: runner, candidateRunner: candidateTop, changed: candidateTop.runnerId !== runner.runnerId };
    });
    const changed = replacements.filter((row) => row.changed);
    return {
      candidate: candidate.id,
      controlLongRankOne: controlLongRankOne.length,
      displacedBecauseExcuseRemoved: changed.filter((row) => row.controlRunner.removedExcuseContribution > 0 || contributionSum(row.controlRunner, adverseIndexes) > 0).length,
      unaffected: replacements.filter((row) => !row.changed).length,
      stillRank1OtherFamiliesDominate: replacements.filter((row) => !row.changed && contributionSum(row.controlRunner, adverseIndexes) <= contributionSum(row.controlRunner, commentIndexes) / 2).length,
      replacementFamilies: topReplacementFamilies(changed.map((row) => row.candidateRunner), names),
    };
  });
}

function exampleRaces(evaluations: CandidateEvaluation[], adverseIndexes: number[], commentIndexes: number[], names: string[]) {
  const control = evaluations.find((candidate) => candidate.id === "CONTROL")!;
  const rows = evaluations.filter((candidate) => candidate.id !== "CONTROL").flatMap((candidate) => control.races.flatMap((race) => {
    const controlTop = race.runners.find((runner) => runner.rank === 1);
    if (!controlTop || !isLongPrice(controlTop.sp)) return [];
    const candidateRace = candidate.races.find((item) => item.raceId === race.raceId)!;
    const candidateTop = candidateRace.runners.find((runner) => runner.rank === 1)!;
    if (candidateTop.runnerId === controlTop.runnerId) return [];
    return [{
      candidate: candidate.id,
      date: race.raceDate,
      course: race.courseName,
      raceName: race.raceName,
      controlHorse: controlTop.horseName,
      controlSp: controlTop.sp,
      controlResult: controlTop.won ? "won" : "lost",
      candidateHorse: candidateTop.horseName,
      candidateSp: candidateTop.sp,
      candidateResult: candidateTop.won ? "won" : "lost",
      commentContributionRemovedOrReduced: contributionSum(controlTop, adverseIndexes),
      mainRemainingContributionDifferences: contributionDifferenceSummary(candidateTop, controlTop, names, commentIndexes),
    }];
  }));
  const byYear = YEARS.flatMap((year) => rows.filter((row) => row.date.startsWith(year)).slice(0, 10));
  return byYear.slice(0, 20);
}

function interpretation(evaluations: CandidateEvaluation[]) {
  const control = evaluations.find((candidate) => candidate.id === "CONTROL")!;
  const candidates = evaluations.filter((candidate) => candidate.id !== "CONTROL");
  const sorted = [...candidates].sort((left, right) =>
    (left.primary2026.logLoss ?? Number.POSITIVE_INFINITY) - (right.primary2026.logLoss ?? Number.POSITIVE_INFINITY) ||
    (left.primary2026.brier ?? Number.POSITIVE_INFINITY) - (right.primary2026.brier ?? Number.POSITIVE_INFINITY)
  );
  const best = sorted[0]!;
  const ordinaryVerdict = ordinaryPerformanceVerdict(control.ordinaryRankOne, best.ordinaryRankOne);
  const longImprovement = (best.longPrice2026.calibrationRatio ?? 0) > (control.longPrice2026.calibrationRatio ?? 0) + 0.05;
  const probabilityImprovement = (best.primary2026.logLoss ?? 99) < (control.primary2026.logLoss ?? 99) && (best.primary2026.brier ?? 99) <= (control.primary2026.brier ?? 99);
  const classification = probabilityImprovement && longImprovement && ordinaryVerdict !== "Worse"
    ? "STRONG IMPROVEMENT"
    : probabilityImprovement || longImprovement
      ? "MODEST IMPROVEMENT"
      : "NO IMPROVEMENT";
  return {
    bestCandidate: best.id,
    ordinaryRank1Performance: ordinaryVerdict,
    classification,
    productionRecommendation: classification === "STRONG IMPROVEMENT" ? "PROMOTE HURDLE V2" : classification === "MODEST IMPROVEMENT" ? "MORE RESEARCH" : "KEEP V1 / MORE RESEARCH",
    answers: {
      adverseExcuseMaterialCause: longImprovement ? "Partial evidence: reducing/removing excuse contributions lowers long-price overprediction, but causality is limited by the fixed candidate set." : "No strong evidence from this controlled holdout experiment.",
      excuseZeroImproves2026: improves(control, evaluations.find((candidate) => candidate.id === "EXCUSE_ZERO")!) ? "yes" : "no",
      excuseHalfImproves2026: improves(control, evaluations.find((candidate) => candidate.id === "EXCUSE_HALF")!) ? "yes" : "no",
      allCommentsHelpsOrHurts: improves(control, evaluations.find((candidate) => candidate.id === "ALL_COMMENTS_ZERO")!) ? "helps on primary 2026 probability metrics" : "hurts or is neutral on primary 2026 probability metrics",
      usefulCommentsLostIfAllRemoved: "Compare ALL_COMMENTS_ZERO against EXCUSE candidates: if all-comment removal worsens rank capture or ordinary rank-1 performance while excuse-only improves longshot calibration, useful comment features are being lost.",
      evidenceKeepCommentsReduceExcuses: best.id === "EXCUSE_HALF" || best.id === "EXCUSE_ZERO" ? "Yes" : "No clear evidence",
    },
  };
}

function improves(control: CandidateEvaluation, candidate: CandidateEvaluation) {
  return (candidate.primary2026.logLoss ?? 99) < (control.primary2026.logLoss ?? 99) && (candidate.primary2026.brier ?? 99) <= (control.primary2026.brier ?? 99);
}

function buildCommentFeatureFamilies(): Record<CommentFamily, string[]> {
  const featureNames = (flags: string[]) => flags.flatMap((flag) => [`last_${flag}`, `last3_${flag}_count`]);
  return {
    volume: ["prior_comment_count"],
    positive_performance: featureNames(["prominent", "led", "stayedOn", "strongFinish"]),
    running_style: featureNames(["heldUpRear"]),
    adverse_excuse: featureNames(["slowlyAway", "awkwardStart", "racedFreely", "hampered", "bumped", "checked", "deniedRoom", "shortRoom", "switched", "racedWide", "weakened", "faded", "eased", "neverDangerous", "lostTouch"]),
    negative_finish: [],
    equipment_context: featureNames(["equipment"]),
  };
}

function numericVector(features: HistoricalPreRaceFeatureRow): number[] {
  const values = [
    features.officialRating,
    features.latestJumpSpeedRating,
    features.bestJumpSpeedLast3,
    features.averageJumpSpeedLast3,
    features.trainerPriorWinRate,
    Math.log1p(features.trainerPriorRuns),
    features.jockeyPriorWinRate ?? null,
    Math.log1p(features.jockeyPriorRuns ?? 0),
    features.daysSinceLastRun,
    Math.log1p(features.priorRuns),
    features.horseAge,
    features.weightCarriedLbs,
    numericClass(features.raceClass),
    features.distanceYards === null ? null : features.distanceYards / 220,
    features.actualRunnerCount ?? features.declaredRunnerCount,
    classifyHandicapStatus(features) === "unknown" ? null : classifyHandicapStatus(features) === "handicap" ? 1 : 0,
    /soft|heavy/i.test(features.going ?? "") ? 1 : 0,
    /firm/i.test(features.going ?? "") ? 1 : 0,
  ];
  return [
    ...values.map((value) => typeof value === "number" && Number.isFinite(value) ? value : 0),
    ...values.map((value) => typeof value === "number" && Number.isFinite(value) ? 0 : 1),
  ];
}

function contributionVector(model: Model, values: number[]) {
  return values.map((value, index) => ((value - model.means[index]!) / model.scales[index]!) * model.weights[index]!);
}

function calibrationError(rows: RunnerEval[]) {
  const bands = [[0, .05], [.05, .1], [.1, .15], [.15, .2], [.2, .3], [.3, 1.01]] as const;
  return sum(bands.map(([low, high]) => {
    const band = rows.filter((row) => row.probability >= low && row.probability < high);
    return band.length * Math.abs((mean(band.map((row) => row.probability)) ?? 0) - (mean(band.map((row) => row.won ? 1 : 0)) ?? 0));
  })) / Math.max(rows.length, 1);
}

function capture(races: RaceEval[], rank: number) {
  return mean(races.map((race) => race.runners.some((runner) => runner.rank <= rank && runner.won) ? 1 : 0));
}

function countWinnerAt(races: RaceEval[], rank: number) {
  return races.filter((race) => race.runners.some((runner) => runner.won && runner.rank <= rank)).length;
}

function longRankOneRunners(races: RaceEval[], period: Year | "combined") {
  const scoped = period === "combined" ? races : races.filter((race) => race.year === period);
  return scoped.flatMap((race) => race.runners.filter((runner) => runner.rank === 1 && isLongPrice(runner.sp)));
}

function topReplacementFamilies(rows: RunnerEval[], names: string[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    for (const [family, value] of Object.entries(familyTotals(row, names))) {
      if (value > 0) totals.set(family, (totals.get(family) ?? 0) + value);
    }
  }
  return [...totals.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5).map(([family, contribution]) => ({ family, contribution }));
}

function contributionDifferenceSummary(left: RunnerEval, right: RunnerEval, names: string[], commentIndexes: number[]) {
  void commentIndexes;
  const leftTotals = familyTotals(left, names);
  const rightTotals = familyTotals(right, names);
  return Object.keys(leftTotals).map((family) => ({ family, difference: (leftTotals[family] ?? 0) - (rightTotals[family] ?? 0) }))
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
    .slice(0, 4);
}

function familyTotals(row: RunnerEval, names: string[]) {
  const totals: Record<string, number> = {};
  for (const [index, contribution] of row.contributions.entries()) {
    const family = featureFamily(names[index]!);
    totals[family] = (totals[family] ?? 0) + contribution;
  }
  return totals;
}

function featureFamily(name: string) {
  if (/last_|last3_|prior_comment_count/.test(name)) return "comments";
  if (/jump_speed|official_rating/.test(name)) return "speed / ratings";
  if (/best_l3|avg_l3|latest_|prior_jump_starts/.test(name)) return "recent form";
  if (/trainer/.test(name)) return "trainer";
  if (/jockey/.test(name)) return "jockey";
  if (/days_since_run/.test(name)) return "recency";
  if (/class|handicap/.test(name)) return "class";
  if (/distance/.test(name)) return "distance";
  if (/going/.test(name)) return "going";
  if (/weight/.test(name)) return "weight";
  if (/field_size/.test(name)) return "field/race context";
  return "other";
}

function candidateDescription(candidate: CandidateId) {
  if (candidate === "CONTROL") return "Frozen Jump Tissue v1 unchanged.";
  if (candidate === "EXCUSE_HALF") return "Frozen model, but adverse/excuse comment raw-score contributions are multiplied by 50% before race softmax.";
  if (candidate === "EXCUSE_ZERO") return "Frozen model, but adverse/excuse comment raw-score contributions are set to zero before race softmax.";
  return "Frozen model, but all comment-derived raw-score contributions are set to zero before race softmax.";
}

function ordinaryPerformanceVerdict(control: ReturnType<typeof ordinaryRankOneSummary>, candidate: ReturnType<typeof ordinaryRankOneSummary>) {
  const strikeDiff = (candidate.strikeRate ?? 0) - (control.strikeRate ?? 0);
  const calDiff = Math.abs((candidate.calibrationRatio ?? 1) - 1) - Math.abs((control.calibrationRatio ?? 1) - 1);
  if (strikeDiff < -0.01 || calDiff > 0.05) return "Worse";
  if (strikeDiff > 0.005 && calDiff <= 0) return "Improved";
  return "Similar";
}

function indexesFor(names: string[], featureNames: string[]) {
  const indexes = featureNames.map((feature) => names.indexOf(feature));
  const missing = featureNames.filter((_, index) => indexes[index] === -1);
  if (missing.length) throw new Error(`Missing feature names: ${missing.join(", ")}`);
  return indexes;
}

function stripRacePayload(report: Report) {
  return {
    ...report,
    evaluations: report.evaluations.map(({ races, ...evaluation }) => ({ ...evaluation, racePayloadOmitted: races.length })),
  };
}

function markdown(report: Report) {
  const control = report.evaluations.find((candidate) => candidate.id === "CONTROL")!;
  return [
    "# Hurdle Tissue V2 Comment Experiment",
    "",
    "## Executive Summary",
    `Control: ${report.model.version} (${report.model.path}, checksum ${report.model.checksum}). No production artifact was modified.`,
    `Population: ${report.population.races} Hurdle races and ${report.population.runners} runners. 2025: ${report.population.byYear["2025"].races} races; 2026 holdout: ${report.population.byYear["2026"].races} races.`,
    `Best candidate by holdout probability ordering: **${report.interpretation.bestCandidate}**. Classification: **${report.interpretation.classification}**. Recommendation: **${report.interpretation.productionRecommendation}**.`,
    "",
    "## Comment Feature Families",
    `Existing comment parser flags: ${COMMENT_NAMES.join(", ")}.`,
    `Actual parser regex keys: ${Object.keys(COMMENT_PATTERNS).join(", ")}.`,
    table(["Family", "Features"], Object.entries(report.commentFeatureFamilies).map(([family, features]) => [family, features.join(", ")])),
    "Adverse / excuse family used:",
    report.adverseExcuseFeatures.map((feature) => `- ${feature}`).join("\n"),
    "",
    "## Candidates",
    table(["Candidate", "Definition"], CANDIDATES.map((candidate) => [candidate, report.candidateDescriptions[candidate]])),
    "",
    "## 2025 Development",
    rankOneLongTable(report.evaluations, "2025"),
    "",
    "## 2026 Holdout",
    table(["Candidate", "Races", "Runners", "Log loss", "Brier", "Cal error", "Rank-1 strike", "Top-2", "Top-3", "Rank-one changed"], report.evaluations.map((row) => [row.id, row.primary2026.races, row.primary2026.runners, fmt(row.primary2026.logLoss), fmt(row.primary2026.brier), fmt(row.primary2026.calibrationError), pct(row.primary2026.rank1StrikeRate), pct(row.primary2026.top2WinnerCapture), pct(row.primary2026.top3WinnerCapture), row.rankChanges.changedRankOne])),
    "",
    "## Long-Price Calibration",
    table(["Candidate", "Runners", "Predicted winners", "Actual winners", "Calibration ratio", "Market expected", "A/E"], report.evaluations.map((row) => [row.id, row.longPrice2026.runners, fmt(row.longPrice2026.predictedWinners), row.longPrice2026.actualWinners, fmt(row.longPrice2026.calibrationRatio), fmt(row.longPrice2026.marketExpected), fmt(row.longPrice2026.marketAe)])),
    "",
    "## Rank-1 Longshots",
    rankOneLongTable(report.evaluations, "combined"),
    "",
    "## Ordinary Rank-1",
    table(["Candidate", "Selections", "Winners", "Strike", "Predicted winners", "Calibration", "Market A/E"], report.evaluations.map((row) => [row.id, row.ordinaryRankOne.selections, row.ordinaryRankOne.winners, pct(row.ordinaryRankOne.strikeRate), fmt(row.ordinaryRankOne.predictedWinners), fmt(row.ordinaryRankOne.calibrationRatio), fmt(row.ordinaryRankOne.marketAe)])),
    "",
    "## Price Bands",
    table(["Candidate", "Band", "Runners", "Predicted winners", "Actual winners", "Calibration"], report.evaluations.flatMap((candidate) => candidate.priceBands2026.map((row) => [candidate.id, row.band, row.runners, fmt(row.predictedWinners), row.actualWinners, fmt(row.calibrationRatio)]))),
    "",
    "## Winner Ranking",
    table(["Candidate", "Period", "Winners", "Rank 1", "Rank <=2", "Rank <=3", "Rank <=5"], report.evaluations.flatMap((candidate) => candidate.winnerRanking.map((row) => [candidate.id, row.period, row.winners, row.rank1, row.rankLe2, row.rankLe3, row.rankLe5]))),
    "",
    "## Longshot Promotions",
    table(["Candidate", "Control long rank-1", "Displaced via excuse", "Unaffected", "Still rank-1 other families", "Replacement families"], report.longshotPromotions.map((row) => [row.candidate, row.controlLongRankOne, row.displacedBecauseExcuseRemoved, row.unaffected, row.stillRank1OtherFamiliesDominate, row.replacementFamilies.map((item) => `${item.family} ${fmt(item.contribution)}`).join("; ")])),
    "",
    "## Example Races",
    table(["Candidate", "Date", "Course", "Control horse", "Control SP", "Control result", "Candidate horse", "Candidate SP", "Candidate result", "Excuse contrib", "Main diffs"], report.exampleRaces.map((row) => [row.candidate, row.date, row.course, escapeCell(row.controlHorse), fmt(row.controlSp), row.controlResult, escapeCell(row.candidateHorse), fmt(row.candidateSp), row.candidateResult, fmt(row.commentContributionRemovedOrReduced), row.mainRemainingContributionDifferences.map((item) => `${item.family} ${signed(item.difference)}`).join("; ")])),
    "",
    "## VALUE Impact",
    table(["Candidate", "Band", "Selections", "Winners", "Expected winners", "Market expected", "A/E", "ROI"], report.evaluations.flatMap((candidate) => candidate.value.map((row) => [candidate.id, row.band, row.selections, row.winners, fmt(row.expectedWinners), fmt(row.marketExpected), fmt(row.marketAe), pct(row.roi)]))),
    "",
    "## Interpretation",
    `A. Does the adverse/excuse family materially cause the problem? ${report.interpretation.answers.adverseExcuseMaterialCause}`,
    `B. Does EXCUSE_ZERO improve 2026? ${report.interpretation.answers.excuseZeroImproves2026}`,
    `C. Does EXCUSE_HALF improve 2026? ${report.interpretation.answers.excuseHalfImproves2026}`,
    `D. Does removing ALL comments help or hurt? ${report.interpretation.answers.allCommentsHelpsOrHurts}`,
    `E. Are useful comments lost if all comments are removed? ${report.interpretation.answers.usefulCommentsLostIfAllRemoved}`,
    `F. Evidence for keeping comments generally but reducing/removing excuses? ${report.interpretation.answers.evidenceKeepCommentsReduceExcuses}`,
    "",
    "## Recommendation",
    `Classification: **${report.interpretation.classification}**.`,
    `Production recommendation: **${report.interpretation.productionRecommendation}**.`,
    `CONTROL 2026 >14/1 calibration: ${fmt(control.longPrice2026.calibrationRatio)}.`,
    "",
  ].join("\n");
}

function rankOneLongTable(evaluations: CandidateEvaluation[], period: Year | "combined") {
  return table(["Candidate", "Rank-1 total", "Selections SP >14/1", "Winners", "Expected", "Calibration", "Market expected", "A/E", "Original cease rank-1"], evaluations.map((candidate) => {
    const row = candidate.rankOneLong.find((item) => item.period === period)!;
    const control = evaluations.find((item) => item.id === "CONTROL")!;
    const original = new Set(longRankOneRunners(control.races, period).map((runner) => runner.runnerId));
    const still = new Set(longRankOneRunners(candidate.races, period).map((runner) => runner.runnerId));
    const cease = [...original].filter((runnerId) => !still.has(runnerId)).length;
    return [candidate.id, row.becomingRank1, row.selectionsAtLongPrice, row.winners, fmt(row.expectedWinners), fmt(row.calibrationRatio), fmt(row.marketExpected), fmt(row.marketAe), cease];
  }));
}

function printTerminalSummary(report: Report) {
  console.log(`Wrote ${MARKDOWN_OUTPUT}`);
  console.log(`Wrote ${JSON_OUTPUT}`);
  console.log("");
  for (const id of ["CONTROL", "EXCUSE_HALF", "EXCUSE_ZERO", "ALL_COMMENTS_ZERO"] as const) {
    const row = report.evaluations.find((candidate) => candidate.id === id)!;
    console.log(id);
    console.log(`2026 LL: ${fmt(row.primary2026.logLoss)}`);
    console.log(`2026 Brier: ${fmt(row.primary2026.brier)}`);
    console.log(`2026 rank1 strike: ${pct(row.primary2026.rank1StrikeRate)}`);
    console.log(`2026 >14/1 calibration: ${fmt(row.longPrice2026.calibrationRatio)}`);
    console.log("");
  }
  const control = report.evaluations.find((candidate) => candidate.id === "CONTROL")!;
  const best = report.evaluations.find((candidate) => candidate.id === report.interpretation.bestCandidate)!;
  const original = new Set(longRankOneRunners(control.races, "combined").map((runner) => runner.runnerId));
  const still = new Set(longRankOneRunners(best.races, "combined").map((runner) => runner.runnerId));
  console.log(`BEST CANDIDATE: ${report.interpretation.bestCandidate}`);
  console.log(`Original >14/1 rank1 horses displaced: ${[...original].filter((runnerId) => !still.has(runnerId)).length}`);
  console.log(`<=14/1 rank1 performance: ${report.interpretation.ordinaryRank1Performance}`);
  console.log(`Classification: ${report.interpretation.classification}`);
  console.log(`Production recommendation: ${report.interpretation.productionRecommendation}`);
}

function inPriceBand(sp: number, band: typeof PRICE_BANDS[number]) {
  const aboveMin = band.minInclusive ? sp >= band.min : sp > band.min;
  const belowMax = band.maxInclusive ? sp <= band.max : sp < band.max;
  return aboveMin && belowMax;
}
function isLongPrice(sp: number) { return sp > 15; }
function contributionSum(row: RunnerEval, indexes: number[]) { return sum(indexes.map((index) => row.contributions[index]!)); }
function numericClass(value: string | null) { return Number(value?.match(/\d+/)?.[0] ?? NaN) || null; }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function mean(values: number[]) { return values.length ? sum(values) / values.length : null; }
function ratio(numerator: number, denominator: number) { return denominator === 0 ? null : numerator / denominator; }
function fmt(value: number | null | undefined) { return value === null || value === undefined || !Number.isFinite(value) ? "-" : value.toFixed(4); }
function pct(value: number | null | undefined) { return value === null || value === undefined || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`; }
function signed(value: number | null | undefined) { return value === null || value === undefined || !Number.isFinite(value) ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(4)}`; }
function escapeCell(value: string) { return value.replace(/\|/g, "\\|"); }
function groupBy<T, K>(values: T[], keyFor: (value: T) => K) {
  const groups = new Map<K, T[]>();
  for (const value of values) groups.set(keyFor(value), [...(groups.get(keyFor(value)) ?? []), value]);
  return groups;
}
function table(headers: string[], rows: Array<Array<string | number>>) {
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`), ""].join("\n");
}

await main();

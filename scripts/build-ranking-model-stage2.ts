import { writeFile } from "node:fs/promises";
import { loadLatestBacktestFeatureCacheForYear, type BacktestCacheFamily } from "@/lib/racing/backtest-cache";
import { loadAwTissueForward } from "@/lib/racing/aw-tissue-forward";
import { loadForwardValueData } from "@/lib/racing/forward-value";
import { loadJumpTissueForward } from "@/lib/racing/jump-tissue-forward";
import {
  auditRankOneSelections,
  awTissueRankOneSelections,
  forwardValueRankOneSelections,
  jumpTissueRankOneSelections,
  renderRankOneAudit,
  turfTissueRankOneSelections,
} from "@/lib/racing/rank-one-diagnostics";
import { loadTissueForward, TISSUE_V2_CONFIG } from "@/lib/racing/tissue-forward";

type FamilyId = "turf" | "jump" | "aw";
type Confidence = "LOW" | "MEDIUM" | "HIGH";
type FeatureRow = {
  features: Record<string, unknown>;
  outcome: {
    won: boolean | null;
    resultStatus: string | null;
    finishingPosition: number | null;
    startingPriceDecimal?: string | number | null;
  };
};
type Runner = {
  runnerId: string;
  horseName: string;
  won: boolean;
  finalSp: number;
  marketProbability: number;
  features: Record<string, unknown>;
  scores: Record<string, number>;
};
type Race = {
  raceId: string;
  raceDate: string;
  year: "2025" | "2026";
  family: FamilyId;
  course: string;
  raceName: string;
  fieldSize: number;
  subtype: string;
  handicap: boolean;
  runners: Runner[];
};
type Candidate = {
  family: FamilyId;
  id: string;
  label: string;
  description: string;
  score: (runner: Runner, race: Race) => number;
};
type EvaluatedRace = {
  race: Race;
  candidate: Candidate;
  probabilities: Map<string, number>;
  ranking: Runner[];
  confidence: Confidence;
  probabilityGap: number | null;
  scoreGap: number | null;
};
type MetricSummary = {
  races: number;
  top1Wins: number;
  top1Strike: number | null;
  top2Capture: number | null;
  top3Capture: number | null;
  logLoss: number | null;
  brier: number | null;
  modelExpectedWinners: number | null;
  actualWinners: number;
  calibrationMae: number | null;
};

const MD_OUTPUT = "/tmp/ranking-model-rebuild-stage2.md";
const JSON_OUTPUT = "/tmp/ranking-model-rebuild-stage2.json";
const YEARS = ["2025", "2026"] as const;
const FAMILY_CACHE: Record<FamilyId, BacktestCacheFamily> = {
  turf: "turf_flat",
  jump: "jump",
  aw: "all_weather_flat",
};
const FAMILY_LABEL: Record<FamilyId, string> = {
  turf: "Turf",
  jump: "Jump",
  aw: "All Weather",
};
const CURRENT_BASELINES: Record<FamilyId, { model: string; selections: number; winners: number; strike: number }> = {
  turf: { model: "Turf Tissue v2", selections: 267, winners: 59, strike: 0.221 },
  jump: { model: "JUMP_TISSUE_V1", selections: 75, winners: 17, strike: 0.227 },
  aw: { model: "AW_TISSUE_V1", selections: 66, winners: 14, strike: 0.212 },
};

export const candidates: Candidate[] = [
  {
    family: "turf",
    id: "TURF-R1",
    label: "Reduced stable numeric",
    description: "Latest/best/average turf speed, OR, trainer/jockey prior strength, history depth and recency; no comments or market price.",
    score: (runner, race) => weightedRanks(runner, race, [
      ["latestTurfSpeedRating", 1.2], ["bestTurfSpeedLast3", 1.3], ["averageTurfSpeedLast3", 1.1],
      ["officialRating", 1.0], ["trainerPriorWinRate", 0.45], ["jockeyPriorWinRate", 0.35],
      ["priorRuns", 0.35], ["daysSinceLastRun", -0.25], ["weightCarriedLbs", -0.15], ["draw", -0.1],
    ]),
  },
  {
    family: "turf",
    id: "TURF-R2",
    label: "Ranking-oriented rank consensus",
    description: "Ordinal rank points across turf speed, OR, trainer, jockey and recency, built for winner ranking rather than probability modelling.",
    score: (runner, race) => rankConsensus(runner, race, [
      ["bestTurfSpeedLast3", true, 1.5], ["latestTurfSpeedRating", true, 1.2], ["averageTurfSpeedLast3", true, 1.0],
      ["officialRating", true, 1.0], ["trainerPriorWinRate", true, 0.5], ["jockeyPriorWinRate", true, 0.4],
      ["daysSinceLastRun", false, 0.3],
    ]),
  },
  {
    family: "turf",
    id: "TURF-R3",
    label: "Standardised-score ensemble",
    description: "Equal blend of reduced numeric score, rank consensus and broad performance-rating evidence.",
    score: (runner, race) =>
      0.45 * candidatesById.get("TURF-R1")!.score(runner, race) +
      0.35 * candidatesById.get("TURF-R2")!.score(runner, race) +
      0.2 * weightedRanks(runner, race, [["latestPerformanceRating", 1], ["bestPerformanceLast3", 1], ["averagePerformanceLast3", 0.8], ["latestTodaysRating", 0.7]]),
  },
  {
    family: "jump",
    id: "JUMP-R1",
    label: "Richer numeric Jump",
    description: "Jump speed, OR, trainer/jockey prior strength, class, weight, distance, recency and history depth.",
    score: (runner, race) => weightedRanks(runner, race, [
      ["latestJumpSpeedRating", 1.2], ["bestJumpSpeedLast3", 1.35], ["averageJumpSpeedLast3", 1.1],
      ["officialRating", 1.0], ["trainerPriorWinRate", 0.45], ["jockeyPriorWinRate", 0.4],
      ["priorRuns", 0.35], ["daysSinceLastRun", -0.25], ["weightCarriedLbs", -0.15],
      ["distanceYards", race.handicap ? -0.1 : 0.05],
    ]),
  },
  {
    family: "jump",
    id: "JUMP-R2",
    label: "Numeric plus reduced comments proxy",
    description: "Numeric Jump score plus chronology-safe proxy features available in cache: win/place history, break pattern and recent performance.",
    score: (runner, race) =>
      candidatesById.get("JUMP-R1")!.score(runner, race) +
      weightedRanks(runner, race, [["winPercentage", 0.35], ["placePercentage", 0.25], ["latestPerformanceRating", 0.35], ["breakLengthDays", -0.2]]),
  },
  {
    family: "jump",
    id: "JUMP-R3",
    label: "Ranking/consensus Jump",
    description: "Ordinal consensus across Jump speed, OR, trainer/jockey and performance signals, with NH Flat monitored separately.",
    score: (runner, race) => rankConsensus(runner, race, [
      ["bestJumpSpeedLast3", true, 1.4], ["averageJumpSpeedLast3", true, 1.0], ["latestJumpSpeedRating", true, 1.0],
      ["officialRating", true, 0.9], ["latestPerformanceRating", true, 0.7], ["trainerPriorWinRate", true, 0.45],
      ["jockeyPriorWinRate", true, 0.45], ["daysSinceLastRun", false, 0.25],
    ]),
  },
  {
    family: "aw",
    id: "AW-R1",
    label: "Richer numeric AW",
    description: "AW speed, OR, trainer/jockey strength, weight, class, distance, draw, recency and same-surface history depth.",
    score: (runner, race) => weightedRanks(runner, race, [
      ["latestAwSpeedRating", 1.2], ["bestAwSpeedLast3", 1.35], ["averageAwSpeedLast3", 1.1],
      ["officialRating", 0.9], ["trainerPriorWinRate", 0.45], ["jockeyPriorWinRate", 0.4],
      ["priorRuns", 0.25], ["daysSinceLastRun", -0.25], ["draw", -0.15], ["weightCarriedLbs", -0.1],
    ]),
  },
  {
    family: "aw",
    id: "AW-R2",
    label: "Numeric plus reduced comments proxy",
    description: "Numeric AW score plus prior win/place reliability and recent performance consistency proxies.",
    score: (runner, race) =>
      candidatesById.get("AW-R1")!.score(runner, race) +
      weightedRanks(runner, race, [["winPercentage", 0.3], ["placePercentage", 0.25], ["latestPerformanceRating", 0.35], ["averagePerformanceLast3", 0.25]]),
  },
  {
    family: "aw",
    id: "AW-R3",
    label: "Ranking/consensus AW",
    description: "Ordinal consensus across AW speed, OR, trainer/jockey, course-surface proxy and recency signals.",
    score: (runner, race) => rankConsensus(runner, race, [
      ["bestAwSpeedLast3", true, 1.45], ["latestAwSpeedRating", true, 1.15], ["averageAwSpeedLast3", true, 1.0],
      ["officialRating", true, 0.8], ["trainerPriorWinRate", true, 0.45], ["jockeyPriorWinRate", true, 0.45],
      ["priorRuns", true, 0.2], ["daysSinceLastRun", false, 0.25],
    ]),
  },
];
const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

async function main() {
  const [races, shortPriceAudit] = await Promise.all([loadHistoricalRaces(), loadShortPriceAudit()]);
  const evaluated = candidates.map((candidate) => ({
    candidate,
    races: races.filter((race) => race.family === candidate.family).map((race) => evaluateRace(candidate, race)),
  }));
  const report = buildReport(races, evaluated, shortPriceAudit);
  await writeFile(MD_OUTPUT, report.markdown, "utf8");
  await writeFile(JSON_OUTPUT, `${JSON.stringify(report.json, null, 2)}\n`, "utf8");
  printTerminalSummary(evaluated);
}

export async function loadHistoricalRaces(): Promise<Race[]> {
  const races: Race[] = [];
  for (const family of Object.keys(FAMILY_CACHE) as FamilyId[]) {
    for (const year of YEARS) {
      const cache = await loadLatestBacktestFeatureCacheForYear({ year, family: FAMILY_CACHE[family] });
      if (!cache) continue;
      const grouped = groupBy(cache.rows as FeatureRow[], (row) => stringFeature(row, "targetRaceId"));
      for (const [raceId, rows] of grouped) {
        const active = rows.filter((row) => row.outcome.resultStatus !== "non_runner" && boolOrNull(row.outcome.won) !== null);
        if (active.length < 2 || active.filter((row) => row.outcome.won === true).length !== 1) continue;
        const runners = active.flatMap((row): Runner[] => {
          const finalSp = decimal(row.outcome.startingPriceDecimal) ?? decimal(row.features.oddsDecimal);
          if (finalSp === null || finalSp <= 1) return [];
          return [{
            runnerId: stringFeature(row, "targetRunnerId"),
            horseName: stringFeature(row, "horseName"),
            won: row.outcome.won === true,
            finalSp,
            marketProbability: 1 / finalSp,
            features: row.features,
            scores: {},
          }];
        });
        if (runners.length !== active.length) continue;
        races.push({
          raceId,
          raceDate: stringFeature(active[0]!, "raceDate"),
          year,
          family,
          course: stringFeature(active[0]!, "courseName"),
          raceName: stringFeature(active[0]!, "raceName"),
          fieldSize: runners.length,
          subtype: subtypeFor(active[0]!, family),
          handicap: /handicap/i.test(`${stringFeature(active[0]!, "raceName")} ${stringFeature(active[0]!, "raceType")}`),
          runners,
        });
      }
    }
  }
  return races.sort((left, right) => left.raceDate.localeCompare(right.raceDate) || left.raceId.localeCompare(right.raceId));
}

async function loadShortPriceAudit() {
  const [forwardValue, turfTissueV2, jumpTissue, awTissue] = await Promise.all([
    loadForwardValueData(),
    loadTissueForward(TISSUE_V2_CONFIG.forwardPath, TISSUE_V2_CONFIG),
    loadJumpTissueForward(),
    loadAwTissueForward(),
  ]);
  const selections = [
    ...forwardValueRankOneSelections(forwardValue),
    ...turfTissueRankOneSelections(turfTissueV2, "Turf Tissue v2"),
    ...jumpTissueRankOneSelections(jumpTissue),
    ...awTissueRankOneSelections(awTissue),
  ];
  return {
    audits: auditRankOneSelections(selections),
    markdown: renderRankOneAudit(auditRankOneSelections(selections)),
  };
}

export function evaluateRace(candidate: Candidate, race: Race): EvaluatedRace {
  const rawScores = race.runners.map((runner) => candidate.score(runner, race));
  const probabilities = softmax(rawScores);
  race.runners.forEach((runner, index) => { runner.scores[candidate.id] = rawScores[index]!; });
  const probabilityByRunner = new Map(race.runners.map((runner, index) => [runner.runnerId, probabilities[index]!]));
  const ranking = [...race.runners].sort((left, right) =>
    probabilityByRunner.get(right.runnerId)! - probabilityByRunner.get(left.runnerId)! ||
    right.scores[candidate.id]! - left.scores[candidate.id]! ||
    left.horseName.localeCompare(right.horseName)
  );
  const probabilityGap = ranking.length >= 2 ? probabilityByRunner.get(ranking[0]!.runnerId)! - probabilityByRunner.get(ranking[1]!.runnerId)! : null;
  const scoreGap = ranking.length >= 2 ? ranking[0]!.scores[candidate.id]! - ranking[1]!.scores[candidate.id]! : null;
  return { race, candidate, probabilities: probabilityByRunner, ranking, confidence: confidence(probabilityByRunner.get(ranking[0]!.runnerId)!, probabilityGap, scoreGap, ranking[0]!, race), probabilityGap, scoreGap };
}

function metrics(rows: EvaluatedRace[]): MetricSummary {
  const usable = rows.filter((row) => row.ranking.length > 0);
  const top1Wins = usable.filter((row) => row.ranking[0]!.won).length;
  return {
    races: usable.length,
    top1Wins,
    top1Strike: rate(top1Wins, usable.length),
    top2Capture: rate(usable.filter((row) => row.ranking.slice(0, 2).some((runner) => runner.won)).length, usable.length),
    top3Capture: rate(usable.filter((row) => row.ranking.slice(0, 3).some((runner) => runner.won)).length, usable.length),
    logLoss: avg(usable.map((row) => -Math.log(Math.max(winnerProbability(row), 1e-12)))),
    brier: avg(usable.map((row) => row.race.runners.reduce((sum, runner) => sum + (row.probabilities.get(runner.runnerId)! - (runner.won ? 1 : 0)) ** 2, 0))),
    modelExpectedWinners: usable.length ? sum(usable.map((row) => row.probabilities.get(row.ranking[0]!.runnerId)!)) : null,
    actualWinners: top1Wins,
    calibrationMae: calibrationMae(usable),
  };
}

function buildReport(
  races: Race[],
  evaluated: Array<{ candidate: Candidate; races: EvaluatedRace[] }>,
  shortPriceAudit: Awaited<ReturnType<typeof loadShortPriceAudit>>,
) {
  const summaries = Object.fromEntries(evaluated.map((entry) => [entry.candidate.id, metrics(entry.races)]));
  const byYear = Object.fromEntries(evaluated.map((entry) => [entry.candidate.id, Object.fromEntries(YEARS.map((year) => [year, metrics(entry.races.filter((row) => row.race.year === year))]))]));
  const folds = Object.fromEntries(evaluated.map((entry) => [entry.candidate.id, foldRows(entry.races)]));
  const abstention = Object.fromEntries(evaluated.map((entry) => [entry.candidate.id, abstentionRows(entry.races)]));
  const shortConfidence = Object.fromEntries(evaluated.map((entry) => [entry.candidate.id, shortPriceConfidenceRows(entry.races)]));
  const failures = Object.fromEntries(evaluated.map((entry) => [entry.candidate.id, failureProfile(entry.races)]));
  const recommendations = recommendationsFor(evaluated);
  const lines: string[] = [];
  lines.push("# Ranking Model Rebuild Stage 2", "");
  lines.push("Diagnostic/research output only. Production models, trackers, settlement, price history and Forward Value artifacts were read but not mutated.", "");
  lines.push("## Executive Summary", "");
  for (const family of ["turf", "jump", "aw"] as FamilyId[]) {
    const familyEntries = evaluated.filter((entry) => entry.candidate.family === family);
    const diagnosticBest = bestDiagnosticCandidate(familyEntries);
    const best = recommendations[family];
    const current = CURRENT_BASELINES[family];
    const diagnosticSummary = summaries[diagnosticBest.id] as MetricSummary;
    const recommendation = best
      ? `Recommend prospective shadowing for ${best.id}.`
      : "No Stage 2 candidate clears the supplied current rank-1 baseline, so no new shadow candidate is recommended.";
    lines.push(`- ${FAMILY_LABEL[family]}: current ${current.model} rank-1 ${pct(current.strike)} (${current.winners}/${current.selections}). Best diagnostic candidate is ${diagnosticBest.id} ${diagnosticBest.label} at ${pct(diagnosticSummary.top1Strike)} rank-1 and ${pct(diagnosticSummary.top3Capture)} top-3. ${recommendation}`);
  }
  lines.push("", "Primary caution: candidate results use chronology-safe historical caches and fixed scorebooks. They are not production replacements and should enter prospective shadowing before any promotion.", "");
  lines.push("## Short-Price Failure Audit", "");
  lines.push("Current baseline diagnostic from the Stage 1 shared rank-one diagnostics. Final SP is used after rank 1 is frozen and is not a model feature.", "");
  lines.push(shortPriceAudit.markdown.replace(/^# Rank-1 Failure Diagnostic\n\n/, "").trim(), "");
  lines.push("## Confidence Framework", "");
  lines.push("Confidence is model-evidence only: HIGH requires a strong rank-1 probability and gap with adequate history; MEDIUM requires usable probability/gap or partial history; LOW captures narrow, sparse or missing-evidence leaders. The fixed gates are: probability >=30% and gap >=6pp for HIGH, or probability >=22% and gap >=3pp for MEDIUM, with history and missing-data burden modifiers.", "");
  lines.push("## Abstention Results", "");
  table(lines, ["Candidate", "Setting", "Total races", "Retained", "Abstention", "Rank-1", "Top-3", "Model exp winners", "Actual winners"], Object.entries(abstention).flatMap(([id, rows]) => rows.map((row) => [id, row.setting, row.total, row.retained, pct(row.abstentionRate), pct(row.metrics.top1Strike), pct(row.metrics.top3Capture), fmt(row.metrics.modelExpectedWinners), row.metrics.actualWinners])));
  lines.push("", "## Candidate Short-Price Confidence", "");
  table(lines, ["Candidate", "Price band", "Confidence", "Selections", "Market exp", "Model exp", "Actual", "Strike"], Object.entries(shortConfidence).flatMap(([id, rows]) =>
    rows
      .filter((row) => row.selections > 0)
      .map((row) => [id, row.priceBand, row.confidence, row.selections, fmt(row.marketExpectedWinners), fmt(row.modelExpectedWinners), row.actualWinners, pct(row.strike)])
  ));
  lines.push("", "## Turf Candidate Results", "");
  candidateSection(lines, evaluated, "turf", summaries);
  lines.push("## Jump Candidate Results", "");
  candidateSection(lines, evaluated, "jump", summaries);
  jumpSubtypeSection(lines, evaluated);
  lines.push("## AW Candidate Results", "");
  candidateSection(lines, evaluated, "aw", summaries);
  lines.push("## Walk-Forward Validation", "");
  table(lines, ["Candidate", "Fold", "Train period", "Validation period", "Races", "Rank-1", "Top-2", "Top-3", "Log loss", "Brier", "Calibration MAE"], Object.entries(folds).flatMap(([id, rows]) => rows.map((row) => [id, row.fold, row.trainPeriod, row.validationPeriod, row.metrics.races, pct(row.metrics.top1Strike), pct(row.metrics.top2Capture), pct(row.metrics.top3Capture), fmt(row.metrics.logLoss), fmt(row.metrics.brier), fmt(row.metrics.calibrationMae)])));
  lines.push("", "## 2025 vs 2026 Stability", "");
  table(lines, ["Candidate", "2025 races", "2025 rank-1", "2025 top-3", "2026 races", "2026 rank-1", "2026 top-3", "Strike delta"], evaluated.map(({ candidate }) => {
    const y = byYear[candidate.id] as Record<string, MetricSummary>;
    return [candidate.id, y["2025"].races, pct(y["2025"].top1Strike), pct(y["2025"].top3Capture), y["2026"].races, pct(y["2026"].top1Strike), pct(y["2026"].top3Capture), signedPp((y["2026"].top1Strike ?? 0) - (y["2025"].top1Strike ?? 0))];
  }));
  lines.push("", "## Ensemble Results", "");
  lines.push("The R3 candidate in each family is the fixed ensemble/consensus test. Consensus improved only where its strike, top-3, calibration and 2025/2026 delta jointly beat the family R1/R2 alternatives; otherwise simplicity wins.", "");
  table(lines, ["Family", "R1 strike", "R2 strike", "R3 strike", "R3 top-3", "R3 calibration MAE", "Consensus verdict"], (["turf", "jump", "aw"] as FamilyId[]).map((family) => {
    const ids = candidates.filter((candidate) => candidate.family === family).map((candidate) => candidate.id);
    const r1 = summaries[ids[0]!] as MetricSummary;
    const r2 = summaries[ids[1]!] as MetricSummary;
    const r3 = summaries[ids[2]!] as MetricSummary;
    return [FAMILY_LABEL[family], pct(r1.top1Strike), pct(r2.top1Strike), pct(r3.top1Strike), pct(r3.top3Capture), fmt(r3.calibrationMae), verdict(r3, [r1, r2])];
  }));
  lines.push("", "## Failure Profiles", "");
  table(lines, ["Candidate", "Losing rank-1", "Favourite", "Odds-on", "Low history", "Gap <3pp", "Avg field", "Avg SP", "Common subtype/surface"], Object.entries(failures).map(([id, row]) => [id, row.losers, pct(row.favouriteRate), pct(row.oddsOnRate), pct(row.lowHistoryRate), pct(row.smallGapRate), fmt(row.avgField), fmt(row.avgSp), row.commonSubtype]));
  lines.push("", "## Recommended Shadow Candidates", "");
  for (const family of ["turf", "jump", "aw"] as FamilyId[]) {
    const best = recommendations[family];
    lines.push(`- ${FAMILY_LABEL[family]}: ${best ? `${best.id} ${best.label}` : "No candidate clearly improves the current baseline enough for shadowing."}`);
  }
  lines.push("", "## Prospective Shadow Plan", "");
  lines.push("Shadow at most one candidate per family for the next settled sample. Keep production rankings unchanged, log the candidate top-3, confidence band, abstention label and short-price confidence diagnostic, then review after a meaningful settled sample rather than by P/L.", "");
  const json = { generatedAt: new Date().toISOString(), raceCounts: countBy(races, (race) => race.family), candidates: candidates.map((candidate) => ({ ...candidate, score: undefined })), summaries, byYear, folds, abstention, shortConfidence, failures, recommendations };
  return { markdown: `${lines.join("\n").trimEnd()}\n`, json };
}

function candidateSection(lines: string[], evaluated: Array<{ candidate: Candidate; races: EvaluatedRace[] }>, family: FamilyId, summaries: Record<string, unknown>) {
  table(lines, ["Candidate", "Description", "Races", "Rank-1", "Top-2", "Top-3", "Log loss", "Brier", "Calibration MAE"], evaluated.filter((entry) => entry.candidate.family === family).map(({ candidate }) => {
    const s = summaries[candidate.id] as MetricSummary;
    return [candidate.id, candidate.description, s.races, pct(s.top1Strike), pct(s.top2Capture), pct(s.top3Capture), fmt(s.logLoss), fmt(s.brier), fmt(s.calibrationMae)];
  }));
  lines.push("");
}

function jumpSubtypeSection(lines: string[], evaluated: Array<{ candidate: Candidate; races: EvaluatedRace[] }>) {
  lines.push("Jump subtype split", "");
  table(lines, ["Candidate", "Subtype", "Races", "Rank-1", "Top-3"], evaluated.filter((entry) => entry.candidate.family === "jump").flatMap((entry) =>
    [...groupBy(entry.races, (row) => row.race.subtype)].map(([subtype, rows]) => {
      const m = metrics(rows);
      return [entry.candidate.id, subtype, m.races, pct(m.top1Strike), pct(m.top3Capture)];
    })
  ));
  lines.push("");
}

function foldRows(rows: EvaluatedRace[]) {
  const folds = [
    { fold: "2025-H1", trainPeriod: "pre-2025 fixed rules", validationPeriod: "2025-01-01 to 2025-06-30", includes: (row: EvaluatedRace) => row.race.raceDate <= "2025-06-30" },
    { fold: "2025-H2", trainPeriod: "2025-H1 observed only", validationPeriod: "2025-07-01 to 2025-12-31", includes: (row: EvaluatedRace) => row.race.raceDate >= "2025-07-01" && row.race.raceDate <= "2025-12-31" },
    { fold: "2026-H1", trainPeriod: "2025 full year", validationPeriod: "2026-01-01 to 2026-06-30", includes: (row: EvaluatedRace) => row.race.raceDate >= "2026-01-01" && row.race.raceDate <= "2026-06-30" },
    { fold: "2026-H2", trainPeriod: "2025 plus 2026-H1 observed only", validationPeriod: "2026-07-01 to latest cache", includes: (row: EvaluatedRace) => row.race.raceDate >= "2026-07-01" },
  ];
  return folds.map((fold) => ({ ...fold, includes: undefined, metrics: metrics(rows.filter(fold.includes)) }));
}

function abstentionRows(rows: EvaluatedRace[]) {
  const settings = [
    { setting: "retain HIGH only", keep: (row: EvaluatedRace) => row.confidence === "HIGH" },
    { setting: "retain MEDIUM/HIGH", keep: (row: EvaluatedRace) => row.confidence !== "LOW" },
  ];
  return settings.map((setting) => {
    const retained = rows.filter(setting.keep);
    return { setting: setting.setting, total: rows.length, retained: retained.length, abstentionRate: rate(rows.length - retained.length, rows.length), metrics: metrics(retained) };
  });
}

function shortPriceConfidenceRows(rows: EvaluatedRace[]) {
  const bands = [
    { label: "<Evens", includes: (sp: number) => sp < 2 },
    { label: "Evens-<6/4", includes: (sp: number) => sp >= 2 && sp < 2.5 },
    { label: "6/4-<2/1", includes: (sp: number) => sp >= 2.5 && sp < 3 },
    { label: ">=2/1", includes: (sp: number) => sp >= 3 },
  ];
  return bands.flatMap((band) => (["LOW", "MEDIUM", "HIGH"] as Confidence[]).map((confidenceBand) => {
    const subset = rows.filter((row) => band.includes(row.ranking[0]!.finalSp) && row.confidence === confidenceBand);
    return { priceBand: band.label, confidence: confidenceBand, selections: subset.length, marketExpectedWinners: sum(subset.map((row) => row.ranking[0]!.marketProbability)), modelExpectedWinners: sum(subset.map((row) => row.probabilities.get(row.ranking[0]!.runnerId)!)), actualWinners: subset.filter((row) => row.ranking[0]!.won).length, strike: rate(subset.filter((row) => row.ranking[0]!.won).length, subset.length) };
  }));
}

function failureProfile(rows: EvaluatedRace[]) {
  const losers = rows.filter((row) => !row.ranking[0]!.won);
  const commonSubtype = mode(losers.map((row) => row.race.subtype));
  return {
    losers: losers.length,
    favouriteRate: rate(losers.filter((row) => row.ranking[0]!.finalSp === Math.min(...row.race.runners.map((runner) => runner.finalSp))).length, losers.length),
    oddsOnRate: rate(losers.filter((row) => row.ranking[0]!.finalSp < 2).length, losers.length),
    lowHistoryRate: rate(losers.filter((row) => (num(row.ranking[0]!.features.priorRuns) ?? 0) < 3).length, losers.length),
    smallGapRate: rate(losers.filter((row) => (row.probabilityGap ?? 0) < 0.03).length, losers.length),
    avgField: avg(losers.map((row) => row.race.fieldSize)),
    avgSp: avg(losers.map((row) => row.ranking[0]!.finalSp)),
    commonSubtype,
  };
}

function recommendationsFor(evaluated: Array<{ candidate: Candidate; races: EvaluatedRace[] }>) {
  const recommendations: Partial<Record<FamilyId, Candidate>> = {};
  for (const family of ["turf", "jump", "aw"] as FamilyId[]) {
    const ranked = evaluated
      .filter((entry) => entry.candidate.family === family)
      .map((entry) => ({ candidate: entry.candidate, metrics: metrics(entry.races), stability: stabilityPenalty(entry.races) }))
      .sort((left, right) =>
        scoreCandidate(right.metrics, right.stability) - scoreCandidate(left.metrics, left.stability) ||
        left.candidate.id.localeCompare(right.candidate.id)
      );
    const best = ranked[0];
    if (
      best &&
      best.metrics.races >= 200 &&
      (best.metrics.top1Strike ?? 0) > CURRENT_BASELINES[family].strike &&
      best.stability < 0.06
    ) {
      recommendations[family] = best.candidate;
    }
  }
  return recommendations;
}

function weightedRanks(runner: Runner, race: Race, weights: Array<[string, number]>): number {
  return weights.reduce((total, [feature, weight]) => total + weight * zWithinRace(runner, race, feature), 0);
}

function rankConsensus(runner: Runner, race: Race, features: Array<[string, boolean, number]>): number {
  return features.reduce((total, [feature, higherBetter, weight]) => {
    const values = race.runners.map((candidate) => num(candidate.features[feature]));
    const ordered = [...race.runners].sort((left, right) => {
      const a = num(left.features[feature]);
      const b = num(right.features[feature]);
      if (a === null && b === null) return left.runnerId.localeCompare(right.runnerId);
      if (a === null) return 1;
      if (b === null) return -1;
      return higherBetter ? b - a : a - b;
    });
    const rank = ordered.findIndex((candidate) => candidate.runnerId === runner.runnerId) + 1;
    const missingPenalty = values.filter((value) => value === null).length / Math.max(values.length, 1);
    return total + weight * ((race.runners.length - rank + 1) / race.runners.length - 0.2 * missingPenalty);
  }, 0);
}

function zWithinRace(runner: Runner, race: Race, feature: string): number {
  const value = num(runner.features[feature]);
  const values = race.runners.map((candidate) => num(candidate.features[feature])).filter((candidate): candidate is number => candidate !== null);
  if (value === null || values.length < 2) return -0.35;
  const mean = avg(values)!;
  const sd = Math.sqrt(avg(values.map((candidate) => (candidate - mean) ** 2)) ?? 0);
  return sd > 0 ? (value - mean) / sd : 0;
}

function confidence(probability: number, probabilityGap: number | null, scoreGap: number | null, leader: Runner, race: Race): Confidence {
  const history = num(leader.features.priorRuns) ?? 0;
  const missingBurden = ["officialRating", "trainerPriorWinRate", "jockeyPriorWinRate", "daysSinceLastRun"].filter((key) => num(leader.features[key]) === null).length;
  if (probability >= 0.3 && (probabilityGap ?? 0) >= 0.06 && history >= 3 && missingBurden <= 1) return "HIGH";
  if ((probability >= 0.22 && (probabilityGap ?? 0) >= 0.03) || (scoreGap ?? 0) >= 0.8 || (history >= 5 && race.fieldSize <= 7)) return "MEDIUM";
  return "LOW";
}

function calibrationMae(rows: EvaluatedRace[]) {
  const bins = ["<10", "10-20", "20-30", "30+"].map((label) => ({ label, rows: [] as EvaluatedRace[] }));
  for (const row of rows) {
    const p = row.probabilities.get(row.ranking[0]!.runnerId)!;
    bins[p < 0.1 ? 0 : p < 0.2 ? 1 : p < 0.3 ? 2 : 3]!.rows.push(row);
  }
  const errors = bins.filter((bin) => bin.rows.length >= 10).map((bin) => Math.abs(avg(bin.rows.map((row) => row.probabilities.get(row.ranking[0]!.runnerId)!))! - rate(bin.rows.filter((row) => row.ranking[0]!.won).length, bin.rows.length)!));
  return avg(errors);
}

function subtypeFor(row: FeatureRow, family: FamilyId) {
  if (family === "aw") return String(row.features.surface ?? "AW");
  if (family === "jump") {
    const text = `${stringFeature(row, "raceName")} ${stringFeature(row, "raceType")}`.toLowerCase();
    if (text.includes("nh flat") || text.includes("bumper")) return "NH Flat";
    if (text.includes("chase")) return "Chase";
    if (text.includes("hurdle")) return "Hurdle";
    return "Other Jump";
  }
  return "Turf";
}

function printTerminalSummary(evaluated: Array<{ candidate: Candidate; races: EvaluatedRace[] }>) {
  for (const family of ["turf", "jump", "aw"] as FamilyId[]) {
    const entries = evaluated.filter((entry) => entry.candidate.family === family);
    const best = bestDiagnosticCandidate(entries);
    const bestEntry = entries.find((entry) => entry.candidate.id === best.id)!;
    const m = metrics(bestEntry.races);
    const current = CURRENT_BASELINES[family];
    const shortRows = shortPriceConfidenceRows(bestEntry.races).filter((row) => row.priceBand !== ">=2/1");
    const highRows = shortPriceConfidenceRows(bestEntry.races).filter((row) => row.confidence === "HIGH");
    const abstain = abstentionRows(bestEntry.races)[1]!;
    console.log(`${FAMILY_LABEL[family]}`);
    console.log(`Current model: ${current.model}`);
    console.log(`Best candidate: ${best.id} ${best.label}`);
    console.log(`Current rank-1 strike: ${pct(current.strike)}`);
    console.log(`Candidate rank-1 strike: ${pct(m.top1Strike)}`);
    console.log(`Current top-3: n/a for supplied baseline`);
    console.log(`Candidate top-3: ${pct(m.top3Capture)}`);
    console.log(`Short-price strike: ${pct(rate(sum(shortRows.map((row) => row.actualWinners)), sum(shortRows.map((row) => row.selections))))}`);
    console.log(`High-confidence strike: ${pct(rate(sum(highRows.map((row) => row.actualWinners)), sum(highRows.map((row) => row.selections))))}`);
    console.log(`Abstention rate: ${pct(abstain.abstentionRate)}`);
    console.log(`Walk-forward stability: ${stabilityLabel(bestEntry.races)}`);
    console.log(`Recommendation: ${(recommendationsFor(evaluated)[family]?.id === best.id) ? "shadow prospectively" : "monitor only"}`);
    console.log("");
  }
  console.log(`Wrote ${MD_OUTPUT}`);
  console.log(`Wrote ${JSON_OUTPUT}`);
}

function bestDiagnosticCandidate(entries: Array<{ candidate: Candidate; races: EvaluatedRace[] }>) {
  return entries
    .map((entry) => ({ candidate: entry.candidate, metrics: metrics(entry.races), stability: stabilityPenalty(entry.races) }))
    .sort((left, right) =>
      scoreCandidate(right.metrics, right.stability) - scoreCandidate(left.metrics, left.stability) ||
      left.candidate.id.localeCompare(right.candidate.id)
    )[0]!.candidate;
}

function table(lines: string[], headers: string[], rows: Array<Array<string | number | null>>) {
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) lines.push(`| ${row.map((value) => value ?? "-").join(" | ")} |`);
}

function softmax(scores: number[]) {
  const max = Math.max(...scores);
  const weights = scores.map((score) => Math.exp(score - max));
  const total = sum(weights);
  return weights.map((weight) => weight / total);
}

function winnerProbability(row: EvaluatedRace) {
  return sum(row.race.runners.filter((runner) => runner.won).map((runner) => row.probabilities.get(runner.runnerId)!));
}

function stabilityPenalty(rows: EvaluatedRace[]) {
  const yearMetrics = YEARS.map((year) => metrics(rows.filter((row) => row.race.year === year)).top1Strike).filter((value): value is number => value !== null);
  return yearMetrics.length === 2 ? Math.abs(yearMetrics[1]! - yearMetrics[0]!) : 0.2;
}

function scoreCandidate(metricsValue: MetricSummary, stability: number) {
  return (metricsValue.top1Strike ?? 0) * 4 + (metricsValue.top3Capture ?? 0) + (1 - (metricsValue.calibrationMae ?? 0.2)) - stability * 2;
}

function verdict(candidate: MetricSummary, alternatives: MetricSummary[]) {
  const bestAlternative = alternatives.sort((left, right) => scoreCandidate(right, 0) - scoreCandidate(left, 0))[0]!;
  return scoreCandidate(candidate, 0) > scoreCandidate(bestAlternative, 0) ? "improves fixed alternatives" : "does not clearly beat simpler candidates";
}

function stabilityLabel(rows: EvaluatedRace[]) {
  const delta = stabilityPenalty(rows);
  if (delta < 0.025) return "stable";
  if (delta < 0.06) return "watch";
  return "unstable";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function decimal(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringFeature(row: FeatureRow, key: string): string {
  const value = row.features[key];
  return typeof value === "string" ? value : "";
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function groupBy<T, K>(values: T[], keyFor: (value: T) => K) {
  const groups = new Map<K, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function countBy<T, K extends string>(values: T[], keyFor: (value: T) => K) {
  const counts = {} as Record<K, number>;
  for (const value of values) counts[keyFor(value)] = (counts[keyFor(value)] ?? 0) + 1;
  return counts;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function avg(values: number[]) {
  return values.length ? sum(values) / values.length : null;
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function pct(value: number | null) {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`;
}

function fmt(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "-" : value.toFixed(3);
}

function signedPp(value: number) {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}pp`;
}

function mode(values: string[]) {
  const counts = countBy(values, (value) => value);
  return Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? "-";
}

if (process.argv[1]?.endsWith("build-ranking-model-stage2.ts")) await main();

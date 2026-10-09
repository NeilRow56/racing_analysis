import { writeFile } from "node:fs/promises";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { raceRunners, races } from "@/db/schema";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow as Row } from "@/lib/racing/historical-target-metrics";
import { calculateJumpRaceRatings } from "@/lib/racing/jump-performance-rating";
import { classifyJumpRaceSubtype, type JumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import { classifyHandicapStatus } from "@/lib/racing/research-rule";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";
import { loadJumpTissueForward } from "@/lib/racing/jump-tissue-forward";

type Year = "2025" | "2026";
type Subtype = JumpRaceSubtype;
type ClassMovement = "drop" | "same" | "rise" | "unknown";
type RankBand = "rank 1" | "rank 2-3" | "rank 4+" | "missing";
type MarketBand = "favourite" | "market rank 2-3" | "market rank 4+";
type Verdict = "PLAUSIBLE STRUCTURAL EXPLANATION" | "WEAK / INCONCLUSIVE" | "NO EVIDENCE";
type Decision =
  | "NO STRUCTURAL EXPLANATION FOUND"
  | "ONE OR MORE PLAUSIBLE FEATURES, BUT NOT STRONG ENOUGH FOR A NEW TEST"
  | "PLAUSIBLE REPLICATED STRUCTURAL FEATURE WORTH A SEPARATE CONTROLLED EXPERIMENT";

type HistoryRun = {
  runnerId: string;
  horseId: string;
  raceDateTime: Date | null;
  raceDate: string;
  raceClass: string | null;
  runnerComment: string | null;
};

type Summary = {
  races: number;
  runners: number;
  winners: number;
  strike: number | null;
  expectedWinners: number;
  ae: number | null;
  profitLoss: number;
  roi: number | null;
  largestWinnerReturn: number | null;
  profitLossExLargestWinner: number | null;
  profitLossExTop3WinnerReturns: number | null;
};

type FeatureComparison = {
  feature: string;
  type: "numeric" | "binary";
  coverage: number;
  coverageRate: number | null;
  winnerMean: number | null;
  winnerMedian: number | null;
  loserMean: number | null;
  loserMedian: number | null;
  difference: number | null;
  standardizedEffect: number | null;
  ci95: [number, number] | null;
  winnerMarketProbabilityMean: number | null;
  loserMarketProbabilityMean: number | null;
  residualAssociation: number | null;
  direction: string;
};

type GroupRow = {
  group: string;
  summary: Summary;
  byYear: Record<Year, Summary>;
  bySubtype: Record<Subtype, Summary>;
};

type Explanation = {
  feature: string;
  verdict: Verdict;
  rationale: string;
};

type Runner = {
  row: Row;
  year: Year;
  subtype: Subtype;
  avgL3Rank: number | null;
  latestRank: number | null;
  bestL3Rank: number | null;
  orRank: number | null;
  weightRank: number | null;
  marketRank: number | null;
  previousClass: number | null;
  currentClass: number | null;
  classMovement: ClassMovement;
  classDropSize: number | null;
  jprARank: number | null;
  jprBRank: number | null;
  jumpTissueRank: number | null;
  priorComments: string[];
  commentFlags: Record<string, boolean>;
};

type Report = {
  generatedAt: string;
  definition: string[];
  cacheCoverage: Array<Record<string, unknown>>;
  notes: string[];
  sample: {
    all: Summary;
    bySubtype: Record<Subtype, Summary>;
    byYear: Record<Year, Summary>;
  };
  featureComparisons: FeatureComparison[];
  marketRank: GroupRow[];
  orRelativity: GroupRow[];
  speedAgreement: GroupRow[];
  speedImprovement: {
    distribution: Array<Record<string, unknown>>;
    quartiles: GroupRow[];
  };
  speedConsistency: {
    varianceTerciles: GroupRow[];
    usableSpeedRuns: GroupRow[];
  };
  classDrop: GroupRow[];
  currentClass: GroupRow[];
  recency: GroupRow[];
  comments: GroupRow[];
  currentModels: {
    winnersByModelRank: GroupRow[];
    likedLosers: Array<Record<string, unknown>>;
  };
  interactions: GroupRow[];
  robustness: Array<Record<string, unknown>>;
  explanations: Explanation[];
  decision: Decision;
};

const YEARS: Year[] = ["2025", "2026"];
const SUBTYPES: Subtype[] = ["hurdle", "chase", "nh_flat", "unknown_other"];
const MARKDOWN = "/tmp/jump-g4-winner-loser-diagnostic.md";
const JSON_OUTPUT = "/tmp/jump-g4-winner-loser-diagnostic.json";

const COMMENT_PATTERNS: Array<{ key: string; label: string; pattern: RegExp }> = [
  { key: "heldUpRear", label: "held up / rear", pattern: /\b(held up|in rear|towards rear|rear|waited with)\b/i },
  { key: "prominent", label: "prominent / led", pattern: /\b(prominent|tracked leader|led|made all|close up|handy)\b/i },
  { key: "keen", label: "raced freely / keen", pattern: /\b(keen|freely|took keen hold|pulled hard|raced freely)\b/i },
  { key: "weakenedFaded", label: "weakened / faded", pattern: /\b(weakened|faded|tired|lost place|soon beaten)\b/i },
  { key: "jumpingError", label: "jumping error", pattern: /\b(mistake|blunder|pecked|hit \d|bad mistake|hampered by faller|unseated)\b/i },
  { key: "notFluent", label: "not fluent", pattern: /\b(not fluent|awkward|slow jump|jumped left|jumped right|scrubbed along)\b/i },
  { key: "lateProgress", label: "late progress", pattern: /\b(stayed on|kept on|ran on|headway|finished well|late progress)\b/i },
  { key: "trouble", label: "trouble", pattern: /\b(hampered|stumbled|short of room|badly hampered|impeded|checked|squeezed)\b/i },
  { key: "completionRisk", label: "completion risk", pattern: /\b(fell|unseated|refused|pulled up|brought down|ran out)\b/i },
];

async function main() {
  const loaded = await Promise.all(YEARS.map(loadYear));
  const rows = loaded.flatMap((item) => item.rows).filter(isEligibleJumpRow).sort(compareRows);
  const [history, tissueRanks] = await Promise.all([
    loadHistory(rows),
    loadJumpTissueRanks(),
  ]);
  const runners = buildRunners(rows, history, tissueRanks);
  const g4 = runners.filter(matchesG4);
  const report = buildReport(g4, loaded);
  await writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(MARKDOWN, renderMarkdown(report), "utf8");
  printTerminalSummary(report);
}

async function loadYear(year: Year) {
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: "jump", year });
  if (!cache) throw new Error(`Missing jump backtest feature cache for ${year}`);
  return {
    year,
    rows: cache.rows.filter((row) => row.features.raceCode === "jump"),
    directory: cache.directory,
    coverage: `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}`,
    generatedAt: cache.manifest.generatedAt,
  };
}

async function loadHistory(rows: Row[]): Promise<Map<string, HistoryRun[]>> {
  const { db, client } = createDbConnection();
  try {
    const horseIds = [...new Set(rows.map((row) => row.features.horseId))];
    const maxDate = rows.map((row) => row.features.raceDate).sort().at(-1) ?? "2026-12-31";
    const history: HistoryRun[] = [];
    for (const chunk of chunks(horseIds, 2_000)) {
      history.push(...await db
        .select({
          runnerId: raceRunners.id,
          horseId: raceRunners.horseId,
          raceDateTime: races.raceDatetime,
          raceDate: races.raceDate,
          raceClass: races.raceClass,
          runnerComment: raceRunners.runnerComment,
        })
        .from(raceRunners)
        .innerJoin(races, eq(raceRunners.raceId, races.id))
        .where(and(
          eq(raceRunners.source, "sporting_life"),
          eq(races.source, "sporting_life"),
          inArray(raceRunners.horseId, chunk),
          lte(races.raceDate, maxDate),
        ))
        .orderBy(asc(raceRunners.horseId), asc(races.raceDatetime), asc(races.raceDate), asc(raceRunners.id)));
    }
    return group(history, (run) => run.horseId);
  } finally {
    await client.end();
  }
}

async function loadJumpTissueRanks(): Promise<Map<string, number>> {
  const ranks = new Map<string, number>();
  const forward = await loadJumpTissueForward();
  for (const race of forward.races) {
    for (const runner of race.runners) {
      if (runner.rank !== null) ranks.set(runner.runnerId, runner.rank);
    }
  }
  return ranks;
}

function buildRunners(rows: Row[], historyByHorse: Map<string, HistoryRun[]>, tissueRanks: Map<string, number>): Runner[] {
  const avgRanks = rankWithinRace(rows, (row) => row.features.averageJumpSpeedLast3);
  const latestRanks = rankWithinRace(rows, (row) => row.features.latestJumpSpeedRating);
  const bestRanks = rankWithinRace(rows, (row) => row.features.bestJumpSpeedLast3);
  const orRanks = rankWithinRace(rows, (row) => row.features.officialRating);
  const weightRanks = rankWithinRace(rows, (row) => row.features.weightCarriedLbs);
  const marketRanks = rankWithinRace(rows, (row) => sp(row) === null ? null : -sp(row)!);
  const jprRanks = jprRanksForRows(rows);

  const runners = rows.map((row) => {
    const prior = priorHistory(row, historyByHorse.get(row.features.horseId) ?? []);
    const previousClass = raceClassNumber(prior.at(-1)?.raceClass ?? null);
    const currentClass = raceClassNumber(row.features.raceClass);
    const classDropSize = currentClass !== null && previousClass !== null && currentClass > previousClass ? currentClass - previousClass : null;
    const comments = prior.slice(-3).map((run) => run.runnerComment).filter((comment): comment is string => Boolean(comment));
    return {
      row,
      year: row.features.raceDate.slice(0, 4) as Year,
      subtype: classifyJumpRaceSubtype(row.features),
      avgL3Rank: avgRanks.get(id(row)) ?? null,
      latestRank: latestRanks.get(id(row)) ?? null,
      bestL3Rank: bestRanks.get(id(row)) ?? null,
      orRank: orRanks.get(id(row)) ?? null,
      weightRank: weightRanks.get(id(row)) ?? null,
      marketRank: marketRanks.get(id(row)) ?? null,
      previousClass,
      currentClass,
      classMovement: classMovement(currentClass, previousClass),
      classDropSize,
      jprARank: jprRanks.get(id(row))?.jprA ?? null,
      jprBRank: jprRanks.get(id(row))?.jprB ?? null,
      jumpTissueRank: tissueRanks.get(id(row)) ?? null,
      priorComments: comments,
      commentFlags: commentFlags(comments),
    };
  });
  fieldRowsCache.clear();
  for (const [raceId, raceRows] of group(runners, (runner) => runner.row.features.targetRaceId)) {
    fieldRowsCache.set(raceId, raceRows);
  }
  return runners;
}

function jprRanksForRows(rows: Row[]) {
  const result = new Map<string, { jprA: number | null; jprB: number | null }>();
  for (const raceRows of group(rows, (row) => row.features.targetRaceId).values()) {
    const ratings = calculateJumpRaceRatings(raceRows.map((row) => ({
      runnerId: id(row),
      resultStatus: row.outcome.resultStatus,
      averageJumpSpeedLast3: row.features.averageJumpSpeedLast3,
      trainerPriorStrikeRate: row.features.trainerPriorWinRate,
      officialRating: row.features.officialRating,
    })));
    for (const row of raceRows) {
      const rating = ratings.get(id(row));
      result.set(id(row), { jprA: rating?.jprA?.rank ?? null, jprB: rating?.jprB?.rank ?? null });
    }
  }
  return result;
}

function matchesG4(runner: Runner) {
  return (runner.avgL3Rank ?? Infinity) <= 3 &&
    runner.classMovement === "drop" &&
    valid(runner.row.features.latestJumpSpeedRating) &&
    valid(runner.row.features.previousJumpSpeedRating) &&
    runner.row.features.latestJumpSpeedRating > runner.row.features.previousJumpSpeedRating;
}

function buildReport(g4: Runner[], loaded: Array<{ year: Year; rows: Row[]; directory: string; coverage: string; generatedAt: string }>): Report {
  const comparisons = featureComparisons(g4).sort((left, right) => Math.abs(right.standardizedEffect ?? 0) - Math.abs(left.standardizedEffect ?? 0));
  const marketRows = groupRows(g4, "market rank", (runner) => marketRankBand(runner.marketRank));
  const orRows = groupRows(g4, "OR rank", (runner) => rankBand(runner.orRank));
  const speedAgreement = speedAgreementRows(g4);
  const improvementValues = g4.map(speedImprovement).filter(valid).sort((a, b) => a - b);
  const consistencyValues = g4.map(speedStdev).filter(valid).sort((a, b) => a - b);
  const commentRows = COMMENT_PATTERNS.map(({ key, label }) => groupRow(
    label,
    g4.filter((runner) => runner.commentFlags[key] === true),
  )).filter((row) => row.summary.runners >= 10);
  const modelRows = [
    ...groupRows(g4.filter(won), "G4 winners by Jump Tissue rank", (runner) => rankBand(runner.jumpTissueRank)),
    ...groupRows(g4.filter(won), "G4 winners by JPR-A rank", (runner) => rankBand(runner.jprARank)),
    ...groupRows(g4.filter(won), "G4 winners by JPR-B rank", (runner) => rankBand(runner.jprBRank)),
  ];
  const interactionRows = [
    groupRow("G4 x OR top3", g4.filter((runner) => (runner.orRank ?? Infinity) <= 3)),
    groupRow("G4 x speed agreement", g4.filter((runner) => (runner.latestRank ?? Infinity) <= 3 && (runner.bestL3Rank ?? Infinity) <= 3)),
    groupRow("G4 x 3+ prior usable speed runs", g4.filter((runner) => usableSpeedRuns(runner) >= 3)),
    groupRow("G4 x class drop 2+", g4.filter((runner) => (runner.classDropSize ?? 0) >= 2)),
    groupRow("G4 x market rank 4+", g4.filter((runner) => (runner.marketRank ?? Infinity) >= 4)),
  ];
  const robustnessRows = [
    ...interestingRows("market rank", marketRows),
    ...interestingRows("OR relativity", orRows),
    ...interestingRows("speed agreement", speedAgreement),
    ...interestingRows("speed consistency", groupRowsByTercile(g4, "speed variance", speedStdev, consistencyValues)),
    ...interestingRows("interactions", interactionRows),
  ];
  const explanations = rankExplanations({ comparisons, marketRows, orRows, speedAgreement, commentRows, interactionRows });
  return {
    generatedAt: new Date().toISOString(),
    definition: [
      "Jump G4 fixed profile: Avg L3 Jump speed rank <= 3.",
      "Class drop uses canonical race class where a larger class number is lower class; e.g. Class 3 to Class 4 is a drop by 1.",
      "Speed improvement is strictly latest Jump speed > previous Jump speed.",
      "No speed threshold, class-drop threshold, price threshold, or model fitting was optimized.",
    ],
    cacheCoverage: loaded.map((item) => ({
      year: item.year,
      coverage: item.coverage,
      cacheRows: item.rows.length,
      cache: item.directory,
      generatedAt: item.generatedAt,
    })),
    notes: [
      "All pre-race numeric features come from the chronology-safe backtest feature cache.",
      "Prior comment flags use only earlier race comments for the same horse; target-race comments are excluded.",
      "SP is used only for retrospective settlement, expected winners, market rank, and market-adjusted descriptive residuals.",
      "Jump Tissue rank coverage depends on the local forward archive and is sparse for historical 2025/2026 backtest rows.",
    ],
    sample: {
      all: summarize(g4),
      bySubtype: Object.fromEntries(SUBTYPES.map((subtype) => [subtype, summarize(g4.filter((runner) => runner.subtype === subtype))])) as Record<Subtype, Summary>,
      byYear: Object.fromEntries(YEARS.map((year) => [year, summarize(g4.filter((runner) => runner.year === year))])) as Record<Year, Summary>,
    },
    featureComparisons: comparisons,
    marketRank: marketRows,
    orRelativity: [
      ...orRows,
      ...groupRowsByTercile(g4, "OR relative to field mean", orRelativeToFieldMean, g4.map(orRelativeToFieldMean).filter(valid).sort((a, b) => a - b)),
      ...groupRowsByTercile(g4, "OR gap to best", orGapToBest, g4.map(orGapToBest).filter(valid).sort((a, b) => a - b)),
    ],
    speedAgreement,
    speedImprovement: {
      distribution: distributionRows(g4, "latest - previous Jump speed", speedImprovement),
      quartiles: groupRowsByQuantile(g4, "speed improvement quartile", speedImprovement, improvementValues, 4),
    },
    speedConsistency: {
      varianceTerciles: groupRowsByQuantile(g4, "recent speed variance tercile", speedStdev, consistencyValues, 3),
      usableSpeedRuns: groupRows(g4, "usable prior speed runs", (runner) => {
        const count = usableSpeedRuns(runner);
        return count <= 1 ? "1 usable" : count === 2 ? "2 usable" : "3+ usable";
      }),
    },
    classDrop: groupRows(g4, "class drop size", (runner) => runner.classDropSize === 1 ? "drop 1 class" : "drop 2+ classes"),
    currentClass: groupRows(g4, "current class", (runner) => runner.currentClass === null ? "missing" : `Class ${runner.currentClass}`),
    recency: groupRows(g4, "days since run", (runner) => daysBand(runner.row.features.daysSinceLastRun)),
    comments: commentRows,
    currentModels: {
      winnersByModelRank: modelRows,
      likedLosers: likedLoserRows(g4),
    },
    interactions: interactionRows,
    robustness: robustnessRows,
    explanations,
    decision: decisionFor(explanations),
  };
}

function featureComparisons(runners: Runner[]): FeatureComparison[] {
  const numeric: Array<[string, (runner: Runner) => number | null]> = [
    ["Avg L3 speed rank", (runner) => runner.avgL3Rank],
    ["latest speed rank", (runner) => runner.latestRank],
    ["best L3 speed rank", (runner) => runner.bestL3Rank],
    ["Avg L3 speed absolute", (runner) => runner.row.features.averageJumpSpeedLast3],
    ["latest speed absolute", (runner) => runner.row.features.latestJumpSpeedRating],
    ["best L3 speed", (runner) => runner.row.features.bestJumpSpeedLast3],
    ["OR", (runner) => runner.row.features.officialRating],
    ["OR rank", (runner) => runner.orRank],
    ["OR gap to field best", orGapToBest],
    ["OR relative to field mean", orRelativeToFieldMean],
    ["days since run", (runner) => runner.row.features.daysSinceLastRun],
    ["prior Jump-run count", (runner) => runner.row.features.priorRuns],
    ["latest minus previous speed", speedImprovement],
    ["latest minus Avg L3 speed", (runner) => diff(runner.row.features.latestJumpSpeedRating, runner.row.features.averageJumpSpeedLast3)],
    ["best minus average", (runner) => diff(runner.row.features.bestJumpSpeedLast3, runner.row.features.averageJumpSpeedLast3)],
    ["recent speed standard deviation", speedStdev],
    ["number of contributing speed runs", (runner) => usableSpeedRuns(runner)],
    ["age of latest speed evidence", (runner) => runner.row.features.daysSinceLastRun],
    ["trainer prior strike", (runner) => runner.row.features.trainerPriorWinRate],
    ["jockey prior strike", (runner) => runner.row.features.jockeyPriorWinRate ?? null],
    ["trainer scale", (runner) => Math.log1p(runner.row.features.trainerPriorRuns)],
    ["field size", (runner) => runner.row.features.actualRunnerCount ?? runner.row.features.declaredRunnerCount],
    ["distance yards", (runner) => runner.row.features.distanceYards],
    ["weight rank", (runner) => runner.weightRank],
    ["market rank", (runner) => runner.marketRank],
    ["SP decimal", (runner) => sp(runner)],
  ];
  const binary: Array<[string, (runner: Runner) => boolean | null]> = [
    ["class drop by 1", (runner) => runner.classDropSize === 1],
    ["class drop by 2+", (runner) => (runner.classDropSize ?? 0) >= 2],
    ["handicap", (runner) => classifyHandicapStatus(runner.row.features) === "handicap"],
    ["Hurdle", (runner) => runner.subtype === "hurdle"],
    ["Chase", (runner) => runner.subtype === "chase"],
    ...COMMENT_PATTERNS.map(({ key, label }) => [label, (runner: Runner) => runner.commentFlags[key]] as [string, (runner: Runner) => boolean | null]),
  ];
  return [
    ...numeric.map(([name, value]) => compareFeature(runners, name, "numeric", value)),
    ...binary.map(([name, value]) => compareFeature(runners, name, "binary", (runner) => {
      const flag = value(runner);
      return flag === null ? null : flag ? 1 : 0;
    })),
  ];
}

function compareFeature(runners: Runner[], feature: string, type: "numeric" | "binary", value: (runner: Runner) => number | null): FeatureComparison {
  const values = runners
    .map((runner) => ({ runner, value: value(runner) }))
    .filter((entry): entry is { runner: Runner; value: number } => valid(entry.value));
  const winners = values.filter(({ runner }) => won(runner)).map(({ value }) => value);
  const losers = values.filter(({ runner }) => !won(runner)).map(({ value }) => value);
  const winnerMean = average(winners);
  const loserMean = average(losers);
  const difference = winnerMean !== null && loserMean !== null ? winnerMean - loserMean : null;
  const residualAssociation = residualSlope(values.map(({ runner, value }) => ({ x: value, residual: marketResidual(runner) })));
  return {
    feature,
    type,
    coverage: values.length,
    coverageRate: rate(values.length, runners.length),
    winnerMean,
    winnerMedian: median(winners),
    loserMean,
    loserMedian: median(losers),
    difference,
    standardizedEffect: standardizedDifference(winners, losers),
    ci95: differenceCi(winners, losers),
    winnerMarketProbabilityMean: average(values.filter(({ runner }) => won(runner)).map(({ runner }) => marketProbability(runner))),
    loserMarketProbabilityMean: average(values.filter(({ runner }) => !won(runner)).map(({ runner }) => marketProbability(runner))),
    residualAssociation,
    direction: directionText(feature, difference, residualAssociation),
  };
}

function summarize(runners: Runner[]): Summary {
  const settled = runners.filter((runner) => sp(runner) !== null);
  const winners = settled.filter(won);
  const returns = winners.map((runner) => sp(runner)!).sort((a, b) => b - a);
  const grossReturn = returns.reduce((sum, value) => sum + value, 0);
  const expectedWinners = settled.reduce((sum, runner) => sum + marketProbability(runner), 0);
  const races = distinct(settled, (runner) => runner.row.features.targetRaceId);
  return {
    races,
    runners: settled.length,
    winners: winners.length,
    strike: rate(winners.length, settled.length),
    expectedWinners,
    ae: expectedWinners > 0 ? winners.length / expectedWinners : null,
    profitLoss: grossReturn - settled.length,
    roi: rate(grossReturn - settled.length, settled.length),
    largestWinnerReturn: returns[0] ?? null,
    profitLossExLargestWinner: returns.length ? grossReturn - returns[0]! - (settled.length - 1) : null,
    profitLossExTop3WinnerReturns: returns.length ? grossReturn - returns.slice(0, 3).reduce((sum, value) => sum + value, 0) - Math.max(0, settled.length - Math.min(3, returns.length)) : null,
  };
}

function groupRows(runners: Runner[], prefix: string, key: (runner: Runner) => string): GroupRow[] {
  return [...group(runners, key)].map(([label, rows]) => groupRow(`${prefix}: ${label}`, rows));
}

function groupRow(groupName: string, rows: Runner[]): GroupRow {
  return {
    group: groupName,
    summary: summarize(rows),
    byYear: Object.fromEntries(YEARS.map((year) => [year, summarize(rows.filter((runner) => runner.year === year))])) as Record<Year, Summary>,
    bySubtype: Object.fromEntries(SUBTYPES.map((subtype) => [subtype, summarize(rows.filter((runner) => runner.subtype === subtype))])) as Record<Subtype, Summary>,
  };
}

function groupRowsByQuantile(runners: Runner[], prefix: string, value: (runner: Runner) => number | null, sortedValues: number[], buckets: number): GroupRow[] {
  if (sortedValues.length === 0) return [];
  return Array.from({ length: buckets }, (_, index) => {
    const low = index === 0 ? -Infinity : quantile(sortedValues, index / buckets) ?? -Infinity;
    const high = index === buckets - 1 ? Infinity : quantile(sortedValues, (index + 1) / buckets) ?? Infinity;
    const label = `${prefix} ${index + 1}: ${fmt(low, 2, "-inf")} to ${fmt(high, 2, "inf")}`;
    return groupRow(label, runners.filter((runner) => {
      const current = value(runner);
      return current !== null && current > low && current <= high;
    }));
  });
}

function groupRowsByTercile(runners: Runner[], prefix: string, value: (runner: Runner) => number | null, sortedValues: number[]) {
  return groupRowsByQuantile(runners, prefix, value, sortedValues, 3);
}

function distributionRows(runners: Runner[], label: string, value: (runner: Runner) => number | null) {
  const winners = runners.filter(won).map(value).filter(valid).sort((a, b) => a - b);
  const losers = runners.filter((runner) => !won(runner)).map(value).filter(valid).sort((a, b) => a - b);
  return [
    distributionRow(`${label} winners`, winners),
    distributionRow(`${label} losers`, losers),
  ];
}

function distributionRow(label: string, values: number[]) {
  return {
    group: label,
    n: values.length,
    mean: average(values),
    median: median(values),
    q1: quantile(values, 0.25),
    q3: quantile(values, 0.75),
    min: values[0] ?? null,
    max: values.at(-1) ?? null,
  };
}

function likedLoserRows(g4: Runner[]) {
  const rows = [
    { label: "G4 losers that were Jump Tissue rank 1", rows: g4.filter((runner) => !won(runner) && runner.jumpTissueRank === 1) },
    { label: "G4 losers that were JPR-A rank 1", rows: g4.filter((runner) => !won(runner) && runner.jprARank === 1) },
    { label: "G4 losers that were market favourite", rows: g4.filter((runner) => !won(runner) && runner.marketRank === 1) },
  ];
  return rows.map(({ label, rows: selected }) => ({
    group: label,
    runners: selected.length,
    expectedWinners: summarize(selected).expectedWinners,
    averageMarketProbability: average(selected.map(marketProbability)),
    averageORRank: average(selected.map((runner) => runner.orRank).filter(valid)),
    averageSpeedImprovement: average(selected.map(speedImprovement).filter(valid)),
    topCommentFlags: topCommentFlags(selected),
  }));
}

function interestingRows(section: string, rows: GroupRow[]) {
  return rows
    .filter((row) => row.summary.runners >= 20 && ((row.summary.ae ?? 0) >= 1.05 || (row.summary.roi ?? 0) > 0))
    .map((row) => ({
      section,
      group: row.group,
      runners: row.summary.runners,
      winners: row.summary.winners,
      "A/E": row.summary.ae,
      ROI: row.summary.roi,
      "2025 A/E": row.byYear["2025"].ae,
      "2026 A/E": row.byYear["2026"].ae,
      "Hurdle A/E": row.bySubtype.hurdle.ae,
      "Chase A/E": row.bySubtype.chase.ae,
      "largest winner": row.summary.largestWinnerReturn,
      "P/L": row.summary.profitLoss,
      "P/L ex largest": row.summary.profitLossExLargestWinner,
      "P/L ex top3 wins": row.summary.profitLossExTop3WinnerReturns,
    }));
}

function rankExplanations(input: {
  comparisons: FeatureComparison[];
  marketRows: GroupRow[];
  orRows: GroupRow[];
  speedAgreement: GroupRow[];
  commentRows: GroupRow[];
  interactionRows: GroupRow[];
}): Explanation[] {
  const candidates: Explanation[] = [];
  const orTop3 = input.orRows.find((row) => row.group.endsWith("rank 2-3")) ?? input.orRows.find((row) => row.group.endsWith("rank 1"));
  if (orTop3) candidates.push(explanation("OR support", orTop3, "Recent speed appears more credible when supported by a field-top OR rank."));
  const agreement = input.speedAgreement.find((row) => row.group.includes("all three speed")) ?? input.speedAgreement.find((row) => row.group.includes("latest rank <=3"));
  if (agreement) candidates.push(explanation("speed-measure agreement", agreement, "Winners may be coming from repeated speed evidence rather than the average rank alone."));
  const usable = input.interactionRows.find((row) => row.group === "G4 x 3+ prior usable speed runs");
  if (usable) candidates.push(explanation("3+ usable speed runs", usable, "More repeated prior evidence can separate reliable improvers from one-run spikes."));
  const classDrop = input.interactionRows.find((row) => row.group === "G4 x class drop 2+");
  if (classDrop) candidates.push(explanation("class drop 2+", classDrop, "Large class drops may explain part of the G4 lift if not fully absorbed by the market."));
  const comment = input.commentRows.sort((a, b) => (b.summary.ae ?? 0) - (a.summary.ae ?? 0))[0];
  if (comment) candidates.push(explanation(`comment flag: ${comment.group}`, comment, "Prior comment context may identify hidden-form improvement, but parsing is intentionally conservative."));
  return candidates
    .sort((a, b) => verdictScore(b.verdict) - verdictScore(a.verdict))
    .slice(0, 5);
}

function explanation(feature: string, row: GroupRow, rationale: string): Explanation {
  const y25 = row.byYear["2025"];
  const y26 = row.byYear["2026"];
  const hurdle = row.bySubtype.hurdle;
  const chase = row.bySubtype.chase;
  const replicatedYears = (y25.ae ?? 0) >= 1 && (y26.ae ?? 0) >= 1;
  const replicatedSubtype = (hurdle.runners < 20 || (hurdle.ae ?? 0) >= 0.95) && (chase.runners < 20 || (chase.ae ?? 0) >= 0.95);
  const notPriceDriven = row.summary.ae !== null && row.summary.ae >= 1.05;
  const notOneWinner = row.summary.profitLossExLargestWinner !== null && row.summary.profitLossExLargestWinner > row.summary.profitLoss * 0.25;
  const verdict: Verdict = row.summary.runners >= 50 && replicatedYears && replicatedSubtype && notPriceDriven && notOneWinner
    ? "PLAUSIBLE STRUCTURAL EXPLANATION"
    : row.summary.runners >= 20 && notPriceDriven
      ? "WEAK / INCONCLUSIVE"
      : "NO EVIDENCE";
  return {
    feature,
    verdict,
    rationale: `${rationale} Evidence: ${row.summary.runners} runners, A/E ${fmt(row.summary.ae)}, ROI ${pct(row.summary.roi)}, 2025 A/E ${fmt(y25.ae)}, 2026 A/E ${fmt(y26.ae)}.`,
  };
}

function decisionFor(explanations: Explanation[]): Decision {
  if (explanations.some((item) => item.verdict === "PLAUSIBLE STRUCTURAL EXPLANATION")) {
    return "ONE OR MORE PLAUSIBLE FEATURES, BUT NOT STRONG ENOUGH FOR A NEW TEST";
  }
  if (explanations.some((item) => item.verdict === "WEAK / INCONCLUSIVE")) {
    return "ONE OR MORE PLAUSIBLE FEATURES, BUT NOT STRONG ENOUGH FOR A NEW TEST";
  }
  return "NO STRUCTURAL EXPLANATION FOUND";
}

function renderMarkdown(report: Report) {
  const lines = ["# Jump G4 Winner-vs-Loser Diagnostic", ""];
  lines.push("## Executive Summary", "");
  lines.push(`Decision: **${report.decision}**.`);
  lines.push(`Fixed G4 sample: ${compact(report.sample.all)}. Date/cache coverage: ${report.cacheCoverage.map((row) => `${row.year} ${row.coverage}`).join("; ")}.`);
  lines.push("No thresholds were optimized and no betting rule was created.", "");
  lines.push("## G4 Definition", "", ...report.definition.map((line) => `- ${line}`), "");
  lines.push("## Sample", "");
  table(lines, [
    { split: "All G4", ...summaryColumns(report.sample.all) },
    ...YEARS.map((year) => ({ split: year, ...summaryColumns(report.sample.byYear[year]) })),
    ...SUBTYPES.map((subtype) => ({ split: subtype, ...summaryColumns(report.sample.bySubtype[subtype]) })),
  ]);
  lines.push("## Winner vs Loser Feature Comparison", "");
  table(lines, report.featureComparisons.slice(0, 30).map(featureColumns));
  lines.push("## Market Control", "");
  lines.push("Market control is deliberately simple: SP implied probability is used as expected winners. Feature tables include A/E and residual association with `won - SP probability`, so a group must beat market expectation rather than merely contain shorter-priced runners.", "");
  table(lines, report.marketRank.map(groupColumns));
  lines.push("## OR Relativity", "");
  table(lines, report.orRelativity.map(groupColumns));
  lines.push("## Speed Agreement", "");
  table(lines, report.speedAgreement.map(groupColumns));
  lines.push("## Speed Improvement", "");
  table(lines, report.speedImprovement.distribution);
  table(lines, report.speedImprovement.quartiles.map(groupColumns));
  lines.push("## Speed Consistency", "");
  table(lines, report.speedConsistency.varianceTerciles.map(groupColumns));
  table(lines, report.speedConsistency.usableSpeedRuns.map(groupColumns));
  lines.push("## Class Drop", "");
  table(lines, report.classDrop.map(groupColumns));
  table(lines, report.currentClass.map(groupColumns));
  lines.push("## Recency", "");
  table(lines, report.recency.map(groupColumns));
  lines.push("## Comment Features", "");
  table(lines, report.comments.map(groupColumns));
  lines.push("## Current Model Comparison", "");
  table(lines, report.currentModels.winnersByModelRank.map(groupColumns));
  table(lines, report.currentModels.likedLosers);
  lines.push("## Pre-Specified Interactions", "");
  table(lines, report.interactions.map(groupColumnsWithSplits));
  lines.push("## 2025 vs 2026", "");
  table(lines, YEARS.map((year) => ({ year, ...summaryColumns(report.sample.byYear[year]) })));
  lines.push("## Hurdle vs Chase", "");
  table(lines, SUBTYPES.map((subtype) => ({ subtype, ...summaryColumns(report.sample.bySubtype[subtype]) })));
  lines.push("## Robustness", "");
  table(lines, report.robustness);
  lines.push("## Structural Explanations", "");
  table(lines, report.explanations);
  lines.push("## Recommendation", "");
  lines.push(recommendation(report), "");
  lines.push("## Notes", "", ...report.notes.map((note) => `- ${note}`), "");
  return `${lines.join("\n")}\n`;
}

function recommendation(report: Report) {
  if (report.decision === "NO STRUCTURAL EXPLANATION FOUND") {
    return "Do not promote G4. The fixed profile remains descriptive only, with no structural explanation strong enough to justify even a controlled follow-up.";
  }
  return "Keep G4 frozen and do not create a betting rule. The plausible factors above are suitable only for a separate, explicitly controlled experiment if they remain directionally consistent under prospective data.";
}

function printTerminalSummary(report: Report) {
  console.log(`G4 sample: ${compact(report.sample.all)}`);
  console.log(`2025: ${compact(report.sample.byYear["2025"])}`);
  console.log(`2026: ${compact(report.sample.byYear["2026"])}`);
  console.log(`Decision: ${report.decision}`);
  console.log(`Wrote ${MARKDOWN}`);
  console.log(`Wrote ${JSON_OUTPUT}`);
}

function isEligibleJumpRow(row: Row) {
  return row.features.raceCode === "jump" && row.outcome.resultStatus !== "non_runner" && row.outcome.finishingPosition !== null && sp(row) !== null;
}

function priorHistory(row: Row, history: HistoryRun[]) {
  const targetTime = row.features.raceDateTime.getTime();
  return history
    .filter((run) => run.runnerId !== id(row))
    .filter((run) => timeForHistoryRun(run) < targetTime)
    .sort((left, right) => timeForHistoryRun(left) - timeForHistoryRun(right) || left.runnerId.localeCompare(right.runnerId));
}

function classMovement(currentClass: number | null, previousClass: number | null): ClassMovement {
  if (currentClass === null || previousClass === null) return "unknown";
  if (currentClass > previousClass) return "drop";
  if (currentClass < previousClass) return "rise";
  return "same";
}

function commentFlags(comments: string[]) {
  const text = comments.join(" | ");
  return Object.fromEntries(COMMENT_PATTERNS.map(({ key, pattern }) => [key, pattern.test(text)]));
}

function rankWithinRace(rows: Row[], valueFor: (row: Row) => number | null): Map<string, number> {
  const result = new Map<string, number>();
  for (const raceRows of group(rows.filter((row) => row.outcome.resultStatus !== "non_runner"), (row) => row.features.targetRaceId).values()) {
    const sorted = raceRows
      .map((row) => ({ row, value: valueFor(row) }))
      .filter((entry): entry is { row: Row; value: number } => valid(entry.value))
      .sort((left, right) => right.value - left.value || id(left.row).localeCompare(id(right.row)));
    let previousValue: number | null = null;
    let previousRank = 0;
    sorted.forEach((entry, index) => {
      const rank = entry.value === previousValue ? previousRank : index + 1;
      result.set(id(entry.row), rank);
      previousValue = entry.value;
      previousRank = rank;
    });
  }
  return result;
}

function speedAgreementRows(runners: Runner[]) {
  return [
    groupRow("A avg L3 rank <=3 and latest rank <=3", runners.filter((runner) => (runner.avgL3Rank ?? Infinity) <= 3 && (runner.latestRank ?? Infinity) <= 3)),
    groupRow("B avg L3 rank <=3 but latest rank >3", runners.filter((runner) => (runner.avgL3Rank ?? Infinity) <= 3 && (runner.latestRank ?? Infinity) > 3)),
    groupRow("C avg L3 rank <=3 and best L3 rank <=3", runners.filter((runner) => (runner.avgL3Rank ?? Infinity) <= 3 && (runner.bestL3Rank ?? Infinity) <= 3)),
    groupRow("D all three speed measures top 3", runners.filter((runner) => (runner.avgL3Rank ?? Infinity) <= 3 && (runner.latestRank ?? Infinity) <= 3 && (runner.bestL3Rank ?? Infinity) <= 3)),
  ];
}

function speedImprovement(runner: Runner) {
  return diff(runner.row.features.latestJumpSpeedRating, runner.row.features.previousJumpSpeedRating);
}

function speedStdev(runner: Runner) {
  const values = [
    runner.row.features.latestJumpSpeedRating,
    runner.row.features.previousJumpSpeedRating,
    runner.row.features.bestJumpSpeedLast3,
  ].filter(valid);
  if (values.length < 2) return null;
  const mean = average(values)!;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function usableSpeedRuns(runner: Runner) {
  return Math.min(3, [
    runner.row.features.latestJumpSpeedRating,
    runner.row.features.previousJumpSpeedRating,
    runner.row.features.bestJumpSpeedLast3,
  ].filter(valid).length);
}

function orRelativeToFieldMean(runner: Runner) {
  const value = runner.row.features.officialRating;
  if (!valid(value)) return null;
  const field = fieldRowsCache.get(runner.row.features.targetRaceId) ?? [];
  const mean = average(field.map((item) => item.row.features.officialRating).filter(valid));
  return mean === null ? null : value - mean;
}

function orGapToBest(runner: Runner) {
  const value = runner.row.features.officialRating;
  if (!valid(value)) return null;
  const field = fieldRowsCache.get(runner.row.features.targetRaceId) ?? [];
  const best = Math.max(...field.map((item) => item.row.features.officialRating).filter(valid));
  return Number.isFinite(best) ? value - best : null;
}

const fieldRowsCache = new Map<string, Runner[]>();

function marketRankBand(rank: number | null): MarketBand {
  return rank === 1 ? "favourite" : rank !== null && rank <= 3 ? "market rank 2-3" : "market rank 4+";
}

function rankBand(rank: number | null): RankBand {
  return rank === null ? "missing" : rank === 1 ? "rank 1" : rank <= 3 ? "rank 2-3" : "rank 4+";
}

function daysBand(days: number | null) {
  if (days === null) return "missing";
  if (days <= 14) return "<=14 days";
  if (days <= 30) return "15-30 days";
  if (days <= 60) return "31-60 days";
  if (days <= 120) return "61-120 days";
  return ">120 days";
}

function directionText(feature: string, difference: number | null, residualAssociation: number | null) {
  if (difference === null) return "insufficient coverage";
  const side = difference > 0 ? "higher in winners" : difference < 0 ? "lower in winners" : "level";
  const residual = residualAssociation === null ? "market residual unavailable" : residualAssociation > 0 ? "positive beyond SP" : residualAssociation < 0 ? "negative beyond SP" : "flat beyond SP";
  return `${side}; ${residual}; ${feature}`;
}

function marketProbability(runner: Runner) {
  const price = sp(runner);
  return price === null ? 0 : 1 / price;
}

function marketResidual(runner: Runner) {
  return (won(runner) ? 1 : 0) - marketProbability(runner);
}

function won(runner: Runner) {
  return runner.row.outcome.won === true;
}

function sp(input: Runner | Row) {
  const row = "row" in input ? input.row : input;
  const value = Number(row.outcome.startingPriceDecimal);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function id(row: Row) {
  return row.features.targetRunnerId;
}

function compareRows(left: Row, right: Row) {
  return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() || id(left).localeCompare(id(right));
}

function timeForHistoryRun(run: { raceDateTime: Date | null; raceDate: string }) {
  return run.raceDateTime?.getTime() ?? new Date(`${run.raceDate}T00:00:00Z`).getTime();
}

function diff(left: number | null, right: number | null) {
  return valid(left) && valid(right) ? left - right : null;
}

function residualSlope(values: Array<{ x: number; residual: number }>) {
  if (values.length < 10) return null;
  const xMean = average(values.map((item) => item.x))!;
  const yMean = average(values.map((item) => item.residual))!;
  const variance = values.reduce((sum, item) => sum + (item.x - xMean) ** 2, 0);
  if (variance === 0) return null;
  return values.reduce((sum, item) => sum + (item.x - xMean) * (item.residual - yMean), 0) / variance;
}

function standardizedDifference(winners: number[], losers: number[]) {
  if (winners.length < 2 || losers.length < 2) return null;
  const diffMean = average(winners)! - average(losers)!;
  const pooled = Math.sqrt((((winners.length - 1) * variance(winners)) + ((losers.length - 1) * variance(losers))) / (winners.length + losers.length - 2));
  return pooled === 0 ? null : diffMean / pooled;
}

function differenceCi(winners: number[], losers: number[]): [number, number] | null {
  if (winners.length < 2 || losers.length < 2) return null;
  const difference = average(winners)! - average(losers)!;
  const se = Math.sqrt(variance(winners) / winners.length + variance(losers) / losers.length);
  return [difference - 1.96 * se, difference + 1.96 * se];
}

function variance(values: number[]) {
  if (values.length < 2) return 0;
  const mean = average(values)!;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
}

function topCommentFlags(rows: Runner[]) {
  return COMMENT_PATTERNS
    .map(({ key, label }) => ({ label, count: rows.filter((runner) => runner.commentFlags[key]).length }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 3)
    .map((item) => `${item.label} ${item.count}`)
    .join("; ");
}

function featureColumns(item: FeatureComparison) {
  return {
    feature: item.feature,
    type: item.type,
    coverage: item.coverage,
    "coverage %": pct(item.coverageRate),
    "winner mean": fmt(item.winnerMean),
    "winner median": fmt(item.winnerMedian),
    "loser mean": fmt(item.loserMean),
    "loser median": fmt(item.loserMedian),
    diff: fmt(item.difference),
    std: fmt(item.standardizedEffect),
    "95% CI": item.ci95 ? `${fmt(item.ci95[0])} to ${fmt(item.ci95[1])}` : "-",
    "winner SP prob": pct(item.winnerMarketProbabilityMean),
    "loser SP prob": pct(item.loserMarketProbabilityMean),
    "residual assoc": fmt(item.residualAssociation, 4),
    direction: item.direction,
  };
}

function groupColumns(row: GroupRow) {
  return {
    group: row.group,
    ...summaryColumns(row.summary),
  };
}

function groupColumnsWithSplits(row: GroupRow) {
  return {
    ...groupColumns(row),
    "2025 A/E": fmt(row.byYear["2025"].ae),
    "2026 A/E": fmt(row.byYear["2026"].ae),
    "Hurdle A/E": fmt(row.bySubtype.hurdle.ae),
    "Chase A/E": fmt(row.bySubtype.chase.ae),
  };
}

function summaryColumns(summary: Summary) {
  return {
    races: summary.races,
    runners: summary.runners,
    winners: summary.winners,
    strike: pct(summary.strike),
    "exp winners": fmt(summary.expectedWinners),
    "A/E": fmt(summary.ae),
    "P/L": fmt(summary.profitLoss),
    ROI: pct(summary.roi),
  };
}

function compact(summary: Summary) {
  return `${summary.races} races, ${summary.runners} runners, ${summary.winners} winners, strike ${pct(summary.strike)}, expected ${fmt(summary.expectedWinners)}, A/E ${fmt(summary.ae)}, ROI ${pct(summary.roi)}`;
}

function table(lines: string[], rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    lines.push("No rows.", "");
    return;
  }
  const headers = Object.keys(rows[0]!);
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    lines.push(`| ${headers.map((header) => String(row[header] ?? "-").replace(/\|/g, "\\|")).join(" | ")} |`);
  }
  lines.push("");
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function group<T>(values: T[], key: (value: T) => string) {
  const result = new Map<string, T[]>();
  for (const value of values) result.set(key(value), [...(result.get(key(value)) ?? []), value]);
  return result;
}

function distinct<T>(values: T[], key: (value: T) => string) {
  return new Set(values.map(key)).size;
}

function valid(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function quantile(values: number[], q: number) {
  if (!values.length) return null;
  const position = (values.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const next = values[base + 1];
  return next === undefined ? values[base]! : values[base]! + rest * (next - values[base]!);
}

function rate(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

function pct(value: number | null) {
  return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`;
}

function fmt(value: number | null, decimals = 3, fallback = "-") {
  return value === null || !Number.isFinite(value) ? fallback : value.toFixed(decimals);
}

function verdictScore(verdict: Verdict) {
  if (verdict === "PLAUSIBLE STRUCTURAL EXPLANATION") return 2;
  if (verdict === "WEAK / INCONCLUSIVE") return 1;
  return 0;
}

if (process.argv[1]?.endsWith("diagnose-jump-g4-winner-loser.ts")) {
  await main();
}

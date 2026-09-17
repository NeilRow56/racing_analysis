import { writeFile } from "node:fs/promises";
import {
  loadLatestBacktestFeatureCacheForYear,
  type BacktestCacheFamily,
} from "@/lib/racing/backtest-cache";
import { createDbConnection } from "@/db";
import {
  getHistoricalTargetRunnerMetrics,
  type HistoricalTargetRunnerMetricsRow,
} from "@/lib/racing/historical-target-metrics";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";
import { TURF_PERFORMANCE_RATING_VERSION } from "@/lib/racing/turf-performance-rating";

type Year = "2025" | "2026";
type VariantKey = "W0" | "W50" | "W75" | "W100" | "W100_CAP3" | "C50" | "W50_C50";
type RankMap = Map<string, number>;

type Context = {
  year: Year;
  cacheFamily: BacktestCacheFamily;
  cacheWindow: string;
  actualCoverage: string;
  allRows: HistoricalTargetRunnerMetricsRow[];
  rows: HistoricalTargetRunnerMetricsRow[];
  races: RaceContext[];
};

type RaceContext = {
  raceId: string;
  rows: HistoricalTargetRunnerMetricsRow[];
  medianWeight: number | null;
};

type Variant = {
  key: VariantKey;
  label: string;
  weightMultiplier: number;
  classMultiplier: number;
  capDisplayedWeightPoints: number | null;
};

type ScoredRunner = {
  row: HistoricalTargetRunnerMetricsRow;
  raceId: string;
  runnerId: string;
  horseName: string;
  won: boolean;
  placed: boolean;
  tpr: number | null;
  raw: number | null;
  base: number | null;
  classRaw: number;
  weightDiff: number | null;
  weightRawProduction: number | null;
  weightDisplayedProduction: number | null;
  weightRawApplied: number | null;
  weightDisplayedApplied: number | null;
  rank: number | null;
};

type VariantResult = {
  variant: Variant;
  scored: ScoredRunner[];
  ranksByRunner: RankMap;
};

type CaseResult = {
  horse: string;
  variant: VariantKey;
  tpr: number | null;
  rank: number | null;
  weightDisplayedApplied: number | null;
};

type PredictiveMetrics = {
  validRunners: number;
  raceCount: number;
  rank1Runners: number;
  rank1Winners: number;
  rank1Strike: number | null;
  winners: number;
  top3WinnerCapture: number | null;
  places: number;
  top3PlaceCapture: number | null;
  winCorrelation: number | null;
  averageTpr: number | null;
  stdevTpr: number | null;
  brier18Rank1: number | null;
};

type StabilityMetrics = {
  sameRank1RacePct: number | null;
  sameTop3SetRacePct: number | null;
  avgAbsRankChange: number | null;
  runnerMove4PlusPct: number | null;
  rank1ChangedRacePct: number | null;
};

const OUTPUT_PATH = "/tmp/tpr-weight-sensitivity.md";
const YEARS: Year[] = ["2025", "2026"];

const B3_WEIGHTS: [number, number, number] = [0.6, 0.25, 0.15];
const RPR_MEDIAN_2025 = 59.73279656117335;
const RPR_IQR_2025 = 15.303501885173738;
const SPEED_MEDIAN_2025 = 96.81426514225745;
const SPEED_IQR_2025 = 13.71148109158355;
const CLASS_OFFSETS_2025: Record<string, number> = {
  "Class 1": 0.40728372695748705,
  "Class 2": 0.21081366080149383,
  "Class 3": 0.15923801805811594,
  "Class 4": 0.012261721350936047,
  "Class 5": -0.07957322921317331,
  "Class 6": -0.197767969260115,
  unknown: -0.05486729600240039,
};
const WEIGHT_COEFFICIENT_RAW_POINTS_PER_LB = 0.1216065319677862;
const TPR_DEVELOPMENT_MEAN = -0.103;
const TPR_DEVELOPMENT_STDEV = 1.223;
const DISPLAYED_POINTS_PER_RAW = 10 / TPR_DEVELOPMENT_STDEV;
const CAP_DISPLAYED_POINTS = 3;
const CAP_RAW_POINTS = CAP_DISPLAYED_POINTS / DISPLAYED_POINTS_PER_RAW;

const VARIANTS: Variant[] = [
  { key: "W0", label: "W0 - no weight", weightMultiplier: 0, classMultiplier: 1, capDisplayedWeightPoints: null },
  { key: "W50", label: "W50 - half weight", weightMultiplier: 0.5, classMultiplier: 1, capDisplayedWeightPoints: null },
  { key: "W75", label: "W75 - three-quarter weight", weightMultiplier: 0.75, classMultiplier: 1, capDisplayedWeightPoints: null },
  { key: "W100", label: "W100 - production", weightMultiplier: 1, classMultiplier: 1, capDisplayedWeightPoints: null },
  { key: "W100_CAP3", label: "W100 capped at ±3 displayed points", weightMultiplier: 1, classMultiplier: 1, capDisplayedWeightPoints: CAP_DISPLAYED_POINTS },
  { key: "C50", label: "C50 - half class adjustment", weightMultiplier: 1, classMultiplier: 0.5, capDisplayedWeightPoints: null },
  { key: "W50_C50", label: "W50 + C50", weightMultiplier: 0.5, classMultiplier: 0.5, capDisplayedWeightPoints: null },
];

async function main() {
  const contexts = await Promise.all(YEARS.map(loadContext));
  const resultsByYear = new Map<Year, Map<VariantKey, VariantResult>>();
  for (const context of contexts) {
    resultsByYear.set(context.year, scoreVariants(context));
  }
  const caseResults = await loadCaseResults(contexts.find((entry) => entry.year === "2026") ?? null);
  const lines = buildReport(contexts, resultsByYear, caseResults);
  await writeFile(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
}

async function loadContext(year: Year): Promise<Context> {
  const candidates = (await Promise.all([
    loadLatestBacktestFeatureCacheForYear({ year, family: "turf_flat" }),
    loadLatestBacktestFeatureCacheForYear({ year, family: "all" }),
  ])).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const cache = candidates
    .map((entry) => ({
      ...entry,
      turfRows: entry.rows
        .filter((row) => row.features.raceCode === "turf")
        .filter(isSettledRunner)
        .sort(compareRows),
    }))
    .filter((entry) => entry.turfRows.length > 0)
    .sort((left, right) => {
      const leftTo = left.actualCoverage?.actualTo ?? left.manifest.to;
      const rightTo = right.actualCoverage?.actualTo ?? right.manifest.to;
      return rightTo.localeCompare(leftTo) || right.turfRows.length - left.turfRows.length;
    })[0];
  if (!cache) {
    throw new Error(`Missing compatible v4 cache for ${year}`);
  }
  const rows = cache.turfRows;
  return {
    year,
    cacheFamily: cache.manifest.family,
    cacheWindow: `${cache.manifest.from} to ${cache.manifest.to}`,
    actualCoverage: `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}`,
    allRows: cache.rows.sort(compareRows),
    rows,
    races: [...groupBy(rows, (row) => row.features.targetRaceId).entries()].map(([raceId, raceRows]) => ({
      raceId,
      rows: raceRows,
      medianWeight: median(
        raceRows
          .map((row) => row.features.weightCarriedLbs)
          .filter((value): value is number => value !== null),
      ),
    })),
  };
}

function scoreVariants(context: Context): Map<VariantKey, VariantResult> {
  const result = new Map<VariantKey, VariantResult>();
  for (const variant of VARIANTS) {
    const scored = context.races.flatMap((race) => scoreRace(race, variant));
    const ranksByRunner = new Map(scored.map((runner) => [runner.runnerId, runner.rank]).filter((entry): entry is [string, number] => entry[1] !== null));
    result.set(variant.key, { variant, scored, ranksByRunner });
  }
  return result;
}

async function loadCaseResults(context: Context | null): Promise<CaseResult[]> {
  const cases = caseTargets();
  if (!context || !process.env.DATABASE_URL) {
    return cases.flatMap((target) => VARIANTS.map((variant) => ({
      horse: target.horse,
      variant: variant.key,
      tpr: null,
      rank: null,
      weightDisplayedApplied: null,
    })));
  }

  const raceIds = [...new Set(cases.flatMap((target) =>
    context.allRows
      .filter((row) =>
        row.features.horseName === target.horse &&
        row.features.raceDate === target.date &&
        row.features.courseName === target.course
      )
      .map((row) => row.features.targetRaceId)
  ))];
  if (raceIds.length === 0) {
    return [];
  }

  const { db, client } = createDbConnection();
  try {
    const rows = await getHistoricalTargetRunnerMetrics(db, {
      source: "sporting_life",
      targetRaceIds: raceIds,
      ratingFamily: "turf",
    });
    const races = [...groupBy(rows, (row) => row.features.targetRaceId).entries()]
      .map(([raceId, raceRows]) => ({
        raceId,
        rows: raceRows,
        medianWeight: median(
          raceRows
            .map((row) => row.features.weightCarriedLbs)
            .filter((value): value is number => value !== null),
        ),
      }));
    return cases.flatMap((target) =>
      VARIANTS.map((variant) => {
        const race = races.find((entry) => entry.rows.some((row) =>
          row.features.horseName === target.horse &&
          row.features.raceDate === target.date &&
          row.features.courseName === target.course
        ));
        const scored = race ? scoreRace(race, variant) : [];
        const row = scored.find((runner) => runner.horseName === target.horse);
        return {
          horse: target.horse,
          variant: variant.key,
          tpr: row?.tpr ?? null,
          rank: row?.rank ?? null,
          weightDisplayedApplied: row?.weightDisplayedApplied ?? null,
        };
      })
    );
  } finally {
    await client.end();
  }
}

function scoreRace(race: RaceContext, variant: Variant): ScoredRunner[] {
  const scored = race.rows.map((row) => scoreRunner(row, race.medianWeight, variant));
  const ranks = rankBy(scored, (runner) => runner.tpr, (runner) => runner.runnerId);
  return scored.map((runner) => ({
    ...runner,
    rank: ranks.get(runner.runnerId) ?? null,
  }));
}

function scoreRunner(row: HistoricalTargetRunnerMetricsRow, medianWeight: number | null, variant: Variant): ScoredRunner {
  const performanceValues = reconstructedLast3Values(
    row.features.latestPerformanceRating,
    row.features.previousPerformanceRating,
    row.features.averagePerformanceLast3,
  );
  const speedValues = reconstructedLast3Values(
    row.features.latestTurfSpeedRating,
    row.features.previousTurfSpeedRating,
    row.features.averageTurfSpeedLast3,
  );
  const performance = weightedRecentLevel(performanceValues);
  const speed = weightedRecentLevel(speedValues);
  const performanceRobust = robustScore(performance, RPR_MEDIAN_2025, RPR_IQR_2025);
  const speedRobust = robustScore(speed, SPEED_MEDIAN_2025, SPEED_IQR_2025);
  const base = performanceRobust === null || speedRobust === null ? null : (performanceRobust + speedRobust) / 2;
  const classRaw = classOffset(row.features.raceClass);
  const weightDiff = row.features.weightCarriedLbs === null || medianWeight === null
    ? null
    : row.features.weightCarriedLbs - medianWeight;
  const weightRawProduction = weightDiff === null ? null : WEIGHT_COEFFICIENT_RAW_POINTS_PER_LB * weightDiff;
  const uncappedApplied = weightRawProduction === null
    ? null
    : weightRawProduction * variant.weightMultiplier;
  const capRaw = variant.capDisplayedWeightPoints === null
    ? null
    : variant.capDisplayedWeightPoints / DISPLAYED_POINTS_PER_RAW;
  const weightRawApplied = uncappedApplied === null
    ? null
    : capRaw === null
      ? uncappedApplied
      : Math.max(-capRaw, Math.min(capRaw, uncappedApplied));
  const raw = base === null || weightDiff === null
    ? null
    : base - (classRaw * variant.classMultiplier) + (weightRawApplied ?? 0);

  return {
    row,
    raceId: row.features.targetRaceId,
    runnerId: row.features.targetRunnerId,
    horseName: row.features.horseName,
    won: row.outcome.won === true,
    placed: row.outcome.placed === true,
    tpr: raw === null ? null : toDisplayedTpr(raw),
    raw,
    base,
    classRaw,
    weightDiff,
    weightRawProduction,
    weightDisplayedProduction: weightRawProduction === null ? null : weightRawProduction * DISPLAYED_POINTS_PER_RAW,
    weightRawApplied,
    weightDisplayedApplied: weightRawApplied === null ? null : weightRawApplied * DISPLAYED_POINTS_PER_RAW,
    rank: null,
  };
}

function buildReport(
  contexts: Context[],
  resultsByYear: Map<Year, Map<VariantKey, VariantResult>>,
  caseResults: CaseResult[],
): string[] {
  const lines: string[] = [];
  lines.push("# TPR Weight Sensitivity Diagnostic");
  lines.push("");
  lines.push("Diagnostic only. Production TPR, Today, Research, cache logic, importer behavior, schemas, and cache versions were not changed.");
  lines.push("");
  writeFormula(lines);
  writeScope(lines, contexts);
  writeBaseline(lines, contexts, resultsByYear);
  writePredictiveMetrics(lines, contexts, resultsByYear);
  writeRankStability(lines, contexts, resultsByYear);
  writeWinnerSensitivity(lines, contexts, resultsByYear);
  writeWeightEffectBands(lines, contexts, resultsByYear);
  writeWeightDirection(lines, contexts, resultsByYear);
  writeThreeRunnerCases(lines, caseResults);
  writeHoldoutInterpretation(lines, contexts, resultsByYear);
  writeConclusion(lines, contexts, resultsByYear);
  return lines;
}

function writeFormula(lines: string[]) {
  lines.push("## Production Formula Reconciliation");
  lines.push("");
  lines.push(`Baseline version: \`${TURF_PERFORMANCE_RATING_VERSION}\`.`);
  lines.push("");
  lines.push("Production reconstructs up to three recent performance values and up to three recent Turf speed values from latest, previous, and average-L3 fields, weights them `0.60 / 0.25 / 0.15`, robust-scales each against the frozen 2025 median/IQR, and averages the two robust scores.");
  lines.push("");
  lines.push("Relative-weight formula:");
  lines.push("");
  lines.push("```text");
  lines.push("weightDiffLb = runnerWeightCarriedLb - raceMedianWeightCarriedLb");
  lines.push(`weightRaw = ${WEIGHT_COEFFICIENT_RAW_POINTS_PER_LB} * weightDiffLb`);
  lines.push("rawRating = baseRobustBlend - classOffset + weightRaw");
  lines.push(`displayedTPR = 100 + 10 * ((rawRating - ${TPR_DEVELOPMENT_MEAN}) / ${TPR_DEVELOPMENT_STDEV})`);
  lines.push("```");
  lines.push("");
  lines.push(`Sign convention: carrying more than the race median gives a positive adjustment; carrying less than the median gives a negative adjustment. One raw point is ${round(DISPLAYED_POINTS_PER_RAW, 4)} displayed TPR points, so one pound equals ${round(WEIGHT_COEFFICIENT_RAW_POINTS_PER_LB * DISPLAYED_POINTS_PER_RAW, 3)} displayed TPR points. Production has no cap. The diagnostic cap of ±3 displayed points is ±${round(CAP_RAW_POINTS, 4)} raw points.`);
  lines.push("");
}

function writeScope(lines: string[], contexts: Context[]) {
  lines.push("## Scope");
  lines.push("");
  table(lines, contexts.map((context) => ({
    year: context.year,
    "cache family": context.cacheFamily,
    "cache window": context.cacheWindow,
    "actual coverage": context.actualCoverage,
    "settled Turf runners": context.rows.length,
    races: context.races.length,
  })));
  lines.push("");
}

function writeBaseline(lines: string[], contexts: Context[], resultsByYear: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Baseline W100");
  lines.push("");
  table(lines, contexts.map((context) => {
    const production = resultFor(resultsByYear, context.year, "W100");
    const noWeight = resultFor(resultsByYear, context.year, "W0");
    const metrics = predictiveMetrics(production);
    const movement = movementMetrics(production, noWeight);
    return {
      year: context.year,
      "valid TPR": metrics.validRunners,
      "rank-1 strike": pct(metrics.rank1Strike),
      "top-3 winner capture": pct(metrics.top3WinnerCapture),
      "top-3 place capture": pct(metrics.top3PlaceCapture),
      "win corr": number(metrics.winCorrelation, 4),
      "avg TPR": number(metrics.averageTpr),
      "TPR stdev": number(metrics.stdevTpr),
      "rank1 differs pre-weight": pct(movement.rank1ChangedRacePct),
      "avg abs rank move from weight": number(movement.avgAbsRankChange),
      "move 0": pct(rankMoveBucket(production, noWeight, "0")),
      "move 1": pct(rankMoveBucket(production, noWeight, "1")),
      "move 2-3": pct(rankMoveBucket(production, noWeight, "2-3")),
      "move 4+": pct(rankMoveBucket(production, noWeight, "4+")),
    };
  }));
  lines.push("");
}

function writePredictiveMetrics(lines: string[], contexts: Context[], resultsByYear: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Predictive Metrics");
  lines.push("");
  table(lines, contexts.flatMap((context) =>
    VARIANTS.map((variant) => {
      const metrics = predictiveMetrics(resultFor(resultsByYear, context.year, variant.key));
      return {
        year: context.year,
        variant: variant.key,
        "valid runners": metrics.validRunners,
        races: metrics.raceCount,
        "rank-1 strike": pct(metrics.rank1Strike),
        "rank-1 winners": metrics.rank1Winners,
        "top-3 winner capture": pct(metrics.top3WinnerCapture),
        "top-3 place capture": pct(metrics.top3PlaceCapture),
        "win corr": number(metrics.winCorrelation, 4),
        "avg TPR": number(metrics.averageTpr),
        "TPR stdev": number(metrics.stdevTpr),
        "Brier @18% rank1": number(metrics.brier18Rank1, 4),
      };
    })
  ));
  lines.push("");
}

function writeRankStability(lines: string[], contexts: Context[], resultsByYear: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Rank Stability Vs Production W100");
  lines.push("");
  table(lines, contexts.flatMap((context) => {
    const production = resultFor(resultsByYear, context.year, "W100");
    return VARIANTS.filter((variant) => variant.key !== "W100").map((variant) => {
      const metrics = stabilityMetrics(production, resultFor(resultsByYear, context.year, variant.key));
      return {
        year: context.year,
        variant: variant.key,
        "same rank1 horse": pct(metrics.sameRank1RacePct),
        "same top3 set": pct(metrics.sameTop3SetRacePct),
        "avg abs rank change": number(metrics.avgAbsRankChange),
        "runners move 4+": pct(metrics.runnerMove4PlusPct),
        "rank1 changed by variant": pct(metrics.rank1ChangedRacePct),
      };
    });
  }));
  lines.push("");
}

function writeWinnerSensitivity(lines: string[], contexts: Context[], resultsByYear: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Winner Sensitivity");
  lines.push("");
  table(lines, contexts.flatMap((context) => {
    const production = resultFor(resultsByYear, context.year, "W100");
    return VARIANTS.map((variant) => {
      const result = resultFor(resultsByYear, context.year, variant.key);
      const sensitivity = winnerSensitivity(production, result);
      return {
        year: context.year,
        variant: variant.key,
        "rank1 winners": sensitivity.rank1Winners,
        "top3 winners": sensitivity.top3Winners,
        "rank1 gained": sensitivity.rank1Gained,
        "rank1 lost": sensitivity.rank1Lost,
        "net rank1": sensitivity.netRank1,
        "top3 gained": sensitivity.top3Gained,
        "top3 lost": sensitivity.top3Lost,
      };
    });
  }));
  lines.push("");
}

function writeWeightEffectBands(lines: string[], contexts: Context[], resultsByYear: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Large Production Weight-Effect Cases");
  lines.push("");
  table(lines, contexts.flatMap((context) => {
    const production = resultFor(resultsByYear, context.year, "W100");
    const noWeight = resultFor(resultsByYear, context.year, "W0");
    return ["<1", "1-1.99", "2-2.99", "3-3.99", "4+"] .map((band) => weightBandStats(context.year, band, production, noWeight));
  }));
  lines.push("");
}

function writeWeightDirection(lines: string[], contexts: Context[], resultsByYear: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Direction Of Production Weight Effect");
  lines.push("");
  lines.push("Near-zero is defined as absolute production displayed weight adjustment below 0.5 TPR points.");
  lines.push("");
  table(lines, contexts.flatMap((context) => {
    const production = resultFor(resultsByYear, context.year, "W100");
    const noWeight = resultFor(resultsByYear, context.year, "W0");
    return ["positive", "near-zero", "negative"].map((direction) => directionStats(context.year, direction, production, noWeight));
  }));
  lines.push("");
}

function caseTargets() {
  return [
    { horse: "Cerro Blanco", date: "2026-09-16", course: "Sandown" },
    { horse: "Mare Crisium", date: "2026-09-16", course: "Clonmel" },
    { horse: "Raffles Angel", date: "2026-09-16", course: "Yarmouth" },
  ];
}

function writeThreeRunnerCases(lines: string[], caseResults: CaseResult[]) {
  lines.push("## Three-Runner Case Check");
  lines.push("");
  lines.push("These three rows are illustrative only. Aggregates above remain cache-based; this section loads the current DB target-race metrics because the latest cache stores these 2026-09-16 rows as unsupported/unsettled racecard rows.");
  lines.push("");
  table(lines, caseResults.map((row) => ({
    horse: row.horse,
    variant: row.variant,
    TPR: number(row.tpr),
    rank: row.rank ?? "-",
    "weight pts": number(row.weightDisplayedApplied),
  })));
  lines.push("");
}

function writeHoldoutInterpretation(lines: string[], contexts: Context[], resultsByYear: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Holdout-First Interpretation");
  lines.push("");
  table(lines, VARIANTS.filter((variant) => variant.key !== "W100").map((variant) => {
    const y2025 = classifyVariant(resultFor(resultsByYear, "2025", "W100"), resultFor(resultsByYear, "2025", variant.key));
    const y2026 = classifyVariant(resultFor(resultsByYear, "2026", "W100"), resultFor(resultsByYear, "2026", variant.key));
    return {
      variant: variant.key,
      "2025 vs W100": y2025,
      "2026 vs W100": y2026,
      classification: combinedClassification(y2025, y2026),
    };
  }));
  lines.push("");
}

function writeConclusion(lines: string[], contexts: Context[], resultsByYear: Map<Year, Map<VariantKey, VariantResult>>) {
  const p2026 = resultFor(resultsByYear, "2026", "W100");
  const w0 = resultFor(resultsByYear, "2026", "W0");
  const w50 = resultFor(resultsByYear, "2026", "W50");
  const w75 = resultFor(resultsByYear, "2026", "W75");
  const cap = resultFor(resultsByYear, "2026", "W100_CAP3");
  const c50 = resultFor(resultsByYear, "2026", "C50");
  const w50c50 = resultFor(resultsByYear, "2026", "W50_C50");
  const pMetrics = predictiveMetrics(p2026);
  const stabilityW0 = stabilityMetrics(p2026, w0);
  const stabilityCap = stabilityMetrics(p2026, cap);

  lines.push("## Conclusion");
  lines.push("");
  lines.push(`1. Production W100 ${beats(p2026, w0) ? "does" : "does not"} outperform no-weight in 2026 on the simple combined rank-1/top-3/correlation score used here.`);
  lines.push(`2. W50 ${beats(w50, p2026) ? "matches/beats" : "does not match/beat"} W100; W75 ${beats(w75, p2026) ? "matches/beats" : "does not match/beat"} W100.`);
  lines.push(`3. The ±3-point cap is ${beats(cap, p2026) ? "competitive with or better than" : "not better than"} production on predictive metrics; it leaves ${pct(stabilityCap.sameRank1RacePct)} of rank-1 horses unchanged and ${pct(stabilityCap.runnerMove4PlusPct)} of runners moving 4+ ranks vs production.`);
  lines.push(`4. Class adjustment is ${beats(c50, p2026) ? "a plausible concern because C50 improves the 2026 score" : "not clearly too strong on this holdout view"}.`);
  lines.push(`5. C50 ${beats(c50, p2026) ? "improves" : "does not improve"} holdout performance vs W100.`);
  lines.push(`6. W50 + C50 ${beats(w50c50, p2026) ? "helps" : "does not help"} vs W100 on the 2026 combined score.`);
  lines.push(`7. Production weight changes the top-rated horse vs no-weight in ${pct(stabilityW0.rank1ChangedRacePct)} of 2026 races.`);
  lines.push(`8. Production weight moves ${pct(stabilityW0.runnerMove4PlusPct)} of 2026 valid runners by 4+ ranks vs no-weight.`);
  lines.push(`9. There ${stabilityW0.rank1ChangedRacePct !== null && stabilityW0.rank1ChangedRacePct > 0.2 ? "is" : "is limited"} evidence the current weight coefficient is influential at runner level; influence is not automatically the same as overfitting.`);
  lines.push(`10. The clearest candidate for a separately pre-specified confirmation test is ${preferredVariant(resultsByYear) ?? "none"}.`);
  lines.push(`11. ${preferredVariant(resultsByYear) ? "Do not change production yet; confirm the candidate in a separate pre-specified diagnostic." : "Production TPR should remain unchanged for now."}`);
  lines.push("");
  lines.push(`2026 W100 reference: rank-1 strike ${pct(pMetrics.rank1Strike)}, top-3 winner capture ${pct(pMetrics.top3WinnerCapture)}, win correlation ${number(pMetrics.winCorrelation, 4)}.`);
}

function predictiveMetrics(result: VariantResult): PredictiveMetrics {
  const valid = result.scored.filter((runner) => runner.tpr !== null && runner.rank !== null);
  const rank1 = valid.filter((runner) => runner.rank === 1);
  const top3 = valid.filter((runner) => runner.rank !== null && runner.rank <= 3);
  const winners = valid.filter((runner) => runner.won);
  const places = valid.filter((runner) => runner.placed);
  return {
    validRunners: valid.length,
    raceCount: new Set(valid.map((runner) => runner.raceId)).size,
    rank1Runners: rank1.length,
    rank1Winners: rank1.filter((runner) => runner.won).length,
    rank1Strike: percentage(rank1.filter((runner) => runner.won).length, rank1.length),
    winners: winners.length,
    top3WinnerCapture: percentage(top3.filter((runner) => runner.won).length, winners.length),
    places: places.length,
    top3PlaceCapture: percentage(top3.filter((runner) => runner.placed).length, places.length),
    winCorrelation: pearson(valid.map((runner) => runner.tpr ?? 0), valid.map((runner) => runner.won ? 1 : 0)),
    averageTpr: average(valid.map((runner) => runner.tpr).filter(isNumber)),
    stdevTpr: stdev(valid.map((runner) => runner.tpr).filter(isNumber)),
    brier18Rank1: rank1.length === 0 ? null : average(rank1.map((runner) => ((runner.won ? 1 : 0) - 0.18) ** 2)),
  };
}

function stabilityMetrics(production: VariantResult, variant: VariantResult): StabilityMetrics {
  const prodByRace = raceRankSets(production);
  const variantByRace = raceRankSets(variant);
  const raceIds = [...prodByRace.keys()].filter((raceId) => variantByRace.has(raceId));
  let sameRank1 = 0;
  let sameTop3 = 0;
  let rank1Changed = 0;
  for (const raceId of raceIds) {
    const prod = prodByRace.get(raceId)!;
    const alt = variantByRace.get(raceId)!;
    if (prod.rank1 !== null && prod.rank1 === alt.rank1) sameRank1 += 1;
    if (setKey(prod.top3) === setKey(alt.top3)) sameTop3 += 1;
    if (prod.rank1 !== alt.rank1) rank1Changed += 1;
  }
  const changes = runnerRankChanges(production, variant);
  return {
    sameRank1RacePct: percentage(sameRank1, raceIds.length),
    sameTop3SetRacePct: percentage(sameTop3, raceIds.length),
    avgAbsRankChange: average(changes.map((entry) => Math.abs(entry.change))),
    runnerMove4PlusPct: percentage(changes.filter((entry) => Math.abs(entry.change) >= 4).length, changes.length),
    rank1ChangedRacePct: percentage(rank1Changed, raceIds.length),
  };
}

function movementMetrics(production: VariantResult, noWeight: VariantResult): StabilityMetrics {
  return stabilityMetrics(noWeight, production);
}

function rankMoveBucket(production: VariantResult, noWeight: VariantResult, bucket: "0" | "1" | "2-3" | "4+"): number | null {
  const changes = runnerRankChanges(noWeight, production).map((entry) => Math.abs(entry.change));
  if (changes.length === 0) return null;
  const count = changes.filter((change) => {
    if (bucket === "0") return change === 0;
    if (bucket === "1") return change === 1;
    if (bucket === "2-3") return change >= 2 && change <= 3;
    return change >= 4;
  }).length;
  return count / changes.length;
}

function winnerSensitivity(production: VariantResult, variant: VariantResult) {
  const prodRank1 = winnerSet(production, 1);
  const prodTop3 = winnerSet(production, 3);
  const rank1 = winnerSet(variant, 1);
  const top3 = winnerSet(variant, 3);
  return {
    rank1Winners: rank1.size,
    top3Winners: top3.size,
    rank1Gained: difference(rank1, prodRank1).size,
    rank1Lost: difference(prodRank1, rank1).size,
    netRank1: rank1.size - prodRank1.size,
    top3Gained: difference(top3, prodTop3).size,
    top3Lost: difference(prodTop3, top3).size,
  };
}

function weightBandStats(year: Year, band: string, production: VariantResult, noWeight: VariantResult) {
  const changes = new Map(runnerRankChanges(noWeight, production).map((entry) => [entry.runnerId, Math.abs(entry.change)]));
  const rows = production.scored.filter((runner) => {
    const abs = Math.abs(runner.weightDisplayedProduction ?? 0);
    if (band === "<1") return abs < 1;
    if (band === "1-1.99") return abs >= 1 && abs < 2;
    if (band === "2-2.99") return abs >= 2 && abs < 3;
    if (band === "3-3.99") return abs >= 3 && abs < 4;
    return abs >= 4;
  });
  return {
    year,
    band,
    runners: rows.length,
    "rank1 freq": pct(percentage(rows.filter((runner) => runner.rank === 1).length, rows.length)),
    "winner rate": pct(percentage(rows.filter((runner) => runner.won).length, rows.length)),
    "avg rank move": number(average(rows.map((runner) => changes.get(runner.runnerId) ?? null).filter(isNumber))),
    "move 4+": pct(percentage(rows.filter((runner) => (changes.get(runner.runnerId) ?? 0) >= 4).length, rows.length)),
  };
}

function directionStats(year: Year, direction: string, production: VariantResult, noWeight: VariantResult) {
  const changes = new Map(runnerRankChanges(noWeight, production).map((entry) => [entry.runnerId, Math.abs(entry.change)]));
  const rows = production.scored.filter((runner) => {
    const value = runner.weightDisplayedProduction ?? 0;
    if (direction === "positive") return value >= 0.5;
    if (direction === "negative") return value <= -0.5;
    return Math.abs(value) < 0.5;
  });
  const rank1 = rows.filter((runner) => runner.rank === 1);
  return {
    year,
    direction,
    runners: rows.length,
    "strike rate": pct(percentage(rows.filter((runner) => runner.won).length, rows.length)),
    "avg rank movement": number(average(rows.map((runner) => changes.get(runner.runnerId) ?? null).filter(isNumber))),
    "rank1 runners": rank1.length,
    "rank1 strike": pct(percentage(rank1.filter((runner) => runner.won).length, rank1.length)),
  };
}

function classifyVariant(production: VariantResult, variant: VariantResult): "improves" | "neutral" | "worse" {
  const p = predictiveMetrics(production);
  const v = predictiveMetrics(variant);
  const scoreDelta = combinedScore(v) - combinedScore(p);
  if (scoreDelta > 0.002) return "improves";
  if (scoreDelta < -0.002) return "worse";
  return "neutral";
}

function combinedClassification(y2025: string, y2026: string): string {
  if (y2025 === "improves" && y2026 === "improves") return "improves both years";
  if (y2026 === "improves" && y2025 !== "improves") return "improves 2026 only";
  if (y2026 === "neutral") return y2025 === "worse" ? "unstable" : "neutral";
  if (y2026 === "worse" && y2025 === "improves") return "unstable";
  return "worse";
}

function beats(left: VariantResult, right: VariantResult): boolean {
  return combinedScore(predictiveMetrics(left)) >= combinedScore(predictiveMetrics(right));
}

function preferredVariant(resultsByYear: Map<Year, Map<VariantKey, VariantResult>>): string | null {
  const production = resultFor(resultsByYear, "2026", "W100");
  const candidates = VARIANTS
    .filter((variant) => variant.key !== "W100")
    .map((variant) => ({
      key: variant.key,
      score: combinedScore(predictiveMetrics(resultFor(resultsByYear, "2026", variant.key))) -
        combinedScore(predictiveMetrics(production)),
      stability: stabilityMetrics(production, resultFor(resultsByYear, "2026", variant.key)),
    }))
    .filter((entry) => entry.score > 0.002)
    .sort((left, right) => right.score - left.score);
  return candidates[0]?.key ?? null;
}

function combinedScore(metrics: PredictiveMetrics): number {
  return (metrics.rank1Strike ?? 0) + (metrics.top3WinnerCapture ?? 0) + ((metrics.winCorrelation ?? 0) * 2);
}

function resultFor(resultsByYear: Map<Year, Map<VariantKey, VariantResult>>, year: Year, key: VariantKey): VariantResult {
  const result = resultsByYear.get(year)?.get(key);
  if (!result) throw new Error(`Missing result for ${year} ${key}`);
  return result;
}

function raceRankSets(result: VariantResult): Map<string, { rank1: string | null; top3: Set<string> }> {
  const values = new Map<string, { rank1: string | null; top3: Set<string> }>();
  for (const [raceId, runners] of groupBy(result.scored.filter((runner) => runner.rank !== null), (runner) => runner.raceId)) {
    const rank1 = runners.find((runner) => runner.rank === 1)?.runnerId ?? null;
    values.set(raceId, {
      rank1,
      top3: new Set(runners.filter((runner) => runner.rank !== null && runner.rank <= 3).map((runner) => runner.runnerId)),
    });
  }
  return values;
}

function runnerRankChanges(left: VariantResult, right: VariantResult): Array<{ runnerId: string; change: number }> {
  const rightRanks = right.ranksByRunner;
  return [...left.ranksByRunner.entries()]
    .flatMap(([runnerId, leftRank]) => {
      const rightRank = rightRanks.get(runnerId);
      return rightRank === undefined ? [] : [{ runnerId, change: rightRank - leftRank }];
    });
}

function winnerSet(result: VariantResult, maxRank: number): Set<string> {
  return new Set(result.scored
    .filter((runner) => runner.won && runner.rank !== null && runner.rank <= maxRank)
    .map((runner) => runner.runnerId));
}

function reconstructedLast3Values(latest: number | null, previous: number | null, averageLast3: number | null): Array<number | null> {
  const values: Array<number | null> = [latest, previous];
  if (latest !== null && previous !== null && averageLast3 !== null) {
    values.push((averageLast3 * 3) - latest - previous);
  }
  return values;
}

function weightedRecentLevel(values: Array<number | null>): number | null {
  const available = values
    .slice(0, 3)
    .map((value, index) => ({ value, weight: B3_WEIGHTS[index]! }))
    .filter((entry): entry is { value: number; weight: number } => valueIsNumber(entry.value));
  if (available.length === 0) return null;
  const total = available.reduce((sum, entry) => sum + entry.weight, 0);
  return available.reduce((sum, entry) => sum + entry.value * (entry.weight / total), 0);
}

function robustScore(value: number | null, medianValue: number, iqr: number): number | null {
  return value === null ? null : (value - medianValue) / iqr;
}

function classOffset(value: string | null): number {
  const raceClass = raceClassNumber(value);
  return CLASS_OFFSETS_2025[raceClass === null ? "unknown" : `Class ${raceClass}`] ?? 0;
}

function toDisplayedTpr(raw: number): number {
  return 100 + (10 * ((raw - TPR_DEVELOPMENT_MEAN) / TPR_DEVELOPMENT_STDEV));
}

function rankBy<T>(rows: T[], getValue: (row: T) => number | null, id: (row: T) => string): Map<string, number> {
  const ranked = rows
    .map((row) => ({ row, value: getValue(row), id: id(row) }))
    .filter((entry): entry is { row: T; value: number; id: string } => valueIsNumber(entry.value))
    .sort((left, right) => right.value - left.value || left.id.localeCompare(right.id));
  const ranks = new Map<string, number>();
  let previousValue: number | null = null;
  let previousRank = 0;
  ranked.forEach((entry, index) => {
    const rank = entry.value === previousValue ? previousRank : index + 1;
    ranks.set(entry.id, rank);
    previousValue = entry.value;
    previousRank = rank;
  });
  return ranks;
}

function isSettledRunner(row: HistoricalTargetRunnerMetricsRow): boolean {
  return row.outcome.finishingPosition !== null &&
    row.outcome.resultStatus !== "non_runner";
}

function compareRows(left: HistoricalTargetRunnerMetricsRow, right: HistoricalTargetRunnerMetricsRow): number {
  return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
    left.features.targetRaceId.localeCompare(right.features.targetRaceId) ||
    left.features.targetRunnerId.localeCompare(right.features.targetRunnerId);
}

function groupBy<T, K>(values: T[], keyFor: (value: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    const group = map.get(key) ?? [];
    group.push(value);
    map.set(key, group);
  }
  return map;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdev(values: number[]): number | null {
  const avg = average(values);
  if (avg === null || values.length < 2) return null;
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / values.length);
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const xAvg = average(xs);
  const yAvg = average(ys);
  if (xAvg === null || yAvg === null) return null;
  let numerator = 0;
  let xDenominator = 0;
  let yDenominator = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const x = xs[index]! - xAvg;
    const y = ys[index]! - yAvg;
    numerator += x * y;
    xDenominator += x * x;
    yDenominator += y * y;
  }
  const denominator = Math.sqrt(xDenominator * yDenominator);
  return denominator === 0 ? null : numerator / denominator;
}

function percentage(count: number, total: number): number | null {
  return total === 0 ? null : count / total;
}

function difference<T>(left: Set<T>, right: Set<T>): Set<T> {
  return new Set([...left].filter((value) => !right.has(value)));
}

function setKey(values: Set<string>): string {
  return [...values].sort().join("|");
}

function isNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function valueIsNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function table(lines: string[], rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]!);
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    lines.push(`| ${headers.map((header) => formatCell(row[header])).join(" | ")} |`);
  }
  lines.push("");
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value).replaceAll("|", "\\|");
}

function pct(value: number | null): string {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`;
}

function number(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "-" : value.toFixed(digits);
}

function round(value: number, digits = 2): string {
  return value.toFixed(digits);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

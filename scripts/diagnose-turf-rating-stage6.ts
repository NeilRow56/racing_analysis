import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { raceRunners, races } from "@/db/schema";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";

type Year = "2025" | "2026";
type RankGroup = "rank 1" | "rank 2" | "rank 3" | "rank 4+" | "missing";
type VersionKey = "v3" | "v5";

type Context = {
  year: Year;
  settledRows: HistoricalTargetRunnerMetricsRow[];
  baseScores: Map<string, number>;
};

type Benchmark = {
  year: Year;
  key: string;
  label: string;
  values: Map<string, number>;
  ranks: Map<string, number>;
  rankGroups: Map<string, RankGroup>;
  settledRows: HistoricalTargetRunnerMetricsRow[];
  rowsWithValue: HistoricalTargetRunnerMetricsRow[];
};

type Band = {
  label: string;
  min: number;
  max: number;
};

type ClassAdjustment = {
  globalMean: number;
  byClass: Map<string, { mean: number; count: number; offset: number }>;
};

type WeightAdjustment = {
  coefficientRawPointsPerLb: number;
  residualPerformancePerLb: number;
  performancePerRawPoint: number;
  sampleSize: number;
};

type PriorRun = {
  runnerId: string;
  horseId: string;
  raceDateTime: Date;
  going: string | null;
  racingPostRating: number | null;
  topspeedRating: number | null;
};

type GoingMatchQuality =
  | "latest exact match"
  | "latest adjacent"
  | "latest materially different"
  | "latest unmapped"
  | "missing going history";

type GoingProfile = {
  targetGoingGroup: string | null;
  recentRuns: PriorRun[];
  contributingRuns: PriorRun[];
  latestQuality: GoingMatchQuality;
  last3MatchCount: number | null;
};

type GoingAdjustment = {
  globalMean: number;
  byQuality: Map<GoingMatchQuality, { mean: number; count: number; offset: number }>;
  active: boolean;
  reason: string;
};

const YEARS: Year[] = ["2025", "2026"];
const B3_WEIGHTS: [number, number, number] = [0.6, 0.25, 0.15];
const SCORE_BAND_LABELS = ["bottom 20%", "20-40%", "40-60%", "60-80%", "top 20%"];
const GAP_BAND_LABELS = ["smallest 25%", "25-50%", "50-75%", "largest 25%"];

async function main() {
  console.log("# Turf Rating Stage 6 Going Suitability Diagnostic");
  console.log("");
  console.log("Diagnostic only. V3 is the retained Stage 5 candidate: B3 60/25/15 recent performance + Turf speed, 2025 class offset, and 2025 weight-relative coefficient. V5 can add one 2025-derived fixed going-suitability offset if the development pattern is coherent.");
  console.log("");
  console.log("No Research, Today, saved/frozen rules, UI, cache schemas, cache generation, importers, or holdout behavior changed. No ROI, SP, market rank, trainer, jockey, draw, course, or future runs used.");
  console.log("");

  const contexts = await loadContexts();
  const goingProfiles = await loadGoingProfiles(contexts);
  const development = contextFor(contexts, "2025");
  const classAdjustment = buildClassAdjustment(development);
  const weightAdjustment = buildWeightAdjustment(development);
  const v3DevelopmentValues = v3Values(development, classAdjustment, weightAdjustment);
  const goingAdjustment = buildGoingAdjustment(development, v3DevelopmentValues, goingProfiles);
  const benchmarks = contexts.flatMap((context) => {
    const v3 = v3Values(context, classAdjustment, weightAdjustment);
    const v5 = v5Values(context, classAdjustment, weightAdjustment, goingAdjustment, goingProfiles);
    return [
      benchmarkFor(context.year, "v3", "V3 - Stage 4 class + weight adjusted B3", context.settledRows, v3),
      benchmarkFor(context.year, "v5", "V5 - V3 + fixed going suitability adjustment", context.settledRows, v5),
    ];
  });
  const retained = retainedVersion(benchmarks);

  printStage5Reconciliation(benchmarks);
  printGoingCoverage(contexts, goingProfiles);
  printGoingDefinitions();
  printGoingMatchDiagnostic(benchmarks, goingProfiles);
  printGoingAdjustment(goingAdjustment);
  printCoreComparison(benchmarks);
  printGapCalibration(benchmarks);
  printAbsoluteCalibration(benchmarks);
  printContextPortability(benchmarks);
  printHoldoutReplication(benchmarks, goingProfiles);
  printExistingComparison(contexts, benchmarks, retained);
  printScaleDecision(benchmarks, retained);
  printConclusion(benchmarks, retained, goingAdjustment, goingProfiles);
  printGuardrails();
}

async function loadContexts(): Promise<Context[]> {
  const contexts: Context[] = [];
  rowCacheByRace.clear();
  for (const year of YEARS) {
    const cache = await loadLatestBacktestFeatureCacheForYear({ family: "turf_flat", year });
    const settledRows = (cache?.rows ?? [])
      .filter((row) => row.features.raceCode === "turf")
      .filter(isSettledRunner)
      .sort(compareRowsChronologically);
    contexts.push({ year, settledRows, baseScores: b3BaseScores(settledRows) });
    for (const [raceId, raceRows] of groupBy(settledRows, (row) => row.features.targetRaceId)) {
      rowCacheByRace.set(raceId, raceRows);
    }
  }
  return contexts;
}

function b3BaseScores(rows: HistoricalTargetRunnerMetricsRow[]) {
  const values = new Map<string, number>();
  for (const row of rows) {
    const rpr = weightedRecentLevel(cachedLast3Values(
      row.features.latestPerformanceRating,
      row.features.previousPerformanceRating,
      row.features.averagePerformanceLast3,
    ), B3_WEIGHTS);
    const speed = weightedRecentLevel(cachedLast3Values(
      row.features.latestSpeedRating,
      row.features.previousSpeedRating,
      row.features.averageSpeedLast3,
    ), B3_WEIGHTS);
    if (rpr !== null && speed !== null) {
      values.set(row.features.targetRunnerId, (rpr + speed) / 2);
    }
  }
  return values;
}

function cachedLast3Values(
  latest: number | null,
  previous: number | null,
  averageLast3: number | null,
) {
  const values: Array<number | null> = [latest, previous];
  if (latest !== null && previous !== null && averageLast3 !== null) {
    values.push((averageLast3 * 3) - latest - previous);
  }
  return values;
}

function weightedRecentLevel(values: Array<number | null>, weights: [number, number, number]) {
  const available = values
    .slice(0, 3)
    .map((value, index) => ({ value, weight: weights[index]! }))
    .filter((entry): entry is { value: number; weight: number } => entry.value !== null && Number.isFinite(entry.value));
  if (available.length === 0) return null;
  const weightTotal = available.reduce((total, entry) => total + entry.weight, 0);
  return available.reduce((total, entry) => total + entry.value * (entry.weight / weightTotal), 0);
}

function buildClassAdjustment(context: Context): ClassAdjustment {
  const globalMean = average([...context.baseScores.values()]) ?? 0;
  const byClass = new Map<string, { mean: number; count: number; offset: number }>();
  const rowsByClass = groupBy(
    context.settledRows.filter((row) => context.baseScores.has(row.features.targetRunnerId)),
    (row) => raceClassBucket(row.features.raceClass),
  );
  for (const [raceClass, rows] of rowsByClass) {
    const values = rows.map((row) => context.baseScores.get(row.features.targetRunnerId)).filter(isNumber);
    const mean = average(values);
    if (mean !== null) {
      byClass.set(raceClass, { mean, count: values.length, offset: mean - globalMean });
    }
  }
  return { globalMean, byClass };
}

function buildWeightAdjustment(context: Context): WeightAdjustment {
  const benchmark = benchmarkFor(context.year, "unadjustedForWeight", "unadjusted for weight", context.settledRows, context.baseScores);
  const bands = scoreBandsForSingle(benchmark);
  const expectedFinishByBand = new Map(bands.map((band) => {
    const rows = rowsForBand(benchmark, band);
    return [band.label, averageFinish(rows)];
  }));
  const samples = benchmark.rowsWithValue.flatMap((row) => {
    const value = benchmark.values.get(row.features.targetRunnerId);
    const band = bands.find((item) => inBand(value ?? NaN, item));
    const expected = band ? expectedFinishByBand.get(band.label) : null;
    const actual = row.outcome.finishingPosition;
    const weightDiff = weightDiffFromRaceMedian(row);
    if (value === undefined || expected === null || expected === undefined || actual === null || weightDiff === null) return [];
    return [{
      score: value,
      weightDiff,
      residualPerformance: expected - actual,
      performance: -actual,
    }];
  });
  const residualPerformancePerLb = slope(samples.map((sample) => sample.weightDiff), samples.map((sample) => sample.residualPerformance)) ?? 0;
  const performancePerRawPoint = slope(samples.map((sample) => sample.score), samples.map((sample) => sample.performance)) ?? 0;
  return {
    coefficientRawPointsPerLb: performancePerRawPoint === 0 ? 0 : residualPerformancePerLb / performancePerRawPoint,
    residualPerformancePerLb,
    performancePerRawPoint,
    sampleSize: samples.length,
  };
}

function classAdjustedValues(
  context: Context,
  sourceValues: Map<string, number>,
  adjustment: ClassAdjustment,
) {
  const adjusted = new Map<string, number>();
  for (const row of context.settledRows) {
    const value = sourceValues.get(row.features.targetRunnerId);
    const classOffset = adjustment.byClass.get(raceClassBucket(row.features.raceClass))?.offset ?? 0;
    if (value !== undefined) {
      adjusted.set(row.features.targetRunnerId, value - classOffset);
    }
  }
  return adjusted;
}

function v3Values(context: Context, classAdjustment: ClassAdjustment, weightAdjustment: WeightAdjustment) {
  const classValues = classAdjustedValues(context, context.baseScores, classAdjustment);
  const adjusted = new Map<string, number>();
  for (const row of context.settledRows) {
    const value = classValues.get(row.features.targetRunnerId);
    const weightDiff = weightDiffFromRaceMedian(row);
    if (value !== undefined && weightDiff !== null) {
      adjusted.set(row.features.targetRunnerId, value + (weightAdjustment.coefficientRawPointsPerLb * weightDiff));
    }
  }
  return adjusted;
}

async function loadGoingProfiles(contexts: Context[]) {
  const allRows = contexts.flatMap((context) => context.settledRows);
  const priorRunsByHorse = await loadPriorRuns(allRows);
  const profiles = new Map<string, GoingProfile>();
  for (const row of allRows) {
    const targetGoingGroup = broadGoingGroup(row.features.going);
    const recentRuns = (priorRunsByHorse.get(row.features.horseId) ?? [])
      .filter((run) => run.raceDateTime < row.features.raceDateTime)
      .sort((left, right) =>
        right.raceDateTime.getTime() - left.raceDateTime.getTime() ||
        left.runnerId.localeCompare(right.runnerId)
      )
      .slice(0, 3);
    const contributingRuns = recentRuns;
    profiles.set(row.features.targetRunnerId, goingProfile(targetGoingGroup, recentRuns, contributingRuns));
  }
  return profiles;
}

async function loadPriorRuns(rows: HistoricalTargetRunnerMetricsRow[]) {
  const { db, client } = createDbConnection();
  try {
    const horseIds = [...new Set(rows.map((row) => row.features.horseId))];
    const latestTargetDateTime = rows.reduce(
      (latest, row) => row.features.raceDateTime > latest ? row.features.raceDateTime : latest,
      rows[0]?.features.raceDateTime ?? new Date(0),
    );
    const loaded: PriorRun[] = [];
    for (const horseIdChunk of chunks(horseIds, 5_000)) {
      const chunkRows = await db
        .select({
          runnerId: raceRunners.id,
          horseId: raceRunners.horseId,
          raceDateTime: races.raceDatetime,
          going: races.going,
          racingPostRating: raceRunners.racingPostRating,
          topspeedRating: raceRunners.topspeedRating,
        })
        .from(raceRunners)
        .innerJoin(races, eq(raceRunners.raceId, races.id))
        .where(and(
          inArray(raceRunners.horseId, horseIdChunk),
          eq(raceRunners.source, "sporting_life"),
          eq(races.source, "sporting_life"),
          sql`(${raceRunners.resultStatus} is distinct from 'non_runner' and (${raceRunners.resultStatus} is not null or ${raceRunners.finishingPosition} is not null))`,
          sql`${races.winningTime} is not null and btrim(${races.winningTime}) <> ''`,
          lt(races.raceDatetime, latestTargetDateTime),
        ))
        .orderBy(desc(races.raceDatetime));
      loaded.push(...chunkRows.filter(hasRaceDateTime));
    }

    const byHorse = groupBy(loaded, (run) => run.horseId);
    for (const horseRuns of byHorse.values()) {
      horseRuns.sort((left, right) =>
        right.raceDateTime.getTime() - left.raceDateTime.getTime() ||
        left.runnerId.localeCompare(right.runnerId)
      );
    }
    return byHorse;
  } finally {
    await client.end();
  }
}

function goingProfile(
  targetGoingGroup: string | null,
  recentRuns: PriorRun[],
  contributingRuns: PriorRun[],
): GoingProfile {
  const latest = contributingRuns[0] ?? recentRuns[0] ?? null;
  const latestGroup = latest ? broadGoingGroup(latest.going) : null;
  const latestQuality = goingQuality(targetGoingGroup, latestGroup, latest !== null);
  const groups = contributingRuns.map((run) => broadGoingGroup(run.going));
  const last3MatchCount = targetGoingGroup === null || groups.length === 0 || groups.some((group) => group === null)
    ? null
    : groups.filter((group) => group === targetGoingGroup).length;
  return { targetGoingGroup, recentRuns, contributingRuns, latestQuality, last3MatchCount };
}

function buildGoingAdjustment(
  context: Context,
  v3ValuesForDevelopment: Map<string, number>,
  goingProfiles: Map<string, GoingProfile>,
): GoingAdjustment {
  const assessableRows = context.settledRows.filter((row) =>
    v3ValuesForDevelopment.has(row.features.targetRunnerId) &&
    isAssessableQuality(goingProfiles.get(row.features.targetRunnerId)?.latestQuality)
  );
  const globalMean = average(assessableRows.map((row) => v3ValuesForDevelopment.get(row.features.targetRunnerId)).filter(isNumber)) ?? 0;
  const byQuality = new Map<GoingMatchQuality, { mean: number; count: number; offset: number }>();
  for (const [quality, rows] of groupBy(assessableRows, (row) => goingProfiles.get(row.features.targetRunnerId)?.latestQuality ?? "missing going history")) {
    const values = rows.map((row) => v3ValuesForDevelopment.get(row.features.targetRunnerId)).filter(isNumber);
    const mean = average(values);
    if (mean !== null) {
      byQuality.set(quality as GoingMatchQuality, { mean, count: values.length, offset: mean - globalMean });
    }
  }

  const active = hasCoherentGoingPattern(context, v3ValuesForDevelopment, goingProfiles);
  return {
    globalMean,
    byQuality,
    active,
    reason: active
      ? "2025 going-match quality was coherent enough to test a frozen location offset."
      : "2025 going-match quality was weak or erratic; V5 is reported as no-adjustment for comparison.",
  };
}

function v5Values(
  context: Context,
  classAdjustment: ClassAdjustment,
  weightAdjustment: WeightAdjustment,
  goingAdjustment: GoingAdjustment,
  goingProfiles: Map<string, GoingProfile>,
) {
  const v3 = v3Values(context, classAdjustment, weightAdjustment);
  const adjusted = new Map<string, number>();
  for (const row of context.settledRows) {
    const value = v3.get(row.features.targetRunnerId);
    const quality = goingProfiles.get(row.features.targetRunnerId)?.latestQuality ?? "missing going history";
    const goingOffset = goingAdjustment.active
      ? goingAdjustment.byQuality.get(quality)?.offset ?? 0
      : 0;
    if (value !== undefined) {
      adjusted.set(row.features.targetRunnerId, value - goingOffset);
    }
  }
  return adjusted;
}

const goingQualityOrder: GoingMatchQuality[] = [
  "latest exact match",
  "latest adjacent",
  "latest materially different",
  "latest unmapped",
  "missing going history",
];

const goingGroupOrder = ["firm-fast", "good", "good-soft", "soft-heavy"];

function broadGoingGroup(going: string | null | undefined) {
  const value = normalizeGoing(going);
  if (value === null) return null;
  if (value === "firm" || value.startsWith("firm ") || value === "good to firm" || value.startsWith("good to firm ")) {
    return "firm-fast";
  }
  if (value === "good" || value.startsWith("good ")) {
    return "good";
  }
  if (value === "good to soft" || value.startsWith("good to soft ")) {
    return "good-soft";
  }
  if (value === "soft" || value.startsWith("soft ") || value === "heavy" || value.startsWith("heavy ")) {
    return "soft-heavy";
  }
  return null;
}

function normalizeGoing(going: string | null | undefined) {
  const value = going?.trim().toLowerCase().replace(/\s+/g, " ");
  return value ? value : null;
}

function goingQuality(
  targetGroup: string | null,
  latestGroup: string | null,
  hasHistory: boolean,
): GoingMatchQuality {
  if (!hasHistory) return "missing going history";
  if (targetGroup === null || latestGroup === null) return "latest unmapped";
  if (targetGroup === latestGroup) return "latest exact match";
  const targetIndex = goingGroupOrder.indexOf(targetGroup);
  const latestIndex = goingGroupOrder.indexOf(latestGroup);
  if (targetIndex >= 0 && latestIndex >= 0 && Math.abs(targetIndex - latestIndex) === 1) {
    return "latest adjacent";
  }
  return "latest materially different";
}

function isAssessableQuality(value: GoingMatchQuality | undefined): value is GoingMatchQuality {
  return value === "latest exact match" ||
    value === "latest adjacent" ||
    value === "latest materially different";
}

function hasCoherentGoingPattern(
  context: Context,
  v3ValuesForDevelopment: Map<string, number>,
  profiles: Map<string, GoingProfile>,
) {
  const benchmark = benchmarkFor(context.year, "v3GoingCoherence", "V3 going coherence", context.settledRows, v3ValuesForDevelopment);
  const exactRows = benchmark.rowsWithValue.filter((row) => profiles.get(row.features.targetRunnerId)?.latestQuality === "latest exact match");
  const adjacentRows = benchmark.rowsWithValue.filter((row) => profiles.get(row.features.targetRunnerId)?.latestQuality === "latest adjacent");
  const differentRows = benchmark.rowsWithValue.filter((row) => profiles.get(row.features.targetRunnerId)?.latestQuality === "latest materially different");
  if (exactRows.length < 500 || adjacentRows.length < 500 || differentRows.length < 500) {
    return false;
  }
  const exact = winRate(exactRows);
  const adjacent = winRate(adjacentRows);
  const different = winRate(differentRows);
  if (exact === null || adjacent === null || different === null) return false;
  return exact >= adjacent && adjacent >= different && exact - different >= 1.0;
}

function goingDiagnosticRow(benchmark: Benchmark, rows: HistoricalTargetRunnerMetricsRow[], group: string) {
  return {
    year: benchmark.year,
    group,
    runners: rows.length,
    wins: winners(rows),
    "strike rate": pct(winRate(rows)),
    "top-3 rate": pct(top3Rate(rows)),
    association: number(spearmanAssociationForRows(benchmark, rows)),
    "average finish": number(averageFinish(rows)),
  };
}

function benchmarkFor(
  year: Year,
  key: string,
  label: string,
  settledRows: HistoricalTargetRunnerMetricsRow[],
  values: Map<string, number>,
): Benchmark {
  const ranks = rankRowsByMeasure(settledRows, (row) => values.get(row.features.targetRunnerId) ?? null);
  const rankGroups = new Map<string, RankGroup>();
  for (const row of settledRows) {
    rankGroups.set(row.features.targetRunnerId, rankGroup(ranks.get(row.features.targetRunnerId) ?? null));
  }
  return {
    year,
    key,
    label,
    values,
    ranks,
    rankGroups,
    settledRows,
    rowsWithValue: settledRows.filter((row) => values.has(row.features.targetRunnerId)),
  };
}

function printStage5Reconciliation(benchmarks: Benchmark[]) {
  console.log("## Stage 5 Baseline Reconciliation");
  printTable(YEARS.map((year) => {
    const benchmark = benchmarkByKey(benchmarks, year, "v3");
    return summaryRow(benchmark, scoreBandsFor(benchmarks, "v3"), gapBandsFor(benchmarks, "v3"));
  }));
  console.log("");
}

function printGoingCoverage(contexts: Context[], profiles: Map<string, GoingProfile>) {
  console.log("## Going Data Coverage");
  printTable(contexts.map((context) => {
    const ratedRows = context.settledRows.filter((row) => context.baseScores.has(row.features.targetRunnerId));
    const withTargetGoing = ratedRows.filter((row) => profiles.get(row.features.targetRunnerId)?.targetGoingGroup !== null);
    const withRecentGoing = ratedRows.filter((row) => {
      const profile = profiles.get(row.features.targetRunnerId);
      return profile !== undefined && profile.contributingRuns.some((run) => broadGoingGroup(run.going) !== null);
    });
    const assessable = ratedRows.filter((row) => isAssessableQuality(profiles.get(row.features.targetRunnerId)?.latestQuality));
    const directRawRpr = ratedRows.filter((row) =>
      profiles.get(row.features.targetRunnerId)?.contributingRuns.some((run) => run.racingPostRating !== null)
    );
    const directRawTopSpeed = ratedRows.filter((row) =>
      profiles.get(row.features.targetRunnerId)?.contributingRuns.some((run) => run.topspeedRating !== null)
    );
    return {
      year: context.year,
      "V3-rated runners": ratedRows.length,
      "target going group": pct(ratedRows.length === 0 ? null : (withTargetGoing.length / ratedRows.length) * 100),
      "recent-run going": pct(ratedRows.length === 0 ? null : (withRecentGoing.length / ratedRows.length) * 100),
      assessable: pct(ratedRows.length === 0 ? null : (assessable.length / ratedRows.length) * 100),
      "direct raw RPR on contributing runs": pct(ratedRows.length === 0 ? null : (directRawRpr.length / ratedRows.length) * 100),
      "direct raw Topspeed on contributing runs": pct(ratedRows.length === 0 ? null : (directRawTopSpeed.length / ratedRows.length) * 100),
      reconstruction: "source-table prior runs; cache stores aggregates, not contributing run IDs",
    };
  }));
  console.log("");
}

function printGoingDefinitions() {
  console.log("## Going Group Definitions");
  printTable([
    { group: "firm-fast", "raw examples": "Firm; Good to Firm; descriptions beginning with those values" },
    { group: "good", "raw examples": "Good" },
    { group: "good-soft", "raw examples": "Good to Soft" },
    { group: "soft-heavy", "raw examples": "Soft; Heavy; descriptions beginning with those values" },
    { group: "unmapped", "raw examples": "missing, Standard/AW, or unsupported labels" },
  ]);
  console.log("Mapping follows the existing Turf going-band convention, collapsed into the requested broad suitability groups. Cut points/categories are deterministic and not outcome-tuned.");
  console.log("");
}

function printGoingMatchDiagnostic(benchmarks: Benchmark[], profiles: Map<string, GoingProfile>) {
  console.log("## Going-Match Diagnostic Before Adjustment");
  printTable(YEARS.flatMap((year) => {
    const benchmark = benchmarkByKey(benchmarks, year, "v3");
    return goingQualityOrder.map((quality) => {
      const rows = benchmark.rowsWithValue.filter((row) => profiles.get(row.features.targetRunnerId)?.latestQuality === quality);
      return goingDiagnosticRow(benchmark, rows, quality);
    });
  }));
  console.log("");
  console.log("### Last-3 Contributing-Run Match Count");
  printTable(YEARS.flatMap((year) => {
    const benchmark = benchmarkByKey(benchmarks, year, "v3");
    return ["0", "1", "2", "3", "missing"].map((bucket) => {
      const rows = benchmark.rowsWithValue.filter((row) => {
        const count = profiles.get(row.features.targetRunnerId)?.last3MatchCount;
        return bucket === "missing" ? count === null || count === undefined : count === Number(bucket);
      });
      return goingDiagnosticRow(benchmark, rows, bucket);
    });
  }));
  console.log("");
}

function printGoingAdjustment(adjustment: GoingAdjustment) {
  console.log("## 2025-Derived Going Adjustment");
  console.log("Method: inspect 2025 V3 score location by latest-run going-match quality. If coherent, subtract a fixed quality offset and apply unchanged to 2026. This uses no outcome, SP, market, ROI, or 2026 tuning.");
  console.log("");
  console.log(`Decision: ${adjustment.active ? "test frozen offsets" : "do not activate offsets"}. ${adjustment.reason}`);
  console.log("");
  printTable([...adjustment.byQuality.entries()].map(([quality, value]) => ({
    quality,
    runners: value.count,
    "2025 V3 mean": number(value.mean),
    "global mean": number(adjustment.globalMean),
    "fixed offset subtracted": number(value.offset),
  })));
  console.log("");
}

function printCoreComparison(benchmarks: Benchmark[]) {
  console.log("## V3 Vs V5 Core Comparison");
  printTable(YEARS.flatMap((year) => (["v3", "v5"] as VersionKey[]).map((key) => {
    const benchmark = benchmarkByKey(benchmarks, year, key);
    return summaryRow(benchmark, scoreBandsFor(benchmarks, key), gapBandsFor(benchmarks, key));
  })));
  console.log("");
  console.log("### Incremental Effect");
  printTable(YEARS.map((year) => incrementalRow(benchmarks, year)));
  console.log("");
}

function printAbsoluteCalibration(benchmarks: Benchmark[]) {
  console.log("## Absolute-Score Calibration");
  for (const key of ["v3", "v5"] as VersionKey[]) {
    const bands = scoreBandsFor(benchmarks, key);
    console.log(`### ${benchmarkByKey(benchmarks, "2025", key).label}`);
    printTable(YEARS.flatMap((year) => {
      const benchmark = benchmarkByKey(benchmarks, year, key);
      return bands.map((band) => {
        const rows = rowsForBand(benchmark, band);
        return {
          year,
          band: band.label,
          range: bandRange(band),
          runners: rows.length,
          wins: winners(rows),
          "strike rate": pct(winRate(rows)),
          "top-3 rate": pct(top3Rate(rows)),
          "average finish": number(averageFinish(rows)),
          "median finish": number(medianFinish(rows)),
        };
      });
    }));
    console.log("");
  }
}

function printGapCalibration(benchmarks: Benchmark[]) {
  console.log("## Gap Calibration");
  for (const key of ["v3", "v5"] as VersionKey[]) {
    const bands = gapBandsFor(benchmarks, key);
    console.log(`### ${benchmarkByKey(benchmarks, "2025", key).label}`);
    printTable(YEARS.flatMap((year) => {
      const benchmark = benchmarkByKey(benchmarks, year, key);
      const gaps = topTwoGaps(benchmark);
      return bands.map((band) => {
        const rows = gaps.filter((item) => inBand(item.gap, band)).map((item) => item.topRow);
        return {
          year,
          band: band.label,
          range: bandRange(band),
          races: rows.length,
          wins: winners(rows),
          "win rate": pct(winRate(rows)),
          "top-3 rate": pct(top3Rate(rows)),
          "average finish": number(averageFinish(rows)),
        };
      });
    }));
    console.log("");
  }
}

function printContextPortability(benchmarks: Benchmark[]) {
  console.log("## Context Portability");
  for (const key of ["v3", "v5"] as VersionKey[]) {
    const label = benchmarkByKey(benchmarks, "2025", key).label;
    console.log(`### ${label}`);
    printTable(YEARS.flatMap((year) => {
      const benchmark = benchmarkByKey(benchmarks, year, key);
      const bands = scoreBandsFor(benchmarks, key);
      return [
        ...contextRows(benchmark, bands, "distance", (row) => distanceBand(row.features.distanceYards), distanceOrder),
        ...contextRows(benchmark, bands, "race class", (row) => raceClassBucket(row.features.raceClass), raceClassOrder),
        ...contextRows(benchmark, bands, "field size", (row) => fieldSizeBand(fieldSizeForRow(row)), fieldSizeOrder),
      ];
    }));
    console.log("");
  }
}

function printHoldoutReplication(benchmarks: Benchmark[], profiles: Map<string, GoingProfile>) {
  console.log("## Going-Specific Holdout Replication");
  printTable(goingQualityOrder.map((quality) => {
    const rows = YEARS.map((year) => goingEffectRow(benchmarks, profiles, year, quality));
    return {
      quality,
      "2025 association delta": number(rows[0]?.associationDelta ?? null),
      "2025 top-3 capture delta": pp(rows[0]?.top3CaptureDelta ?? null),
      "2025 effect": rows[0]?.effect ?? "too sparse",
      "2026 association delta": number(rows[1]?.associationDelta ?? null),
      "2026 top-3 capture delta": pp(rows[1]?.top3CaptureDelta ?? null),
      "2026 effect": rows[1]?.effect ?? "too sparse",
      classification: goingReplicationLabel(rows[0]?.effect, rows[1]?.effect),
    };
  }));
  console.log("");
}

function printExistingComparison(contexts: Context[], benchmarks: Benchmark[], retained: VersionKey) {
  console.log("## Comparison With Existing Measures");
  const comparisonBenchmarks = [...benchmarks, ...existingMeasureBenchmarks(contexts)];
  printTable(YEARS.flatMap((year) => {
    const keys = [
      retained,
      "todaysRating",
      "averageSpeedLast3",
      "averagePerformanceLast3",
      "officialRating",
    ];
    return keys.map((key) => {
      const benchmark = benchmarkByKey(comparisonBenchmarks, year, key);
      return summaryRow(benchmark, scoreBandsFor(comparisonBenchmarks, key), gapBandsFor(comparisonBenchmarks, key));
    });
  }));
  console.log("");
}

function printScaleDecision(benchmarks: Benchmark[], retained: VersionKey) {
  console.log("## Absolute Scale Decision");
  const b2025 = benchmarkByKey(benchmarks, "2025", retained);
  const b2026 = benchmarkByKey(benchmarks, "2026", retained);
  const bands = scoreBandsFor(benchmarks, retained);
  const gaps = gapBandsFor(benchmarks, retained);
  const clears = retained === "v5" &&
    absoluteBandMonotonicity(b2025, bands) === "monotonic increasing" &&
    absoluteBandMonotonicity(b2026, bands) === "monotonic increasing" &&
    gapCalibrationLabel(b2025, gaps) === "monotonic increasing" &&
    gapCalibrationLabel(b2026, gaps) === "monotonic increasing" &&
    noMaterialContextDeterioration(benchmarks);
  if (!clears) {
    console.log("No diagnostic absolute Turf Performance Rating scale proposed. Going adjustment must improve holdout gap/context portability without material deterioration; this stop-rule was not cleared.");
    console.log("");
    return;
  }
  const mean = average([...b2025.values.values()]);
  const stdev = standardDeviation([...b2025.values.values()]);
  printTable([{
    scale: "Turf Performance Rating - diagnostic",
    mapping: "100 + 10 * ((rating - developmentMean) / developmentStdev)",
    "development mean": number(mean),
    "development stdev": number(stdev),
    note: "Diagnostic-only monotonic transform; not Racing Post RPR.",
  }]);
  console.log("");
}

function printConclusion(
  benchmarks: Benchmark[],
  retained: VersionKey,
  goingAdjustment: GoingAdjustment,
  profiles: Map<string, GoingProfile>,
) {
  const v3_2025 = benchmarkByKey(benchmarks, "2025", "v3");
  const v3_2026 = benchmarkByKey(benchmarks, "2026", "v3");
  const v5_2025 = benchmarkByKey(benchmarks, "2025", "v5");
  const v5_2026 = benchmarkByKey(benchmarks, "2026", "v5");
  console.log("## Conclusion");
  printTable([
    { question: "1. Is recent-run going data available with adequate coverage?", answer: goingCoverageAnswer(v3_2025, v3_2026, profiles) },
    { question: "2. Does V3 performance vary meaningfully by going-match quality?", answer: goingVariationAnswer(v3_2025, v3_2026, profiles) },
    { question: "3. Is there a sensible 2025-only going adjustment?", answer: goingAdjustment.active ? "Yes, one frozen score-location offset was tested." : `No. ${goingAdjustment.reason}` },
    { question: "4. Does the frozen adjustment improve 2026?", answer: versionComparisonAnswer(v3_2026, v5_2026, benchmarks, "2026") },
    { question: "5. Does gap calibration improve?", answer: `V3: ${gapCalibrationLabel(v3_2025, gapBandsFor(benchmarks, "v3"))}/${gapCalibrationLabel(v3_2026, gapBandsFor(benchmarks, "v3"))}; V5: ${gapCalibrationLabel(v5_2025, gapBandsFor(benchmarks, "v5"))}/${gapCalibrationLabel(v5_2026, gapBandsFor(benchmarks, "v5"))}.` },
    { question: "6. Does absolute-score monotonicity improve?", answer: `V3: ${absoluteBandMonotonicity(v3_2025, scoreBandsFor(benchmarks, "v3"))}/${absoluteBandMonotonicity(v3_2026, scoreBandsFor(benchmarks, "v3"))}; V5: ${absoluteBandMonotonicity(v5_2025, scoreBandsFor(benchmarks, "v5"))}/${absoluteBandMonotonicity(v5_2026, scoreBandsFor(benchmarks, "v5"))}.` },
    { question: "7. Is the effect broad across class/distance/field size?", answer: noMaterialContextDeterioration(benchmarks) ? "No material deterioration detected by the strict summary check." : "No. Some class/distance/field-size context behavior remains weak or deteriorates." },
    { question: "8. Should V5 replace V3?", answer: retained === "v5" ? "Retain V5 for another diagnostic stage." : "Retain V3; do not replace it with going suitability yet." },
    { question: "9. If going fails, is the remaining limitation likely course-specific?", answer: "Likely yes: broad going match is too blunt, so remaining ground effects may be course- or meeting-specific rather than horse-level suitability." },
    { question: "10. Is there enough evidence yet for an absolute Turf Performance Rating scale?", answer: retained === "v5" && noMaterialContextDeterioration(benchmarks) ? "Only if gap calibration also clears; see scale decision section." : "No." },
  ]);
  console.log("");
}

function printGuardrails() {
  console.log("## Guardrails");
  printTable([
    { item: "Production Research/Today/saved rules changed", result: "No" },
    { item: "Cache schema/generation changed", result: "No" },
    { item: "Importer changed", result: "No" },
    { item: "Holdout behavior changed", result: "No" },
    { item: "Going tuned on 2026", result: "No" },
    { item: "New features beyond going added", result: "No" },
  ]);
}

function retainedVersion(benchmarks: Benchmark[]): VersionKey {
  const v3_2026 = benchmarkByKey(benchmarks, "2026", "v3");
  const v5_2026 = benchmarkByKey(benchmarks, "2026", "v5");
  const v5Bands2026 = absoluteBandMonotonicity(v5_2026, scoreBandsFor(benchmarks, "v5"));
  const v3Gap2026 = gapCalibrationLabel(v3_2026, gapBandsFor(benchmarks, "v3"));
  const v5Gap2026 = gapCalibrationLabel(v5_2026, gapBandsFor(benchmarks, "v5"));
  const associationGain = (spearmanAssociation(v5_2026) ?? -Infinity) - (spearmanAssociation(v3_2026) ?? -Infinity);
  const captureGain = (winnerCapture(v5_2026, new Set(["rank 1", "rank 2", "rank 3"])) ?? -Infinity) -
    (winnerCapture(v3_2026, new Set(["rank 1", "rank 2", "rank 3"])) ?? -Infinity);
  const holdoutImproves = associationGain >= 0.005 && captureGain >= -0.2;
  const calibrationNotWorse = v5Bands2026 === "monotonic increasing" && (v3Gap2026 !== "monotonic increasing" || v5Gap2026 === "monotonic increasing");
  if (holdoutImproves && calibrationNotWorse) {
    return "v5";
  }
  return "v3";
}

function summaryRow(benchmark: Benchmark, scoreBands: Band[], gapBands: Band[]) {
  return {
    year: benchmark.year,
    version: benchmark.label,
    coverage: pct(coverage(benchmark)),
    association: number(spearmanAssociation(benchmark)),
    "rank-1 strike": pct(winRate(rowsForRankGroup(benchmark, "rank 1"))),
    "rank-1 top-3": pct(top3Rate(rowsForRankGroup(benchmark, "rank 1"))),
    "top-2 capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2"]))),
    "top-3 capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2", "rank 3"]))),
    monotonicity: monotonicityLabel(benchmark),
    "absolute bands": absoluteBandMonotonicity(benchmark, scoreBands),
    "gap calibration": gapCalibrationLabel(benchmark, gapBands),
  };
}

function incrementalRow(benchmarks: Benchmark[], year: Year) {
  const v3 = benchmarkByKey(benchmarks, year, "v3");
  const v5 = benchmarkByKey(benchmarks, year, "v5");
  return {
    year,
    "association delta": number(diff(spearmanAssociation(v5), spearmanAssociation(v3))),
    "rank-1 strike delta": pp(diff(winRate(rowsForRankGroup(v5, "rank 1")), winRate(rowsForRankGroup(v3, "rank 1")))),
    "top-3 capture delta": pp(diff(winnerCapture(v5, new Set(["rank 1", "rank 2", "rank 3"])), winnerCapture(v3, new Set(["rank 1", "rank 2", "rank 3"])))),
    "absolute calibration": `${absoluteBandMonotonicity(v3, scoreBandsFor(benchmarks, "v3"))} -> ${absoluteBandMonotonicity(v5, scoreBandsFor(benchmarks, "v5"))}`,
    "gap calibration": `${gapCalibrationLabel(v3, gapBandsFor(benchmarks, "v3"))} -> ${gapCalibrationLabel(v5, gapBandsFor(benchmarks, "v5"))}`,
  };
}

function contextRows(
  benchmark: Benchmark,
  bands: Band[],
  contextType: string,
  keyFor: (row: HistoricalTargetRunnerMetricsRow) => string,
  order: string[],
) {
  const groups = groupBy(benchmark.settledRows, keyFor);
  return order
    .filter((key) => groups.has(key))
    .map((key) => {
      const rows = groups.get(key)!;
      const ratedRows = rows.filter((row) => benchmark.values.has(row.features.targetRunnerId));
      return {
        year: benchmark.year,
        context: contextType,
        bucket: key,
        coverage: pct(rows.length === 0 ? null : (ratedRows.length / rows.length) * 100),
        "mean rating": number(average(ratedRows.map((row) => benchmark.values.get(row.features.targetRunnerId)).filter(isNumber))),
        "median rating": number(median(ratedRows.map((row) => benchmark.values.get(row.features.targetRunnerId)).filter(isNumber))),
        association: number(spearmanAssociationForRows(benchmark, rows)),
        "rank-1 strike": pct(winRate(rows.filter((row) => benchmark.rankGroups.get(row.features.targetRunnerId) === "rank 1"))),
        "top-3 capture": pct(winnerCaptureForRows(benchmark, rows, new Set(["rank 1", "rank 2", "rank 3"]))),
        "absolute bands": absoluteBandMonotonicityForRows(benchmark, bands, rows),
      };
    });
}

function goingEffectRow(
  benchmarks: Benchmark[],
  profiles: Map<string, GoingProfile>,
  year: Year,
  quality: GoingMatchQuality,
) {
  const v3 = benchmarkByKey(benchmarks, year, "v3");
  const v5 = benchmarkByKey(benchmarks, year, "v5");
  const v3Rows = v3.settledRows.filter((row) => profiles.get(row.features.targetRunnerId)?.latestQuality === quality);
  const v5Rows = v5.settledRows.filter((row) => profiles.get(row.features.targetRunnerId)?.latestQuality === quality);
  if (v3Rows.length < 500 || v5Rows.length < 500) {
    return { associationDelta: null, top3CaptureDelta: null, effect: "too sparse" };
  }
  const associationDelta = diff(spearmanAssociationForRows(v5, v5Rows), spearmanAssociationForRows(v3, v3Rows));
  const top3CaptureDelta = diff(
    winnerCaptureForRows(v5, v5Rows, new Set(["rank 1", "rank 2", "rank 3"])),
    winnerCaptureForRows(v3, v3Rows, new Set(["rank 1", "rank 2", "rank 3"])),
  );
  const effect = (associationDelta ?? 0) > 0.005 && (top3CaptureDelta ?? 0) >= -0.5
    ? "improved"
    : (associationDelta ?? 0) < -0.005 || (top3CaptureDelta ?? 0) < -0.5
      ? "worsened"
      : "unchanged";
  return { associationDelta, top3CaptureDelta, effect };
}

function goingReplicationLabel(left?: string, right?: string) {
  if (left === "too sparse" || right === "too sparse") return "too sparse";
  if (left === "improved" && right === "improved") return "replicated";
  if (left === "improved" || right === "improved") return "partially replicated";
  if (left === "worsened" || right === "worsened") return "worsened";
  return "failed";
}

function existingMeasureBenchmarks(contexts: Context[]) {
  return contexts.flatMap((context) => [
    benchmarkFor(context.year, "todaysRating", "Today's Rating", context.settledRows, valuesFor(context.settledRows, (row) => row.features.latestTodaysRating)),
    benchmarkFor(context.year, "averageSpeedLast3", "Average Topspeed last 3", context.settledRows, valuesFor(context.settledRows, (row) => row.features.averageSpeedLast3)),
    benchmarkFor(context.year, "averagePerformanceLast3", "Average RPR last 3", context.settledRows, valuesFor(context.settledRows, (row) => row.features.averagePerformanceLast3)),
    benchmarkFor(context.year, "officialRating", "Official Rating", context.settledRows, valuesFor(context.settledRows, (row) => row.features.officialRating)),
  ]);
}

function valuesFor(rows: HistoricalTargetRunnerMetricsRow[], valueFor: (row: HistoricalTargetRunnerMetricsRow) => number | null) {
  const values = new Map<string, number>();
  for (const row of rows) {
    const value = valueFor(row);
    if (value !== null && Number.isFinite(value)) {
      values.set(row.features.targetRunnerId, value);
    }
  }
  return values;
}

function versionComparisonAnswer(v3: Benchmark, v5: Benchmark, benchmarks: Benchmark[], year: Year) {
  return `association ${number(spearmanAssociation(v3))} -> ${number(spearmanAssociation(v5))}; top-3 capture ${pct(winnerCapture(v3, new Set(["rank 1", "rank 2", "rank 3"])))} -> ${pct(winnerCapture(v5, new Set(["rank 1", "rank 2", "rank 3"])))}; absolute bands ${absoluteBandMonotonicity(v3, scoreBandsFor(benchmarks, "v3"))} -> ${absoluteBandMonotonicity(v5, scoreBandsFor(benchmarks, "v5"))} (${year}).`;
}

function goingCoverageAnswer(
  v3_2025: Benchmark,
  v3_2026: Benchmark,
  profiles: Map<string, GoingProfile>,
) {
  const pct2025 = assessablePct(v3_2025, profiles);
  const pct2026 = assessablePct(v3_2026, profiles);
  return `Assessable latest-run going suitability covers ${pct(pct2025)} of V3-rated 2025 runners and ${pct(pct2026)} of V3-rated 2026 runners; reconstruction uses source-table prior runs because the cache stores aggregate rating fields, not contributing run IDs.`;
}

function goingVariationAnswer(
  v3_2025: Benchmark,
  v3_2026: Benchmark,
  profiles: Map<string, GoingProfile>,
) {
  const spread2025 = goingStrikeSpread(v3_2025, profiles);
  const spread2026 = goingStrikeSpread(v3_2026, profiles);
  return `Latest-run exact/adjacent/different strike-rate spread is ${pp(spread2025)} in 2025 and ${pp(spread2026)} in 2026.`;
}

function assessablePct(benchmark: Benchmark, profiles: Map<string, GoingProfile>) {
  if (benchmark.rowsWithValue.length === 0) return null;
  const assessable = benchmark.rowsWithValue.filter((row) =>
    isAssessableQuality(profiles.get(row.features.targetRunnerId)?.latestQuality)
  );
  return (assessable.length / benchmark.rowsWithValue.length) * 100;
}

function goingStrikeSpread(benchmark: Benchmark, profiles: Map<string, GoingProfile>) {
  const rates = [
    "latest exact match",
    "latest adjacent",
    "latest materially different",
  ].map((quality) =>
    winRate(benchmark.rowsWithValue.filter((row) => profiles.get(row.features.targetRunnerId)?.latestQuality === quality))
  ).filter(isNumber);
  return rates.length < 2 ? null : Math.max(...rates) - Math.min(...rates);
}

function noMaterialContextDeterioration(benchmarks: Benchmark[]) {
  return YEARS.every((year) => {
    const v3 = benchmarkByKey(benchmarks, year, "v3");
    const v5 = benchmarkByKey(benchmarks, year, "v5");
    const buckets = [
      ...distanceOrder.map((key) => ({ type: "distance", key, rows: v3.settledRows.filter((row) => distanceBand(row.features.distanceYards) === key) })),
      ...raceClassOrder.map((key) => ({ type: "race class", key, rows: v3.settledRows.filter((row) => raceClassBucket(row.features.raceClass) === key) })),
      ...fieldSizeOrder.map((key) => ({ type: "field size", key, rows: v3.settledRows.filter((row) => fieldSizeBand(fieldSizeForRow(row)) === key) })),
    ];
    return buckets.every((bucket) => {
      if (bucket.rows.length < 500) return true;
      const v3Association = spearmanAssociationForRows(v3, bucket.rows) ?? 0;
      const v5Association = spearmanAssociationForRows(v5, bucket.rows) ?? 0;
      return v5Association >= v3Association - 0.015;
    });
  });
}

function scoreBandsFor(benchmarks: Benchmark[], key: string) {
  return scoreBandsForSingle(benchmarkByKey(benchmarks, "2025", key));
}

function scoreBandsForSingle(benchmark: Benchmark) {
  return quantileBands([...benchmark.values.values()], SCORE_BAND_LABELS);
}

function gapBandsFor(benchmarks: Benchmark[], key: string) {
  return quantileBands(topTwoGaps(benchmarkByKey(benchmarks, "2025", key)).map((item) => item.gap), GAP_BAND_LABELS);
}

function rowsForBand(benchmark: Benchmark, band: Band) {
  return benchmark.rowsWithValue.filter((row) => inBand(benchmark.values.get(row.features.targetRunnerId) ?? NaN, band));
}

function rowsForBandInRows(benchmark: Benchmark, rows: HistoricalTargetRunnerMetricsRow[], band: Band) {
  return rows.filter((row) => inBand(benchmark.values.get(row.features.targetRunnerId) ?? NaN, band));
}

function topTwoGaps(benchmark: Benchmark) {
  const gaps: Array<{ gap: number; topRow: HistoricalTargetRunnerMetricsRow }> = [];
  const rowsByRace = groupBy(benchmark.rowsWithValue, (row) => row.features.targetRaceId);
  for (const raceRows of rowsByRace.values()) {
    const ranked = raceRows
      .map((row) => ({ row, value: benchmark.values.get(row.features.targetRunnerId) }))
      .filter((entry): entry is { row: HistoricalTargetRunnerMetricsRow; value: number } => entry.value !== undefined)
      .sort((left, right) =>
        right.value - left.value ||
        left.row.features.targetRunnerId.localeCompare(right.row.features.targetRunnerId)
      );
    if (ranked.length >= 2) {
      gaps.push({ gap: ranked[0]!.value - ranked[1]!.value, topRow: ranked[0]!.row });
    }
  }
  return gaps;
}

function absoluteBandMonotonicity(benchmark: Benchmark, bands: Band[]) {
  return trendLabel(bands.map((band) => winRate(rowsForBand(benchmark, band))));
}

function absoluteBandMonotonicityForRows(
  benchmark: Benchmark,
  bands: Band[],
  rows: HistoricalTargetRunnerMetricsRow[],
) {
  return trendLabel(bands.map((band) => winRate(rowsForBandInRows(benchmark, rows, band))));
}

function gapCalibrationLabel(benchmark: Benchmark, bands: Band[]) {
  const gaps = topTwoGaps(benchmark);
  return trendLabel(bands.map((band) => {
    const rows = gaps.filter((item) => inBand(item.gap, band)).map((item) => item.topRow);
    return winRate(rows);
  }));
}

function monotonicityLabel(benchmark: Benchmark) {
  return trendLabel((["rank 1", "rank 2", "rank 3", "rank 4+"] satisfies RankGroup[]).map((group) => winRate(rowsForRankGroup(benchmark, group))));
}

function trendLabel(values: Array<number | null>) {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (finite.length < 3) return "insufficient data";
  let nonDecreasing = true;
  let nonIncreasing = true;
  for (let index = 1; index < finite.length; index += 1) {
    if (finite[index]! < finite[index - 1]! - 0.0001) nonDecreasing = false;
    if (finite[index]! > finite[index - 1]! + 0.0001) nonIncreasing = false;
  }
  if (nonDecreasing) return "monotonic increasing";
  if (nonIncreasing) return "monotonic decreasing";
  return "non-monotonic";
}

function rankRowsByMeasure(
  rows: HistoricalTargetRunnerMetricsRow[],
  valueFor: (row: HistoricalTargetRunnerMetricsRow) => number | null,
) {
  const ranks = new Map<string, number>();
  const rowsByRace = groupBy(rows, (row) => row.features.targetRaceId);
  for (const raceRows of rowsByRace.values()) {
    const rankable = raceRows
      .map((row) => ({ row, value: valueFor(row) }))
      .filter((entry): entry is { row: HistoricalTargetRunnerMetricsRow; value: number } =>
        entry.value !== null && Number.isFinite(entry.value)
      )
      .sort((left, right) =>
        right.value - left.value ||
        left.row.features.targetRunnerId.localeCompare(right.row.features.targetRunnerId)
      );
    let previousValue: number | null = null;
    let previousRank = 0;
    rankable.forEach((entry, index) => {
      const rank = entry.value === previousValue ? previousRank : index + 1;
      ranks.set(entry.row.features.targetRunnerId, rank);
      previousValue = entry.value;
      previousRank = rank;
    });
  }
  return ranks;
}

function rowsForRankGroup(benchmark: Benchmark, group: RankGroup) {
  return benchmark.settledRows.filter((row) => benchmark.rankGroups.get(row.features.targetRunnerId) === group);
}

function winnerCapture(benchmark: Benchmark, groups: Set<RankGroup>) {
  return winnerCaptureForRows(benchmark, benchmark.settledRows, groups);
}

function winnerCaptureForRows(benchmark: Benchmark, rows: HistoricalTargetRunnerMetricsRow[], groups: Set<RankGroup>) {
  const winnersInRows = rows.filter((row) => row.outcome.won === true);
  if (winnersInRows.length === 0) return null;
  return (winnersInRows.filter((row) => groups.has(benchmark.rankGroups.get(row.features.targetRunnerId) ?? "missing")).length / winnersInRows.length) * 100;
}

function spearmanAssociation(benchmark: Benchmark) {
  return spearmanAssociationForRows(benchmark, benchmark.rowsWithValue);
}

function spearmanAssociationForRows(benchmark: Benchmark, rows: HistoricalTargetRunnerMetricsRow[]) {
  const entries = rows
    .map((row) => ({
      rating: benchmark.values.get(row.features.targetRunnerId) ?? null,
      performance: row.outcome.finishingPosition === null ? null : -row.outcome.finishingPosition,
    }))
    .filter((entry): entry is { rating: number; performance: number } =>
      entry.rating !== null && entry.performance !== null && Number.isFinite(entry.rating) && Number.isFinite(entry.performance)
    );
  if (entries.length < 2) return null;
  return pearson(rankValues(entries.map((entry) => entry.rating)), rankValues(entries.map((entry) => entry.performance)));
}

function rankValues(values: number[]) {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((left, right) => left.value - right.value || left.index - right.index);
  const ranks = Array<number>(values.length);
  for (let index = 0; index < indexed.length;) {
    let end = index + 1;
    while (end < indexed.length && indexed[end]!.value === indexed[index]!.value) end += 1;
    const averageRank = (index + 1 + end) / 2;
    for (let cursor = index; cursor < end; cursor += 1) {
      ranks[indexed[cursor]!.index] = averageRank;
    }
    index = end;
  }
  return ranks;
}

function pearson(left: number[], right: number[]) {
  if (left.length !== right.length || left.length < 2) return null;
  const leftAverage = average(left);
  const rightAverage = average(right);
  if (leftAverage === null || rightAverage === null) return null;
  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index]! - leftAverage;
    const rightDelta = right[index]! - rightAverage;
    numerator += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator === 0 ? null : numerator / denominator;
}

function slope(xs: number[], ys: number[]) {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const xMean = average(xs);
  const yMean = average(ys);
  if (xMean === null || yMean === null) return null;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < xs.length; index += 1) {
    numerator += (xs[index]! - xMean) * (ys[index]! - yMean);
    denominator += (xs[index]! - xMean) ** 2;
  }
  return denominator === 0 ? null : numerator / denominator;
}

function quantileBands(values: number[], labels: string[]) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (sorted.length === 0) return [{ label: labels[0] ?? "all", min: -Infinity, max: Infinity }];
  return labels.map((label, index) => ({
    label,
    min: index === 0 ? -Infinity : quantile(sorted, index / labels.length),
    max: index === labels.length - 1 ? Infinity : quantile(sorted, (index + 1) / labels.length),
  }));
}

function quantile(sortedValues: number[], probability: number) {
  if (sortedValues.length === 0) return NaN;
  if (sortedValues.length === 1) return sortedValues[0]!;
  const position = (sortedValues.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower]!;
  const weight = position - lower;
  return sortedValues[lower]! * (1 - weight) + sortedValues[upper]! * weight;
}

function inBand(value: number, band: Band) {
  if (!Number.isFinite(value)) return false;
  const aboveMin = band.min === -Infinity ? true : value > band.min || nearlyEqual(value, band.min);
  const belowMax = band.max === Infinity ? true : value <= band.max || nearlyEqual(value, band.max);
  return aboveMin && belowMax;
}

function benchmarkByKey(benchmarks: Benchmark[], year: Year, key: string) {
  const benchmark = benchmarks.find((item) => item.year === year && item.key === key);
  if (!benchmark) throw new Error(`Missing benchmark ${key} ${year}`);
  return benchmark;
}

function contextFor(contexts: Context[], year: Year) {
  const context = contexts.find((item) => item.year === year);
  if (!context) throw new Error(`Missing context ${year}`);
  return context;
}

function isSettledRunner(row: HistoricalTargetRunnerMetricsRow) {
  return row.outcome.resultStatus !== "non_runner" && row.outcome.finishingPosition !== null;
}

function rankGroup(rank: number | null): RankGroup {
  if (rank === null) return "missing";
  if (rank === 1) return "rank 1";
  if (rank === 2) return "rank 2";
  if (rank === 3) return "rank 3";
  return "rank 4+";
}

function winners(rows: HistoricalTargetRunnerMetricsRow[]) {
  return rows.filter((row) => row.outcome.won === true).length;
}

function winRate(rows: HistoricalTargetRunnerMetricsRow[]) {
  return rows.length === 0 ? null : (winners(rows) / rows.length) * 100;
}

function top3Rate(rows: HistoricalTargetRunnerMetricsRow[]) {
  if (rows.length === 0) return null;
  return (rows.filter((row) => (row.outcome.finishingPosition ?? Infinity) <= 3).length / rows.length) * 100;
}

function coverage(benchmark: Benchmark) {
  return benchmark.settledRows.length === 0 ? null : (benchmark.rowsWithValue.length / benchmark.settledRows.length) * 100;
}

function averageFinish(rows: HistoricalTargetRunnerMetricsRow[]) {
  return average(rows.map((row) => row.outcome.finishingPosition).filter(isNumber));
}

function medianFinish(rows: HistoricalTargetRunnerMetricsRow[]) {
  return median(rows.map((row) => row.outcome.finishingPosition).filter(isNumber));
}

function weightDiffFromRaceMedian(row: HistoricalTargetRunnerMetricsRow) {
  const raceWeights = rowCacheByRace.get(row.features.targetRaceId)
    ?.map((raceRow) => raceRow.features.weightCarriedLbs)
    .filter(isNumber) ?? [];
  if (row.features.weightCarriedLbs === null || raceWeights.length === 0) return null;
  const raceMedian = median(raceWeights);
  return raceMedian === null ? null : row.features.weightCarriedLbs - raceMedian;
}

function raceClassBucket(value: string | null) {
  const raceClass = raceClassNumber(value);
  return raceClass === null ? "unknown" : `Class ${raceClass}`;
}

const raceClassOrder = ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "unknown"];
const distanceOrder = ["sprint", "mile-ish", "middle distance", "staying", "unknown"];
const fieldSizeOrder = ["2-5", "6-8", "9-12", "13+"];

function distanceBand(yards: number | null) {
  if (yards === null) return "unknown";
  if (yards <= 1320) return "sprint";
  if (yards <= 1760) return "mile-ish";
  if (yards <= 2640) return "middle distance";
  return "staying";
}

function fieldSizeBand(value: number | null) {
  if (value === null) return "13+";
  if (value <= 5) return "2-5";
  if (value <= 8) return "6-8";
  if (value <= 12) return "9-12";
  return "13+";
}

function fieldSizeForRow(row: HistoricalTargetRunnerMetricsRow) {
  return row.features.actualRunnerCount ?? row.features.declaredRunnerCount;
}

const rowCacheByRace = new Map<string, HistoricalTargetRunnerMetricsRow[]>();

function compareRowsChronologically(left: HistoricalTargetRunnerMetricsRow, right: HistoricalTargetRunnerMetricsRow) {
  return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
    left.features.targetRaceId.localeCompare(right.features.targetRaceId) ||
    left.features.targetRunnerId.localeCompare(right.features.targetRunnerId);
}

function hasRaceDateTime<T extends { raceDateTime: Date | null }>(row: T): row is T & { raceDateTime: Date } {
  return row.raceDateTime instanceof Date;
}

function groupBy<T>(items: T[], keyFor: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function standardDeviation(values: number[]) {
  const mean = average(values);
  if (mean === null || values.length < 2) return null;
  return Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length);
}

function isNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function nearlyEqual(left: number, right: number) {
  return Math.abs(left - right) < 0.0000001;
}

function chunks<T>(values: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function diff(left: number | null, right: number | null) {
  return left === null || right === null ? null : left - right;
}

function bandRange(band: Band) {
  const min = band.min === -Infinity ? "-inf" : band.min.toFixed(3);
  const max = band.max === Infinity ? "inf" : band.max.toFixed(3);
  return `${min} to ${max}`;
}

function pct(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(1)}%`;
}

function pp(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(1)}pp`;
}

function number(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(3);
}

function printTable(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    console.log("_No rows_");
    return;
  }
  const columns = Object.keys(rows[0]!);
  console.log(`| ${columns.join(" | ")} |`);
  console.log(`| ${columns.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    console.log(`| ${columns.map((column) => printable(row[column])).join(" | ")} |`);
  }
}

function printable(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\|/g, "\\|");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

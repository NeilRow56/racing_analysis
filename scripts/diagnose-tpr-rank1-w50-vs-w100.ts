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
type VariantKey = "W50" | "W100";

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
};

type ScoredRunner = {
  row: HistoricalTargetRunnerMetricsRow;
  raceId: string;
  runnerId: string;
  horseName: string;
  raceDate: string;
  month: string;
  fieldSize: number | null;
  raceClass: string;
  sp: number | null;
  won: boolean;
  placed: boolean;
  tpr: number | null;
  rank: number | null;
};

type VariantResult = {
  variant: Variant;
  scored: ScoredRunner[];
  rank1: ScoredRunner[];
  top3: ScoredRunner[];
  rankByRunner: Map<string, number>;
};

type Overall = {
  races: number;
  selections: number;
  winners: number;
  strike: number | null;
  avgSp: number | null;
  medianSp: number | null;
  roi: number | null;
  ae: number | null;
  top3WinnerCapture: number | null;
  winCorrelation: number | null;
};

type CaseResult = {
  horse: string;
  variant: VariantKey;
  tpr: number | null;
  rank: number | null;
};

const OUTPUT_PATH = "/tmp/tpr-rank1-w50-vs-w100.md";
const YEARS: Year[] = ["2025", "2026"];
const VARIANTS: Variant[] = [
  { key: "W50", label: "W50 - half production weight", weightMultiplier: 0.5 },
  { key: "W100", label: "W100 - production weight", weightMultiplier: 1 },
];

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

async function main() {
  const contexts = await Promise.all(YEARS.map(loadContext));
  const resultsByYear = new Map<Year, Map<VariantKey, VariantResult>>();
  for (const context of contexts) {
    resultsByYear.set(context.year, scoreVariants(context));
  }
  const cases = await loadCaseResults(contexts.find((context) => context.year === "2026") ?? null);
  const lines = report(contexts, resultsByYear, cases);
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
  if (!cache) throw new Error(`Missing compatible cache for ${year}`);

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
      medianWeight: median(raceRows.map((row) => row.features.weightCarriedLbs).filter(isNumber)),
    })),
  };
}

function scoreVariants(context: Context): Map<VariantKey, VariantResult> {
  const values = new Map<VariantKey, VariantResult>();
  for (const variant of VARIANTS) {
    const scored = context.races.flatMap((race) => scoreRace(race, variant));
    const rankByRunner = new Map(
      scored
        .filter((runner): runner is ScoredRunner & { rank: number } => runner.rank !== null)
        .map((runner) => [runner.runnerId, runner.rank]),
    );
    values.set(variant.key, {
      variant,
      scored,
      rankByRunner,
      rank1: scored.filter((runner) => runner.rank === 1),
      top3: scored.filter((runner) => runner.rank !== null && runner.rank <= 3),
    });
  }
  return values;
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
  const performance = weightedRecentLevel(reconstructedLast3Values(
    row.features.latestPerformanceRating,
    row.features.previousPerformanceRating,
    row.features.averagePerformanceLast3,
  ));
  const speed = weightedRecentLevel(reconstructedLast3Values(
    row.features.latestTurfSpeedRating,
    row.features.previousTurfSpeedRating,
    row.features.averageTurfSpeedLast3,
  ));
  const performanceRobust = robustScore(performance, RPR_MEDIAN_2025, RPR_IQR_2025);
  const speedRobust = robustScore(speed, SPEED_MEDIAN_2025, SPEED_IQR_2025);
  const base = performanceRobust === null || speedRobust === null ? null : (performanceRobust + speedRobust) / 2;
  const weightDiff = row.features.weightCarriedLbs === null || medianWeight === null
    ? null
    : row.features.weightCarriedLbs - medianWeight;
  const weightRaw = weightDiff === null
    ? null
    : WEIGHT_COEFFICIENT_RAW_POINTS_PER_LB * weightDiff * variant.weightMultiplier;
  const raw = base === null || weightRaw === null
    ? null
    : base - classOffset(row.features.raceClass) + weightRaw;

  return {
    row,
    raceId: row.features.targetRaceId,
    runnerId: row.features.targetRunnerId,
    horseName: row.features.horseName,
    raceDate: row.features.raceDate,
    month: row.features.raceDate.slice(0, 7),
    fieldSize: row.features.actualRunnerCount ?? row.features.declaredRunnerCount,
    raceClass: normalizedClass(row.features.raceClass),
    sp: decimalSp(row),
    won: row.outcome.won === true,
    placed: row.outcome.placed === true,
    tpr: raw === null ? null : toTpr(raw),
    rank: null,
  };
}

async function loadCaseResults(context: Context | null): Promise<CaseResult[]> {
  const targets = caseTargets();
  if (!context || !process.env.DATABASE_URL) return [];
  const raceIds = [...new Set(targets.flatMap((target) =>
    context.allRows
      .filter((row) =>
        row.features.horseName === target.horse &&
        row.features.raceDate === target.date &&
        row.features.courseName === target.course
      )
      .map((row) => row.features.targetRaceId)
  ))];
  if (raceIds.length === 0) return [];

  const { db, client } = createDbConnection();
  try {
    const rows = await getHistoricalTargetRunnerMetrics(db, {
      source: "sporting_life",
      targetRaceIds: raceIds,
      ratingFamily: "turf",
    });
    const races = [...groupBy(rows, (row) => row.features.targetRaceId).entries()].map(([raceId, raceRows]) => ({
      raceId,
      rows: raceRows,
      medianWeight: median(raceRows.map((row) => row.features.weightCarriedLbs).filter(isNumber)),
    }));
    return targets.flatMap((target) => VARIANTS.map((variant) => {
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
      };
    }));
  } finally {
    await client.end();
  }
}

function report(contexts: Context[], resultsByYear: Map<Year, Map<VariantKey, VariantResult>>, cases: CaseResult[]): string[] {
  const lines: string[] = [];
  lines.push("# TPR Rank-1 W50 vs W100 Confirmation Study");
  lines.push("");
  lines.push("Diagnostic only. Objective: identify the horse most likely to win today. Production TPR, Today, Research, cache logic, importer behavior, schemas, and cache versions were not changed.");
  lines.push("");
  lines.push(`Formula version: \`${TURF_PERFORMANCE_RATING_VERSION}\`. Only W50 and W100 are compared; all other coefficients remain production.`);
  lines.push("");
  writeScope(lines, contexts);
  writeOverall(lines, contexts, resultsByYear);
  writeDisagreement(lines, contexts, resultsByYear);
  writeAgreement(lines, contexts, resultsByYear);
  writeMonthly(lines, contexts, resultsByYear);
  writeFieldSize(lines, contexts, resultsByYear);
  writeRaceClass(lines, contexts, resultsByYear);
  writePriceBands(lines, contexts, resultsByYear);
  writeRankChangeMagnitude(lines, contexts, resultsByYear);
  writeCases(lines, cases);
  writeUncertainty(lines, contexts, resultsByYear);
  writeConclusion(lines, contexts, resultsByYear);
  return lines;
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
}

function writeOverall(lines: string[], contexts: Context[], resultsByYear: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Overall Rank-1 Performance");
  lines.push("");
  table(lines, contexts.flatMap((context) => {
    const w50 = overall(resultFor(resultsByYear, context.year, "W50"));
    const w100 = overall(resultFor(resultsByYear, context.year, "W100"));
    return [
      rowForOverall(context.year, "W50", w50, diffPct(w50.strike, w100.strike)),
      rowForOverall(context.year, "W100", w100, diffPct(w100.strike, w50.strike)),
    ];
  }));
}

function rowForOverall(year: Year, variant: VariantKey, stats: Overall, diff: number | null) {
  return {
    year,
    variant,
    races: stats.races,
    selections: stats.selections,
    winners: stats.winners,
    strike: pct(stats.strike),
    "diff pp": pp(diff),
    "avg SP": number(stats.avgSp),
    "median SP": number(stats.medianSp),
    "uncapped ROI": pct(stats.roi),
    "A/E": number(stats.ae, 3),
    "top-3 winner capture": pct(stats.top3WinnerCapture),
    "win corr": number(stats.winCorrelation, 4),
  };
}

function writeDisagreement(lines: string[], contexts: Context[], resultsByYear: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Disagreement Races");
  lines.push("");
  table(lines, contexts.map((context) => {
    const summary = disagreementSummary(resultFor(resultsByYear, context.year, "W50"), resultFor(resultsByYear, context.year, "W100"));
    return {
      year: context.year,
      races: summary.races,
      "W50 winners": summary.w50Winners,
      "W100 winners": summary.w100Winners,
      neither: summary.neither,
      "both won": summary.bothWon,
      "net W50 extra winners": summary.w50Winners - summary.w100Winners,
    };
  }));
}

function writeAgreement(lines: string[], contexts: Context[], resultsByYear: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Agreement Races");
  lines.push("");
  table(lines, contexts.map((context) => {
    const summary = agreementSummary(resultFor(resultsByYear, context.year, "W50"), resultFor(resultsByYear, context.year, "W100"));
    return {
      year: context.year,
      races: summary.races,
      winners: summary.winners,
      strike: pct(percentage(summary.winners, summary.races)),
    };
  }));
}

function writeMonthly(lines: string[], contexts: Context[], resultsByYear: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Monthly Stability");
  lines.push("");
  const rows: Array<Record<string, unknown>> = [];
  const summaryRows: Array<Record<string, unknown>> = [];
  for (const context of contexts) {
    let w50Wins = 0;
    let w100Wins = 0;
    let ties = 0;
    const months = [...new Set([
      ...resultFor(resultsByYear, context.year, "W50").rank1.map((runner) => runner.month),
      ...resultFor(resultsByYear, context.year, "W100").rank1.map((runner) => runner.month),
    ])].sort();
    for (const month of months) {
      const w50 = subsetStats(resultFor(resultsByYear, context.year, "W50").rank1.filter((runner) => runner.month === month));
      const w100 = subsetStats(resultFor(resultsByYear, context.year, "W100").rank1.filter((runner) => runner.month === month));
      const diff = diffPct(w50.strike, w100.strike);
      if (diff !== null && diff > 0) w50Wins += 1;
      else if (diff !== null && diff < 0) w100Wins += 1;
      else ties += 1;
      rows.push({
        year: context.year,
        month,
        "W50 selections": w50.selections,
        "W50 strike": pct(w50.strike),
        "W100 selections": w100.selections,
        "W100 strike": pct(w100.strike),
        "diff pp": pp(diff),
      });
    }
    summaryRows.push({ year: context.year, "months W50 wins": w50Wins, "months W100 wins": w100Wins, ties });
  }
  table(lines, rows);
  lines.push("Monthly scorecard:");
  lines.push("");
  table(lines, summaryRows);
}

function writeFieldSize(lines: string[], contexts: Context[], resultsByYear: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Field-Size Stability");
  lines.push("");
  const bands = ["2-5", "6-8", "9-12", "13+"];
  table(lines, contexts.flatMap((context) => bands.map((band) => {
    const w50 = subsetStats(resultFor(resultsByYear, context.year, "W50").rank1.filter((runner) => fieldBand(runner.fieldSize) === band));
    const w100 = subsetStats(resultFor(resultsByYear, context.year, "W100").rank1.filter((runner) => fieldBand(runner.fieldSize) === band));
    return {
      year: context.year,
      band,
      "W50 selections": w50.selections,
      "W50 strike": pct(w50.strike),
      "W100 selections": w100.selections,
      "W100 strike": pct(w100.strike),
      "diff pp": pp(diffPct(w50.strike, w100.strike)),
    };
  })));
}

function writeRaceClass(lines: string[], contexts: Context[], resultsByYear: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Race-Class Stability");
  lines.push("");
  table(lines, contexts.flatMap((context) => {
    const classes = [...new Set([
      ...resultFor(resultsByYear, context.year, "W50").rank1.map((runner) => runner.raceClass),
      ...resultFor(resultsByYear, context.year, "W100").rank1.map((runner) => runner.raceClass),
    ])].sort();
    return classes.map((raceClass) => {
      const w50 = subsetStats(resultFor(resultsByYear, context.year, "W50").rank1.filter((runner) => runner.raceClass === raceClass));
      const w100 = subsetStats(resultFor(resultsByYear, context.year, "W100").rank1.filter((runner) => runner.raceClass === raceClass));
      return {
        year: context.year,
        class: raceClass,
        sparse: w50.selections < 100 || w100.selections < 100 ? "yes" : "no",
        "W50 selections": w50.selections,
        "W50 strike": pct(w50.strike),
        "W100 selections": w100.selections,
        "W100 strike": pct(w100.strike),
        "diff pp": pp(diffPct(w50.strike, w100.strike)),
      };
    });
  }));
}

function writePriceBands(lines: string[], contexts: Context[], resultsByYear: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Price-Band Stability");
  lines.push("");
  const bands = ["<2.0", "2.0-2.99", "3.0-4.99", "5.0-8.99", "9.0+"];
  table(lines, contexts.flatMap((context) => bands.map((band) => {
    const w50 = subsetStats(resultFor(resultsByYear, context.year, "W50").rank1.filter((runner) => priceBand(runner.sp) === band));
    const w100 = subsetStats(resultFor(resultsByYear, context.year, "W100").rank1.filter((runner) => priceBand(runner.sp) === band));
    return {
      year: context.year,
      band,
      "W50 selections": w50.selections,
      "W50 strike": pct(w50.strike),
      "W50 ROI": pct(w50.roi),
      "W50 A/E": number(w50.ae, 3),
      "W100 selections": w100.selections,
      "W100 strike": pct(w100.strike),
      "W100 ROI": pct(w100.roi),
      "W100 A/E": number(w100.ae, 3),
    };
  })));
}

function writeRankChangeMagnitude(lines: string[], contexts: Context[], resultsByYear: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Rank-Change Magnitude In Disagreement Races");
  lines.push("");
  table(lines, contexts.map((context) => {
    const w50 = resultFor(resultsByYear, context.year, "W50");
    const w100 = resultFor(resultsByYear, context.year, "W100");
    const pairs = rank1Pairs(w50, w100).filter((pair) => pair.w50?.runnerId !== pair.w100?.runnerId);
    const w50RankUnderW100 = pairs.map((pair) => pair.w50 ? w100.rankByRunner.get(pair.w50.runnerId) ?? null : null);
    const w100RankUnderW50 = pairs.map((pair) => pair.w100 ? w50.rankByRunner.get(pair.w100.runnerId) ?? null : null);
    return {
      year: context.year,
      "disagreement races": pairs.length,
      "W50 pick is W100 rank2": w50RankUnderW100.filter((rank) => rank === 2).length,
      "W50 pick is W100 rank3+": w50RankUnderW100.filter((rank) => rank !== null && rank >= 3).length,
      "W100 pick is W50 rank2": w100RankUnderW50.filter((rank) => rank === 2).length,
      "W100 pick is W50 rank3+": w100RankUnderW50.filter((rank) => rank !== null && rank >= 3).length,
    };
  }));
}

function writeCases(lines: string[], cases: CaseResult[]) {
  lines.push("## Three Case Examples");
  lines.push("");
  lines.push("Illustrative only. The aggregate study is cache-based; these current-day examples load target-race metrics from the DB because the latest cache stores 2026-09-16 racecard rows as unsupported/unsettled.");
  lines.push("");
  table(lines, cases.map((row) => ({
    horse: row.horse,
    variant: row.variant,
    TPR: number(row.tpr),
    rank: row.rank ?? "-",
  })));
}

function writeUncertainty(lines: string[], contexts: Context[], resultsByYear: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Statistical Uncertainty");
  lines.push("");
  table(lines, contexts.flatMap((context) => {
    const w50 = overall(resultFor(resultsByYear, context.year, "W50"));
    const w100 = overall(resultFor(resultsByYear, context.year, "W100"));
    const disagreement = disagreementSummary(resultFor(resultsByYear, context.year, "W50"), resultFor(resultsByYear, context.year, "W100"));
    const mcnemar = mcnemarApprox(disagreement.w50Winners, disagreement.w100Winners);
    return [
      {
        year: context.year,
        variant: "W50",
        strike: pct(w50.strike),
        "95% CI": ciText(w50.winners, w50.selections),
        "paired p approx": number(mcnemar.p, 4),
      },
      {
        year: context.year,
        variant: "W100",
        strike: pct(w100.strike),
        "95% CI": ciText(w100.winners, w100.selections),
        "paired p approx": number(mcnemar.p, 4),
      },
    ];
  }));
  lines.push("Paired p is a simple two-sided normal approximation to McNemar on disagreement races only; treat as directional, not a formal model.");
  lines.push("");
}

function writeConclusion(lines: string[], contexts: Context[], resultsByYear: Map<Year, Map<VariantKey, VariantResult>>) {
  const y2025W50 = overall(resultFor(resultsByYear, "2025", "W50"));
  const y2025W100 = overall(resultFor(resultsByYear, "2025", "W100"));
  const y2026W50 = overall(resultFor(resultsByYear, "2026", "W50"));
  const y2026W100 = overall(resultFor(resultsByYear, "2026", "W100"));
  const d2025 = disagreementSummary(resultFor(resultsByYear, "2025", "W50"), resultFor(resultsByYear, "2025", "W100"));
  const d2026 = disagreementSummary(resultFor(resultsByYear, "2026", "W50"), resultFor(resultsByYear, "2026", "W100"));
  const m2026 = mcnemarApprox(d2026.w50Winners, d2026.w100Winners);

  lines.push("## Conclusion");
  lines.push("");
  lines.push(`1. Higher 2025 rank-1 strike: ${winnerLabel(y2025W50.strike, y2025W100.strike)} (${pct(y2025W50.strike)} vs ${pct(y2025W100.strike)}).`);
  lines.push(`2. Higher 2026 rank-1 strike: ${winnerLabel(y2026W50.strike, y2026W100.strike)} (${pct(y2026W50.strike)} vs ${pct(y2026W100.strike)}).`);
  lines.push(`3. Extra W50 winners in disagreement races: 2025 ${d2025.w50Winners - d2025.w100Winners}; 2026 ${d2026.w50Winners - d2026.w100Winners}.`);
  lines.push("4. Monthly breadth: see monthly scorecard; use it to distinguish broad edge from month concentration.");
  lines.push("5. Field-size persistence: see fixed 2-5, 6-8, 9-12, 13+ table; no bands were tuned.");
  lines.push("6. Race-class persistence: see class table; sparse classes are flagged.");
  lines.push(`7. Statistical clarity: 2026 paired p approximation ${number(m2026.p, 4)}; ${m2026.p !== null && m2026.p < 0.05 ? "statistically suggestive" : "not statistically clear"}.`);
  lines.push(`8. ROI/A/E: W50 2026 ROI ${pct(y2026W50.roi)}, A/E ${number(y2026W50.ae, 3)} vs W100 ROI ${pct(y2026W100.roi)}, A/E ${number(y2026W100.ae, 3)}.`);
  lines.push(`9. Secondary whole-field metrics: W50 top-3 capture ${pct(y2026W50.top3WinnerCapture)}, corr ${number(y2026W50.winCorrelation, 4)} vs W100 top-3 capture ${pct(y2026W100.top3WinnerCapture)}, corr ${number(y2026W100.winCorrelation, 4)}.`);
  lines.push(`10. For the stated rank-1 objective, ${shouldSwitch(y2026W50, y2026W100, m2026.p) ? "W50 is strong enough to justify a separately staged production switch decision" : "W50 is not yet strong enough to justify switching production from W100"}.`);
  lines.push("11. Additional confirmation needed: at least another independent Turf holdout period or a locked-forward live shadow run of comparable size, focused only on rank-1 strike and paired disagreement winners.");
}

function overall(result: VariantResult): Overall {
  const rank1 = result.rank1;
  const top3 = result.top3;
  const valid = result.scored.filter((runner) => runner.tpr !== null && runner.rank !== null);
  const winners = valid.filter((runner) => runner.won);
  return {
    races: new Set(valid.map((runner) => runner.raceId)).size,
    selections: rank1.length,
    winners: rank1.filter((runner) => runner.won).length,
    strike: percentage(rank1.filter((runner) => runner.won).length, rank1.length),
    avgSp: average(rank1.map((runner) => runner.sp).filter(isNumber)),
    medianSp: median(rank1.map((runner) => runner.sp).filter(isNumber)),
    roi: roi(rank1),
    ae: ae(rank1),
    top3WinnerCapture: percentage(top3.filter((runner) => runner.won).length, winners.length),
    winCorrelation: pearson(valid.map((runner) => runner.tpr ?? 0), valid.map((runner) => runner.won ? 1 : 0)),
  };
}

function subsetStats(rows: ScoredRunner[]) {
  return {
    selections: rows.length,
    winners: rows.filter((runner) => runner.won).length,
    strike: percentage(rows.filter((runner) => runner.won).length, rows.length),
    roi: roi(rows),
    ae: ae(rows),
  };
}

function disagreementSummary(w50: VariantResult, w100: VariantResult) {
  const pairs = rank1Pairs(w50, w100).filter((pair) => pair.w50?.runnerId !== pair.w100?.runnerId);
  let w50Winners = 0;
  let w100Winners = 0;
  let bothWon = 0;
  let neither = 0;
  for (const pair of pairs) {
    const leftWon = pair.w50?.won === true;
    const rightWon = pair.w100?.won === true;
    if (leftWon) w50Winners += 1;
    if (rightWon) w100Winners += 1;
    if (leftWon && rightWon) bothWon += 1;
    if (!leftWon && !rightWon) neither += 1;
  }
  return { races: pairs.length, w50Winners, w100Winners, bothWon, neither };
}

function agreementSummary(w50: VariantResult, w100: VariantResult) {
  const pairs = rank1Pairs(w50, w100).filter((pair) => pair.w50?.runnerId === pair.w100?.runnerId);
  return {
    races: pairs.length,
    winners: pairs.filter((pair) => pair.w50?.won).length,
  };
}

function rank1Pairs(w50: VariantResult, w100: VariantResult): Array<{ raceId: string; w50: ScoredRunner | null; w100: ScoredRunner | null }> {
  const left = new Map(w50.rank1.map((runner) => [runner.raceId, runner]));
  const right = new Map(w100.rank1.map((runner) => [runner.raceId, runner]));
  return [...new Set([...left.keys(), ...right.keys()])].map((raceId) => ({
    raceId,
    w50: left.get(raceId) ?? null,
    w100: right.get(raceId) ?? null,
  }));
}

function mcnemarApprox(w50OnlyWins: number, w100OnlyWins: number): { statistic: number | null; p: number | null } {
  const n = w50OnlyWins + w100OnlyWins;
  if (n === 0) return { statistic: null, p: null };
  const statistic = ((Math.abs(w50OnlyWins - w100OnlyWins) - 1) ** 2) / n;
  const z = Math.sqrt(statistic);
  return { statistic, p: 2 * (1 - normalCdf(z)) };
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
    .filter((entry): entry is { value: number; weight: number } => isNumber(entry.value));
  if (available.length === 0) return null;
  const total = available.reduce((sum, entry) => sum + entry.weight, 0);
  return available.reduce((sum, entry) => sum + entry.value * (entry.weight / total), 0);
}

function robustScore(value: number | null, center: number, spread: number): number | null {
  return value === null ? null : (value - center) / spread;
}

function classOffset(value: string | null): number {
  const raceClass = raceClassNumber(value);
  return CLASS_OFFSETS_2025[raceClass === null ? "unknown" : `Class ${raceClass}`] ?? 0;
}

function toTpr(raw: number): number {
  return 100 + (10 * ((raw - TPR_DEVELOPMENT_MEAN) / TPR_DEVELOPMENT_STDEV));
}

function rankBy<T>(rows: T[], getValue: (row: T) => number | null, id: (row: T) => string): Map<string, number> {
  const ranked = rows
    .map((row) => ({ row, value: getValue(row), id: id(row) }))
    .filter((entry): entry is { row: T; value: number; id: string } => isNumber(entry.value))
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

function decimalSp(row: HistoricalTargetRunnerMetricsRow): number | null {
  const value = row.outcome.startingPriceDecimal;
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function roi(rows: ScoredRunner[]): number | null {
  if (rows.length === 0) return null;
  const profit = rows.reduce((sum, runner) => {
    if (!runner.won) return sum - 1;
    return sum + ((runner.sp ?? 0) - 1);
  }, 0);
  return profit / rows.length;
}

function ae(rows: ScoredRunner[]): number | null {
  const expected = rows.reduce((sum, runner) => runner.sp ? sum + (1 / runner.sp) : sum, 0);
  if (expected === 0) return null;
  return rows.filter((runner) => runner.won).length / expected;
}

function fieldBand(size: number | null): string {
  if (size === null) return "missing";
  if (size <= 5) return "2-5";
  if (size <= 8) return "6-8";
  if (size <= 12) return "9-12";
  return "13+";
}

function priceBand(sp: number | null): string {
  if (sp === null) return "missing";
  if (sp < 2) return "<2.0";
  if (sp < 3) return "2.0-2.99";
  if (sp < 5) return "3.0-4.99";
  if (sp < 9) return "5.0-8.99";
  return "9.0+";
}

function normalizedClass(value: string | null): string {
  const classNumber = raceClassNumber(value);
  return classNumber === null ? "unknown" : `Class ${classNumber}`;
}

function caseTargets() {
  return [
    { horse: "Cerro Blanco", date: "2026-09-16", course: "Sandown" },
    { horse: "Mare Crisium", date: "2026-09-16", course: "Clonmel" },
    { horse: "Raffles Angel", date: "2026-09-16", course: "Yarmouth" },
  ];
}

function shouldSwitch(w50: Overall, w100: Overall, pairedP: number | null): boolean {
  return (w50.strike ?? 0) > (w100.strike ?? 0) &&
    (w50.winners - w100.winners) >= 10 &&
    pairedP !== null &&
    pairedP < 0.05 &&
    (w50.ae ?? 0) >= ((w100.ae ?? 0) * 0.98);
}

function winnerLabel(left: number | null, right: number | null): string {
  if (left === null || right === null) return "n/a";
  if (left > right) return "W50";
  if (right > left) return "W100";
  return "tie";
}

function ciText(winners: number, total: number): string {
  if (total === 0) return "-";
  const p = winners / total;
  const se = Math.sqrt((p * (1 - p)) / total);
  return `${pct(p - 1.96 * se)} to ${pct(p + 1.96 * se)}`;
}

function normalCdf(value: number): number {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

function erf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
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

function resultFor(resultsByYear: Map<Year, Map<VariantKey, VariantResult>>, year: Year, key: VariantKey): VariantResult {
  const result = resultsByYear.get(year)?.get(key);
  if (!result) throw new Error(`Missing ${year} ${key}`);
  return result;
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
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

function diffPct(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left - right;
}

function isNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
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
  return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(1)}%`;
}

function pp(value: number | null): string {
  return value === null ? "-" : `${(value * 100).toFixed(2)}`;
}

function number(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "-" : value.toFixed(digits);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

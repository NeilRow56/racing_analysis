import { writeFile } from "node:fs/promises";
import { loadLatestBacktestFeatureCacheForYear, type BacktestCacheFamily } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import {
  calculateTurfPerformanceRating,
  rankTurfPerformanceRatings,
  TURF_PERFORMANCE_RATING_VERSION,
  TURF_PERFORMANCE_RATING_W50_WEIGHT_MULTIPLIER,
  type TurfPerformanceRating,
} from "@/lib/racing/turf-performance-rating";

type Year = "2025" | "2026";
type VariantKey = "W100" | "W50";
type PopulationKey = "rank1" | "rank2" | "top2";

type Context = {
  year: Year;
  cacheFamily: BacktestCacheFamily;
  cacheWindow: string;
  actualCoverage: string;
  rows: HistoricalTargetRunnerMetricsRow[];
  races: RaceContext[];
};

type RaceContext = {
  raceId: string;
  raceDateTime: Date;
  rows: HistoricalTargetRunnerMetricsRow[];
  medianWeight: number | null;
};

type Variant = {
  key: VariantKey;
  label: string;
  weightMultiplier: number;
};

type Selection = {
  raceId: string;
  runnerId: string;
  horseName: string;
  raceDate: string;
  raceDateTime: Date;
  month: string;
  fieldSize: number | null;
  sp: number | null;
  won: boolean;
  rating: number;
  rank: number;
};

type VariantResult = {
  variant: Variant;
  selections: Selection[];
  rank1: Selection[];
  rank2: Selection[];
  top2: Selection[];
  eligibleRaces: number;
  tieRaces: number;
  top2IneligibleRaces: number;
};

type Metrics = {
  races: number;
  bets: number;
  winners: number;
  strike: number | null;
  capturedRaces: number;
  capture: number | null;
  stakes: number;
  returns: number;
  profitLoss: number;
  roi: number | null;
  ae: number | null;
  averageSp: number | null;
  medianSp: number | null;
  averageWinnerSp: number | null;
  medianWinnerSp: number | null;
};

const OUTPUT_PATH = "/tmp/tpr-rank1-vs-top2.md";
const YEARS: Year[] = ["2025", "2026"];
const VARIANTS: Variant[] = [
  { key: "W100", label: "W100 production", weightMultiplier: 1 },
  { key: "W50", label: "W50 shadow", weightMultiplier: TURF_PERFORMANCE_RATING_W50_WEIGHT_MULTIPLIER },
];
const POPULATIONS: Array<{ key: PopulationKey; label: string }> = [
  { key: "rank1", label: "rank 1" },
  { key: "rank2", label: "rank 2" },
  { key: "top2", label: "ranks 1 + 2" },
];
const FIELD_BANDS = ["2-5", "6-8", "9-12", "13+"];
const SP_BANDS = ["<2.0", "2.0-2.99", "3.0-4.99", "5.0-8.99", "9.0-20.99", "21.0+"];
const MATERIAL_ROI_GAP = 0.05;

async function main() {
  const contexts = await Promise.all(YEARS.map(loadContext));
  const results = new Map<Year, Map<VariantKey, VariantResult>>();
  for (const context of contexts) results.set(context.year, scoreVariants(context));
  const lines = buildReport(contexts, results);
  await writeFile(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
  for (const context of contexts) {
    for (const variant of VARIANTS) {
      const result = resultFor(results, context.year, variant.key);
      console.log(`${context.year} ${variant.key}: rank1 ROI ${pct(metrics(result.rank1).roi)}, rank2 ROI ${pct(metrics(result.rank2).roi)}, top2 ROI ${pct(metrics(result.top2).roi)}`);
    }
  }
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
  if (!cache) throw new Error(`Missing compatible v4 Turf cache for ${year}`);

  const races = [...groupBy(cache.turfRows, (row) => row.features.targetRaceId).entries()]
    .map(([raceId, rows]) => ({
      raceId,
      raceDateTime: rows[0]!.features.raceDateTime,
      rows,
      medianWeight: median(rows.map((row) => row.features.weightCarriedLbs).filter(isNumber)),
    }))
    .sort((left, right) => left.raceDateTime.getTime() - right.raceDateTime.getTime() || left.raceId.localeCompare(right.raceId));
  return {
    year,
    cacheFamily: cache.manifest.family,
    cacheWindow: `${cache.manifest.from} to ${cache.manifest.to}`,
    actualCoverage: `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}`,
    rows: cache.turfRows,
    races,
  };
}

function scoreVariants(context: Context): Map<VariantKey, VariantResult> {
  return new Map(VARIANTS.map((variant) => [variant.key, scoreVariant(context, variant)]));
}

function scoreVariant(context: Context, variant: Variant): VariantResult {
  const selections: Selection[] = [];
  let eligibleRaces = 0;
  let tieRaces = 0;
  let top2IneligibleRaces = 0;
  for (const race of context.races) {
    const ratings = race.rows.map((row) => ({
      id: row.features.targetRunnerId,
      rating: ratingFor(row, race.medianWeight, variant.weightMultiplier),
    }));
    const ranked = rankTurfPerformanceRatings(ratings);
    if (ranked.size === 0) continue;
    eligibleRaces += 1;
    const rankCounts = countBy([...ranked.values()], (rating) => rating.rank);
    if ([...rankCounts.values()].some((count) => count > 1)) tieRaces += 1;
    if ((rankCounts.get(1) ?? 0) !== 1 || (rankCounts.get(2) ?? 0) !== 1) top2IneligibleRaces += 1;
    for (const row of race.rows) {
      const rankedRating = ranked.get(row.features.targetRunnerId);
      if (!rankedRating) continue;
      selections.push({
        raceId: race.raceId,
        runnerId: row.features.targetRunnerId,
        horseName: row.features.horseName,
        raceDate: row.features.raceDate,
        raceDateTime: row.features.raceDateTime,
        month: row.features.raceDate.slice(0, 7),
        fieldSize: row.features.actualRunnerCount ?? row.features.declaredRunnerCount,
        sp: decimalSp(row),
        won: row.outcome.won === true,
        rating: rankedRating.rating,
        rank: rankedRating.rank,
      });
    }
  }
  const rank1 = selections.filter((row) => row.rank === 1);
  const rank2 = selections.filter((row) => row.rank === 2);
  const top2RaceIds = new Set(
    [...groupBy(selections.filter((row) => row.rank <= 2), (row) => row.raceId).entries()]
      .filter(([, rows]) => rows.filter((row) => row.rank === 1).length === 1 && rows.filter((row) => row.rank === 2).length === 1)
      .map(([raceId]) => raceId),
  );
  return {
    variant,
    selections,
    rank1,
    rank2,
    top2: selections.filter((row) => row.rank <= 2 && top2RaceIds.has(row.raceId)),
    eligibleRaces,
    tieRaces,
    top2IneligibleRaces,
  };
}

function ratingFor(row: HistoricalTargetRunnerMetricsRow, medianWeight: number | null, weightMultiplier: number): TurfPerformanceRating | null {
  return calculateTurfPerformanceRating({
    latestPerformanceRating: row.features.latestPerformanceRating,
    previousPerformanceRating: row.features.previousPerformanceRating,
    averagePerformanceLast3: row.features.averagePerformanceLast3,
    latestSpeedRating: row.features.latestTurfSpeedRating,
    previousSpeedRating: row.features.previousTurfSpeedRating,
    averageSpeedLast3: row.features.averageTurfSpeedLast3,
    raceClass: row.features.raceClass,
    weightCarriedLbs: row.features.weightCarriedLbs,
    raceMedianWeightCarriedLbs: medianWeight,
    weightCoefficientMultiplier: weightMultiplier,
  });
}

function buildReport(contexts: Context[], results: Map<Year, Map<VariantKey, VariantResult>>): string[] {
  const lines: string[] = [];
  lines.push("# TPR Rank 1 Versus Top Two Betting Diagnostic", "");
  lines.push("Diagnostic only. Flat Turf, actual uncapped final SP, and £1 level stakes per selected runner. Production TPR, Today, Research, caches, saved rules, importer behavior, and schemas were not changed.", "");
  lines.push(`W100 uses production formula \`${TURF_PERFORMANCE_RATING_VERSION}\`; W50 changes only the relative-weight coefficient to 50%. A/E is actual winners divided by the sum of final-SP implied probabilities.`, "");
  writeCoverage(lines, contexts, results);
  writeCore(lines, contexts, results);
  writeIncremental(lines, contexts, results);
  writeCapture(lines, contexts, results);
  writeVariantComparison(lines, contexts, results);
  writeMonthly(lines, contexts, results);
  writeFieldSize(lines, contexts, results);
  writeSpBands(lines, contexts, results);
  writeOutlierStress(lines, contexts, results);
  writeLosingRuns(lines, contexts, results);
  writeConclusion(lines, results);
  return lines;
}

function writeCoverage(lines: string[], contexts: Context[], results: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Coverage", "");
  table(lines, contexts.flatMap((context) => VARIANTS.map((variant) => {
    const result = resultFor(results, context.year, variant.key);
    return {
      year: context.year,
      variant: variant.key,
      "cache family": context.cacheFamily,
      "cache window": context.cacheWindow,
      "actual coverage": context.actualCoverage,
      "settled Turf runners": context.rows.length,
      "TPR-eligible races": result.eligibleRaces,
      "tie races": result.tieRaces,
      "top2-ineligible races": result.top2IneligibleRaces,
    };
  })));
  lines.push("Production competition ranking is retained: exact equal ratings share a rank and the following rank is skipped. Standalone rank populations retain their natural coverage. The combined population includes only races with exactly one rank-1 and one rank-2 runner, guaranteeing exactly two £1 bets per included race; top2-ineligible races lack that pair because of insufficient rated runners or ties.", "");
}

function writeCore(lines: string[], contexts: Context[], results: Map<Year, Map<VariantKey, VariantResult>>) {
  for (const variant of VARIANTS) {
    lines.push(`## ${variant.key} Comparison`, "");
    table(lines, contexts.flatMap((context) => POPULATIONS.map((population) => ({
      year: context.year,
      population: `${variant.key} ${population.label}`,
      ...metricColumns(metrics(populationRows(resultFor(results, context.year, variant.key), population.key))),
    }))));
  }
}

function writeIncremental(lines: string[], contexts: Context[], results: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Incremental Rank-2 Value", "");
  table(lines, contexts.flatMap((context) => VARIANTS.map((variant) => {
    const result = resultFor(results, context.year, variant.key);
    const rank1 = metrics(result.rank1);
    const top2 = metrics(result.top2);
    const top2RaceIds = new Set(result.top2.map((row) => row.raceId));
    const comparableRank1 = metrics(result.rank1.filter((row) => top2RaceIds.has(row.raceId)));
    const comparableRank2 = metrics(result.rank2.filter((row) => top2RaceIds.has(row.raceId)));
    return {
      year: context.year,
      variant: variant.key,
      "additional captured winners": top2.capturedRaces - comparableRank1.capturedRaces,
      "additional bets/stakes": comparableRank2.stakes,
      "incremental return": money(comparableRank2.returns),
      "incremental P/L": money(comparableRank2.profitLoss),
      "incremental ROI": pct(comparableRank2.roi),
      "rank1 ROI": pct(rank1.roi),
      "rank1 ROI, same races": pct(comparableRank1.roi),
      "top2 ROI": pct(top2.roi),
      "ROI change pp": pp(diff(top2.roi, rank1.roi)),
    };
  })));
}

function writeCapture(lines: string[], contexts: Context[], results: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Race-Level Winner Capture", "");
  table(lines, contexts.flatMap((context) => VARIANTS.map((variant) => {
    const result = resultFor(results, context.year, variant.key);
    const eligibleRaceIds = new Set(result.selections.map((row) => row.raceId));
    const rank1Wins = capturedRaceIds(result.rank1);
    const rank2Wins = capturedRaceIds(result.rank2);
    const either = new Set([...rank1Wins, ...rank2Wins]);
    return {
      year: context.year,
      variant: variant.key,
      "eligible races": eligibleRaceIds.size,
      "rank1 won": rank1Wins.size,
      "rank2 won": rank2Wins.size,
      "either won": either.size,
      neither: eligibleRaceIds.size - either.size,
      "either capture": pct(percentage(either.size, eligibleRaceIds.size)),
    };
  })));
}

function writeVariantComparison(lines: string[], contexts: Context[], results: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## W50 Versus W100", "");
  table(lines, contexts.flatMap((context) => POPULATIONS.map((population) => {
    const w50 = metrics(populationRows(resultFor(results, context.year, "W50"), population.key));
    const w100 = metrics(populationRows(resultFor(results, context.year, "W100"), population.key));
    return {
      year: context.year,
      population: population.label,
      "strike leader": leader(w50.strike, w100.strike),
      "W50 strike": pct(w50.strike),
      "W100 strike": pct(w100.strike),
      "capture leader": leader(w50.capture, w100.capture),
      "W50 capture": pct(w50.capture),
      "W100 capture": pct(w100.capture),
      "ROI leader": leader(w50.roi, w100.roi),
      "W50 ROI": pct(w50.roi),
      "W100 ROI": pct(w100.roi),
      "A/E leader": leader(w50.ae, w100.ae),
      "W50 A/E": number(w50.ae, 3),
      "W100 A/E": number(w100.ae, 3),
    };
  })));
}

function writeMonthly(lines: string[], contexts: Context[], results: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Monthly Stability: Ranks 1 + 2", "");
  for (const context of contexts) {
    const months = [...new Set(VARIANTS.flatMap((variant) => resultFor(results, context.year, variant.key).top2.map((row) => row.month)))].sort();
    table(lines, months.flatMap((month) => VARIANTS.map((variant) => {
      const values = metrics(resultFor(results, context.year, variant.key).top2.filter((row) => row.month === month));
      return { year: context.year, month, variant: variant.key, bets: values.bets, winners: values.winners, ROI: pct(values.roi), "A/E": number(values.ae, 3) };
    })));
  }
}

function writeFieldSize(lines: string[], contexts: Context[], results: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Field-Size Stability: Ranks 1 + 2", "");
  table(lines, contexts.flatMap((context) => VARIANTS.flatMap((variant) => FIELD_BANDS.map((band) => {
    const values = metrics(resultFor(results, context.year, variant.key).top2.filter((row) => fieldBand(row.fieldSize) === band));
    return { year: context.year, variant: variant.key, band, bets: values.bets, strike: pct(values.strike), ROI: pct(values.roi), "A/E": number(values.ae, 3) };
  }))));
}

function writeSpBands(lines: string[], contexts: Context[], results: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## SP-Band Stability", "");
  lines.push("Final SP is used only for evaluation and band assignment.", "");
  const rows: Array<Record<string, unknown>> = [];
  const populations = [
    { key: "rank2" as const, label: "rank 2" },
    { key: "top2" as const, label: "ranks 1 + 2" },
  ];
  for (const context of contexts) {
    for (const variant of VARIANTS) {
      for (const population of populations) {
        for (const band of SP_BANDS) {
          const selections = populationRows(resultFor(results, context.year, variant.key), population.key)
            .filter((row) => spBand(row.sp) === band);
          const values = metrics(selections);
          rows.push({
            year: context.year,
            variant: variant.key,
            population: population.label,
            band,
            bets: values.bets,
            winners: values.winners,
            ROI: pct(values.roi),
            "A/E": number(values.ae, 3),
          });
        }
      }
    }
  }
  table(lines, rows);
}

function writeOutlierStress(lines: string[], contexts: Context[], results: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Outlier Stress", "");
  lines.push("Shown when rank 2 or top two has positive ROI, or top-two ROI beats rank-one ROI by at least 5 percentage points. The biggest-priced winner is removed together with its £1 stake.", "");
  const rows: Array<Record<string, unknown>> = [];
  for (const context of contexts) {
    for (const variant of VARIANTS) {
      const result = resultFor(results, context.year, variant.key);
      const rank1 = metrics(result.rank1);
      for (const population of [{ key: "rank2" as const, label: "rank 2" }, { key: "top2" as const, label: "ranks 1 + 2" }]) {
        const source = populationRows(result, population.key);
        const baseline = metrics(source);
        if (!((baseline.roi ?? -Infinity) > 0 || (baseline.roi ?? -Infinity) - (rank1.roi ?? Infinity) >= MATERIAL_ROI_GAP)) continue;
        const biggest = source.filter((row) => row.won && row.sp !== null).sort((left, right) => (right.sp ?? 0) - (left.sp ?? 0))[0];
        if (!biggest) continue;
        const stressed = metrics(source.filter((row) => row.runnerId !== biggest.runnerId));
        const winnerNet = (biggest.sp ?? 0) - 1;
        rows.push({
          year: context.year,
          variant: variant.key,
          population: population.label,
          "baseline ROI": pct(baseline.roi),
          "largest winner": `${biggest.horseName} @ ${number(biggest.sp, 2)}`,
          "winner net contribution": money(winnerNet),
          "% total P/L": baseline.profitLoss === 0 ? "-" : pct(winnerNet / baseline.profitLoss),
          "stressed ROI": pct(stressed.roi),
          "stressed A/E": number(stressed.ae, 3),
        });
      }
    }
  }
  if (rows.length === 0) lines.push("No population met the pre-specified stress trigger.", "");
  else table(lines, rows);
}

function writeLosingRuns(lines: string[], contexts: Context[], results: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Losing-Run Context", "");
  lines.push("Rank-specific losing runs count consecutive chronologically ordered losing bets. Top-two no-capture runs count consecutive chronologically ordered races in which neither selected runner won.", "");
  table(lines, contexts.flatMap((context) => VARIANTS.map((variant) => {
    const result = resultFor(results, context.year, variant.key);
    return {
      year: context.year,
      variant: variant.key,
      "max rank1 losing bets": maxLosingRun(result.rank1),
      "max rank2 losing bets": maxLosingRun(result.rank2),
      "max top2 no-capture races": maxNoCaptureRaceRun(result.top2),
    };
  })));
}

function writeConclusion(lines: string[], results: Map<Year, Map<VariantKey, VariantResult>>) {
  lines.push("## Conclusion", "");
  for (const year of YEARS) {
    for (const variant of VARIANTS) {
      const result = resultFor(results, year, variant.key);
      const rank1 = metrics(result.rank1);
      const rank2 = metrics(result.rank2);
      const top2 = metrics(result.top2);
      const top2RaceIds = new Set(result.top2.map((row) => row.raceId));
      const comparableRank1 = metrics(result.rank1.filter((row) => top2RaceIds.has(row.raceId)));
      const comparableRank2 = metrics(result.rank2.filter((row) => top2RaceIds.has(row.raceId)));
      lines.push(`- ${year} ${variant.key}: rank 1 ROI ${pct(rank1.roi)}, rank 2 ROI ${pct(rank2.roi)}, top-two ROI ${pct(top2.roi)}; adding rank 2 gained ${top2.capturedRaces - comparableRank1.capturedRaces} captured winners for ${money(comparableRank2.stakes)} extra stake and ${money(comparableRank2.profitLoss)} incremental P/L.`);
    }
  }
  lines.push("");
  const holdout = YEARS.map((year) => VARIANTS.map((variant) => {
    const result = resultFor(results, year, variant.key);
    const rank1 = metrics(result.rank1);
    const rank2 = metrics(result.rank2);
    const top2 = metrics(result.top2);
    return { year, variant: variant.key, rank1, rank2, top2 };
  })).flat();
  const allTop2BetterRoi = holdout.every((row) => (row.top2.roi ?? -Infinity) > (row.rank1.roi ?? Infinity));
  const allTop2BetterAe = holdout.every((row) => (row.top2.ae ?? -Infinity) > (row.rank1.ae ?? Infinity));
  const bothYearsRank2Positive = VARIANTS.some((variant) => YEARS.every((year) => (metrics(resultFor(results, year, variant.key).rank2).roi ?? -Infinity) > 0));
  const w50Top2Wins = YEARS.filter((year) => (metrics(resultFor(results, year, "W50").top2).roi ?? -Infinity) > (metrics(resultFor(results, year, "W100").top2).roi ?? Infinity)).length;
  lines.push(`1. Adding rank 2 increases capture in every cell by the counts above; the monetary test is whether its standalone incremental ROI and P/L compensate for the added stake.`);
  lines.push(`2. Top-two ROI ${allTop2BetterRoi ? "improves" : "does not improve consistently"} versus rank 1 across both years and weightings.`);
  lines.push(`3. Top-two A/E ${allTop2BetterAe ? "improves" : "does not improve consistently"} versus rank 1 across both years and weightings.`);
  lines.push(`4. A rank-2 population is profitable in both years for ${bothYearsRank2Positive ? "at least one weighting" : "neither weighting"}.`);
  lines.push(`5. W50 has the better top-two ROI in ${w50Top2Wins} of 2 years; the full comparison table shows the strike, capture, ROI, and A/E trade-off.`);
  lines.push(`6. Outlier dependence is shown above wherever the trigger fired; no post-hoc filters were created.`);
  lines.push(`7. ${allTop2BetterRoi && bothYearsRank2Positive ? "The result is strong enough to consider a locked live top-two shadow, while retaining rank 1 as the production benchmark." : "The evidence does not justify a live top-two shadow strategy; rank 1 remains the cleaner benchmark."}`);
}

function metrics(source: Selection[]): Metrics {
  const rows = source.filter((row): row is Selection & { sp: number } => row.sp !== null);
  const winners = rows.filter((row) => row.won);
  const races = new Set(rows.map((row) => row.raceId)).size;
  const capturedRaces = capturedRaceIds(rows).size;
  const returns = winners.reduce((sum, row) => sum + row.sp, 0);
  const stakes = rows.length;
  const profitLoss = returns - stakes;
  const expected = rows.reduce((sum, row) => sum + (1 / row.sp), 0);
  return {
    races,
    bets: rows.length,
    winners: winners.length,
    strike: percentage(winners.length, rows.length),
    capturedRaces,
    capture: percentage(capturedRaces, races),
    stakes,
    returns,
    profitLoss,
    roi: stakes === 0 ? null : profitLoss / stakes,
    ae: expected === 0 ? null : winners.length / expected,
    averageSp: average(rows.map((row) => row.sp)),
    medianSp: median(rows.map((row) => row.sp)),
    averageWinnerSp: average(winners.map((row) => row.sp)),
    medianWinnerSp: median(winners.map((row) => row.sp)),
  };
}

function metricColumns(value: Metrics) {
  return {
    races: value.races,
    bets: value.bets,
    winners: value.winners,
    "strike/bet": pct(value.strike),
    "winner-captured races": value.capturedRaces,
    "race capture": pct(value.capture),
    stakes: money(value.stakes),
    return: money(value.returns),
    "P/L": money(value.profitLoss),
    ROI: pct(value.roi),
    "A/E": number(value.ae, 3),
    "avg SP": number(value.averageSp, 2),
    "median SP": number(value.medianSp, 2),
    "avg winner SP": number(value.averageWinnerSp, 2),
    "median winner SP": number(value.medianWinnerSp, 2),
  };
}

function populationRows(result: VariantResult, key: PopulationKey): Selection[] {
  return result[key];
}

function capturedRaceIds(rows: Selection[]): Set<string> {
  return new Set(rows.filter((row) => row.won).map((row) => row.raceId));
}

function maxLosingRun(source: Selection[]): number {
  const rows = source.filter((row) => row.sp !== null).sort(compareSelections);
  let current = 0;
  let maximum = 0;
  for (const row of rows) {
    current = row.won ? 0 : current + 1;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

function maxNoCaptureRaceRun(source: Selection[]): number {
  const races = [...groupBy(source.filter((row) => row.sp !== null), (row) => row.raceId).values()]
    .sort((left, right) => compareSelections(left[0]!, right[0]!));
  let current = 0;
  let maximum = 0;
  for (const rows of races) {
    current = rows.some((row) => row.won) ? 0 : current + 1;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

function decimalSp(row: HistoricalTargetRunnerMetricsRow): number | null {
  const parsed = Number(row.outcome.startingPriceDecimal);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function fieldBand(size: number | null): string {
  if (size === null) return "missing";
  if (size <= 5) return "2-5";
  if (size <= 8) return "6-8";
  if (size <= 12) return "9-12";
  return "13+";
}

function spBand(sp: number | null): string {
  if (sp === null) return "missing";
  if (sp < 2) return "<2.0";
  if (sp < 3) return "2.0-2.99";
  if (sp < 5) return "3.0-4.99";
  if (sp < 9) return "5.0-8.99";
  if (sp < 21) return "9.0-20.99";
  return "21.0+";
}

function isSettledRunner(row: HistoricalTargetRunnerMetricsRow): boolean {
  return row.outcome.finishingPosition !== null && row.outcome.resultStatus !== "non_runner";
}

function compareRows(left: HistoricalTargetRunnerMetricsRow, right: HistoricalTargetRunnerMetricsRow): number {
  return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
    left.features.targetRaceId.localeCompare(right.features.targetRaceId) ||
    left.features.targetRunnerId.localeCompare(right.features.targetRunnerId);
}

function compareSelections(left: Selection, right: Selection): number {
  return left.raceDateTime.getTime() - right.raceDateTime.getTime() || left.raceId.localeCompare(right.raceId) || left.runnerId.localeCompare(right.runnerId);
}

function resultFor(results: Map<Year, Map<VariantKey, VariantResult>>, year: Year, variant: VariantKey): VariantResult {
  const value = results.get(year)?.get(variant);
  if (!value) throw new Error(`Missing ${year} ${variant} result`);
  return value;
}

function groupBy<T, K>(values: T[], keyFor: (value: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const value of values) groups.set(keyFor(value), [...(groups.get(keyFor(value)) ?? []), value]);
  return groups;
}

function countBy<T, K>(values: T[], keyFor: (value: T) => K): Map<K, number> {
  const counts = new Map<K, number>();
  for (const value of values) counts.set(keyFor(value), (counts.get(keyFor(value)) ?? 0) + 1);
  return counts;
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function diff(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left - right;
}

function leader(w50: number | null, w100: number | null): string {
  if (w50 === null || w100 === null) return "-";
  if (w50 > w100) return "W50";
  if (w100 > w50) return "W100";
  return "tie";
}

function pct(value: number | null): string {
  return value === null ? "-" : `${(value * 100).toFixed(2)}%`;
}

function pp(value: number | null): string {
  return value === null ? "-" : `${(value * 100).toFixed(2)} pp`;
}

function number(value: number | null, digits = 2): string {
  return value === null ? "-" : value.toFixed(digits);
}

function money(value: number): string {
  return `${value < 0 ? "-" : ""}£${Math.abs(value).toFixed(2)}`;
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function table(lines: string[], rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    lines.push("No rows.", "");
    return;
  }
  const headers = Object.keys(rows[0]!);
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) lines.push(`| ${headers.map((header) => String(row[header] ?? "-")).join(" | ")} |`);
  lines.push("");
}

await main();

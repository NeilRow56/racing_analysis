import { writeFile } from "node:fs/promises";
import { loadLatestBacktestFeatureCacheForYear, type BacktestCacheFamily } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import {
  calculateTurfPerformanceRating,
  rankTurfPerformanceRatings,
  TURF_PERFORMANCE_RATING_VERSION,
  TURF_PERFORMANCE_RATING_W50_WEIGHT_MULTIPLIER,
} from "@/lib/racing/turf-performance-rating";

type Year = "2025" | "2026";
type Variant = "W0" | "W50" | "W100";

type Context = {
  year: Year;
  family: BacktestCacheFamily;
  window: string;
  coverage: string;
  rows: HistoricalTargetRunnerMetricsRow[];
};

type Selection = {
  year: Year;
  raceId: string;
  runnerId: string;
  sp: number;
  won: boolean;
  fieldSize: number | null;
  lead: number | null;
  weightContribution: number;
  noWeightMargin: number;
  noWeightRank1: boolean;
  w50Rank1: boolean;
};

type Metrics = {
  selections: number;
  winners: number;
  strike: number | null;
  returns: number;
  roi: number | null;
  ae: number | null;
  averageSp: number | null;
  medianSp: number | null;
  averageWinnerSp: number | null;
};

const OUTPUT_PATH = "/tmp/tpr-lead-price-interaction.md";
const YEARS: Year[] = ["2025", "2026"];
const LEAD_BANDS = ["<2", "2-3.99", "4-7.99", "8-11.99", "12+"];
const SP_BANDS = ["<2.0", "2.0-2.99", "3.0-4.99", "5.0-8.99", "9.0-20.99", "21.0+"];
const FIELD_BANDS = ["2-5", "6-8", "9+"];

async function main() {
  const contexts = await Promise.all(YEARS.map(loadContext));
  const byYear = new Map<Year, Selection[]>();
  for (const context of contexts) byYear.set(context.year, score(context));
  const report = buildReport(contexts, byYear);
  await writeFile(OUTPUT_PATH, `${report.join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
  for (const year of YEARS) {
    const rows = required(byYear, year);
    const all = metrics(rows);
    const large = metrics(rows.filter((row) => leadAtLeast(row, 8)));
    console.log(`${year}: rank1 n=${all.selections}, strike=${pct(all.strike)}, ROI=${pct(all.roi)}, A/E=${number(all.ae, 3)}; lead>=8 n=${large.selections}, ROI=${pct(large.roi)}`);
  }
}

async function loadContext(year: Year): Promise<Context> {
  const candidates = (await Promise.all([
    loadLatestBacktestFeatureCacheForYear({ year, family: "turf_flat" }),
    loadLatestBacktestFeatureCacheForYear({ year, family: "all" }),
  ])).filter((entry): entry is NonNullable<typeof entry> => entry !== null)
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
    });
  const cache = candidates[0];
  if (!cache) throw new Error(`Missing compatible v4 Turf cache for ${year}`);
  return {
    year,
    family: cache.manifest.family,
    window: `${cache.manifest.from} to ${cache.manifest.to}`,
    coverage: `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}`,
    rows: cache.turfRows,
  };
}

function score(context: Context): Selection[] {
  const selections: Selection[] = [];
  for (const [raceId, rows] of groupBy(context.rows, (row) => row.features.targetRaceId)) {
    const medianWeight = median(rows.map((row) => row.features.weightCarriedLbs).filter(isNumber));
    const variants = new Map<Variant, ReturnType<typeof rankTurfPerformanceRatings>>();
    for (const [variant, multiplier] of [["W0", 0], ["W50", TURF_PERFORMANCE_RATING_W50_WEIGHT_MULTIPLIER], ["W100", 1]] as const) {
      variants.set(variant, rankTurfPerformanceRatings(rows.map((row) => ({
        id: row.features.targetRunnerId,
        rating: calculateTurfPerformanceRating({
          latestPerformanceRating: row.features.latestPerformanceRating,
          previousPerformanceRating: row.features.previousPerformanceRating,
          averagePerformanceLast3: row.features.averagePerformanceLast3,
          latestSpeedRating: row.features.latestTurfSpeedRating,
          previousSpeedRating: row.features.previousTurfSpeedRating,
          averageSpeedLast3: row.features.averageTurfSpeedLast3,
          raceClass: row.features.raceClass,
          weightCarriedLbs: row.features.weightCarriedLbs,
          raceMedianWeightCarriedLbs: medianWeight,
          weightCoefficientMultiplier: multiplier,
        }),
      }))));
    }
    const w100 = variants.get("W100")!;
    const w0 = variants.get("W0")!;
    const w50 = variants.get("W50")!;
    for (const row of rows) {
      const production = w100.get(row.features.targetRunnerId);
      const noWeight = w0.get(row.features.targetRunnerId);
      const halfWeight = w50.get(row.features.targetRunnerId);
      const sp = decimalSp(row);
      if (production?.rank !== 1 || sp === null || !noWeight || !halfWeight) continue;
      const bestOtherNoWeight = Math.max(...rows
        .filter((other) => other.features.targetRunnerId !== row.features.targetRunnerId)
        .map((other) => w0.get(other.features.targetRunnerId)?.rating ?? -Infinity));
      selections.push({
        year: context.year,
        raceId,
        runnerId: row.features.targetRunnerId,
        sp,
        won: row.outcome.won === true,
        fieldSize: row.features.actualRunnerCount ?? row.features.declaredRunnerCount,
        lead: production.gap,
        weightContribution: production.rating - noWeight.rating,
        noWeightMargin: noWeight.rating - bestOtherNoWeight,
        noWeightRank1: noWeight.rank === 1,
        w50Rank1: halfWeight.rank === 1,
      });
    }
  }
  return selections;
}

function buildReport(contexts: Context[], byYear: Map<Year, Selection[]>): string[] {
  const lines: string[] = [
    "# TPR Rank-1 Lead, Price, and Component Diagnostic",
    "",
    `Diagnostic only. Flat Turf, production W100 \`${TURF_PERFORMANCE_RATING_VERSION}\`, and £1 level stakes settled at uncapped final SP. W50 and no-weight calculations are explanatory shadows only.`,
    "",
    "## Coverage and baseline",
    "",
  ];
  table(lines, contexts.map((context) => ({
    year: context.year,
    "cache family": context.family,
    "cache window": context.window,
    "actual coverage": context.coverage,
    "settled Turf rows": context.rows.length,
    ...metricRow(metrics(required(byYear, context.year)), true),
  })));

  lines.push("## Fixed lead bands", "");
  table(lines, YEARS.flatMap((year) => LEAD_BANDS.map((band) => ({
    year,
    "lead band": band,
    ...metricRow(metrics(required(byYear, year).filter((row) => leadBand(row.lead) === band)), true),
  }))));
  for (const year of YEARS) {
    const strikes = LEAD_BANDS.map((band) => metrics(required(byYear, year).filter((row) => leadBand(row.lead) === band)).strike);
    lines.push(`${year} strike is ${monotonic(strikes) ? "monotonically non-decreasing" : "not monotonic"} across the fixed lead bands.`);
  }
  lines.push("");

  lines.push("## Price profile", "");
  table(lines, YEARS.flatMap((year) => SP_BANDS.map((band) => ({
    year,
    "SP band": band,
    ...metricRow(metrics(required(byYear, year).filter((row) => spBand(row.sp) === band))),
  }))));

  lines.push("## Lead by price", "");
  table(lines, YEARS.flatMap((year) => SP_BANDS.flatMap((band) => [
    { label: "all rank 1", test: () => true },
    { label: "lead >=8", test: (row: Selection) => leadAtLeast(row, 8) },
    { label: "lead >=12", test: (row: Selection) => leadAtLeast(row, 12) },
  ].map((population) => ({
    year,
    "SP band": band,
    population: population.label,
    ...metricRow(metrics(required(byYear, year).filter((row) => spBand(row.sp) === band && population.test(row)))),
  })))));

  lines.push("## Focus: SP 5.0-8.99", "");
  table(lines, YEARS.flatMap((year) => [
    { label: "all rank 1", threshold: 0 },
    { label: "lead >=4", threshold: 4 },
    { label: "lead >=8", threshold: 8 },
    { label: "lead >=12", threshold: 12 },
  ].map((population) => ({
    year,
    population: population.label,
    ...metricRow(metrics(required(byYear, year).filter((row) => row.sp >= 5 && row.sp < 9 && (population.threshold === 0 || leadAtLeast(row, population.threshold))))),
  }))));

  lines.push("## Field-size interaction", "");
  table(lines, YEARS.flatMap((year) => FIELD_BANDS.flatMap((band) => [
    { label: "all rank 1", test: () => true },
    { label: "lead >=8", test: (row: Selection) => leadAtLeast(row, 8) },
  ].map((population) => ({
    year,
    "field band": band,
    population: population.label,
    ...metricRow(metrics(required(byYear, year).filter((row) => fieldBand(row.fieldSize) === band && population.test(row)))),
  })))));

  lines.push("## Weight-adjustment contribution", "");
  table(lines, YEARS.flatMap((year) => [
    { label: "all rank 1", threshold: 0 },
    { label: "lead >=8", threshold: 8 },
    { label: "lead >=12", threshold: 12 },
  ].map((population) => {
    const rows = required(byYear, year).filter((row) => population.threshold === 0 || leadAtLeast(row, population.threshold));
    const contributions = rows.map((row) => row.weightContribution);
    return {
      year,
      population: population.label,
      selections: rows.length,
      "mean weight pts": number(average(contributions), 2),
      "median weight pts": number(median(contributions), 2),
      "abs >=3": pct(ratio(rows.filter((row) => Math.abs(row.weightContribution) >= 3).length, rows.length)),
      "abs >=4": pct(ratio(rows.filter((row) => Math.abs(row.weightContribution) >= 4).length, rows.length)),
    };
  })));

  lines.push("## Lead with weight removed", "");
  table(lines, YEARS.map((year) => {
    const rows = required(byYear, year).filter((row) => leadAtLeast(row, 8));
    return {
      year,
      selections: rows.length,
      "mean production lead": number(average(rows.map((row) => row.lead).filter(isNumber)), 2),
      "median production lead": number(median(rows.map((row) => row.lead).filter(isNumber)), 2),
      "mean no-weight margin": number(average(rows.map((row) => row.noWeightMargin)), 2),
      "median no-weight margin": number(median(rows.map((row) => row.noWeightMargin)), 2),
      "still no-weight lead >=8": pct(ratio(rows.filter((row) => row.noWeightMargin >= 8).length, rows.length)),
      "rank 1 changes": pct(ratio(rows.filter((row) => !row.noWeightRank1).length, rows.length)),
    };
  }));
  lines.push("No-weight margin is the selected W100 horse's no-weight score minus the best other runner; it is negative when another horse becomes rank 1.", "");

  lines.push("## W50 sensitivity of W100 lead >=8", "");
  table(lines, YEARS.flatMap((year) => [
    { label: "all", test: () => true },
    { label: "SP 5.0-8.99", test: (row: Selection) => row.sp >= 5 && row.sp < 9 },
    { label: "field 2-5", test: (row: Selection) => fieldBand(row.fieldSize) === "2-5" },
  ].map((subset) => {
    const rows = required(byYear, year).filter((row) => leadAtLeast(row, 8) && subset.test(row));
    return {
      year,
      subset: subset.label,
      selections: rows.length,
      "still W50 rank 1": pct(ratio(rows.filter((row) => row.w50Rank1).length, rows.length)),
      "W50 selects another": pct(ratio(rows.filter((row) => !row.w50Rank1).length, rows.length)),
    };
  })));

  writeOutlierStress(lines, byYear);
  writeReplication(lines, byYear);
  writeAnswers(lines, byYear);
  return lines;
}

function writeOutlierStress(lines: string[], byYear: Map<Year, Selection[]>) {
  lines.push("## Positive-ROI subgroup outlier stress", "");
  const candidates: Array<{ year: Year; group: string; rows: Selection[] }> = [];
  for (const year of YEARS) {
    const source = required(byYear, year);
    for (const band of SP_BANDS) for (const threshold of [8, 12]) {
      candidates.push({ year, group: `SP ${band}, lead >=${threshold}`, rows: source.filter((row) => spBand(row.sp) === band && leadAtLeast(row, threshold)) });
    }
    for (const threshold of [0, 4, 8, 12]) {
      candidates.push({ year, group: `SP 5.0-8.99, ${threshold === 0 ? "all rank 1" : `lead >=${threshold}`}`, rows: source.filter((row) => row.sp >= 5 && row.sp < 9 && (threshold === 0 || leadAtLeast(row, threshold))) });
    }
    for (const band of FIELD_BANDS) candidates.push({ year, group: `field ${band}, lead >=8`, rows: source.filter((row) => fieldBand(row.fieldSize) === band && leadAtLeast(row, 8)) });
  }
  const uniqueCandidates = [...new Map(candidates.map((candidate) => [`${candidate.year}:${candidate.group}`, candidate])).values()];
  table(lines, uniqueCandidates.filter((candidate) => (metrics(candidate.rows).roi ?? -Infinity) > 0).map((candidate) => {
    const winners = candidate.rows.filter((row) => row.won).sort((left, right) => right.sp - left.sp);
    const remove1 = new Set(winners.slice(0, 1).map((row) => row.runnerId));
    const remove2 = new Set(winners.slice(0, 2).map((row) => row.runnerId));
    const baseline = metrics(candidate.rows);
    const one = metrics(candidate.rows.filter((row) => !remove1.has(row.runnerId)));
    const two = metrics(candidate.rows.filter((row) => !remove2.has(row.runnerId)));
    return {
      year: candidate.year,
      subgroup: candidate.group,
      n: baseline.selections,
      flag: baseline.selections < 50 ? "small n" : "",
      ROI: pct(baseline.roi),
      "A/E": number(baseline.ae, 3),
      "ROI minus top winner": pct(one.roi),
      "A/E minus top winner": number(one.ae, 3),
      "ROI minus top 2": pct(two.roi),
      "A/E minus top 2": number(two.ae, 3),
    };
  }));
}

function writeReplication(lines: string[], byYear: Map<Year, Selection[]>) {
  lines.push("## Directional replication", "");
  const rows: Array<Record<string, unknown>> = [];
  for (const band of SP_BANDS) {
    const annual = YEARS.map((year) => {
      const source = required(byYear, year).filter((row) => spBand(row.sp) === band);
      return { year, all: metrics(source), large: metrics(source.filter((row) => leadAtLeast(row, 8))) };
    });
    rows.push({
      comparison: `SP ${band}: lead >=8 vs all`,
      "2025 strike delta": pp(difference(annual[0]!.large.strike, annual[0]!.all.strike)),
      "2026 strike delta": pp(difference(annual[1]!.large.strike, annual[1]!.all.strike)),
      "2025 A/E delta": number(difference(annual[0]!.large.ae, annual[0]!.all.ae), 3),
      "2026 A/E delta": number(difference(annual[1]!.large.ae, annual[1]!.all.ae), 3),
      "same A/E direction": sameDirection(difference(annual[0]!.large.ae, annual[0]!.all.ae), difference(annual[1]!.large.ae, annual[1]!.all.ae)),
    });
  }
  table(lines, rows);
}

function writeAnswers(lines: string[], byYear: Map<Year, Selection[]>) {
  const all25 = required(byYear, "2025");
  const all26 = required(byYear, "2026");
  const lead25 = all25.filter((row) => leadAtLeast(row, 8));
  const lead26 = all26.filter((row) => leadAtLeast(row, 8));
  const focus25 = lead25.filter((row) => row.sp >= 5 && row.sp < 9);
  const focus26 = lead26.filter((row) => row.sp >= 5 && row.sp < 9);
  const small25 = lead25.filter((row) => fieldBand(row.fieldSize) === "2-5");
  const small26 = lead26.filter((row) => fieldBand(row.fieldSize) === "2-5");
  const weightLarge25 = ratio(lead25.filter((row) => Math.abs(row.weightContribution) >= 3).length, lead25.length);
  const weightAll25 = ratio(all25.filter((row) => Math.abs(row.weightContribution) >= 3).length, all25.length);
  lines.push("## Answers", "");
  lines.push(`1. Lead does ${monotonic(LEAD_BANDS.map((band) => metrics(all25.filter((row) => leadBand(row.lead) === band)).strike)) && monotonic(LEAD_BANDS.map((band) => metrics(all26.filter((row) => leadBand(row.lead) === band)).strike)) ? "reliably increase strike monotonically in both years" : "not produce a monotonic strike progression in both years"}.`);
  lines.push(`2. Lead >=8 aggregate ROI is ${pct(metrics(lead25).roi)} in 2025 and ${pct(metrics(lead26).roi)} in 2026, versus ${pct(metrics(all25).roi)} and ${pct(metrics(all26).roi)} for all rank 1. The price-by-lead table shows whether this is price mix or weaker value within bands.`);
  lines.push(`3. Median SP shifts from ${number(metrics(all25).medianSp)} to ${number(metrics(lead25).medianSp)} in 2025 and ${number(metrics(all26).medianSp)} to ${number(metrics(lead26).medianSp)} in 2026; this quantifies how much shorter-priced the large-lead mix is.`);
  lines.push("4. Equal-price-band A/E effects are summarised in the directional replication table; only same-direction rows should be treated as replicated evidence.");
  lines.push(`5. At SP 5.0-8.99, lead >=8 produces 2025 n=${focus25.length}, ROI ${pct(metrics(focus25).roi)}, A/E ${number(metrics(focus25).ae, 3)}; 2026 n=${focus26.length}, ROI ${pct(metrics(focus26).roi)}, A/E ${number(metrics(focus26).ae, 3)}.`);
  lines.push(`6. Replication is ${sameDirection(metrics(focus25).ae === null ? null : metrics(focus25).ae! - 1, metrics(focus26).ae === null ? null : metrics(focus26).ae! - 1) === "yes" ? "directionally present" : "not directionally present"} in that focal price region.`);
  lines.push(`7. Small-field lead >=8 produces 2025 n=${small25.length}, ROI ${pct(metrics(small25).roi)}, A/E ${number(metrics(small25).ae, 3)}; 2026 n=${small26.length}, ROI ${pct(metrics(small26).roi)}, A/E ${number(metrics(small26).ae, 3)}.`);
  lines.push(`8. Absolute weight contribution >=3 points occurs in ${pct(weightLarge25)} of 2025 lead >=8 selections versus ${pct(weightAll25)} overall; the full table includes both years and the >=4-point test.`);
  lines.push(`9. W100 lead >=8 remains W50 rank 1 for ${pct(ratio(lead25.filter((row) => row.w50Rank1).length, lead25.length))} in 2025 and ${pct(ratio(lead26.filter((row) => row.w50Rank1).length, lead26.length))} in 2026.`);
  const focusReplicates = (metrics(focus25).ae ?? 0) > metrics(all25.filter((row) => row.sp >= 5 && row.sp < 9)).ae! && (metrics(focus26).ae ?? 0) > metrics(all26.filter((row) => row.sp >= 5 && row.sp < 9)).ae!;
  lines.push(`10. ${focusReplicates ? "The pre-specified 5.0-8.99 region improves A/E in both years, so a separate frozen confirmation study is defensible." : "The pre-specified price-aware lead hypothesis does not improve A/E in both years, so it is not yet a robust betting-value filter."}`);
  lines.push(`11. ${focusReplicates ? "Until separately confirmed, TPR lead should still be treated primarily as a confidence indicator." : "TPR lead should remain a confidence indicator rather than a betting-value filter."}`, "");
}

function metrics(rows: Selection[]): Metrics {
  const winners = rows.filter((row) => row.won);
  const returns = winners.reduce((sum, row) => sum + row.sp, 0);
  return {
    selections: rows.length,
    winners: winners.length,
    strike: ratio(winners.length, rows.length),
    returns,
    roi: ratio(returns - rows.length, rows.length),
    ae: ratio(winners.length, rows.reduce((sum, row) => sum + (1 / row.sp), 0)),
    averageSp: average(rows.map((row) => row.sp)),
    medianSp: median(rows.map((row) => row.sp)),
    averageWinnerSp: average(winners.map((row) => row.sp)),
  };
}

function metricRow(value: Metrics, detailed = false): Record<string, unknown> {
  return {
    selections: value.selections,
    winners: value.winners,
    strike: pct(value.strike),
    ROI: pct(value.roi),
    "A/E": number(value.ae, 3),
    ...(detailed ? {
      "average SP": number(value.averageSp),
      "median SP": number(value.medianSp),
      "average winner SP": number(value.averageWinnerSp),
    } : {}),
  };
}

function leadBand(lead: number | null): string {
  if (lead === null) return "missing";
  if (lead < 2) return "<2";
  if (lead < 4) return "2-3.99";
  if (lead < 8) return "4-7.99";
  if (lead < 12) return "8-11.99";
  return "12+";
}

function leadAtLeast(row: Selection, threshold: number): boolean {
  return row.lead !== null && row.lead >= threshold;
}

function spBand(sp: number): string {
  if (sp < 2) return "<2.0";
  if (sp < 3) return "2.0-2.99";
  if (sp < 5) return "3.0-4.99";
  if (sp < 9) return "5.0-8.99";
  if (sp < 21) return "9.0-20.99";
  return "21.0+";
}

function fieldBand(size: number | null): string {
  if (size !== null && size <= 5) return "2-5";
  if (size !== null && size <= 8) return "6-8";
  return "9+";
}

function decimalSp(row: HistoricalTargetRunnerMetricsRow): number | null {
  const value = Number(row.outcome.startingPriceDecimal);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function isSettledRunner(row: HistoricalTargetRunnerMetricsRow): boolean {
  return row.outcome.finishingPosition !== null && row.outcome.resultStatus !== "non_runner";
}

function compareRows(left: HistoricalTargetRunnerMetricsRow, right: HistoricalTargetRunnerMetricsRow): number {
  return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
    left.features.targetRaceId.localeCompare(right.features.targetRaceId) ||
    left.features.targetRunnerId.localeCompare(right.features.targetRunnerId);
}

function required(map: Map<Year, Selection[]>, year: Year): Selection[] {
  const value = map.get(year);
  if (!value) throw new Error(`Missing ${year} selections`);
  return value;
}

function groupBy<T, K>(values: T[], keyFor: (value: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return groups;
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

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function difference(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left - right;
}

function monotonic(values: Array<number | null>): boolean {
  return values.every((value, index) => index === 0 || value === null || values[index - 1] === null || value >= values[index - 1]!);
}

function sameDirection(left: number | null, right: number | null): string {
  if (left === null || right === null) return "insufficient";
  return Math.sign(left) === Math.sign(right) ? "yes" : "no";
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function pct(value: number | null): string {
  return value === null ? "-" : `${(value * 100).toFixed(2)}%`;
}

function pp(value: number | null): string {
  return value === null ? "-" : `${(value * 100).toFixed(2)} pp`;
}

function number(value: number | null, digits = 2): string {
  return value === null || !Number.isFinite(value) ? "-" : value.toFixed(digits);
}

function table(lines: string[], rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    lines.push("No qualifying rows.", "");
    return;
  }
  const headers = Object.keys(rows[0]!);
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) lines.push(`| ${headers.map((header) => String(row[header] ?? "-")).join(" | ")} |`);
  lines.push("");
}

await main();

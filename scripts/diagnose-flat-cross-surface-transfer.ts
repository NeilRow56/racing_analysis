import { writeFile } from "node:fs/promises";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import {
  type HistoricalPreRaceFeatureRow,
  type HistoricalTargetRunnerMetricsRow,
} from "@/lib/racing/historical-target-metrics";

type Year = "2025" | "2026";
type Surface = "turf" | "aw";
type Direction = "turf->turf" | "aw->turf" | "aw->aw" | "turf->aw";

type Evidence = {
  row: HistoricalTargetRunnerMetricsRow;
  targetSurface: Surface;
  sourceSurface: Surface;
  direction: Direction;
  rating: number;
  bestL3: number | null;
  daysSinceRun: number | null;
  usablePriorRuns: number;
  won: boolean;
  placed: boolean;
  finishPosition: number | null;
};

type Summary = {
  runners: number;
  winners: number;
  places: number;
  strike: number | null;
  placeRate: number | null;
  mean: number | null;
  median: number | null;
  winCorrelation: number | null;
  finishCorrelation: number | null;
  rank1Strike: number | null;
  top3WinnerCapture: number | null;
  top3PlaceCapture: number | null;
  rankedRaces: number;
};

const OUTPUT_PATH = "/tmp/flat-cross-surface-transfer.md";
const YEARS: Year[] = ["2025", "2026"];
const DIRECTIONS: Direction[] = ["turf->turf", "aw->turf", "aw->aw", "turf->aw"];
const RECENCY_BANDS = [
  { label: "0-30", min: 0, max: 30 },
  { label: "31-60", min: 31, max: 60 },
  { label: "61-120", min: 61, max: 120 },
  { label: "121+", min: 121, max: Infinity },
];
const DEPTH_BANDS = [
  { label: "1 usable prior Flat run", min: 1, max: 1 },
  { label: "2 usable prior Flat runs", min: 2, max: 2 },
  { label: "3+ usable prior Flat runs", min: 3, max: Infinity },
];

async function main() {
  const contexts = [];
  for (const year of YEARS) {
    console.log(`${year}: loading compatible v4 flat rows`);
    const { rows, cacheNote } = await loadCompatibleFlatRows(year);
    const evidence = buildEvidence(rows);
    console.log(`${year}: rows=${rows.length}, evidence=${evidence.length}, cross=${evidence.filter((row) => row.sourceSurface !== row.targetSurface).length}`);
    contexts.push({ year, rows, evidence, cacheNote });
  }
  const adjustments = deriveAdjustments(contexts.find((context) => context.year === "2025")!.evidence);
  await writeFile(OUTPUT_PATH, `${writeReport(contexts, adjustments).join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
}

async function loadCompatibleFlatRows(year: Year): Promise<{ rows: HistoricalTargetRunnerMetricsRow[]; cacheNote: string }> {
  const all = await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
  if (all) {
    return {
      rows: flatRows(all.rows),
      cacheNote: `v4 all cache ${all.manifest.from}..${all.manifest.to}; both source surfaces available`,
    };
  }

  const [turf, aw] = await Promise.all([
    loadLatestBacktestFeatureCacheForYear({ family: "turf_flat", year }),
    loadLatestBacktestFeatureCacheForYear({ family: "all_weather_flat", year }),
  ]);
  if (!turf || !aw) {
    throw new Error(`Missing compatible v4 flat cache population for ${year}`);
  }

  return {
    rows: dedupeRows([...flatRows(turf.rows), ...flatRows(aw.rows)]).sort(compareRows),
    cacheNote: `v4 family caches only (${turf.manifest.from}..${turf.manifest.to}, ${aw.manifest.from}..${aw.manifest.to}); opposite-surface history is not present, so 2026 cross-surface holdout is unavailable from current caches`,
  };
}

function flatRows(rows: HistoricalTargetRunnerMetricsRow[]): HistoricalTargetRunnerMetricsRow[] {
  return rows.filter((row) =>
    targetSurface(row.features) !== null &&
    row.outcome.resultStatus !== "non_runner" &&
    row.outcome.finishingPosition !== null,
  );
}

function dedupeRows(rows: HistoricalTargetRunnerMetricsRow[]): HistoricalTargetRunnerMetricsRow[] {
  const values = new Map<string, HistoricalTargetRunnerMetricsRow>();
  for (const row of rows) {
    values.set(row.features.targetRunnerId, row);
  }
  return [...values.values()];
}

function buildEvidence(rows: HistoricalTargetRunnerMetricsRow[]): Evidence[] {
  const evidence: Evidence[] = [];
  for (const row of rows) {
    const target = targetSurface(row.features);
    if (!target) continue;
    for (const source of ["turf", "aw"] as const) {
      const rating = latestSpeed(row.features, source);
      if (rating === null) continue;
      evidence.push({
        row,
        targetSurface: target,
        sourceSurface: source,
        direction: `${source}->${target}` as Direction,
        rating,
        bestL3: bestL3(row.features, source),
        daysSinceRun: row.features.daysSinceLastRun,
        usablePriorRuns: usablePriorDepth(row.features),
        won: row.outcome.won === true,
        placed: row.outcome.placed === true,
        finishPosition: row.outcome.finishingPosition,
      });
    }
  }
  return evidence;
}

function writeReport(
  contexts: Array<{ year: Year; rows: HistoricalTargetRunnerMetricsRow[]; evidence: Evidence[]; cacheNote: string }>,
  adjustments: Record<"aw->turf" | "turf->aw", number>,
) {
  const lines: string[] = [];
  lines.push("# Flat Cross-Surface Transfer Diagnostic");
  lines.push("");
  lines.push("Diagnostic only. Production TPR, Today display, Research defaults, cache logic, importer behavior, and schemas were not changed.");
  lines.push("");
  lines.push("Method note: target populations come from compatible v4 caches. Evidence uses the latest available rating within the source surface family (`latestTurfSpeedRating` or `latestAwSpeedRating`). For horses with both Turf and AW history, this identifies source-family latest evidence rather than proving that surface was the absolute most recent run.");
  lines.push("");
  scope(lines, contexts);
  latestRun(lines, contexts);
  sameVsCross(lines, contexts);
  adjustmentSection(lines, contexts, adjustments);
  coverage(lines, contexts);
  lightlyRaced(lines, contexts);
  recency(lines, contexts);
  decisions(lines, contexts, adjustments);
  return lines;
}

function scope(lines: string[], contexts: Array<{ year: Year; rows: HistoricalTargetRunnerMetricsRow[]; evidence: Evidence[]; cacheNote: string }>) {
  lines.push("## Scope");
  lines.push("");
  table(lines, contexts.map((context) => ({
    year: context.year,
    "flat targets": context.rows.length,
    "evidence rows": context.evidence.length,
    "cross-surface evidence": context.evidence.filter((row) => row.sourceSurface !== row.targetSurface).length,
    "cache note": context.cacheNote,
  })));
}

function latestRun(lines: string[], contexts: Array<{ year: Year; evidence: Evidence[] }>) {
  lines.push("## Latest Source-Surface Rating Evidence");
  lines.push("");
  table(lines, contexts.flatMap((context) =>
    DIRECTIONS.map((direction) => ({ year: context.year, direction, ...summaryColumns(summarize(context.evidence.filter((row) => row.direction === direction))) }))
  ));
}

function sameVsCross(lines: string[], contexts: Array<{ year: Year; evidence: Evidence[] }>) {
  lines.push("## Same-Surface Vs Cross-Surface");
  lines.push("");
  table(lines, contexts.flatMap((context) => [
    { year: context.year, target: "Turf", evidence: "prior Turf", ...summaryColumns(summarize(context.evidence.filter((row) => row.direction === "turf->turf"))) },
    { year: context.year, target: "Turf", evidence: "prior AW", ...summaryColumns(summarize(context.evidence.filter((row) => row.direction === "aw->turf"))) },
    { year: context.year, target: "AW", evidence: "prior AW", ...summaryColumns(summarize(context.evidence.filter((row) => row.direction === "aw->aw"))) },
    { year: context.year, target: "AW", evidence: "prior Turf", ...summaryColumns(summarize(context.evidence.filter((row) => row.direction === "turf->aw"))) },
  ]));
}

function adjustmentSection(
  lines: string[],
  contexts: Array<{ year: Year; evidence: Evidence[] }>,
  adjustments: Record<"aw->turf" | "turf->aw", number>,
) {
  lines.push("## Fixed 2025 Transfer Adjustment");
  lines.push("");
  lines.push(`2025 frozen additive offsets from winner-mean controls: AW -> Turf ${signed(adjustments["aw->turf"])} points; Turf -> AW ${signed(adjustments["turf->aw"])} points.`);
  lines.push("");
  table(lines, contexts.flatMap((context) =>
    (["aw->turf", "turf->aw"] as const).flatMap((direction) => {
      const raw = context.evidence.filter((row) => row.direction === direction);
      const adjusted = raw.map((row) => ({ ...row, rating: row.rating + adjustments[direction] }));
      return [
        { year: context.year, direction, mode: "raw", ...summaryColumns(summarize(raw)) },
        { year: context.year, direction, mode: "2025 adjusted", ...summaryColumns(summarize(adjusted)) },
      ];
    })
  ));
}

function coverage(lines: string[], contexts: Array<{ year: Year; rows: HistoricalTargetRunnerMetricsRow[] }>) {
  lines.push("## Coverage Impact");
  lines.push("");
  table(lines, contexts.flatMap((context) =>
    (["turf", "aw"] as const).map((target) => {
      const rows = context.rows.filter((row) => targetSurface(row.features) === target);
      const source = target === "turf" ? "aw" : "turf";
      const noSame = rows.filter((row) => latestSpeed(row.features, target) === null);
      const recoverable = noSame.filter((row) => latestSpeed(row.features, source) !== null);
      return {
        year: context.year,
        "target surface": label(target),
        "target runners": rows.length,
        "no same-surface rating history": noSame.length,
        "recoverable other-surface history": recoverable.length,
        "recoverable %": pct(percent(recoverable.length, noSame.length)),
      };
    })
  ));
}

function lightlyRaced(lines: string[], contexts: Array<{ year: Year; evidence: Evidence[] }>) {
  lines.push("## Lightly Raced Profile");
  lines.push("");
  table(lines, contexts.flatMap((context) =>
    (["aw->turf", "turf->aw"] as Direction[]).flatMap((direction) =>
      DEPTH_BANDS.map((band) => ({
        year: context.year,
        direction,
        depth: band.label,
        ...summaryColumns(summarize(context.evidence.filter((row) =>
          row.direction === direction &&
          row.usablePriorRuns >= band.min &&
          row.usablePriorRuns <= band.max
        ))),
      }))
    )
  ));
}

function recency(lines: string[], contexts: Array<{ year: Year; evidence: Evidence[] }>) {
  lines.push("## Recency Bands");
  lines.push("");
  table(lines, contexts.flatMap((context) =>
    (["aw->turf", "turf->aw"] as Direction[]).flatMap((direction) =>
      RECENCY_BANDS.map((band) => ({
        year: context.year,
        direction,
        recency: band.label,
        ...summaryColumns(summarize(context.evidence.filter((row) =>
          row.direction === direction &&
          row.daysSinceRun !== null &&
          row.daysSinceRun >= band.min &&
          row.daysSinceRun <= band.max
        ))),
      }))
    )
  ));
}

function decisions(
  lines: string[],
  contexts: Array<{ year: Year; rows: HistoricalTargetRunnerMetricsRow[]; evidence: Evidence[] }>,
  adjustments: Record<"aw->turf" | "turf->aw", number>,
) {
  const holdout = contexts.find((context) => context.year === "2026")!;
  const awTurf = summarize(holdout.evidence.filter((row) => row.direction === "aw->turf"));
  const turfAw = summarize(holdout.evidence.filter((row) => row.direction === "turf->aw"));
  const turfTurf = summarize(holdout.evidence.filter((row) => row.direction === "turf->turf"));
  const awAw = summarize(holdout.evidence.filter((row) => row.direction === "aw->aw"));
  const recoverTurf = recoverable(holdout.rows, "turf");
  const recoverAw = recoverable(holdout.rows, "aw");
  const adjustedAwTurf = summarize(holdout.evidence.filter((row) => row.direction === "aw->turf").map((row) => ({ ...row, rating: row.rating + adjustments["aw->turf"] })));
  const adjustedTurfAw = summarize(holdout.evidence.filter((row) => row.direction === "turf->aw").map((row) => ({ ...row, rating: row.rating + adjustments["turf->aw"] })));

  lines.push("## Decision Answers");
  lines.push("");
  lines.push(`1. AW form -> Turf: ${directional(awTurf)} in 2026; win corr ${num(awTurf.winCorrelation)}, rank1 strike ${pct(awTurf.rank1Strike)}.`);
  lines.push(`2. Turf form -> AW: ${directional(turfAw)} in 2026; win corr ${num(turfAw.winCorrelation)}, rank1 strike ${pct(turfAw.rank1Strike)}.`);
  lines.push(`3. Better transfer direction: ${(awTurf.winCorrelation ?? -1) >= (turfAw.winCorrelation ?? -1) ? "AW -> Turf" : "Turf -> AW"} by 2026 win correlation.`);
  lines.push(`4. Weakness vs same surface: AW -> Turf ${num(awTurf.winCorrelation)} vs Turf -> Turf ${num(turfTurf.winCorrelation)}; Turf -> AW ${num(turfAw.winCorrelation)} vs AW -> AW ${num(awAw.winCorrelation)}.`);
  lines.push(`5. 2025 adjustment holdout: AW -> Turf raw/adjusted win corr ${num(awTurf.winCorrelation)}/${num(adjustedAwTurf.winCorrelation)}; Turf -> AW ${num(turfAw.winCorrelation)}/${num(adjustedTurfAw.winCorrelation)}.`);
  lines.push(`6. 2026 Turf runners with no Turf rating but AW fallback: ${recoverTurf.recoverable}/${recoverTurf.noSame} (${pct(percent(recoverTurf.recoverable, recoverTurf.noSame))}).`);
  lines.push(`7. 2026 AW runners with no AW rating but Turf fallback: ${recoverAw.recoverable}/${recoverAw.noSame} (${pct(percent(recoverAw.recoverable, recoverAw.noSame))}).`);
  lines.push("8. Lightly raced impact: see Lightly Raced Profile; one-run rows are the relevant El Morjan-style population.");
  lines.push("9. Recency: see Recency Bands; use fixed 0-30, 31-60, 61-120, 121+ bands.");
  lines.push("10-12. Production fallback should remain off unless 2026 cross-surface ordering is close to same-surface controls. If later adopted, use it only as a labelled fallback for runners with no same-surface history, not as a silent TPR blend.");
}

function summarize(rows: Evidence[]): Summary {
  const ranked = rankWithinRaces(rows);
  const rankOnes = ranked.filter((row) => row.rank === 1);
  const byRace = groupBy(ranked, (row) => row.row.features.targetRaceId);
  let winnerDenominator = 0;
  let winnerNumerator = 0;
  let placeDenominator = 0;
  let placeNumerator = 0;
  for (const raceRows of byRace.values()) {
    if (raceRows.some((row) => row.won)) {
      winnerDenominator += 1;
      if (raceRows.some((row) => row.won && row.rank <= 3)) winnerNumerator += 1;
    }
    const placed = raceRows.filter((row) => row.placed).length;
    placeDenominator += placed;
    placeNumerator += raceRows.filter((row) => row.placed && row.rank <= 3).length;
  }
  return {
    runners: rows.length,
    winners: rows.filter((row) => row.won).length,
    places: rows.filter((row) => row.placed).length,
    strike: percent(rows.filter((row) => row.won).length, rows.length),
    placeRate: percent(rows.filter((row) => row.placed).length, rows.length),
    mean: mean(rows.map((row) => row.rating)),
    median: median(rows.map((row) => row.rating)),
    winCorrelation: pearson(rows.map((row) => row.rating), rows.map((row) => row.won ? 1 : 0)),
    finishCorrelation: pearson(
      rows.filter((row) => row.finishPosition !== null).map((row) => row.rating),
      rows.filter((row) => row.finishPosition !== null).map((row) => row.finishPosition!),
    ),
    rank1Strike: percent(rankOnes.filter((row) => row.won).length, rankOnes.length),
    top3WinnerCapture: percent(winnerNumerator, winnerDenominator),
    top3PlaceCapture: percent(placeNumerator, placeDenominator),
    rankedRaces: byRace.size,
  };
}

function summaryColumns(summary: Summary) {
  return {
    runners: summary.runners,
    winners: summary.winners,
    strike: pct(summary.strike),
    places: summary.places,
    "place/top3": pct(summary.placeRate),
    "speed mean": num(summary.mean),
    "speed median": num(summary.median),
    "win corr": num(summary.winCorrelation),
    "finish corr": num(summary.finishCorrelation),
    "rank1 strike": pct(summary.rank1Strike),
    "top3 win capture": pct(summary.top3WinnerCapture),
    "top3 place capture": pct(summary.top3PlaceCapture),
    "ranked races": summary.rankedRaces,
  };
}

function rankWithinRaces(rows: Evidence[]): Array<Evidence & { rank: number }> {
  return [...groupBy(rows, (row) => row.row.features.targetRaceId).values()].flatMap((raceRows) => {
    const sorted = [...raceRows].sort((left, right) => right.rating - left.rating || left.row.features.targetRunnerId.localeCompare(right.row.features.targetRunnerId));
    let previous: number | null = null;
    let previousRank = 0;
    return sorted.map((row, index) => {
      const rank = row.rating === previous ? previousRank : index + 1;
      previous = row.rating;
      previousRank = rank;
      return { ...row, rank };
    });
  });
}

function deriveAdjustments(evidence: Evidence[]): Record<"aw->turf" | "turf->aw", number> {
  return {
    "aw->turf": winnerMean(evidence, "turf->turf") - winnerMean(evidence, "aw->turf"),
    "turf->aw": winnerMean(evidence, "aw->aw") - winnerMean(evidence, "turf->aw"),
  };
}

function winnerMean(evidence: Evidence[], direction: Direction): number {
  return mean(evidence.filter((row) => row.direction === direction && row.won).map((row) => row.rating)) ?? 0;
}

function recoverable(rows: HistoricalTargetRunnerMetricsRow[], target: Surface) {
  const other = target === "turf" ? "aw" : "turf";
  const targetRows = rows.filter((row) => targetSurface(row.features) === target);
  const noSame = targetRows.filter((row) => latestSpeed(row.features, target) === null);
  const recoverableRows = noSame.filter((row) => latestSpeed(row.features, other) !== null);
  return { noSame: noSame.length, recoverable: recoverableRows.length };
}

function latestSpeed(features: HistoricalPreRaceFeatureRow, surface: Surface): number | null {
  return surface === "turf" ? features.latestTurfSpeedRating : features.latestAwSpeedRating;
}

function bestL3(features: HistoricalPreRaceFeatureRow, surface: Surface): number | null {
  return surface === "turf" ? features.bestTurfSpeedLast3 : features.bestAwSpeedLast3;
}

function usablePriorDepth(features: HistoricalPreRaceFeatureRow): number {
  const values = [
    features.latestTurfSpeedRating,
    features.previousTurfSpeedRating,
    features.averageTurfSpeedLast3,
    features.latestAwSpeedRating,
    features.previousAwSpeedRating,
    features.averageAwSpeedLast3,
  ].filter(isNumber);
  return Math.min(features.priorRuns, Math.max(1, values.length));
}

function targetSurface(features: HistoricalPreRaceFeatureRow): Surface | null {
  if (features.raceCode === "turf") return "turf";
  if (features.raceCode === "aw") return "aw";
  return null;
}

function compareRows(left: HistoricalTargetRunnerMetricsRow, right: HistoricalTargetRunnerMetricsRow) {
  return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
    left.features.targetRaceId.localeCompare(right.features.targetRaceId) ||
    left.features.targetRunnerId.localeCompare(right.features.targetRunnerId);
}

function groupBy<T, K>(values: T[], keyFor: (value: T) => K) {
  const grouped = new Map<K, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    const rows = grouped.get(key) ?? [];
    rows.push(value);
    grouped.set(key, rows);
  }
  return grouped;
}

function table(lines: string[], rows: Array<Record<string, string | number>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]!);
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    lines.push(`| ${headers.map((header) => String(row[header] ?? "-")).join(" | ")} |`);
  }
  lines.push("");
}

function isNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function mean(values: number[]): number | null {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((total, value) => total + value, 0) / clean.length : null;
}

function median(values: number[]): number | null {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle]! : (clean[middle - 1]! + clean[middle]!) / 2;
}

function percent(count: number, total: number): number | null {
  return total > 0 ? (count / total) * 100 : null;
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const xMean = mean(xs);
  const yMean = mean(ys);
  if (xMean === null || yMean === null) return null;
  let numerator = 0;
  let xDenominator = 0;
  let yDenominator = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const x = xs[index]! - xMean;
    const y = ys[index]! - yMean;
    numerator += x * y;
    xDenominator += x * x;
    yDenominator += y * y;
  }
  const denominator = Math.sqrt(xDenominator * yDenominator);
  return denominator === 0 ? null : numerator / denominator;
}

function pct(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(1)}%`;
}

function num(value: number | null): string {
  return value === null ? "-" : value.toFixed(3);
}

function signed(value: number): string {
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

function label(surface: Surface): string {
  return surface === "turf" ? "Turf" : "All-Weather";
}

function directional(summary: Summary): string {
  return summary.winCorrelation !== null && summary.winCorrelation > 0 ? "positive" : "weak/no positive signal";
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

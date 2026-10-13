import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { settleSelection, type BacktestSettlement } from "@/lib/racing/backtest";
import type {
  HistoricalPostRaceOutcome,
  HistoricalPreRaceFeatureRow,
  HistoricalTargetRunnerMetricsRow as Row,
} from "@/lib/racing/historical-target-metrics";

type Year = "2025" | "2026";
type Family = "HURDLE" | "CHASE" | "ALL WEATHER" | "FLAT TURF";
type ClassifiedFamily = Family | "OTHER/EXCLUDED";
type Entry = {
  row: Row;
  year: Year;
  family: ClassifiedFamily;
  settlement: BacktestSettlement;
  sp: number;
  won: boolean;
};

const YEARS: Year[] = ["2025", "2026"];
const FAMILIES: Family[] = ["HURDLE", "CHASE", "ALL WEATHER", "FLAT TURF"];
const PRIMARY_THRESHOLD = 15;
const MARKDOWN_OUTPUT = "/tmp/long-price-winner-rate-by-family.md";
const JSON_OUTPUT = "/tmp/long-price-winner-rate-by-family.json";
const CACHE_ROOT = "data/research/backtest-cache";

async function main() {
  const rowsByYear = await Promise.all(YEARS.map(loadYear));
  const entries = rowsByYear.flat();
  const included = entries.filter((entry) => isTargetFamily(entry.family));
  const other = entries.filter((entry) => !isTargetFamily(entry.family));

  const primary = included.filter((entry) => entry.sp > PRIMARY_THRESHOLD);
  const secondary = included.filter((entry) => entry.sp >= PRIMARY_THRESHOLD);

  const artifact = {
    generatedAt: new Date().toISOString(),
    source: "data/research/backtest-cache v4 all-family caches",
    definitions: {
      primary: "decimal SP > 15.0 (>14/1), exactly 14/1 excluded",
      secondary: "decimal SP >= 15.0 (>=14/1)",
      eligibleRunner: "settleSelection(row.outcome) !== null; void/non-runner/unreliable outcome or invalid SP excluded",
    },
    coverage: YEARS.map((year) => coverageRow(year, entries)),
    exclusions: exclusionSummary(entries, other),
    core: FAMILIES.map((family) => coreStats(primary.filter((entry) => entry.family === family), family)),
    sensitivity: FAMILIES.map((family) => coreStats(secondary.filter((entry) => entry.family === family), family)),
    yearSplit: yearSplit(primary),
    priceBands: priceBands(primary),
    baseline: FAMILIES.map((family) => baselineRow(
      family,
      included.filter((entry) => entry.family === family),
      primary.filter((entry) => entry.family === family),
    )),
    raceLevel: FAMILIES.map((family) => raceLevelRow(family, primary.filter((entry) => entry.family === family))),
    comparisons: comparisons(primary),
    examples: Object.fromEntries(FAMILIES.map((family) => [
      family,
      examples(primary.filter((entry) => entry.family === family && entry.won), 6),
    ])),
  };

  await writeFile(JSON_OUTPUT, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(MARKDOWN_OUTPUT, markdown(artifact), "utf8");

  console.log("SP > 14/1");
  console.log(`Wrote ${MARKDOWN_OUTPUT}`);
  console.log(`Wrote ${JSON_OUTPUT}`);
  console.table(artifact.core.map((row) => ({
    family: row.family,
    runners: row.runners,
    winners: row.winners,
    winnerPct: row.winnerPct,
    averageSp: row.averageSp,
    medianSp: row.medianSp,
  })));
}

async function loadYear(year: Year): Promise<Entry[]> {
  const rows = await loadAllCacheRows(year);
  return rows.flatMap((row): Entry[] => {
    const settlement = settleSelection(row.outcome);
    if (!settlement) return [];
    return [{
      row,
      year,
      family: classifyFamily(row),
      settlement,
      sp: settlement.settlementOddsDecimal,
      won: row.outcome.won === true || row.outcome.finishingPosition === 1,
    }];
  });
}

async function loadAllCacheRows(year: Year): Promise<Row[]> {
  const directory = join(CACHE_ROOT, `backtest_features_v4-sporting_life-all-${year}-01-01-${year}-12-31`);
  const [featuresText, outcomesText] = await Promise.all([
    readFile(join(directory, "features.ndjson"), "utf8"),
    readFile(join(directory, "outcomes.ndjson"), "utf8"),
  ]);
  const features = parseNdjson<HistoricalPreRaceFeatureRow & { raceDateTime: string }>(featuresText).map((feature) => ({
    ...feature,
    raceDateTime: new Date(feature.raceDateTime),
  }));
  const outcomes = parseNdjson<HistoricalPostRaceOutcome>(outcomesText);
  if (features.length !== outcomes.length) throw new Error(`Cache feature/outcome length mismatch for ${year}`);
  return withDeadHeatDivisors(features.map((features, index) => ({ features, outcome: outcomes[index]! })));
}

function withDeadHeatDivisors(rows: Row[]): Row[] {
  const winnerCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.outcome.finishingPosition === 1) {
      winnerCounts.set(row.outcome.targetRaceId, (winnerCounts.get(row.outcome.targetRaceId) ?? 0) + 1);
    }
  }
  return rows.map((row) => ({
    ...row,
    outcome: {
      ...row.outcome,
      deadHeatDivisor: row.outcome.finishingPosition === 1
        ? winnerCounts.get(row.outcome.targetRaceId) ?? 1
        : 1,
    },
  }));
}

function parseNdjson<T>(text: string): T[] {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function classifyFamily(row: Row): ClassifiedFamily {
  const text = `${row.features.raceName ?? ""} ${row.features.raceType ?? ""} ${row.features.raceTypeCode ?? ""}`.toLowerCase();
  if (row.features.raceCode === "aw") return "ALL WEATHER";
  if (row.features.raceCode === "turf") return "FLAT TURF";
  if (row.features.raceCode === "jump") {
    if (/\bhurdles?\b|\bhurdle\b/.test(text)) return "HURDLE";
    if (/\bchase\b|\bsteeplechase\b/.test(text)) return "CHASE";
  }
  return "OTHER/EXCLUDED";
}

function coreStats(rows: Entry[], family: Family) {
  const sps = rows.map((entry) => entry.sp);
  const winners = count(rows, (entry) => entry.won);
  return {
    family,
    runners: rows.length,
    winners,
    winnerPct: pct(rate(winners, rows.length)),
    averageSp: num(average(sps)),
    medianSp: num(median(sps)),
  };
}

function yearSplit(rows: Entry[]) {
  const result = [];
  for (const family of FAMILIES) {
    for (const year of YEARS) {
      const scoped = rows.filter((entry) => entry.family === family && entry.year === year);
      const winners = count(scoped, (entry) => entry.won);
      result.push({ family, year, longPriceRunners: scoped.length, winners, winnerPct: pct(rate(winners, scoped.length)) });
    }
    const scoped = rows.filter((entry) => entry.family === family);
    const winners = count(scoped, (entry) => entry.won);
    result.push({ family, year: "Combined", longPriceRunners: scoped.length, winners, winnerPct: pct(rate(winners, scoped.length)) });
  }
  return result;
}

function priceBands(rows: Entry[]) {
  const bands = [
    { band: ">14/1 to 20/1", select: (sp: number) => sp > 15 && sp <= 21 },
    { band: ">20/1 to 33/1", select: (sp: number) => sp > 21 && sp <= 34 },
    { band: ">33/1 to 50/1", select: (sp: number) => sp > 34 && sp <= 51 },
    { band: ">50/1", select: (sp: number) => sp > 51 },
  ];
  return FAMILIES.flatMap((family) => bands.map(({ band, select }) => {
    const scoped = rows.filter((entry) => entry.family === family && select(entry.sp));
    const winners = count(scoped, (entry) => entry.won);
    return { family, band, runners: scoped.length, winners, winnerPct: pct(rate(winners, scoped.length)) };
  }));
}

function baselineRow(family: Family, allRows: Entry[], longRows: Entry[]) {
  const allWinners = count(allRows, (entry) => entry.won);
  const longWinners = count(longRows, (entry) => entry.won);
  const allStrike = rate(allWinners, allRows.length);
  const longStrike = rate(longWinners, longRows.length);
  return {
    family,
    allSpWinnerPct: pct(allStrike),
    longPriceWinnerPct: pct(longStrike),
    ratioLongToOverall: num(allStrike === null || longStrike === null || allStrike === 0 ? null : longStrike / allStrike),
  };
}

function raceLevelRow(family: Family, rows: Entry[]) {
  const races = group(rows, (entry) => entry.row.features.targetRaceId);
  let racesWithWinner = 0;
  for (const raceRows of races.values()) {
    if (raceRows.some((entry) => entry.won)) racesWithWinner++;
  }
  return {
    family,
    racesRepresented: races.size,
    racesWithLongPriceWinner: racesWithWinner,
    pctRacesWithLongPriceWinner: pct(rate(racesWithWinner, races.size)),
  };
}

function comparisons(rows: Entry[]) {
  const pairs: Array<[Family, Family]> = [
    ["HURDLE", "FLAT TURF"],
    ["CHASE", "FLAT TURF"],
    ["HURDLE", "ALL WEATHER"],
    ["CHASE", "ALL WEATHER"],
  ];
  return pairs.map(([left, right]) => comparePair(left, rows.filter((entry) => entry.family === left), right, rows.filter((entry) => entry.family === right)));
}

function comparePair(leftFamily: Family, left: Entry[], rightFamily: Family, right: Entry[]) {
  const leftWins = count(left, (entry) => entry.won);
  const rightWins = count(right, (entry) => entry.won);
  const p1 = leftWins / left.length;
  const p2 = rightWins / right.length;
  const diff = p1 - p2;
  const se = Math.sqrt((p1 * (1 - p1)) / left.length + (p2 * (1 - p2)) / right.length);
  const z = se > 0 ? diff / se : 0;
  return {
    comparison: `${leftFamily} vs ${rightFamily}`,
    leftRunners: left.length,
    leftWinners: leftWins,
    rightRunners: right.length,
    rightWinners: rightWins,
    leftWinnerPct: pct(p1),
    rightWinnerPct: pct(p2),
    absolutePpDifference: pp(diff),
    relativeRatio: num(p2 === 0 ? null : p1 / p2),
    z: num(z),
    pValueTwoSided: num(2 * (1 - normalCdf(Math.abs(z)))),
    diff95CiPp: `${pp(diff - 1.96 * se)} to ${pp(diff + 1.96 * se)}`,
  };
}

function examples(rows: Entry[], limit: number) {
  return [...rows]
    .sort((left, right) => right.sp - left.sp || left.row.features.raceDate.localeCompare(right.row.features.raceDate))
    .slice(0, limit)
    .map((entry) => ({
      date: entry.row.features.raceDate,
      course: entry.row.features.courseName,
      race: entry.row.features.raceName,
      horse: entry.row.features.horseName,
      family: entry.family,
      raceCode: entry.row.features.raceCode,
      raceType: entry.row.features.raceType,
      raceTypeCode: entry.row.features.raceTypeCode,
      surface: entry.row.features.surface,
      sp: num(entry.sp),
      finishingPosition: entry.row.outcome.finishingPosition,
      resultStatus: entry.row.outcome.resultStatus,
    }));
}

function coverageRow(year: Year, entries: Entry[]) {
  const scoped = entries.filter((entry) => entry.year === year);
  return {
    year,
    eligibleValidSpStarters: scoped.length,
    races: distinct(scoped, (entry) => entry.row.features.targetRaceId),
    dateFrom: scoped.map((entry) => entry.row.features.raceDate).sort()[0] ?? null,
    dateTo: scoped.map((entry) => entry.row.features.raceDate).sort().at(-1) ?? null,
  };
}

function exclusionSummary(entries: Entry[], other: Entry[]) {
  const primaryOther = other.filter((entry) => entry.sp > PRIMARY_THRESHOLD);
  const byRaceCode = [...group(other, (entry) => entry.row.features.raceCode).entries()].map(([raceCode, rows]) => ({
    raceCode,
    validSpStarters: rows.length,
    longPriceRunners: count(rows, (entry) => entry.sp > PRIMARY_THRESHOLD),
    races: distinct(rows, (entry) => entry.row.features.targetRaceId),
  }));
  return {
    targetFamilyValidSpStarters: entries.length - other.length,
    otherValidSpStarters: other.length,
    otherLongPriceRunners: primaryOther.length,
    otherLongPriceWinners: count(primaryOther, (entry) => entry.won),
    byRaceCode,
    examples: examples(primaryOther, 10),
  };
}

function markdown(artifact: Record<string, any>) {
  const lines: string[] = [
    "# Long-Price Winner Rate By Racing Family",
    "",
    "Primary definition: decimal SP > 15.0 (>14/1). Exactly 14/1 is excluded from the primary cohort. Eligibility uses canonical `settleSelection`; non-runners/voids/unreliable outcomes/invalid SP are excluded, while started non-finishers remain non-winners.",
    "",
    "## Coverage",
    "",
  ];
  table(lines, artifact.coverage);
  lines.push("## Primary Result: SP > 14/1", "");
  table(lines, artifact.core);
  lines.push("## Sensitivity: SP >= 14/1", "");
  table(lines, artifact.sensitivity);
  lines.push("## Year Split", "");
  table(lines, artifact.yearSplit);
  lines.push("## Price Bands", "");
  table(lines, artifact.priceBands);
  lines.push("## All-Price Baseline", "");
  table(lines, artifact.baseline);
  lines.push("## Race-Level Check", "");
  table(lines, artifact.raceLevel);
  lines.push("## Statistical Comparisons", "");
  table(lines, artifact.comparisons);
  lines.push("## Excluded / Other", "");
  table(lines, [artifact.exclusions]);
  lines.push("Other by race code:", "");
  table(lines, artifact.exclusions.byRaceCode);
  lines.push("Other long-price examples:", "");
  table(lines, artifact.exclusions.examples);
  lines.push("## Long-Price Winner Examples", "");
  for (const family of FAMILIES) {
    lines.push(`### ${family}`, "");
    table(lines, artifact.examples[family]);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function table(lines: string[], rows: Record<string, unknown>[]) {
  if (!rows.length) {
    lines.push("No rows.", "");
    return;
  }
  const headers = Object.keys(rows[0]!);
  lines.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    lines.push(`| ${headers.map((header) => cell(row[header])).join(" | ")} |`);
  }
  lines.push("");
}

function cell(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} rows; see expanded table below`;
  if (value && typeof value === "object") return JSON.stringify(value).replace(/\|/g, "\\|");
  return String(value ?? "-").replace(/\|/g, "\\|");
}

function isTargetFamily(family: ClassifiedFamily): family is Family {
  return FAMILIES.includes(family as Family);
}

function group<T>(rows: T[], key: (row: T) => string) {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = result.get(k) ?? [];
    bucket.push(row);
    result.set(k, bucket);
  }
  return result;
}

function count<T>(rows: T[], predicate: (row: T) => boolean) {
  return rows.filter(predicate).length;
}

function distinct<T>(rows: T[], key: (row: T) => string) {
  return new Set(rows.map(key)).size;
}

function rate(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function pct(value: number | null) {
  return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`;
}

function pp(value: number | null) {
  return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}`;
}

function num(value: number | null) {
  return value === null || !Number.isFinite(value) ? "-" : value.toFixed(3);
}

function normalCdf(value: number) {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

function erf(value: number) {
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

await main();

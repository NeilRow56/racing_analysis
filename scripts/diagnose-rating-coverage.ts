import { calculateAwRaceRatings } from "@/lib/racing/aw-performance-rating";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { calculateJumpRaceRatings } from "@/lib/racing/jump-performance-rating";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import { rankRows } from "@/lib/racing/research-rule";

type Year = "2025" | "2026";
type Family = "aw" | "tpr" | "jpr";
type RaceCoverage = {
  year: Year;
  family: Family;
  raceId: string;
  activeRunnerCount: number;
  ratedRunnerCount: number;
  coverage: number;
  rank1Selections: number;
  rank1Winners: number;
  top3Captured: boolean;
  rankedOutcomes: Array<{ rank: number; won: boolean }>;
  context: string;
  raceTypeContext: string;
  ageGroup: string;
  historyCounts: {
    zero: number;
    one: number;
    two: number;
    threePlus: number;
  };
};

const YEARS = ["2025", "2026"] as const;
const COVERAGE_BANDS = [
  { label: "<20%", test: (coverage: number) => coverage < .2 },
  { label: "20-39.99%", test: (coverage: number) => coverage >= .2 && coverage < .4 },
  { label: "40-59.99%", test: (coverage: number) => coverage >= .4 && coverage < .6 },
  { label: "60-79.99%", test: (coverage: number) => coverage >= .6 && coverage < .8 },
  { label: ">=80%", test: (coverage: number) => coverage >= .8 },
] as const;

async function main() {
  const rows: RaceCoverage[] = [];
  for (const year of YEARS) {
    rows.push(...await coverageFor("aw", year));
    rows.push(...await coverageFor("tpr", year));
    rows.push(...await coverageFor("jpr", year));
  }

  console.log("# Rating Coverage Diagnostic");
  console.log("");
  console.log("Fixed-band diagnostic only. No ROI optimisation, rating formula change, tracker rewrite, or threshold search was performed.");
  console.log("");
  for (const year of YEARS) {
    console.log(`## AW-D ${year}`);
    printCoverageBands(rows.filter((row) => row.family === "aw" && row.year === year));
    console.log("");
    printRatedRunnerCounts(rows.filter((row) => row.family === "aw" && row.year === year));
    console.log("");
  }

  for (const family of ["tpr", "jpr"] as const) {
    for (const year of YEARS) {
      const selected = rows.filter((row) => row.family === family && row.year === year);
      console.log(`## ${family === "tpr" ? "TPR / Turf" : "JPR-A / Jump"} ${year}`);
      printCoverageBands(selected);
      console.log("");
      printInsufficientContext(family, selected);
      console.log("");
    }
  }

  console.log("## Other Families Sparse-Coverage Audit");
  console.log("");
  console.log("| Family | Year | Races | Exactly 1 rated | <20% coverage | <40% coverage |");
  console.log("|---|---:|---:|---:|---:|---:|");
  for (const family of ["tpr", "jpr"] as const) {
    for (const year of YEARS) {
      const selected = rows.filter((row) => row.family === family && row.year === year);
      console.log(`| ${family.toUpperCase()} | ${year} | ${selected.length} | ${selected.filter((row) => row.ratedRunnerCount === 1).length} | ${selected.filter((row) => row.coverage < .2).length} | ${selected.filter((row) => row.coverage < .4).length} |`);
    }
  }
}

async function coverageFor(family: Family, year: Year): Promise<RaceCoverage[]> {
  const cacheFamily = family === "aw" ? "all_weather_flat" : family === "jpr" ? "jump" : "turf_flat";
  const raceCode = family === "aw" ? "aw" : family === "jpr" ? "jump" : "turf";
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: cacheFamily, year }) ??
    await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
  if (!cache) throw new Error(`Missing historical feature cache for ${family} ${year}`);
  const rows = cache.rows.filter((row) => row.features.raceCode === raceCode);
  const byRace = group(rows);
  const tprRatings = family === "tpr" ? rankRows(rows) : [];
  const tprByRunner = new Map(tprRatings.flatMap((row) =>
    row.turfPerformance ? [[row.features.targetRunnerId, row.turfPerformance.rank] as const] : []
  ));

  return [...byRace].flatMap(([raceId, raceRows]) => {
    if (!raceRows.some((row) => row.outcome.finishingPosition === 1)) return [];
    const active = raceRows.filter((row) => row.outcome.resultStatus !== "non_runner");
    const ranks = family === "aw"
      ? awRanks(active)
      : family === "jpr"
        ? jprRanks(active)
        : tprByRunner;
    const rankValues = active.flatMap((row) => {
      const rank = ranks.get(row.features.targetRunnerId);
      return rank === undefined ? [] : [{ row, rank }];
    });
    return [{
      year,
      family,
      raceId,
      activeRunnerCount: active.length,
      ratedRunnerCount: rankValues.length,
      coverage: active.length === 0 ? 0 : rankValues.length / active.length,
      rank1Selections: rankValues.filter((entry) => entry.rank === 1).length,
      rank1Winners: rankValues.filter((entry) => entry.rank === 1 && entry.row.outcome.finishingPosition === 1).length,
      top3Captured: rankValues.some((entry) => entry.rank <= 3 && entry.row.outcome.finishingPosition === 1),
      rankedOutcomes: rankValues.map((entry) => ({ rank: entry.rank, won: entry.row.outcome.finishingPosition === 1 })),
      context: family === "jpr" ? jumpContext(raceRows[0]!) : turfContext(raceRows[0]!),
      raceTypeContext: raceTypeContext(raceRows[0]!),
      ageGroup: ageGroup(active),
      historyCounts: {
        zero: active.filter((row) => row.features.priorRuns === 0).length,
        one: active.filter((row) => row.features.priorRuns === 1).length,
        two: active.filter((row) => row.features.priorRuns === 2).length,
        threePlus: active.filter((row) => row.features.priorRuns >= 3).length,
      },
    }];
  });
}

function awRanks(rows: HistoricalTargetRunnerMetricsRow[]) {
  const ratings = calculateAwRaceRatings(rows.map((row) => ({
    runnerId: row.features.targetRunnerId,
    resultStatus: row.outcome.resultStatus,
    averageAwSpeedLast3: row.features.averageAwSpeedLast3,
    trainerPriorStrikeRate: row.features.trainerPriorWinRate,
    jockeyPriorStrikeRate: row.features.jockeyPriorWinRate ?? null,
  })));
  return new Map(rows.flatMap((row) => {
    const rank = ratings.get(row.features.targetRunnerId)?.awD?.rank;
    return rank === undefined ? [] : [[row.features.targetRunnerId, rank] as const];
  }));
}

function jprRanks(rows: HistoricalTargetRunnerMetricsRow[]) {
  const ratings = calculateJumpRaceRatings(rows.map((row) => ({
    runnerId: row.features.targetRunnerId,
    resultStatus: row.outcome.resultStatus,
    averageJumpSpeedLast3: row.features.averageJumpSpeedLast3,
    trainerPriorStrikeRate: row.features.trainerPriorWinRate,
    officialRating: row.features.officialRating,
  })));
  return new Map(rows.flatMap((row) => {
    const rank = ratings.get(row.features.targetRunnerId)?.jprA?.rank;
    return rank === undefined ? [] : [[row.features.targetRunnerId, rank] as const];
  }));
}

function printCoverageBands(rows: RaceCoverage[]) {
  console.log("| Coverage band | Races | Mean field size | Rank-1 strike | Top-3 capture | Rank/win assoc. |");
  console.log("|---|---:|---:|---:|---:|---:|");
  for (const band of COVERAGE_BANDS) {
    const selected = rows.filter((row) => band.test(row.coverage));
    const rank1Selections = sum(selected.map((row) => row.rank1Selections));
    const rank1Winners = sum(selected.map((row) => row.rank1Winners));
    console.log(`| ${band.label} | ${selected.length} | ${num(avg(selected.map((row) => row.activeRunnerCount)))} | ${pct(ratio(rank1Winners, rank1Selections))} | ${pct(ratio(selected.filter((row) => row.top3Captured).length, selected.length))} | ${num(rankWinAssociation(selected))} |`);
  }
}

function printRatedRunnerCounts(rows: RaceCoverage[]) {
  console.log("| Rated runners | Races | Mean field size | Rank-1 strike | Top-3 capture |");
  console.log("|---|---:|---:|---:|---:|");
  for (const group of [
    { label: "exactly 1", test: (row: RaceCoverage) => row.ratedRunnerCount === 1 },
    { label: "exactly 2", test: (row: RaceCoverage) => row.ratedRunnerCount === 2 },
    { label: "3+", test: (row: RaceCoverage) => row.ratedRunnerCount >= 3 },
  ]) {
    const selected = rows.filter(group.test);
    const rank1Selections = sum(selected.map((row) => row.rank1Selections));
    const rank1Winners = sum(selected.map((row) => row.rank1Winners));
    console.log(`| ${group.label} | ${selected.length} | ${num(avg(selected.map((row) => row.activeRunnerCount)))} | ${pct(ratio(rank1Winners, rank1Selections))} | ${pct(ratio(selected.filter((row) => row.top3Captured).length, selected.length))} |`);
  }
}

function printInsufficientContext(family: "tpr" | "jpr", rows: RaceCoverage[]) {
  const insufficient = rows.filter((row) => row.ratedRunnerCount < 2 || row.coverage < .2);
  console.log(`Insufficient by ${family === "tpr" ? "race type" : "subtype"}:`);
  printCounts(insufficient, (row) => row.context);
  if (family === "tpr") {
    console.log("");
    console.log("Insufficient by age group:");
    printCounts(insufficient, (row) => row.ageGroup);
  } else {
    console.log("");
    console.log("Insufficient by race type:");
    printCounts(insufficient, (row) => row.raceTypeContext);
  }
  console.log("");
  console.log("Insufficient races containing prior-run bands:");
  console.log("| Prior history | Races |");
  console.log("|---|---:|");
  console.log(`| zero prior ${family === "jpr" ? "Jump " : ""}starts | ${insufficient.filter((row) => row.historyCounts.zero > 0).length} |`);
  console.log(`| one prior ${family === "jpr" ? "Jump " : ""}start | ${insufficient.filter((row) => row.historyCounts.one > 0).length} |`);
  console.log(`| two prior ${family === "jpr" ? "Jump " : ""}starts | ${insufficient.filter((row) => row.historyCounts.two > 0).length} |`);
  if (family === "jpr") console.log(`| 3+ prior Jump starts | ${insufficient.filter((row) => row.historyCounts.threePlus > 0).length} |`);
}

function printCounts(rows: RaceCoverage[], keyFor: (row: RaceCoverage) => string) {
  console.log("| Context | Races |");
  console.log("|---|---:|");
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(keyFor(row), (counts.get(keyFor(row)) ?? 0) + 1);
  for (const [context, count] of [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))) {
    console.log(`| ${context} | ${count} |`);
  }
}

function turfContext(row: HistoricalTargetRunnerMetricsRow) {
  const value = `${row.features.raceType ?? ""} ${row.features.raceName ?? ""}`.toLocaleLowerCase("en-GB");
  if (value.includes("maiden")) return "maiden";
  if (value.includes("novice")) return "novice";
  if (value.includes("handicap")) return "handicap";
  return "other";
}

function jumpContext(row: HistoricalTargetRunnerMetricsRow) {
  const subtype = classifyJumpRaceSubtype(row.features);
  if (subtype === "chase") return "Chase";
  if (subtype === "hurdle") return "Hurdle";
  if (subtype === "nh_flat") return "NH Flat";
  return "Unknown/other";
}

function raceTypeContext(row: HistoricalTargetRunnerMetricsRow) {
  const value = `${row.features.raceType ?? ""} ${row.features.raceName ?? ""}`.toLocaleLowerCase("en-GB");
  if (value.includes("maiden")) return "maiden";
  if (value.includes("novice")) return "novice";
  if (value.includes("handicap")) return "handicap";
  return "non-handicap";
}

function ageGroup(rows: HistoricalTargetRunnerMetricsRow[]) {
  const ages = [...new Set(rows.map((row) => row.features.horseAge).filter((age): age is number => age !== null))];
  if (ages.length === 1 && ages[0] === 2) return "2yo-only";
  if (ages.length === 1 && ages[0] === 3) return "3yo-only";
  return "mixed/older";
}

function group(rows: HistoricalTargetRunnerMetricsRow[]) {
  const map = new Map<string, HistoricalTargetRunnerMetricsRow[]>();
  for (const row of rows) map.set(row.features.targetRaceId, [...(map.get(row.features.targetRaceId) ?? []), row]);
  return map;
}

function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function avg(values: number[]) { return values.length ? sum(values) / values.length : null; }
function ratio(numerator: number, denominator: number) { return denominator > 0 ? numerator / denominator : null; }
function pct(value: number | null) { return value === null ? "-" : `${(value * 100).toFixed(1)}%`; }
function num(value: number | null) { return value === null ? "-" : value.toFixed(1); }

function rankWinAssociation(rows: RaceCoverage[]) {
  const values = rows.flatMap((row) => row.rankedOutcomes);
  if (values.length < 2 || values.every((value) => value.won === values[0]!.won)) return null;
  return correlation(values.map((value) => value.rank), values.map((value) => value.won ? 1 : 0));
}

function correlation(left: number[], right: number[]) {
  const leftMean = avg(left);
  const rightMean = avg(right);
  if (leftMean === null || rightMean === null) return null;
  const numerator = sum(left.map((value, index) => (value - leftMean) * (right[index]! - rightMean)));
  const leftVariance = sum(left.map((value) => (value - leftMean) ** 2));
  const rightVariance = sum(right.map((value) => (value - rightMean) ** 2));
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator === 0 ? null : numerator / denominator;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

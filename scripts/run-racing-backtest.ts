import { mkdir, writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import {
  FIXED_BACKTEST_PRESETS,
  runHistoricalBacktestSetWithCache,
  type BacktestDefinition,
  type BacktestRaceSegment,
  type BacktestResult,
} from "@/lib/racing/backtest";

const OUTPUT_DIR = "data/research";
const DEFAULT_FROM = "2025-01-01";
const DEFAULT_TO = "2025-12-31";

type CliOptions = {
  from: string;
  to: string;
  preset: string;
  family: "all" | BacktestRaceSegment;
  csv: boolean;
  cache: boolean;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const definitions = definitionsFor(options);
  const { client, db } = createDbConnection();

  try {
    const run = await runHistoricalBacktestSetWithCache({
      db,
      startDate: options.from,
      endDate: options.to,
      family: options.family,
      definitions,
      cache: options.cache,
    });
    console.log(
      `Feature mode: ${run.mode}${run.cacheDirectory ? ` (${run.cacheDirectory})` : ""}`,
    );
    const results = run.results;
    printResults(results);

    if (options.csv) {
      await mkdir(OUTPUT_DIR, { recursive: true });
      for (const result of results) {
        const path = `${OUTPUT_DIR}/backtest-${result.definition.id}-${options.from}-${options.to}.csv`;
        await writeFile(path, selectionsCsv(result), "utf8");
        console.log(`CSV ${path}`);
      }
    }
  } finally {
    await client.end();
  }
}

function parseArgs(args: string[]): CliOptions {
  const valueAfter = (name: string) => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const family = valueAfter("--family") ?? "all";
  if (!isFamily(family)) {
    throw new Error(`Unsupported --family ${family}`);
  }
  return {
    from: valueAfter("--from") ?? DEFAULT_FROM,
    to: valueAfter("--to") ?? DEFAULT_TO,
    preset: valueAfter("--preset") ?? "all",
    family,
    csv: args.includes("--csv"),
    cache: !args.includes("--no-cache"),
  };
}

function definitionsFor(options: CliOptions): BacktestDefinition[] {
  const presets = options.preset === "all"
    ? FIXED_BACKTEST_PRESETS
    : FIXED_BACKTEST_PRESETS.filter((preset) => preset.id === options.preset);
  if (presets.length === 0) {
    throw new Error(`Unknown --preset ${options.preset}`);
  }
  const families: BacktestRaceSegment[] = options.family === "all"
    ? ["jump", "all_weather_flat", "turf_flat"]
    : [options.family];

  return families.flatMap((family) =>
    presets.map((preset) => ({
      ...preset,
      id: `${family}-${preset.id}`,
      name: `${familyName(family)}: ${preset.name}`,
      race: {
        ...preset.race,
        segments: [family],
      },
    })),
  );
}

function printResults(results: BacktestResult[]) {
  console.log(
    "Selection price: feature oddsDecimal only; currently null unless a genuine pre-race odds source is added.",
  );
  console.log("Settlement price: race_runners.starting_price_decimal from result data.");
  console.table(
    results.map((result) => ({
      id: result.definition.id,
      population: result.baseline.totalEligibleRunners,
      settledPopulation: result.baseline.settledRunners,
      baselineStrike: formatPct(result.baseline.strikeRate),
      selections: result.summary.selections,
      settled: result.summary.settledSelections,
      wins: result.summary.wins,
      strike: formatPct(result.summary.winStrikeRate),
      avgOdds: formatNumber(result.summary.averageOdds),
      pl: formatNumber(result.summary.profitLoss),
      roi: formatPct(result.summary.roiPercentage),
      maxLosingRun: result.summary.maxConsecutiveLosers,
      noSpeed: result.missingData.noPriorSpeedRating,
      noOr: result.missingData.noCurrentOr,
      noOdds: result.missingData.noUsableOdds,
      ms: Math.round(result.performance.elapsedMs),
      heapMb: result.performance.heapUsedMb,
    })),
  );
}

function selectionsCsv(result: BacktestResult): string {
  const header = [
    "date",
    "race",
    "course",
    "race_type",
    "distance_yards",
    "horse",
    "current_or",
    "weight",
    "pre_race_odds",
    "latest_speed",
    "previous_speed",
    "best_l3",
    "average_l3",
    "latest_performance",
    "previous_performance",
    "best_performance_l3",
    "average_performance_l3",
    "latest_todays_rating",
    "previous_todays_rating",
    "best_todays_rating_l3",
    "average_todays_rating_l3",
    "latest_speed_minus_or",
    "latest_performance_minus_or",
    "latest_todays_rating_minus_or",
    "days_since_run",
    "selected_preset",
    "selected_reason",
    "finishing_position",
    "settlement_sp",
    "gbp_1_pl",
  ];
  return [
    header.join(","),
    ...result.selectedRunners.map((selection) =>
      [
        selection.features.raceDate,
        selection.features.raceName,
        selection.features.courseName,
        selection.features.raceType,
        selection.features.distanceYards,
        selection.features.horseName,
        selection.features.officialRating,
        selection.features.weight,
        selection.features.oddsDecimal,
        selection.features.latestSpeedRating,
        selection.features.previousSpeedRating,
        selection.features.bestSpeedLast3,
        selection.features.averageSpeedLast3,
        selection.features.latestPerformanceRating,
        selection.features.previousPerformanceRating,
        selection.features.bestPerformanceLast3,
        selection.features.averagePerformanceLast3,
        selection.features.latestTodaysRating,
        selection.features.previousTodaysRating,
        selection.features.bestTodaysRatingLast3,
        selection.features.averageTodaysRatingLast3,
        selection.derived.latestSpeedMinusOR,
        selection.derived.latestPerformanceMinusOR,
        selection.derived.latestTodaysRatingMinusOR,
        selection.features.daysSinceLastRun,
        result.definition.id,
        selection.selectedReason,
        selection.outcome.finishingPosition,
        selection.outcome.startingPriceDecimal,
        selection.settlement?.profitLoss ?? null,
      ].map(csvValue).join(","),
    ),
  ].join("\n");
}

function csvValue(value: string | number | null): string {
  if (value === null) {
    return "";
  }
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function isFamily(value: string): value is CliOptions["family"] {
  return value === "all" ||
    value === "jump" ||
    value === "all_weather_flat" ||
    value === "turf_flat";
}

function familyName(value: BacktestRaceSegment): string {
  if (value === "jump") {
    return "Jump";
  }
  if (value === "all_weather_flat") {
    return "AW";
  }
  return "Turf";
}

function formatPct(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(1)}%`;
}

function formatNumber(value: number | null): string {
  return value === null ? "-" : value.toFixed(2);
}

void main();

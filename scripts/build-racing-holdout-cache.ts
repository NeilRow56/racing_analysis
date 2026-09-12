import { createDbConnection } from "@/db";
import {
  buildBacktestFeatureCache,
  type BacktestCacheFamily,
} from "@/lib/racing/backtest-cache";

const DEFAULT_YEAR = "2026";
const HOLDOUT_FAMILIES: BacktestCacheFamily[] = ["jump", "all_weather_flat", "turf_flat"];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { client, db } = createDbConnection();
  try {
    const rows = [];
    for (const family of options.families) {
      const result = await buildBacktestFeatureCache({
        db,
        from: `${options.year}-01-01`,
        to: options.to,
        family,
        onProgress: (message) => {
          console.log(`[holdout:${family}] ${message}`);
        },
      });
      rows.push({
        directory: result.directory,
        targetRunnerIds: result.counts.targetRunnerIds,
        rows: result.manifest.rowCount,
        family: result.manifest.family,
        from: result.manifest.from,
        to: result.manifest.to,
        version: result.manifest.featureSchemaVersion,
        seconds: (result.elapsedMs / 1000).toFixed(1),
        mb: (result.sizeBytes / 1024 / 1024).toFixed(2),
      });
    }
    console.table(rows);
  } finally {
    await client.end();
  }
}

function parseArgs(args: string[]): { year: string; to: string; families: BacktestCacheFamily[] } {
  const positionalYear = args.find((arg) => !arg.startsWith("--"));
  const year = valueAfter(args, "--year") ?? positionalYear ?? DEFAULT_YEAR;
  if (!/^\d{4}$/.test(year)) {
    throw new Error(`Unsupported holdout year ${year}`);
  }
  const to = valueAfter(args, "--to") ?? `${year}-12-31`;
  const family = valueAfter(args, "--family");
  if (family && !isHoldoutFamily(family)) {
    throw new Error(`Unsupported --family ${family}`);
  }
  const families: BacktestCacheFamily[] = family === undefined ? HOLDOUT_FAMILIES : [family as BacktestCacheFamily];
  return {
    year,
    to,
    families,
  };
}

function valueAfter(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function isHoldoutFamily(value: string): value is BacktestCacheFamily {
  return value === "jump" || value === "all_weather_flat" || value === "turf_flat";
}

void main();

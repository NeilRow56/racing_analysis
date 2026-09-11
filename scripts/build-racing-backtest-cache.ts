import { createDbConnection } from "@/db";
import {
  buildBacktestFeatureCache,
  type BacktestCacheFamily,
} from "@/lib/racing/backtest-cache";

const DEFAULT_FROM = "2025-01-01";
const DEFAULT_TO = "2025-12-31";

type CliOptions = {
  from: string;
  to: string;
  family: BacktestCacheFamily;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { client, db } = createDbConnection();
  try {
    const result = await buildBacktestFeatureCache({
      db,
      from: options.from,
      to: options.to,
      family: options.family,
      onProgress: (message) => {
        console.log(`[cache] ${message}`);
      },
    });
    console.table([
      {
        directory: result.directory,
        targetRunnerIds: result.counts.targetRunnerIds,
        rows: result.manifest.rowCount,
        family: result.manifest.family,
        from: result.manifest.from,
        to: result.manifest.to,
        version: result.manifest.featureSchemaVersion,
        seconds: (result.elapsedMs / 1000).toFixed(1),
        loadTargetsMs: Math.round(result.timings.loadTargetRunnerIdsMs),
        buildFeaturesMs: Math.round(result.timings.buildFeatureRowsMs),
        writeMs: Math.round(result.timings.writeCacheMs),
        mb: (result.sizeBytes / 1024 / 1024).toFixed(2),
        heapMb: result.heapUsedMb,
      },
    ]);
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
    family,
  };
}

function isFamily(value: string): value is BacktestCacheFamily {
  return value === "all" ||
    value === "jump" ||
    value === "all_weather_flat" ||
    value === "turf_flat";
}

void main();

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createResearchCache } from "./research-cache";
import { BACKTEST_FEATURE_CACHE_VERSION, DEFAULT_BACKTEST_CACHE_DIR, loadLatestBacktestFeatureCacheForYear } from "./backtest-cache";
import type { ResearchRuleV1 } from "./research-rule";
import type { FrozenTissueModel, TissueForwardData } from "./tissue-forward";
import { cachedModelObservations, normalizedSpMarkets, RESEARCH_MODELS, storedTissueObservations } from "./research-model-comparison";
import { historicalSettlementEvidenceIdentity } from "./historical-settlement-evidence";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";

const cachedSources = createResearchCache<Awaited<ReturnType<typeof readResearchModelSources>>>();

// Reader only: these APIs never build caches, settle ledgers or write snapshots.
// Reuse the bounded research cache, checking source identity on every request.
export async function loadResearchModelSources(family: ResearchRuleV1["family"]) {
  let directories: string[] = [];
  try {
    directories = (await readdir(DEFAULT_BACKTEST_CACHE_DIR))
      .filter(name => name.startsWith(`${BACKTEST_FEATURE_CACHE_VERSION}-sporting_life-${family}-`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const paths = [
    ...directories.sort().flatMap(directory => ["manifest.json", "features.ndjson", "outcomes.ndjson"].map(name => join(DEFAULT_BACKTEST_CACHE_DIR, directory, name))),
    "data/research/tissue-forward-v3.json", "data/research/tissue-model-v3.json",
  ];
  const identity = await Promise.all(paths.map(async path => {
    try {
      const info = await stat(path, { bigint: true });
      return [path, String(info.ino), String(info.size), String(info.mtimeNs), String(info.ctimeNs)];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return [path, "missing"];
    }
  }));
  const evidenceIdentity = await historicalSettlementEvidenceIdentity();
  return cachedSources(JSON.stringify([CANONICAL_SETTLEMENT_VERSION, family, identity, evidenceIdentity]), () => readResearchModelSources(family));
}

async function readResearchModelSources(family: ResearchRuleV1["family"]) {
  const caches = await Promise.all(["2025", "2026"].map(year => loadLatestBacktestFeatureCacheForYear({ year, family })));
  const rows = caches.flatMap(cache => cache?.rows ?? []);
  const versions = caches.flatMap((cache, i) => cache ? [{ year: 2025 + i, schema: cache.manifest.featureSchemaVersion, source: cache.manifest.sourceFeatureVersion, calculations: cache.manifest.calculationVersions, runners: cache.rows.length, races: new Set(cache.rows.map(row => row.features.targetRaceId)).size, from: cache.actualCoverage?.actualFrom, to: cache.actualCoverage?.actualTo }] : []);
  let tissue: TissueForwardData | null = null;
  let model: FrozenTissueModel | null = null;
  let tissueError: string | null = null;
  try {
    [tissue, model] = await Promise.all([
      readFile("data/research/tissue-forward-v3.json", "utf8").then(text => JSON.parse(text) as TissueForwardData),
      readFile("data/research/tissue-model-v3.json", "utf8").then(text => JSON.parse(text) as FrozenTissueModel),
    ]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    tissueError = "Stored Turf Tissue V3 ledger or provenance artifact is unavailable.";
  }
  const stored = tissue && model ? storedTissueObservations(tissue, model, family === "turf_flat" ? rows : []) : { observations: [], excludedRaces: 0 };
  const markets = normalizedSpMarkets(rows);
  const models = RESEARCH_MODELS.map(option => ({ ...option,
    observations: option.id === "turf-v3" ? (family === "turf_flat" ? stored.observations : []) : cachedModelObservations(rows, option.id, markets),
    version: option.id === "turf-v3" ? "tissue_model_v3 / TURF_TISSUE_V3_PRERACE" : [...new Set(versions.map(v => `${v.schema} / ${option.id.includes("Speed") ? (family === "jump" ? v.calculations.jumpSpeed : family === "turf_flat" ? v.calculations.turfSpeed : v.calculations.awSpeed) : option.id.includes("Performance") ? v.calculations.weightPerformance : v.calculations.todaysRating}`))].join("; ") || "No compatible cache",
  }));
  return { rows, models, versions, tissueError, excludedTissueRaces: stored.excludedRaces,
    tissueRawCoverage: { races: tissue?.races.length ?? 0, runners: tissue?.races.reduce((sum, race) => sum + race.runners.length, 0) ?? 0 },
    training: model ? `${model.trainingWindow.from} to ${model.trainingWindow.to}; fitted ${model.trainedAt}; checksum ${model.checksum}` : "Unavailable" };
}

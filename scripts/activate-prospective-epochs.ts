import { readFile, writeFile, mkdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { COLLECTION_SEMANTICS, EPOCH_MANIFEST, EPOCH_ROOT, EPOCHS } from "@/lib/racing/prospective-epoch-config";
import { assertEpochSources, epochManifestSchema, loadEpochManifest, sha256 } from "@/lib/racing/prospective-epoch-integrity";
import { initializePositiveNeutral, loadPositiveNeutral, POSITIVE_NEUTRAL_PATH } from "@/lib/racing/tissue-positive-neutral";
import { HURDLE_V3_SHADOW_PATH, initializeHurdleV3Shadow, loadHurdleV3Shadow } from "@/lib/racing/hurdle-v3-shadow";
import { initializeHurdleMarketEdge, loadHurdleMarketEdge, MARKET_EDGE_PATH } from "@/lib/racing/hurdle-v3-market-edge";
import { loadTissueGenerationModels, generationModelPath } from "@/lib/racing/tissue-generation-model";
import { loadHurdleV3Challenger, HURDLE_V3_CHALLENGER_PATH } from "@/lib/racing/hurdle-v3-challenger-model";
import { loadAwV2Model, AW_TISSUE_V2_MODEL_PATH } from "@/lib/racing/aw-tissue-v2";
import { loadJumpTissueModel, JUMP_TISSUE_MODEL_PATH } from "@/lib/racing/jump-tissue-model";
import { loadFrozenTissueModel, TISSUE_V3_CONFIG } from "@/lib/racing/tissue-forward";
import { TISSUE_VALUE_FAMILIES } from "@/lib/racing/tissue-value-metrics";
import { CANONICAL_SETTLEMENT_VERSION } from "@/lib/racing/research-settlement-version";

export const ROOTS = ["scripts/track-tissue-generation.ts", "scripts/run-research-workflow.ts", "src/lib/racing/tissue-generation-sync.ts", "src/lib/racing/prospective-epoch-collection.ts",
  "src/lib/racing/hurdle-v3-shadow-sync.ts", "scripts/settle-research-results.ts", "scripts/activate-prospective-epochs.ts",
  "src/app/racing/today/tissue-market-badge.ts", "src/app/racing/research/forward-value/prospective-epoch-monitor.tsx"];
export async function buildDependencyProvenance(roots = ROOTS) {
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd()).options;
  const sourceHashes: Record<string, string> = {}, dependencyGraph: Record<string, string[]> = {};
  async function visit(path: string): Promise<void> {
    if (sourceHashes[path]) return;
    const bytes = await readFile(path); sourceHashes[path] = sha256(bytes);
    const dependencies = ts.preProcessFile(bytes.toString(), true, true).importedFiles.map(i => i.fileName);
    const resolved = dependencies.flatMap(name => {
      const target = ts.resolveModuleName(name, resolve(path), options, ts.sys).resolvedModule;
      if (target && !target.isExternalLibraryImport && !target.resolvedFileName.includes("node_modules/")) return [relative(process.cwd(), resolve(target.resolvedFileName))];
      if (name.startsWith(".") || name.startsWith("@/")) throw new Error(`Unresolved local dependency: ${path}: ${name}`);
      return [];
    });
    dependencyGraph[path] = [...new Set(resolved)].sort();
    for (const dependency of dependencyGraph[path]) await visit(dependency);
  }
  for (const root of roots) await visit(root);
  for (const path of ["package.json", "bun.lock", "tsconfig.json", ...TISSUE_VALUE_FAMILIES.map(generationModelPath),
    HURDLE_V3_CHALLENGER_PATH, AW_TISSUE_V2_MODEL_PATH, JUMP_TISSUE_MODEL_PATH, TISSUE_V3_CONFIG.modelPath]) {
    sourceHashes[path] = sha256(await readFile(path)); dependencyGraph[path] ??= [];
  }
  return { sourceHashes: Object.fromEntries(Object.entries(sourceHashes).sort()), dependencyGraph: Object.fromEntries(Object.entries(dependencyGraph).sort()) };
}
export async function verifyFrozenEpochModels() {
  const [production, challenger] = await Promise.all([loadTissueGenerationModels(), loadHurdleV3Challenger()]);
  const [aw, jump, turf] = await Promise.all([loadAwV2Model(), loadJumpTissueModel(), loadFrozenTissueModel(TISSUE_V3_CONFIG.modelPath, TISSUE_V3_CONFIG.modelVersion)]);
  return { ...Object.fromEntries(TISSUE_VALUE_FAMILIES.map(f => [f, { version: production[f].version, checksum: production[f].checksum }])),
    challenger: { version: challenger.version, checksum: challenger.checksum },
    awBase: { version: aw.version, checksum: aw.checksum }, jumpBase: { version: jump.version, checksum: jump.checksum }, turfBase: { version: turf.version, checksum: turf.checksum } };
}
export async function activateProspectiveEpochs() {
  if (await loadEpochManifest()) throw new Error("Epochs already activated; cannot reseal or restart");
  const models = await verifyFrozenEpochModels(), provenance = await buildDependencyProvenance();
  const originals = [POSITIVE_NEUTRAL_PATH, HURDLE_V3_SHADOW_PATH, MARKET_EDGE_PATH, "data/research/hurdle-low-form-prospective-v1.json", "data/research/tissue-generation-2026-11-manifest.json"];
  const originalEvidenceHashes = Object.fromEntries(await Promise.all(originals.map(async p => [p, sha256(await readFile(p))])));
  // Parse original routes before creating anything. No DB, capture, settlement or replay is run here.
  await Promise.all([loadPositiveNeutral(), loadHurdleV3Shadow(), loadHurdleMarketEdge()]);
  const now = new Date();
  await mkdir(EPOCH_ROOT, { recursive: true });
  // Exclusive writes. A partial failed preparation leaves no activation manifest and cannot collect.
  const positive = await initializePositiveNeutral(EPOCHS.positiveNeutral.ledger, now);
  const shadow = await initializeHurdleV3Shadow(EPOCHS.shadow.ledger, now);
  const edge = await initializeHurdleMarketEdge(EPOCHS.marketEdge.ledger, now);
  const manifest = epochManifestSchema.parse({ version: 2, activatedAt: now.toISOString(), collectionSemantics: COLLECTION_SEMANTICS,
    settlementVersion: CANONICAL_SETTLEMENT_VERSION, epochs: EPOCHS, shadowEpoch: EPOCHS.shadow.id, historicalBackfill: false,
    models, rules: { positiveNeutral: positive.rules, marketEdge: edge.rules, shadow: { v2Version: shadow.v2Version, v3Version: shadow.v3Version, tagVersion: shadow.tagVersion, ledCoefficient: shadow.ledCoefficient, comparison: "Frozen T1/T2; unchanged official/LED comparisons; first eligible production capture only" } },
    ...provenance, roots: ROOTS, originalEvidenceHashes });
  await assertEpochSources(manifest);
  for (const [path, digest] of Object.entries(originalEvidenceHashes)) if (sha256(await readFile(path)) !== digest) throw new Error(`Original evidence changed during activation: ${path}`);
  if ([positive, shadow, edge].some(d => d.observations.length || d.epoch !== null)) throw new Error("Nonempty new epoch");
  await writeFile(EPOCH_MANIFEST, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] !== "activate" || process.argv.length !== 3) throw new Error("Usage: bun scripts/activate-prospective-epochs.ts activate");
  const manifest = await activateProspectiveEpochs();
  console.log(JSON.stringify({ activatedAt: manifest.activatedAt, epochs: EPOCHS, sources: Object.keys(manifest.sourceHashes).length, historicalBackfill: false }, null, 2));
}

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { COLLECTION_SEMANTICS, EPOCH_MANIFEST, EPOCHS } from "./prospective-epoch-config";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const epochManifestSchema = z.object({
  version: z.literal(2), activatedAt: z.iso.datetime(), collectionSemantics: z.literal(COLLECTION_SEMANTICS),
  settlementVersion: z.literal(CANONICAL_SETTLEMENT_VERSION), epochs: z.object({
    positiveNeutral: z.object({ id: z.literal(EPOCHS.positiveNeutral.id), ledger: z.literal(EPOCHS.positiveNeutral.ledger) }).strict(),
    shadow: z.object({ id: z.literal(EPOCHS.shadow.id), ledger: z.literal(EPOCHS.shadow.ledger) }).strict(),
    marketEdge: z.object({ id: z.literal(EPOCHS.marketEdge.id), ledger: z.literal(EPOCHS.marketEdge.ledger) }).strict(),
  }).strict(),
  shadowEpoch: z.literal(EPOCHS.shadow.id), historicalBackfill: z.literal(false),
  models: z.record(z.string(), z.object({ version: z.string(), checksum: hash }).strict()),
  rules: z.record(z.string(), z.unknown()), sourceHashes: z.record(z.string(), hash),
  dependencyGraph: z.record(z.string(), z.array(z.string())), roots: z.array(z.string()).min(1),
  originalEvidenceHashes: z.record(z.string(), hash),
}).strict();
export type EpochManifest = z.infer<typeof epochManifestSchema>;
export const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
export async function loadEpochManifest(path = EPOCH_MANIFEST) {
  try { return epochManifestSchema.parse(JSON.parse(await readFile(path, "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
function assertCompleteProvenance(manifest: EpochManifest) {
  const seen = new Set<string>();
  function visit(path: string) {
    if (seen.has(path)) return;
    if (!manifest.sourceHashes[path] || !manifest.dependencyGraph[path]) throw new Error(`Incomplete epoch provenance: ${path}`);
    seen.add(path); manifest.dependencyGraph[path].forEach(visit);
  }
  manifest.roots.forEach(visit);
}
export async function assertEpochSources(manifest: EpochManifest) {
  assertCompleteProvenance(manifest);
  for (const [path, expected] of Object.entries(manifest.sourceHashes)) {
    if (sha256(await readFile(path)) !== expected) throw new Error(`Epoch source-pin mismatch: ${path}`);
  }
}
export async function requireCollectionEpoch(armedAt: string) {
  const manifest = await loadEpochManifest();
  if (!manifest || manifest.activatedAt !== armedAt || Date.parse(armedAt) > Date.now()) throw new Error("New collection epoch is not active");
  await assertEpochSources(manifest);
  return manifest;
}

/** Recheck after acquiring the existing ledger lock, immediately before append. */
export function requireCollectionEpochSync(armedAt: string) {
  const manifest = epochManifestSchema.parse(JSON.parse(readFileSync(EPOCH_MANIFEST, "utf8")));
  assertCompleteProvenance(manifest);
  if (manifest.activatedAt !== armedAt || Date.parse(armedAt) > Date.now()) throw new Error("New collection epoch is not active");
  for (const [path, expected] of Object.entries(manifest.sourceHashes)) {
    if (sha256(readFileSync(path)) !== expected) throw new Error(`Epoch source-pin mismatch: ${path}`);
  }
  return manifest;
}

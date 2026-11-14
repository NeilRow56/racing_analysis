/** Read-only: compare all epoch pins, dependency edges and frozen model fingerprints. */
import assert from "node:assert/strict";
import { assertEpochSources, loadEpochManifest } from "../src/lib/racing/prospective-epoch-integrity";
import { buildDependencyProvenance, verifyFrozenEpochModels } from "./activate-prospective-epochs";
const manifest = await loadEpochManifest();
assert.ok(manifest);
await assertEpochSources(manifest);
const current = await buildDependencyProvenance();
assert.deepEqual(current.sourceHashes, manifest.sourceHashes);
assert.deepEqual(current.dependencyGraph, manifest.dependencyGraph);
assert.deepEqual(await verifyFrozenEpochModels(), manifest.models);
console.info(`Validated ${Object.keys(manifest.sourceHashes).length} source pins, dependency graph and frozen models; no writes.`);

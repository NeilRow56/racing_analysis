/** Offline regression of six fixed audited snapshots; never loads/rebuilds a compatible cache or writes source data. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { rowsFromCachedParts, type BacktestFeatureCacheManifest } from "../src/lib/racing/backtest-cache";
import { evaluateResearchRule, parseResearchRule } from "../src/lib/racing/research-rule";
import { withHistoricalSettlementEvidence } from "../src/lib/racing/historical-settlement-evidence";
import type { HistoricalPreRaceFeatureRow, HistoricalPostRaceOutcome } from "../src/lib/racing/historical-target-metrics";
import type { TrainerCohortMember, ResolvedTrainerCohort } from "../src/lib/racing/trainer-cohort-mode";
import { settleSelection } from "../src/lib/racing/backtest";
import { CANONICAL_SETTLEMENT_VERSION } from "../src/lib/racing/research-settlement-version";

const audit = "data/research/void-settlement-audit-2026-11-11-sEoXNC";
const output = process.argv[2];
assert.ok(output?.startsWith("data/research/settlement-v3-validation-"), "Supply a new isolated validation report directory");
async function json<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, "utf8")) as T; }
const fingerprints = new Map<string, string>();
async function fingerprint(path: string, expected?: string) {
  const hash = createHash("sha256").update(await readFile(path)).digest("hex");
  if (expected) assert.equal(hash, expected, `Protected evidence changed: ${path}`);
  fingerprints.set(path, hash);
}
type Snapshot = { profitLoss: number; settledSelections: number; holdoutFrom?: string; holdoutTo?: string; settlementVersion?: string };
type AuditedSnapshot = { id: string; name: string; phase: string; cache: string; cohortMembers: TrainerCohortMember[]; snapshot: Snapshot; bookRulesCounterfactual: { settled: number; profit: number; roi: number } };
type Runner = { id: string; race_id: string; horse_id: string; source: string; raceDate: string; outcome_code: string | null; finishing_position: number | null; result_status: string | null; starting_price_decimal: string | null };
type Race = { raceId: string; stage: string | null; sourceType: string };
const snapshots = await json<{ records: AuditedSnapshot[] }>(join(audit, "frozen-snapshot-audit.json"));
const database = await json<{ races: Race[]; runners: Runner[]; savedRules: { id: string; canonical_rule: unknown }[] }>(join(audit, "database-evidence.json"));
const impact = await json<{
  cacheMatrix: { directory: string; sha256: { manifest: string; outcomes: string } }[];
  snapshotReferences: { file: string; sha256: string }[];
  voidPopulation: { raceId: string; sourceId: string; runnerRecords: number }[];
  deadHeatPopulation: { raceId: string }[];
  otherWinnerlessSettledLosses: { raceId: string; runnerIds: string[] }[];
}>(join(audit, "impact.json"));
for (const file of ["frozen-snapshot-audit.json", "database-evidence.json", "impact.json"]) await fingerprint(join(audit, file));
const sources = await json<{ sources: { path: string; sha256: string }[] }>(join(audit, "source-verification.json"));
for (const source of sources.sources) await fingerprint(source.path, source.sha256);
const auditReferenceDifferences: { file: string; auditHash: string; currentHash: string }[] = [];
for (const reference of impact.snapshotReferences) {
  await fingerprint(reference.file);
  const currentHash = fingerprints.get(reference.file)!;
  if (currentHash !== reference.sha256) auditReferenceDifferences.push({ file: reference.file, auditHash: reference.sha256, currentHash });
}
for (const cache of impact.cacheMatrix) {
  await fingerprint(join(cache.directory, "manifest.json"), cache.sha256.manifest);
  const manifest = await json<BacktestFeatureCacheManifest>(join(cache.directory, "manifest.json"));
  await fingerprint(join(cache.directory, manifest.outcomesFile), cache.sha256.outcomes);
}
const stages = new Map<string, string | null>();
for (const race of database.races) if (!stages.has(race.raceId) || race.sourceType === "full-result-next-data") stages.set(race.raceId, race.stage);
const evidence = database.runners.map(r => ({ runnerId: r.id, raceId: r.race_id, horseId: r.horse_id, source: r.source,
  raceDate: r.raceDate, raceStage: stages.get(r.race_id) ?? null, outcomeCode: r.outcome_code,
  finishingPosition: r.finishing_position, resultStatus: r.result_status }));
const results = [];
for (const saved of snapshots.records) {
  const manifest = await json<BacktestFeatureCacheManifest>(join(saved.cache, "manifest.json"));
  await fingerprint(join(saved.cache, manifest.featuresFile));
  await fingerprint(join(saved.cache, manifest.outcomesFile));
  const features = (await readFile(join(saved.cache, manifest.featuresFile), "utf8")).trim().split("\n").map(line => {
    const row = JSON.parse(line) as HistoricalPreRaceFeatureRow;
    return { ...row, raceDateTime: new Date(row.raceDateTime) };
  });
  const outcomes = (await readFile(join(saved.cache, manifest.outcomesFile), "utf8")).trim().split("\n").map(line => JSON.parse(line) as HistoricalPostRaceOutcome);
  const rule = parseResearchRule(JSON.stringify(database.savedRules.find(r => r.id === saved.id)!.canonical_rule));
  assert.ok(rule);
  if (saved.phase === "holdout") rule.dateRange = { from: saved.snapshot.holdoutFrom!, to: saved.snapshot.holdoutTo! };
  const first = saved.cohortMembers[0];
  const cohort: ResolvedTrainerCohort | null = rule.runner.trainerCohort && first ? {
    definition: rule.runner.trainerCohort, cohortYear: first.cohortYear, referenceYear: first.referenceYear,
    family: first.family, members: saved.cohortMembers, trainerIds: new Set(saved.cohortMembers.map(m => m.trainerId)),
  } : null;
  const rows = withHistoricalSettlementEvidence(rowsFromCachedParts({ features, outcomes }), evidence);
  const result = evaluateResearchRule({ rows, rule, trainerCohort: cohort });
  assert.equal(result.summary.settledSelections, saved.bookRulesCounterfactual.settled, `${saved.name}: stakes`);
  assert.ok(Math.abs(result.summary.profitLoss - saved.bookRulesCounterfactual.profit) < 1e-8, `${saved.name}: profit ${result.summary.profitLoss}`);
  assert.equal(result.settlementVersion, CANONICAL_SETTLEMENT_VERSION);
  results.push({ name: saved.name, phase: saved.phase, cache: saved.cache,
    originalReported: saved.snapshot, correctedRecalculation: result.summary, settlementVersion: result.settlementVersion,
    selectedRunnerIds: result.selectedRunners.map(r => r.features.targetRunnerId),
    provenance: "Audited reconstructed trainer cohorts; exact original selection lineage was not retained. Archival cache read directly for regression only; compatibility checks are not bypassed in the application." });
}
function outcome(r: Runner): HistoricalPostRaceOutcome {
  return { targetRaceId: r.race_id, targetRunnerId: r.id, raceStage: stages.get(r.race_id), outcomeCode: r.outcome_code,
    finishingPosition: r.finishing_position, resultStatus: r.result_status, won: r.finishing_position === 1,
    placed: null, startingPrice: null, startingPriceDecimal: r.starting_price_decimal };
}
const voidIds = new Set(impact.voidPopulation.map(r => r.raceId));
const voidRows = database.runners.filter(r => voidIds.has(r.race_id));
assert.equal(voidRows.length, 80);
assert.ok(voidRows.every(r => settleSelection(outcome(r)) === null));
const nonfinalIds = new Set(impact.otherWinnerlessSettledLosses.flatMap(r => r.runnerIds));
const nonfinalRows = database.runners.filter(r => nonfinalIds.has(r.id));
assert.equal(nonfinalRows.length, 189);
assert.ok(nonfinalRows.every(r => settleSelection(outcome(r)) === null));
const deadHeatIds = new Set(impact.deadHeatPopulation.map(r => r.raceId));
const deadHeatWinners = database.runners.filter(r => deadHeatIds.has(r.race_id) && r.finishing_position === 1);
assert.equal(deadHeatWinners.length, 68);
for (const runner of deadHeatWinners) assert.equal(settleSelection({ ...outcome(runner), deadHeatDivisor: 2 })!.grossReturn, Number(runner.starting_price_decimal) / 2);
// Verify bytes after every calculation. Existing records are never persisted.
for (const [path, hash] of fingerprints) await fingerprint(path, hash);
await mkdir(output, { recursive: false });
await writeFile(join(output, "validation.json"), JSON.stringify({ settlementVersion: CANONICAL_SETTLEMENT_VERSION,
  voidRaces: voidIds.size, voidRows: voidRows.length, deadHeatRaces: deadHeatIds.size, deadHeatWinners: deadHeatWinners.length,
  unresolvedNonfinalRows: nonfinalRows.length, results, auditReferenceDifferences, protectedFiles: Object.fromEntries(fingerprints), protectedFilesUnchanged: true }, null, 2) + "\n");
console.log(JSON.stringify({ output, snapshots: results.map(r => ({ name: r.name, phase: r.phase, ...r.correctedRecalculation })), protectedFiles: fingerprints.size }, null, 2));

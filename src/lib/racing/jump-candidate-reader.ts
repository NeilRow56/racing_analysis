import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { isCompatibleManifest, type BacktestFeatureCacheManifest } from "./backtest-cache";
import type { HistoricalPostRaceOutcome, HistoricalPreRaceFeatureRow } from "./historical-target-metrics";
import { settlementOutcomeState } from "./settlement-outcome";
import { settleSelection } from "./backtest";
import {
  analyzeCandidateRace, candidateCoverage, CANDIDATE_FEATURES, JUMP_CANDIDATE_WARNING,
  type CandidateFeature, type CandidateFieldEvidence, type CandidateRow, type CandidateSidecar,
} from "./jump-candidate-eligibility";

export const ISOLATED_JUMP_CANDIDATE = "data/research/jump-2026-isolated-candidate-2026-11-11-vKE4Te";
const CACHE = "cache/backtest_features_v4-sporting_life-jump-2026-01-01-2026-10-14";
// These are evidence identities, not new/replacement sidecars. A changed source fails closed.
export const JUMP_CANDIDATE_PINS: Readonly<Record<string, string>> = Object.freeze({
  "candidate-provenance.json": "9bb3a4fdb414308c68cab605ff8294076ba2c05595b27937f3ecf9bdd92f55f0",
  "prebuild.json": "f0a90e625f2e0f8d95132624654dd65fbfd2fbe1c5450d500e2d3c413e88353d",
  "eligibility.ndjson": "7a1c593abbf7f8b8bdb8800b78f31cbb618e523afde12373ae3bbf14cce2b90b",
  "database-races.json": "76fb4c73e8db2c23b24d8d61dbbe839ebb9a05f96ff2d6ef2c2d7ee33bdbf173",
  "database-runners.json": "cbc9ad5778f2bd43720604f5580d57b90e179cbd0f94edbe024dfb080fcb38e9",
  "validation.json": "daa8bab83f784822ef6041d1272919857be37f792650085bc2ffdd34e656daf3",
  "exclusion-summary.json": "60d5ea2202b6266173b0069997474f2360689cd128b695616a7f3967c4a31c37",
  [`${CACHE}/manifest.json`]: "9e32f91f75b3ec6b198ede2ffe568f069697fc1303bdd2b6f0adcdee3b912260",
  [`${CACHE}/features.ndjson`]: "23b50dbb51cb1b19943d9e453d96ea79cdb74aafa1ffe94ceda51c1b4922de93",
  [`${CACHE}/outcomes.ndjson`]: "cf63d22701e9f80f74b245ec7142ef1031223d6e7833eaead7fd20b82ad69997",
});
export const candidateSha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
export function verifyCandidateBytes(path: string, bytes: string | Buffer) {
  if (!JUMP_CANDIDATE_PINS[path] || candidateSha256(bytes) !== JUMP_CANDIDATE_PINS[path]) throw new Error(`Candidate evidence hash mismatch: ${path}`);
}
const lines = <T>(text: string): T[] => text.trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as T);
const rawSchema = z.object({ props: z.object({ pageProps: z.object({ race: z.object({
  race_summary: z.object({ date: z.string(), race_stage: z.string(), ride_count: z.number().int().positive(), race_summary_reference: z.object({ id: z.number().int() }) }),
  rides: z.array(z.object({ ride_reference: z.object({ id: z.number().int() }), ride_status: z.string(), finish_position: z.number().int().optional(), casualty: z.object({ type: z.string().optional(), short_name: z.string().optional(), name: z.string().optional(), reason: z.string().optional() }).optional() })),
}) }) }) });
type RaceIdentity = { id: string; source_id: string; date: string; stage: string | null; full_count: number };
type RunnerIdentity = { id: string; source_id: string; race_id: string; horse_id: string; finishing_position: number | null; result_status: string | null; outcome_code: string | null; sp: string | null };

/** Proof requires exact source ride identities, independent ride_count, final state,
 * and matching outcome classifications. No cached runner count participates. */
export function verifyCandidateFullResult(input: {
  payload: unknown; race: RaceIdentity; runners: readonly RunnerIdentity[]; rows: readonly CandidateRow[]; sourcePath: string; sha256: string;
}): CandidateFieldEvidence | null {
  const parsed = rawSchema.safeParse(input.payload);
  if (!parsed.success) return null;
  const raw = parsed.data.props.pageProps.race, summary = raw.race_summary;
  if (String(summary.race_summary_reference.id) !== input.race.source_id || summary.date !== input.race.date
    || summary.race_stage !== input.race.stage || !["WEIGHEDIN", "OFFICIAL", "COMPLETED"].includes(summary.race_stage) || input.race.full_count !== 1) return null;
  const bySource = new Map(input.runners.map(r => [r.source_id, r]));
  if (bySource.size !== input.runners.length || raw.rides.length !== input.rows.length || input.runners.length !== input.rows.length) return null;
  const candidateById = new Map(input.rows.map(r => [r.row.features.targetRunnerId, r]));
  const runnerIds: string[] = [], starterIds: string[] = [], nonRunnerIds: string[] = [];
  for (const ride of raw.rides) {
    const runner = bySource.get(String(ride.ride_reference.id));
    if (!runner || runnerIds.includes(runner.id)) return null;
    const candidate = candidateById.get(runner.id);
    if (!candidate || candidate.row.features.horseId !== runner.horse_id || runner.race_id !== input.race.id) return null;
    const position = (ride.finish_position ?? 0) > 0 ? ride.finish_position! : null;
    const casualty = ride.casualty;
    const rawCode = casualty?.type || casualty?.short_name || casualty?.name || casualty?.reason || (ride.ride_status === "RUNNER" && ride.finish_position !== undefined ? String(ride.finish_position) : ride.ride_status);
    // Match the importer: casualty evidence precedes ride_status. A withdrawn
    // RefusedToRace runner is a canonical loss, not a genuine non-runner.
    const nr = ["NONRUNNER", "NON_RUNNER", "NON-RUNNER", "WITHDRAWN", "NR"].includes(rawCode);
    const state = settlementOutcomeState({ raceStage: summary.race_stage, finishingPosition: position, resultStatus: nr ? "non_runner" : null, outcomeCode: rawCode });
    if (state !== settlementOutcomeState(candidate.row.outcome) || position !== candidate.row.outcome.finishingPosition || !["NR", "win", "loss"].includes(state)) return null;
    runnerIds.push(runner.id); (nr ? nonRunnerIds : starterIds).push(runner.id);
  }
  if (summary.ride_count !== starterIds.length || !starterIds.length) return null;
  return { raceId: input.race.id, runnerIds, starterIds, nonRunnerIds, sourcePath: input.sourcePath, sha256: input.sha256 };
}
function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) freezeDeep(child); }
  return value;
}

/** Explicit isolated read. Does not use the default cache reader (which may resolve
 * evidence from the database), register a source, or expose mutable cache rows. */
export async function readIsolatedJumpCandidate() {
  const entries = await Promise.all(Object.keys(JUMP_CANDIDATE_PINS).map(async path => {
    const bytes = await readFile(join(ISOLATED_JUMP_CANDIDATE, path)); verifyCandidateBytes(path, bytes); return [path, bytes.toString("utf8")] as const;
  }));
  const contents = new Map(entries);
  const manifest = JSON.parse(contents.get(`${CACHE}/manifest.json`)!) as BacktestFeatureCacheManifest;
  if (!isCompatibleManifest(manifest, { from: "2026-01-01", to: "2026-10-14", family: "jump" }) || manifest.settlementVersion !== "canonical_settlement_v3") throw new Error("Incompatible isolated candidate");
  const features = lines<HistoricalPreRaceFeatureRow>(contents.get(`${CACHE}/features.ndjson`)!);
  const outcomes = lines<HistoricalPostRaceOutcome>(contents.get(`${CACHE}/outcomes.ndjson`)!);
  const sidecar = lines<CandidateSidecar>(contents.get("eligibility.ndjson")!);
  const races = JSON.parse(contents.get("database-races.json")!) as RaceIdentity[];
  const runners = JSON.parse(contents.get("database-runners.json")!) as RunnerIdentity[];
  const byId = new Map(sidecar.map(e => [e.runnerId, e]));
  const sourceRunnerById = new Map(runners.map(r => [r.id, r]));
  if (features.length !== 32901 || outcomes.length !== features.length || sidecar.length !== features.length || byId.size !== features.length) throw new Error("Candidate population mismatch");
  const grouped = new Map<string, CandidateRow[]>(), seen = new Set<string>();
  for (const [i, f] of features.entries()) {
    const o = outcomes[i], e = byId.get(f.targetRunnerId), identity = sourceRunnerById.get(f.targetRunnerId);
    if (!e || seen.has(f.targetRunnerId) || o.targetRunnerId !== f.targetRunnerId || o.targetRaceId !== f.targetRaceId || e.raceId !== f.targetRaceId || !identity || identity.race_id !== f.targetRaceId || identity.horse_id !== f.horseId
      || identity.finishing_position !== o.finishingPosition || identity.result_status !== o.resultStatus || identity.outcome_code !== o.outcomeCode || identity.sp !== o.startingPriceDecimal) throw new Error("Candidate identity/outcome mismatch");
    if (e.settlementState !== settlementOutcomeState(o) || e.referenceEligible !== !!(settleSelection(o) && e.threeBestL3Finite)) throw new Error("Candidate sidecar settlement mismatch");
    seen.add(f.targetRunnerId);
    const list = grouped.get(f.targetRaceId) ?? []; list.push({ row: { features: f, outcome: o }, evidence: e }); grouped.set(f.targetRaceId, list);
  }
  // A dedicated raw source index; absent/ambiguous payloads withhold field proof.
  const rawDir = "data/raw/sporting-life", files = await readdir(rawDir);
  const sourcePaths = new Map<string, string[]>();
  for (const file of files) { const match = file.match(/-(\d+)-full-result-next-data\.json$/); if (match) sourcePaths.set(match[1], [...(sourcePaths.get(match[1]) ?? []), join(rawDir, file)]); }
  const sourceByRace = new Map(races.map(r => [r.id, r]));
  const recovered = (JSON.parse(contents.get("prebuild.json")!) as { recovered: { sourceId: string; file: string; sha256: string }[] }).recovered;
  const recoveredBySource = new Map(recovered.map(r => [r.sourceId, r]));
  const runnersByRace = new Map<string, RunnerIdentity[]>();
  for (const r of runners) if (grouped.has(r.race_id)) { const list = runnersByRace.get(r.race_id) ?? []; list.push(r); runnersByRace.set(r.race_id, list); }
  const proofs = new Map<string, CandidateFieldEvidence>();
  const fieldFailures: Record<string, string> = {};
  // Sequential reads bound memory; no external sources or database access.
  for (const [id, rows] of grouped) {
    const race = sourceByRace.get(id), recovery = race ? recoveredBySource.get(race.source_id) : undefined;
    // The audit verified eleven full results retained under racecard filenames.
    // Accept only those exact recorded bytes; never generalize from the filename.
    const paths = race ? sourcePaths.get(race.source_id) ?? (recovery ? [recovery.file] : undefined) : undefined;
    if (!race || paths?.length !== 1) { fieldFailures[id] = "missing_or_ambiguous_full_result_payload"; continue; }
    try {
      const bytes = await readFile(paths[0]);
      if (recovery && paths[0] === recovery.file && candidateSha256(bytes) !== recovery.sha256) { fieldFailures[id] = "recovered_full_result_hash_mismatch"; continue; }
      const proof = verifyCandidateFullResult({ payload: JSON.parse(bytes.toString()), race, rows, runners: runnersByRace.get(id) ?? [], sourcePath: paths[0], sha256: candidateSha256(bytes) });
      if (proof) proofs.set(id, proof); else fieldFailures[id] = "full_result_field_verification_failed";
    } catch (error) {
      if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      fieldFailures[id] = "full_result_payload_unreadable";
    }
  }
  const reference = sidecar.filter(e => e.referenceEligible);
  const audit = {
    runners: features.length, races: grouped.size, historicalSPSettlementPopulation: outcomes.filter(o => settleSelection(o)).length,
    referenceEligible: reference.length, strictRatingObservations: sidecar.filter(e => e.strictExploratoryUsable).length,
    broadContextOnlyExclusions: reference.filter(e => !e.strictExploratoryUsable && !e.definiteUntimedPriorIds.length && !e.uncertainPriorIds.length && !e.hiddenActualL3Ids.length && (e.potentialAnyContextCount > 0 || e.potentialL3ContextIds.length > 0)).length,
    referenceDependencyExclusions: reference.filter(e => !e.strictExploratoryUsable).length,
  };
  if (audit.races !== 3353 || audit.historicalSPSettlementPopulation !== 29856 || audit.referenceEligible !== 25251 || audit.strictRatingObservations !== 10661 || audit.broadContextOnlyExclusions !== 13737 || audit.referenceDependencyExclusions !== 14590) throw new Error("Published candidate audit totals mismatch");
  return Object.freeze({
    warning: JUMP_CANDIDATE_WARNING, activated: false, audit: freezeDeep(audit),
    sourceId: ISOLATED_JUMP_CANDIDATE.split("/").at(-1)!, buildDate: manifest.generatedAt,
    sourcePins: JUMP_CANDIDATE_PINS, fieldProofs: freezeDeep([...proofs.values()]), fieldFailures: freezeDeep(fieldFailures),
    analyze(feature: CandidateFeature) {
      if (!(CANDIDATE_FEATURES as readonly string[]).includes(feature)) throw new Error(`Unsupported candidate feature: ${feature}`);
      const result = [...grouped].map(([id, rows]) => analyzeCandidateRace(rows, feature, proofs.get(id)));
      return freezeDeep({ warning: JUMP_CANDIDATE_WARNING, coverage: candidateCoverage(result, feature), races: result });
    },
  });
}

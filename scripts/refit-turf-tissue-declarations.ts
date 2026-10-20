import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { declarationOnlyTurfFeatures } from "../src/lib/racing/turf-tissue-training-semantics";
import type { HistoricalPostRaceOutcome, HistoricalPreRaceFeatureRow } from "../src/lib/racing/historical-target-metrics";
import { TISSUE_V2_CONFIG, TISSUE_V3_CONFIG, TISSUE_V3_LIVE_SEMANTICS_VERSION } from "../src/lib/racing/tissue-forward";
import { buildExamples, fitModel, groupIndexes, metrics, predict, type HistoricalComment } from "./diagnose-independent-tissue-feasibility";

// Rebuild v3 separately; the original v2 artifact and all trackers are read-only.
const OUTPUT = TISSUE_V3_CONFIG.modelPath;
const REPORT = "/tmp/turf-tissue-v3-validation.json";
export async function refitTurfTissueDeclarations() {
  const originalBytes = await readFile(TISSUE_V2_CONFIG.modelPath);
  const original = JSON.parse(originalBytes.toString());
  const readLines = async <T>(path: string): Promise<T[]> => (await readFile(path, "utf8")).trim().split("\n").map(line => JSON.parse(line) as T);
  const load = async (year: number) => {
    const directory = `data/research/backtest-cache/backtest_features_v4-sporting_life-turf_flat-${year}-01-01-${year}-12-31`;
    const [features, outcomes, manifest] = await Promise.all([
      readLines<HistoricalPreRaceFeatureRow>(`${directory}/features.ndjson`),
      readLines<HistoricalPostRaceOutcome>(`${directory}/outcomes.ndjson`),
      readFile(`${directory}/manifest.json`, "utf8").then(JSON.parse),
    ]);
    assert.equal(manifest.calculationVersions.turfSpeed, "turf_speed_v2");
    const byRunner = new Map(outcomes.map(row => [row.targetRunnerId, row]));
    const rows = features.map(f => ({ features: { ...f, raceDateTime: new Date(f.raceDateTime) }, outcome: byRunner.get(f.targetRunnerId)! }));
    assert(rows.every(row => row.outcome));
    return { rows, manifest, directory };
  };
  const [trainingCache, holdoutCache] = await Promise.all([load(2025), load(2026)]);
  const cutoffs = new Map<string, Date>();
  for (const { features: f } of [...trainingCache.rows, ...holdoutCache.rows]) {
    if (!cutoffs.has(f.horseId) || cutoffs.get(f.horseId)! < f.raceDateTime) cutoffs.set(f.horseId, f.raceDateTime);
  }
  const client = postgres(process.env.DATABASE_URL!, { max: 1, connect_timeout: 8, connection: { default_transaction_read_only: true, statement_timeout: 60000 } });
  try {
    const mode = await client`show default_transaction_read_only`;
    assert.equal(mode[0]!.default_transaction_read_only, "on");
    const targets = [...cutoffs].map(([horse_id, cutoff]) => ({ horse_id, cutoff: cutoff.toISOString() }));
    const comments = await client<Array<HistoricalComment & { horseId: string }>>`
      with targets as (select * from jsonb_to_recordset(${client.json(targets)}::jsonb) as t(horse_id uuid, cutoff timestamptz))
      select rr.horse_id as "horseId", r.id as "raceId", r.race_date::text as "raceDate", r.race_datetime as "raceDateTime", rr.runner_comment as comment
      from targets join race_runners rr on rr.horse_id = targets.horse_id
      join races r on r.id = rr.race_id and r.race_datetime < targets.cutoff
      where r.source = 'sporting_life' and rr.runner_comment is not null and btrim(rr.runner_comment) <> '' and coalesce(rr.result_status, '') <> 'non_runner'
      order by rr.horse_id, r.race_datetime`;
    const grouped = new Map<string, HistoricalComment[]>();
    for (const row of comments) {
      const list = grouped.get(row.horseId) ?? [];
      list.push({ ...row, raceDateTime: new Date(row.raceDateTime) });
      grouped.set(row.horseId, list);
    }
    const rebuild = (cache: typeof trainingCache) => buildExamples(cache.rows.map(row => ({ ...row, features: declarationOnlyTurfFeatures(row.features) })), grouped);
    const training = rebuild(trainingCache), holdout = rebuild(holdoutCache);
    const originalTraining = buildExamples(trainingCache.rows, grouped);
    assert.equal(training.length, original.trainingSample.runners);
    assert.equal(groupIndexes(training).length, original.trainingSample.races);
    // Prove the original data/comments still reproduce the original fitted inputs.
    const raw = originalTraining.map(e => [...e.numeric, ...e.comments]);
    const means = original.model.names.map((_: string, i: number) => raw.reduce((sum, row) => sum + row[i]!, 0) / raw.length);
    const scales = means.map((mean: number, i: number) => Math.max(Math.sqrt(raw.reduce((sum, row) => sum + (row[i]! - mean) ** 2, 0) / raw.length), 1e-6));
    assert.deepEqual(means, original.model.means);
    assert.deepEqual(scales, original.model.scales);
    console.log(`Refitting declarations-only v3: ${training.length} training / ${holdout.length} holdout runners`);
    const model = fitModel(training, true);
    assert.deepEqual(model.names, original.model.names);
    assert.equal(model.names.length, 95);
    const specification = { ...original.specification, fieldSizeSource: "declared_runner_count_only", drawFractionDenominator: "declared_runner_count_only", liveSemanticsVersion: TISSUE_V3_LIVE_SEMANTICS_VERSION, prospectiveHistoryCutoff: "capture_datetime", historicalHistoryCutoff: "target_race_datetime", targetOutcomeFeatures: false };
    const checksum = createHash("sha256").update(JSON.stringify({ specification, model })).digest("hex");
    predict(holdout, original.model, true, "numericProbability");
    predict(holdout, model, true, "commentProbability");
    for (const indexes of groupIndexes(holdout)) assert(Math.abs(indexes.reduce((s, i) => s + holdout[i]!.commentProbability!, 0) - 1) < 1e-12);
    const candidate = { ...original, version: TISSUE_V3_CONFIG.modelVersion, trainedAt: new Date().toISOString(), parentModel: { version: original.version, checksum: original.checksum }, trainingSample: { races: groupIndexes(training).length, runners: training.length }, sourceCache: { ...original.sourceCache, declarationsRebuiltFrom: trainingCache.directory, historicalCaptureSnapshotsAvailable: false }, specification, checksum, model, status: "frozen" };
    const validation = { originalArtifactUnchanged: (await readFile(TISSUE_V2_CONFIG.modelPath)).equals(originalBytes), maximumOriginalMeanError: 0, maximumOriginalScaleError: 0, training: candidate.trainingSample, holdout: { originalOnDeclarationInputs: metrics(holdout, "numericProbability"), refitOnDeclarationInputs: metrics(holdout, "commentProbability") }, changedScalerColumns: model.names.filter((_, i) => model.means[i] !== original.model.means[i] || model.scales[i] !== original.model.scales[i]), changedCoefficients: model.weights.filter((w, i) => w !== original.model.weights[i]).length, limitation: "Cached declared counts are retrospective metadata, not immutable early-capture snapshots. This removes result-count dependence but does not prove historical capture-time provenance.", productionDefault: TISSUE_V3_CONFIG.modelVersion };
    assert(validation.originalArtifactUnchanged);
    let existing: { version: string; checksum: string } | null = null;
    try { existing = JSON.parse(await readFile(OUTPUT, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (existing) {
      assert.equal(existing.version, candidate.version);
      assert.equal(existing.checksum, checksum, "Frozen v3 differs: allocate a new model version instead of overwriting it");
    } else await writeFile(OUTPUT, JSON.stringify(candidate, null, 2) + "\n", { flag: "wx" });
    await writeFile(REPORT, JSON.stringify(validation, null, 2) + "\n");
    console.log(JSON.stringify({ output: OUTPUT, report: REPORT, ...validation }));
  } finally { await client.end({ timeout: 2 }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await refitTurfTissueDeclarations();

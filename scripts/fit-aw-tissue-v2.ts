import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { fitModel, loadHistoricalComments, priorCommentsForTarget, commentVector, predict, metrics, groupIndexes, raceSoftmax, type Example } from "./diagnose-independent-tissue-feasibility";
import { AW_V2_NAMES, AW_TISSUE_V2_SCHEMA, AW_SURFACE_FEATURE_POLICY } from "../src/lib/racing/aw-tissue-v2-features";
import { AW_SURFACE_MAPPING_VERSION } from "../src/lib/racing/aw-surface-material";
import { loadAwTissueModel, awTissueModelInputs, awTissueProbabilities, type AwTissueModel } from "../src/lib/racing/aw-tissue-model";
import { classifyHandicapStatus } from "../src/lib/racing/research-rule";
import type { HistoricalPreRaceFeatureRow, HistoricalPostRaceOutcome } from "../src/lib/racing/historical-target-metrics";

const OUTPUT = "data/research/aw-tissue-model-v2.json";
type AuditRow = { features: HistoricalPreRaceFeatureRow; outcome: HistoricalPostRaceOutcome; numeric: number[]; priorAwStarts: number };
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const average = (xs: number[]) => xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
function correlation(a: number[], b: number[]) {
  const am = average(a)!, bm = average(b)!;
  const numerator = a.reduce((s, v, i) => s + (v - am) * (b[i]! - bm), 0);
  const denominator = Math.sqrt(a.reduce((s, v) => s + (v - am) ** 2, 0) * b.reduce((s, v) => s + (v - bm) ** 2, 0));
  return denominator ? numerator / denominator : null;
}
function evaluation(examples: Example[], probabilities: number[]) {
  const groups = groupIndexes(examples);
  const leaders = groups.map(ids => [...ids].sort((a, b) => probabilities[b]! - probabilities[a]! || examples[a]!.row.features.targetRunnerId.localeCompare(examples[b]!.row.features.targetRunnerId))[0]!);
  const wins = leaders.filter(i => examples[i]!.won).length;
  const modelExpected = leaders.reduce((s, i) => s + probabilities[i]!, 0);
  const market: number[] = Array(examples.length).fill(NaN);
  const validMarket = groups.filter(ids => ids.every(i => Number(examples[i]!.row.outcome.startingPriceDecimal) > 1));
  for (const ids of validMarket) {
    const p = raceSoftmax(ids.map(i => -Math.log(Number(examples[i]!.row.outcome.startingPriceDecimal)))); ids.forEach((id, j) => market[id] = p[j]!);
  }
  const marketLeaders = leaders.filter(i => Number.isFinite(market[i]));
  const marketExpected = marketLeaders.reduce((s, i) => s + market[i]!, 0);
  const comparable = examples.map((_, i) => i).filter(i => Number.isFinite(market[i]));
  return { races: groups.length, runners: examples.length, logLoss: -average(examples.map((e, i) => e.won ? Math.log(Math.max(probabilities[i]!, 1e-12)) : null).filter((v): v is number => v !== null))!,
    brier: average(groups.map(ids => ids.reduce((s, i) => s + (probabilities[i]! - (examples[i]!.won ? 1 : 0)) ** 2, 0))),
    top2: average(groups.map(ids => [...ids].sort((a, b) => probabilities[b]! - probabilities[a]!).slice(0, 2).some(i => examples[i]!.won) ? 1 : 0)),
    top3: average(groups.map(ids => [...ids].sort((a, b) => probabilities[b]! - probabilities[a]!).slice(0, 3).some(i => examples[i]!.won) ? 1 : 0)),
    rank1Selections: leaders.length, rank1Winners: wins, rank1StrikeRate: wins / leaders.length,
    actualOverModelExpected: wins / modelExpected, modelExpected,
    marketComparableRaces: validMarket.length, marketLogLoss: -average(validMarket.map(ids => Math.log(market[ids.find(i => examples[i]!.won)!]!)))!,
    modelLogLossOnMarketSample: -average(validMarket.map(ids => Math.log(probabilities[ids.find(i => examples[i]!.won)!]!)))!,
    actualOverMarketExpected: marketExpected ? marketLeaders.filter(i => examples[i]!.won).length / marketExpected : null,
    marketExpected, marketProbabilityCorrelation: correlation(comparable.map(i => probabilities[i]!), comparable.map(i => market[i]!)),
    calibration: Array.from({ length: 10 }, (_, band) => { const ids = examples.map((_, i) => i).filter(i => Math.min(9, Math.floor(probabilities[i]! * 10)) === band); return { band: `${band * 10}-${(band + 1) * 10}%`, runners: ids.length, predicted: average(ids.map(i => probabilities[i]!)), actual: average(ids.map(i => examples[i]!.won ? 1 : 0)) }; }),
    historicalRank1Roi: null, roiReason: "No immutable historical first-capture bookmaker prices; SP used only for forecasting comparison, never as capture-price fallback" };
}
function legacyProbabilities(examples: Example[], counts: Map<string, number>, artifact: AwTissueModel) {
  const result: number[] = Array(examples.length).fill(0);
  for (const ids of groupIndexes(examples)) {
    const inputs = ids.map(i => { const f = examples[i]!.row.features; const match = f.raceClass?.match(/\d+/); const handicap = classifyHandicapStatus(f);
      const raw = [f.averageAwSpeedLast3, f.trainerPriorWinRate, f.jockeyPriorWinRate ?? null, f.declaredRunnerCount, match ? Number(match[0]) : null, f.distanceYards === null ? null : f.distanceYards / 220,
        handicap === "unknown" ? null : handicap === "handicap" ? 1 : 0, f.latestAwSpeedRating, f.bestAwSpeedLast3, f.averagePerformanceLast3, f.latestPerformanceRating, f.officialRating, counts.get(f.targetRunnerId)!, f.horseAge, f.draw, f.daysSinceLastRun];
      return awTissueModelInputs(raw.map(v => typeof v === "number" && Number.isFinite(v) ? v : null), artifact);
    });
    const p = awTissueProbabilities(inputs, artifact); ids.forEach((id, j) => result[id] = p[j]!);
  }
  return result;
}
export async function fitAwTissueV2() {
  const auditBytes = await readFile("/tmp/aw-v2-prefit-audit.json", "utf8"), audit = JSON.parse(auditBytes);
  assert.equal(audit.gate, true, "PRE-FIT GATE FAILED: no model may be fitted");
  assert.deepEqual(audit.names, AW_V2_NAMES); assert.equal(audit.mappingVersion, AW_SURFACE_MAPPING_VERSION); assert.deepEqual(audit.surfacePolicy, AW_SURFACE_FEATURE_POLICY);
  const mapping = JSON.parse(await readFile("data/research/aw-surface-material-v1.json", "utf8"));
  const rowsBytes = await readFile("/tmp/aw-v2-prefit-rows.ndjson", "utf8");
  assert.equal(hash(rowsBytes), audit.rowsChecksum, "Audited row content changed");
  const rows = rowsBytes.trim().split("\n").map(s => JSON.parse(s) as AuditRow).map(r => ({ ...r, features: { ...r.features, raceDateTime: new Date(r.features.raceDateTime) } }));
  assert(rows.every(r => r.features.raceCode === "aw" && r.numeric.length === 52 && r.numeric.every(Number.isFinite)));
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, connect_timeout: 8, connection: { default_transaction_read_only: true, statement_timeout: 60000 } });
  try {
    assert.equal((await sql`show default_transaction_read_only`)[0]!.default_transaction_read_only, "on");
    const comments = await loadHistoricalComments(sql);
    const examples: Example[] = rows.map(r => { const priors = priorCommentsForTarget(comments.get(r.features.horseId) ?? [], r.features.raceDateTime); return { row: { features: r.features, outcome: r.outcome }, raceId: r.features.targetRaceId, won: r.outcome.won === true, numeric: r.numeric, comments: commentVector(priors), priorComments: priors }; });
    const training = examples.filter(e => e.row.features.raceDate.startsWith("2025")), holdout = examples.filter(e => e.row.features.raceDate.startsWith("2026"));
    console.log(`Fitting AW v2: ${training.length} runners / ${groupIndexes(training).length} AW-only races; canonical 90 epochs, L2=.02`);
    const fitted = fitModel(training, true);
    const model = { ...fitted, names: [...AW_V2_NAMES] };
    predict(training, model, true, "commentProbability"); predict(holdout, model, true, "commentProbability");
    for (const rs of groupIndexes(holdout)) assert(Math.abs(rs.reduce((s, i) => s + holdout[i]!.commentProbability!, 0) - 1) < 1e-12);
    const specification = { methodology: "TURF_V3_CORE_AW_SURFACE_HISTORY_V1", featureSchemaVersion: AW_TISSUE_V2_SCHEMA, surfaceMappingVersion: AW_SURFACE_MAPPING_VERSION, surfaceMappingChecksum: mapping.checksum,
      surfacePolicy: AW_SURFACE_FEATURE_POLICY, epochs: 90, l2: .02, learningRate: ".12/sqrt(1+epoch/10)", numericMissingImputation: "zero_plus_missing_flags", scaling: "training_population_sd_floor_1e-6", calibration: "none", probabilityNormalisation: "race_softmax", fieldSizeSource: "declared_runner_count_only", drawFractionDenominator: "declared_runner_count_only", prospectiveHistoryCutoff: "capture_datetime", historicalHistoryCutoff: "target_race_datetime", targetOutcomeFeatures: false };
    const checksum = hash(JSON.stringify({ specification, model }));
    const candidate = { version: "AW_TISSUE_V2", family: "AW", methodology: specification.methodology, featureSchemaVersion: AW_TISSUE_V2_SCHEMA, surfaceMappingVersion: AW_SURFACE_MAPPING_VERSION, trainedAt: new Date().toISOString(), trainingWindow: { from: "2025-01-01", to: "2025-12-31" }, trainingSample: { runners: training.length, races: groupIndexes(training).length }, status: "frozen", checksum, specification, model,
      source: { auditChecksum: hash(auditBytes), rowsChecksum: hash(rowsBytes), priorSourceChecksum: audit.sourceChecksum, historicalPublicationTimesVerified: false, caches: audit.caches } };
    const probabilities = holdout.map(e => e.commentProbability!);
    const legacy = await loadAwTissueModel(), legacyP = legacyProbabilities(holdout, new Map(rows.map(r => [r.features.targetRunnerId, r.priorAwStarts])), legacy);
    const top = (p: number[], ids: number[]) => [...ids].sort((a, b) => p[b]! - p[a]! || holdout[a]!.row.features.targetRunnerId.localeCompare(holdout[b]!.row.features.targetRunnerId))[0]!;
    const groups = groupIndexes(holdout), agreement = groups.filter(ids => top(probabilities, ids) === top(legacyP, ids)).length;
    const validation = { prefitGate: audit, training: metrics(training, "commentProbability"), holdout: { ...metrics(holdout, "commentProbability"), ...evaluation(holdout, probabilities) }, legacyCommonSample: evaluation(holdout, legacyP), comparison: { probabilityCorrelation: correlation(probabilities, legacyP), rank1Agreement: agreement / groups.length, changedRank1: 1 - agreement / groups.length }, checksum, activation: false };
    let existing: { checksum: string } | null = null;
    try { existing = JSON.parse(await readFile(OUTPUT, "utf8")); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    if (existing) assert.equal(existing.checksum, checksum, "Frozen AW v2 differs; allocate a new model version");
    else await writeFile(OUTPUT, JSON.stringify(candidate, null, 2) + "\n", { flag: "wx" });
    await writeFile("/tmp/aw-tissue-v2-fit-validation.json", JSON.stringify(validation, null, 2) + "\n");
    console.log(JSON.stringify(validation, null, 2));
  } finally { await sql.end({ timeout: 2 }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await fitAwTissueV2();

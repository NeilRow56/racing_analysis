import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildDependencyProvenance, verifyFrozenEpochModels } from "../../../scripts/activate-prospective-epochs";
import { assertEpochSources, epochManifestSchema, sha256 } from "./prospective-epoch-integrity";
import { COLLECTION_SEMANTICS, EPOCHS } from "./prospective-epoch-config";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";
import { canonicalHurdleV3Starter } from "./hurdle-v3-challenger-features";
import { legacyVoidBetResultStatus, isVoidBetResultStatus, legacyRecordedWinValue, settledWinValue } from "./backtest";

const evidence = "data/research/prospective-epochs-2026-11-11";
test("complete graph includes transitive Hurdle and AW classifiers, workflow and frozen artifacts; drift fails closed", { timeout: 30000 }, async () => {
  const provenance = await buildDependencyProvenance();
  for (const path of ["src/lib/racing/backtest.ts", "src/lib/racing/settlement-outcome.ts", "src/lib/racing/horse-metrics.ts", "src/lib/racing/trainer-quality.ts",
    "src/lib/racing/aw-tissue-v2-sync.ts", "src/lib/racing/hurdle-v3-shadow-inputs.ts", "src/lib/racing/tissue-generation-context.ts", "bun.lock"])
    assert.ok(provenance.sourceHashes[path], path);
  const root = "src/lib/racing/tissue-generation-sync.ts";
  const manifest = epochManifestSchema.parse({ version: 2, activatedAt: new Date().toISOString(), collectionSemantics: COLLECTION_SEMANTICS,
    settlementVersion: CANONICAL_SETTLEMENT_VERSION, epochs: EPOCHS, shadowEpoch: EPOCHS.shadow.id, historicalBackfill: false,
    models: await verifyFrozenEpochModels(), rules: {}, ...provenance, roots: [root], originalEvidenceHashes: {} });
  await assertEpochSources(manifest);
  await assert.rejects(assertEpochSources({ ...manifest, sourceHashes: { ...manifest.sourceHashes, [root]: "0".repeat(64) } }), /source-pin mismatch/);
  const missing = structuredClone(manifest); delete missing.sourceHashes["src/lib/racing/backtest.ts"];
  await assert.rejects(assertEpochSources(missing), /Incomplete epoch provenance/);
});

test("legacy Hurdle classification is preserved while current canonical AW void classification differs explicitly", () => {
  const cases = [null, "", "finished", "other", "unknown", "pulled_up", "fell", "non_runner", "NR", "void", "race_void", "abandoned", "cancelled"];
  const differences: string[] = [];
  for (const resultStatus of cases) for (const finishingPosition of [null, 0, -1, 1, 2]) {
    assert.equal(canonicalHurdleV3Starter({ resultStatus, finishingPosition }),
      !legacyVoidBetResultStatus(resultStatus) && legacyRecordedWinValue({ resultStatus, finishingPosition, won: null }) !== null);
    if (legacyVoidBetResultStatus(resultStatus) !== isVoidBetResultStatus(resultStatus) ||
      legacyRecordedWinValue({ resultStatus, finishingPosition, won: null }) !== settledWinValue({ resultStatus, finishingPosition, won: null })) differences.push(`${resultStatus}/${finishingPosition}`);
  }
  assert.ok(differences.length > 0);
  assert.equal(legacyVoidBetResultStatus("NR"), false);
  assert.equal(isVoidBetResultStatus("NR"), true);
});

test("isolated activation, concurrent new-epoch collection, pairing, stale rejection, routing and version-separated reports", { timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "prospective-epochs-"));
  try {
    for (const path of ["src", "scripts", "node_modules", "tsconfig.json", "package.json", "bun.lock"]) await symlink(resolve(path), join(dir, path));
    await mkdir(join(dir, "data/research"), { recursive: true });
    // Only frozen artifacts are linked; the three original ledgers are copied, never mutated in the repository.
    const baseline: Record<string, string> = JSON.parse(await readFile(`${evidence}/preservation-before.json`, "utf8"));
    for (const path of Object.keys(baseline)) {
      const destination = join(dir, path);
      if (/tissue-generation-2026-11-(turf|aw|hurdle|chase)\.json$|tissue-model-v3\.json$|aw-tissue-model-v2\.json$|jump-tissue-model-v1\.json$|hurdle-tissue-v3-challenger\.json$/.test(path)) await symlink(resolve(path), destination);
      else await writeFile(destination, await readFile(path));
    }
    const source = `
      import assert from "node:assert/strict";
      import { readFile, writeFile } from "node:fs/promises";
      import { activateProspectiveEpochs } from "./scripts/activate-prospective-epochs";
      import { EPOCHS, EPOCH_MANIFEST } from "./src/lib/racing/prospective-epoch-config";
      import { collectEpochPositiveNeutral, collectEpochShadow, settleEpochShadow } from "./src/lib/racing/prospective-epoch-collection";
      import { loadPositiveNeutral } from "./src/lib/racing/tissue-positive-neutral";
      import { loadHurdleV3Shadow } from "./src/lib/racing/hurdle-v3-shadow";
      import { loadHurdleMarketEdge } from "./src/lib/racing/hurdle-v3-market-edge";
      import { loadTissueGenerationModels } from "./src/lib/racing/tissue-generation-model";
      import { GENERATION_FEATURES } from "./src/lib/racing/tissue-generation-features";
      import { hurdleV3ParticipantPrior } from "./src/lib/racing/hurdle-v3-shadow-inputs";
      import { getLocalRacingDate } from "./src/lib/racing/todays-racing";
      import { shadowResult } from "./src/lib/racing/context-weight-shadow.fixtures";
      import { summarizeCollectionEpoch } from "./src/lib/racing/prospective-epoch-report";
      import { emptyTissueGeneration, generationRaceSchema } from "./src/lib/racing/tissue-generation-forward";
      const oldPaths = ["data/research/tissue-positive-neutral-prospective-v1.json", "data/research/hurdle-v3-prospective-shadow-v1.json", "data/research/hurdle-v3-market-edge-prospective-v1.json", "data/research/hurdle-low-form-prospective-v1.json"];
      const before = await Promise.all(oldPaths.map(p => readFile(p,"utf8")));
      const manifest = await activateProspectiveEpochs();
      await assert.rejects(activateProspectiveEpochs(), /already activated/);
      const now = new Date(), capturedAt = now.toISOString(), off = new Date(now.getTime()+3600000).toISOString();
      const { ProspectiveEpochResearch } = await import("./src/app/racing/research/forward-value/prospective-epoch-monitor");
      const { renderToStaticMarkup } = await import("react-dom/server");
      const html = renderToStaticMarkup(await ProspectiveEpochResearch());
      assert.match(html,/Prospective collection epochs/);assert.match(html,/ACTIVE/);assert.match(html,/ORIGINAL_V1/);
      const model = (await loadTissueGenerationModels()).HURDLE;
      const book = generationRaceSchema.parse({ family: "HURDLE", raceId:"new-fixture", raceDate:getLocalRacingDate(now), course:"Fixture", scheduledOff:off, capturedAt, featureCutoffAt:capturedAt,
        modelVersion:model.version, modelHash:model.checksum, featureNames:model.baseModel.names, adjustmentFeatureNames:GENERATION_FEATURES.HURDLE,
        completeMarket:true, marketSource:"sporting_life_median_bookmaker_at_capture_v1",
        runners:["a","b","c"].map((id,i)=>({runnerId:id,horseId:id,horseName:id,probability:[.5,.3,.2][i],rank:i+1,modelInputs:[...model.baseModel.means],adjustmentInputs:[...model.adjustment.means],capturedPrice:5,marketProbability:1/3,quotes:[{bookmakerId:1,bookmakerName:"Fixture",decimalOdds:5,fractionalOdds:null}],outcome:null})) });
      const prior = hurdleV3ParticipantPrior([],capturedAt);
      const inputs = new Map(book.runners.map(r=>[r.runnerId,{target:{runnerId:r.runnerId,raceId:book.raceId,cutoff:capturedAt,scheduledOff:off,officialRating:100,age:5,weightLbs:150,trainer:prior.prior,jockey:prior.prior},history:[],participantAudit:{trainer:prior.audit,jockey:prior.audit}}]));
      const stale={...book,raceId:"stale",capturedAt:new Date(now.getTime()-61000).toISOString()};
      const preBoundary={...book,raceId:"old",featureCutoffAt:new Date(Date.parse(manifest.activatedAt)-1).toISOString()};
      const postOff={...book,raceId:"post",scheduledOff:new Date(now.getTime()-1).toISOString()};
      await collectEpochPositiveNeutral([stale,preBoundary,postOff]);
      assert.equal((await loadPositiveNeutral(EPOCHS.positiveNeutral.ledger)).observations.length,0);
      await Promise.all([collectEpochPositiveNeutral([book]),collectEpochPositiveNeutral([book])]);
      assert.equal((await loadPositiveNeutral(EPOCHS.positiveNeutral.ledger)).observations.length,1);
      await Promise.all([collectEpochShadow([book],inputs),collectEpochShadow([book],inputs)]);
      let shadow=await loadHurdleV3Shadow(EPOCHS.shadow.ledger);
      const edge=await loadHurdleMarketEdge(EPOCHS.marketEdge.ledger);
      assert.equal(shadow.observations.length,1); assert.equal(edge.observations.length,1);
      // A separate invocation cannot retrospectively recreate a missed Market Edge observation.
      await writeFile(EPOCHS.marketEdge.ledger,JSON.stringify({...edge,epoch:null,observations:[]}));
      await collectEpochShadow([book],inputs);
      assert.equal((await loadHurdleMarketEdge(EPOCHS.marketEdge.ledger)).observations.length,0);
      const result=shadowResult(book);result.runners[1].finishingPosition=1;
      await settleEpochShadow(new Map([[book.raceId,result]]),new Date(off));
      shadow=await loadHurdleV3Shadow(EPOCHS.shadow.ledger);
      assert.equal(shadow.observations[0].production.runners[0].outcome.settlementVersion,"canonical_settlement_v3");
      assert.equal(shadow.observations[0].production.runners[0].outcome.grossReturn,2.5);
      const generation={...emptyTissueGeneration(),races:[shadow.observations[0].production]};
      const positive=await loadPositiveNeutral(EPOCHS.positiveNeutral.ledger);
      const rows=summarizeCollectionEpoch("new",positive,shadow,edge,generation);
      assert.ok(rows.some(r=>r.programme==="Market Edge"&&r.settlement==="canonical_settlement_v3"));
      assert.ok(rows.every(r=>r.epoch==="new"));
      const legacy=structuredClone(generation);delete legacy.races[0].runners[0].outcome.settlementVersion;
      const separated=summarizeCollectionEpoch("original",positive,null,null,legacy);
      assert.ok(separated.some(r=>r.settlement==="unversioned"));
      assert.ok(separated.some(r=>r.settlement==="canonical_settlement_v3"));
      // The original sources and outcomes stay byte-exact, including Low Form's lookup ledger.
      assert.deepEqual(await Promise.all(oldPaths.map(p=>readFile(p,"utf8"))),before);
      const drift=structuredClone(manifest);drift.sourceHashes["src/lib/racing/backtest.ts"]="0".repeat(64);
      await writeFile(EPOCH_MANIFEST,JSON.stringify(drift));
      await assert.rejects(collectEpochPositiveNeutral([{...book,raceId:"drift"}]),/source-pin mismatch/);
      // Outcome-only settlement does not use the collection source guard.
      await settleEpochShadow(new Map(),new Date(off));
      console.log("isolated activation and collection checks passed");
    `;
    const result = await promisify(execFile)(process.execPath, ["--eval", source], { cwd: dir, timeout: 55000, maxBuffer: 4 * 1024 * 1024 });
    assert.match(result.stdout, /checks passed/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("all original research files remain byte-exact against this task's starting state", async () => {
  const before: Record<string,string> = JSON.parse(await readFile(`${evidence}/preservation-before.json`, "utf8"));
  for (const [path, expected] of Object.entries(before)) assert.equal(sha256(await readFile(path)), expected, path);
});

test("current Hurdle completion and AW history differences propagate through unchanged frozen scores and ranks", async () => {
  const { generationCompletion, tissueGenerationFeatures } = await import("./tissue-generation-features");
  const { completionStatus } = await import("./hurdle-recency-forward");
  const { buildAwSurfaceFeatures } = await import("./aw-tissue-v2-features");
  const { loadTissueGenerationModels, predictTissueGeneration } = await import("./tissue-generation-model");
  const { loadAwV2Model } = await import("./aw-tissue-v2");
  const { score, raceSoftmax } = await import("../../../scripts/diagnose-independent-tissue-feasibility");
  const at = "2026-11-11T12:00:00.000Z";
  const priors = [
    { raceId: "nr", raceDateTime: "2026-11-10T12:00:00.000Z", finishingPosition: null, resultStatus: "NR" },
    { raceId: "finish", raceDateTime: "2026-11-01T12:00:00.000Z", finishingPosition: 2, resultStatus: "finished" },
  ];
  const legacyHistory = priors.filter(r => !legacyVoidBetResultStatus(r.resultStatus));
  const oldCompletion = [1, 0, legacyHistory.filter(r => completionStatus(r) === "completed").length / legacyHistory.length, 0];
  const currentCompletion = generationCompletion(priors, "target", at, 10);
  assert.deepEqual(oldCompletion, [1, 0, .5, 0]); assert.deepEqual(currentCompletion, [0, 0, 1, 0]);
  const hurdle = (await loadTissueGenerationModels()).HURDLE;
  const runners = ["a", "b"].map((runnerId, i) => ({ runnerId, modelInputs: [...hurdle.baseModel.means], context: { completionPriors: i === 0 ? priors : priors.slice(1) } }));
  const days = hurdle.baseModel.names.indexOf("days_since_run"), missing = hurdle.baseModel.names.indexOf("days_since_run_missing");
  for (const runner of runners) { runner.modelInputs[days] = 10; runner.modelInputs[missing] = 0; }
  const input = { family: "HURDLE" as const, raceId: "target", capturedAt: at, featureNames: hurdle.baseModel.names, runners };
  const currentFeatures = tissueGenerationFeatures(input);
  const oldLogits = runners.map((r, i) => score(hurdle.baseModel, r.modelInputs) + score(hurdle.adjustment,
    i === 0 ? [...currentFeatures.get(r.runnerId)!.slice(0, 2), ...oldCompletion] : currentFeatures.get(r.runnerId)!));
  const oldProbabilities = raceSoftmax(oldLogits), current = predictTissueGeneration(hurdle, input);
  assert.ok(Math.abs(oldProbabilities[0] - current[0].probability) > 1e-9);
  const oldRanks = oldProbabilities.map(p => 1 + oldProbabilities.filter(q => q > p).length);
  const surfaceRows = priors.map((r, i) => ({ ...r, runnerId: r.raceId, raceDateTime: new Date(r.raceDateTime), course: "Kempton", surface: "POLYTRACK", aw: true, completedTimed: true, speed: 80 + i * 20, weightLbs: 130 }));
  const surfaceInput = { targetRaceId: "target", targetAt: new Date(at), historyCutoff: new Date(at), course: "Kempton", surface: "POLYTRACK", historyLoaded: true };
  const oldSurface = buildAwSurfaceFeatures({ ...surfaceInput, priors: surfaceRows.filter(r => !legacyVoidBetResultStatus(r.resultStatus)) });
  const currentSurface = buildAwSurfaceFeatures({ ...surfaceInput, priors: surfaceRows.filter(r => !isVoidBetResultStatus(r.resultStatus)) });
  assert.deepEqual(oldSurface.selectedPriorRunnerIds, ["nr", "finish"]); assert.deepEqual(currentSurface.selectedPriorRunnerIds, ["finish"]);
  assert.notEqual(oldSurface.exposure, currentSurface.exposure);
  const aw = await loadAwV2Model();
  function vector(surface: typeof oldSurface) {
    const values = [...aw.model.means];
    [surface.exposure, surface.relativePerformance].forEach((value, i) => { values[24 + i] = value ?? 0; values[50 + i] = value === null ? 1 : 0; });
    return values;
  }
  const awOld = raceSoftmax([score(aw.model, vector(oldSurface)), score(aw.model, vector(currentSurface))]);
  const awCurrent = raceSoftmax([score(aw.model, vector(currentSurface)), score(aw.model, vector(currentSurface))]);
  assert.ok(Math.abs(awOld[0] - awCurrent[0]) > 1e-9);
  console.log(JSON.stringify({ fixtureEffects: { hurdle: { oldCompletion, currentCompletion, oldProbabilities, currentProbabilities: current.map(r => r.probability), oldRanks, currentRanks: current.map(r => r.rank) },
    aw: { oldHistory: oldSurface.selectedPriorRunnerIds, currentHistory: currentSurface.selectedPriorRunnerIds, oldProbabilities: awOld, currentProbabilities: awCurrent,
      oldRanks: awOld.map(p => 1 + awOld.filter(q => q > p).length), currentRanks: [1, 1] } } }));
});

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { score, raceSoftmax, type Model } from "./diagnose-independent-tissue-feasibility";
import { GENERATION_FEATURES, tissueGenerationFeatures, type TissueGenerationContext } from "../src/lib/racing/tissue-generation-features";
import { GENERATION_MODEL_VERSIONS, generationChecksum, generationModelPath, type TissueGenerationModel } from "../src/lib/racing/tissue-generation-model";
import { loadChaseShadowModel } from "../src/lib/racing/chase-shadow-model";
import { TISSUE_VALUE_FAMILIES, type TissueValueFamily } from "../src/lib/racing/tissue-value-metrics";

type Runner = { runnerId: string; modelInputs: number[]; probability: number; won: boolean; context: TissueGenerationContext };
type Race = { family: TissueValueFamily; raceId: string; raceDate: string; capturedAt: string; featureNames: string[]; runners: Runner[] };
const hash = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const average = (xs: number[]) => xs.length ? sum(xs) / xs.length : null;
const extra = (race: Race) => tissueGenerationFeatures(race);
function fit(races: Race[], base: Model, l2: number): Model {
  const names = GENERATION_FEATURES[races[0].family], xs = races.flatMap(r => [...extra(r).values()]);
  const means = names.map((_, j) => average(xs.map(x => x[j]))!);
  const scales = means.map((m, j) => Math.max(Math.sqrt(average(xs.map(x => (x[j] - m) ** 2))!), 1e-6));
  const fields = races.map(r => { const features = extra(r); return r.runners.map(row => ({
    x: features.get(row.runnerId)!.map((v, j) => (v - means[j]) / scales[j]), offset: score(base, row.modelInputs), y: +row.won,
  })); });
  const weights = names.map(() => 0);
  for (let epoch = 0; epoch < 120; epoch++) {
    const gradient = names.map(() => 0);
    for (const field of fields) {
      const p = raceSoftmax(field.map(r => r.offset + sum(r.x.map((x, j) => x * weights[j]))));
      field.forEach((r, i) => r.x.forEach((x, j) => gradient[j] += (r.y - p[i]) * x));
    }
    const rate = .08 / Math.sqrt(1 + epoch / 10);
    weights.forEach((w, j) => weights[j] = w + rate * (gradient[j] / races.length - l2 * w));
  }
  return { names, means, scales, weights };
}
function probabilities(race: Race, base: Model, adjustment?: Model) {
  const features = extra(race);
  return raceSoftmax(race.runners.map(r => score(base, r.modelInputs) + (adjustment ? score(adjustment, features.get(r.runnerId)!) : 0)));
}
export function generationMetrics(races: Race[], predictions: number[][]) {
  const bins = Array.from({ length: 5 }, () => ({ n: 0, observed: 0, expected: 0 }));
  let top1 = 0, top2 = 0, top3 = 0, ll = 0, brier = 0, rank = 0, runners = 0;
  races.forEach((race, k) => {
    const p = predictions[k], order = [...race.runners.keys()].sort((a, b) => p[b] - p[a] || race.runners[a].runnerId.localeCompare(race.runners[b].runnerId));
    const winner = race.runners.findIndex(r => r.won), winnerRank = order.indexOf(winner) + 1;
    top1 += +(winnerRank <= 1); top2 += +(winnerRank <= 2); top3 += +(winnerRank <= 3); rank += winnerRank;
    ll -= Math.log(Math.max(p[winner], 1e-300));
    race.runners.forEach((r, i) => { const y = +r.won, v = p[i], b = bins[v < .1 ? 0 : v < .15 ? 1 : v < .2 ? 2 : v < .3 ? 3 : 4];
      b.n++; b.observed += y; b.expected += v; brier += (v - y) ** 2; runners++;
    });
  });
  return { races: races.length, runners, logLoss: races.length ? ll / races.length : null,
    calibrationError: runners ? sum(bins.map(b => Math.abs(b.observed - b.expected))) / runners : null,
    brier: races.length ? brier / races.length : null, top1, top2, top3, meanWinnerRank: races.length ? rank / races.length : null };
}
function agreement(races: Race[], old: number[][], next: number[][]) {
  let t1 = 0, t2 = 0, sets = 0, t1Only = 0, t2Only = 0, bothPositions = 0, bothMembers = 0;
  races.forEach((race, i) => {
    const order = (p: number[]) => [...race.runners.keys()].sort((a, b) => p[b] - p[a] || race.runners[a].runnerId.localeCompare(race.runners[b].runnerId)).slice(0, 2);
    const a = order(old[i]), b = order(next[i]), same1 = a[0] === b[0], same2 = a[1] === b[1];
    t1 += +same1; t2 += +same2; sets += +a.every(x => b.includes(x));
    t1Only += +(!same1 && same2); t2Only += +(same1 && !same2); bothPositions += +(!same1 && !same2); bothMembers += +a.every(x => !b.includes(x));
  });
  return { races: races.length, t1Agreement: t1 / races.length, t2Agreement: t2 / races.length, top2SetAgreement: sets / races.length, t1OnlyChanged: t1Only, t2OnlyChanged: t2Only, bothPositionsChanged: bothPositions, bothTop2MembersReplaced: bothMembers };
}

export async function developTissueGeneration(epoch?: string) {
  const bytes = await readFile("/tmp/tissue-generation-development.json", "utf8");
  const data = JSON.parse(bytes) as { developmentCutoff: string; sourceHashes: Record<string, string>; races: Race[] };
  for (const [p, sha] of Object.entries(data.sourceHashes)) if (hash(await readFile(p)) !== sha) throw new Error("Development source changed");
  const chase = JSON.parse(await readFile("/tmp/chase-promotion-reconciliation.json", "utf8"));
  if (chase.old.races !== 1220 || chase.old.top1 !== 303 || chase.shadow.top1 !== 321 ||
    Math.abs(chase.old.logLoss - 1.8583) > .00005 || Math.abs(chase.shadow.logLoss - 1.8251) > .00005 ||
    !chase.quarters.every((q: { old: { logLoss: number }; shadow: { logLoss: number } }) => q.shadow.logLoss < q.old.logLoss)) throw new Error("Chase promotion reference did not reconcile");
  const models: TissueGenerationModel[] = [], results = [];
  for (const family of TISSUE_VALUE_FAMILIES) {
    const path = family === "TURF" ? "data/research/tissue-model-v3.json" : family === "AW" ? "data/research/aw-tissue-model-v2.json" : "data/research/jump-tissue-model-v1.json";
    const old = JSON.parse(await readFile(path, "utf8")) as { version: string; checksum: string; model: Model };
    const base = family === "CHASE" ? await loadChaseShadowModel() : old;
    const races = data.races.filter(r => r.family === family).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.raceId.localeCompare(b.raceId));
    if (races.length < 30) throw new Error(`Insufficient ${family} development races`);
    // Frozen current probabilities must be reproducible from the current model vectors.
    for (const r of races) {
      const p = probabilities(r, old.model);
      if (p.some((v, i) => Math.abs(v - r.runners[i].probability) > 1e-10)) throw new Error(`Old model parity failed: ${family}/${r.raceId}`);
      if (r.capturedAt >= data.developmentCutoff || r.runners.filter(x => x.won).length !== 1) throw new Error("Unsafe development row");
    }
    const split = Math.floor(races.length * .7), train = races.slice(0, split), validation = races.slice(split);
    // Two predeclared regularisation strengths only; never use ROI for selection.
    const candidates = [.2, 2].map(l2 => {
      const adjustment = fit(train, base.model, l2);
      return { l2, adjustment, validation: generationMetrics(validation, validation.map(r => probabilities(r, base.model, adjustment))) };
    }).sort((a, b) => a.validation.logLoss! - b.validation.logLoss! || a.validation.calibrationError! - b.validation.calibrationError!);
    const selected = candidates[0], baseValidation = generationMetrics(validation, validation.map(r => probabilities(r, base.model)));
    const contextRetained = selected.validation.logLoss! < baseValidation.logLoss!;
    const fitted = fit(races, base.model, selected.l2), adjustment = contextRetained ? fitted : { ...fitted, weights: fitted.weights.map(() => 0) };
    const oldP = races.map(r => probabilities(r, old.model)), newP = races.map(r => probabilities(r, base.model, adjustment));
    const result = { family, oldVersion: old.version, newVersion: GENERATION_MODEL_VERSIONS[family], baseVersion: base.version,
      selectedL2: contextRetained ? selected.l2 : null, contextRetained, baseValidation, features: adjustment.names, coefficients: adjustment.weights, split: { training: train.length, validation: validation.length, boundary: validation[0].capturedAt },
      validationOld: generationMetrics(validation, validation.map(r => probabilities(r, old.model))), candidates: candidates.map(c => ({ l2: c.l2, validation: c.validation })),
      old: generationMetrics(races, oldP), next: generationMetrics(races, newP), agreement: agreement(races, oldP, newP),
      blocks: [...new Set(races.map(r => r.raceDate.slice(0, 7) + (Number(r.raceDate.slice(8)) <= 27 ? "-early" : "-late")))].sort().map(block => {
        const ids = races.map((r, i) => ({ r, i })).filter(({ r }) => r.raceDate.slice(0, 7) + (Number(r.raceDate.slice(8)) <= 27 ? "-early" : "-late") === block);
        return { block, old: generationMetrics(ids.map(x => x.r), ids.map(x => oldP[x.i])), next: generationMetrics(ids.map(x => x.r), ids.map(x => newP[x.i])) };
      }) };
    results.push(result);
    const content: Omit<TissueGenerationModel, "checksum"> = { generation: "TISSUE_GENERATION_2026_11", family, version: GENERATION_MODEL_VERSIONS[family],
      developmentCutoff: data.developmentCutoff, frozenAt: epoch ?? new Date().toISOString(), prospectiveEpoch: epoch ?? "NOT_ACTIVATED", status: "frozen",
      baseVersion: base.version, baseChecksum: base.checksum, baseModel: base.model, adjustment, trainingSample: { races: races.length, runners: races.reduce((n, r) => n + r.runners.length, 0) },
      development: { sourceHashes: data.sourceHashes, datasetHash: hash(bytes), l2: contextRetained ? selected.l2 : null, contextRetained,
        note: "Small regularised context adjustment of the unchanged frozen base, retained only if later-block log loss beats the base. Both chronological portions informed specification/selection; DEVELOPMENT ONLY, not independent prospective validation. Price-complete, single-winner, all-starter frozen Value books; market fields never enter features or fitting. Zero adjustment coefficients mean the promoted base won the quality comparison." } };
    models.push({ ...content, checksum: generationChecksum(content) });
    console.log(JSON.stringify(result));
  }
  await writeFile("/tmp/tissue-generation-model-comparison.json", JSON.stringify({ developmentCutoff: data.developmentCutoff, prospectiveEpoch: epoch ?? null, chaseReference: { ...chase, races: undefined }, results }, null, 2));
  await writeFile("/tmp/tissue-generation-candidate-models.json", JSON.stringify(models, null, 2));
  if (epoch) {
    if (!Number.isFinite(Date.parse(epoch)) || epoch <= data.developmentCutoff) throw new Error("Invalid freeze epoch");
    for (const model of models) await writeFile(generationModelPath(model.family), JSON.stringify(model, null, 2) + "\n", { flag: "wx" });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await developTissueGeneration(process.argv[2]);

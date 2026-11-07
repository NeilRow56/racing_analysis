import { createHash } from "node:crypto";
import { raceSoftmax, score } from "../../../scripts/diagnose-independent-tissue-feasibility";
import { CONTEXT_SHADOW_CANDIDATES, CONTEXT_SHADOW_EPOCH, type ContextShadowFamily } from "./context-weight-shadow-config";
import { generationChecksum, type TissueGenerationModel } from "./tissue-generation-model";
import type { GenerationRace } from "./tissue-generation-forward";

export function contextShadowDefinition(family: ContextShadowFamily) {
  const candidate = CONTEXT_SHADOW_CANDIDATES[family];
  return { ...candidate, features: [...candidate.features], declaredAt: CONTEXT_SHADOW_EPOCH,
    calculation: "production_logit_plus_(multiplier_minus_one)_times_selected_standardised_context" as const,
    rankMissing: "unchanged" as const, selectionEvidence: "prior_retrospective_diagnostic" as const };
}
export function contextShadowHash(family: ContextShadowFamily) {
  return createHash("sha256").update(JSON.stringify(contextShadowDefinition(family))).digest("hex");
}

/** Pure diagnostic scoring. Inputs and production predictions are never mutated. */
export function predictContextWeightShadow(book: GenerationRace, model: TissueGenerationModel) {
  if (book.family !== "AW" && book.family !== "TURF") throw new Error("No context shadow for Jump");
  const candidate = CONTEXT_SHADOW_CANDIDATES[book.family];
  const { checksum, ...content } = model;
  if (generationChecksum(content) !== checksum) throw new Error("Context shadow production model checksum mismatch");
  if (model.family !== book.family || model.checksum !== candidate.productionHash || book.modelHash !== candidate.productionHash ||
    book.modelVersion !== candidate.productionVersion || JSON.stringify(book.featureNames) !== JSON.stringify(model.baseModel.names) ||
    JSON.stringify(book.adjustmentFeatureNames) !== JSON.stringify(model.adjustment.names) || book.runners.length < 2 ||
    new Set(book.runners.map(r => r.runnerId)).size !== book.runners.length || book.runners.some(r =>
      r.modelInputs.length !== model.baseModel.names.length || r.adjustmentInputs.length !== model.adjustment.names.length ||
      [...r.modelInputs, ...r.adjustmentInputs].some(v => !Number.isFinite(v)))) throw new Error("Context shadow production/schema mismatch");
  const indices = candidate.features.map(n => model.adjustment.names.indexOf(n));
  if (indices.some(i => i < 0 || model.adjustment.names[i].endsWith("_missing"))) throw new Error("Invalid shadow context scope");
  const productionScores = book.runners.map(r => score(model.baseModel, r.modelInputs) + score(model.adjustment, r.adjustmentInputs));
  const current = raceSoftmax(productionScores);
  const productionOrder = [...book.runners.keys()].sort((a, b) => current[b] - current[a] || book.runners[a].runnerId.localeCompare(book.runners[b].runnerId));
  if (book.runners.some((r, i) => !Number.isFinite(r.probability) || r.probability <= 0 || Math.abs(r.probability - current[i]) > 1e-12 ||
    r.rank !== (book.family === "TURF" ? 1 + current.filter(p => p > current[i]).length : productionOrder.indexOf(i) + 1))) throw new Error("Context shadow production parity failure");
  const context = book.runners.map(r => indices.reduce((sum, i) => sum + model.adjustment.weights[i] *
    (r.adjustmentInputs[i] - model.adjustment.means[i]) / model.adjustment.scales[i], 0));
  const logits = productionScores.map((s, i) => s + (candidate.multiplier - 1) * context[i]);
  const probabilities = raceSoftmax(logits);
  if (probabilities.some(p => !Number.isFinite(p) || p <= 0)) throw new Error("Invalid shadow probabilities");
  const order = [...book.runners.keys()].sort((a, b) => probabilities[b] - probabilities[a] || book.runners[a].runnerId.localeCompare(book.runners[b].runnerId));
  return book.runners.map((r, i) => ({ runnerId: r.runnerId, probability: probabilities[i],
    rank: book.family === "TURF" ? 1 + probabilities.filter(p => p > probabilities[i]).length : order.indexOf(i) + 1,
    productionLogit: productionScores[i], contextContribution: context[i], shadowLogit: logits[i] }));
}

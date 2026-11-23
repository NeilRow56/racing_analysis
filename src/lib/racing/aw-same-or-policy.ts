import { raceSoftmax, score } from "../../../scripts/diagnose-independent-tissue-feasibility";
import { GENERATION_MODEL_HASHES } from "./tissue-generation-config";
import { GENERATION_FEATURES } from "./tissue-generation-features";
import { validGenerationCapture, type GenerationRace } from "./tissue-generation-forward";
import { generationChecksum, predictTissueGeneration, type TissueGenerationModel } from "./tissue-generation-model";
import { normalizeCompleteMarket } from "./tissue-value-metrics";

export const AW_SAME_OR_POLICY = "AW_SAME_OR_OUTSIDER_V1" as const;

type ScoredRunner = { runnerId: string; capturedPrice: number | null; remainingScore: number };
export type AwSameOrDecision = {
  originalT1: string;
  leaderWithoutSameOr: string | null;
  selection: string | null;
  originalMarketRank: number | null;
  triggered: boolean;
};

/** Sum the two retained contributions using the frozen model's original weights and scaling. */
export function scoreWithoutSameOr(base: number, model: TissueGenerationModel, inputs: readonly number[]) {
  const { adjustment } = model;
  const retained = adjustment.names.reduce((total, name, i) => name === "same_or_speed_gap" ? total :
    total + adjustment.weights[i] * ((inputs[i] - adjustment.means[i]) / adjustment.scales[i]), 0);
  return base + retained;
}

/** Input prices must be the verified medians from the same pre-off field as the scores. */
export function selectAwSameOr(originalT1: string, runners: readonly ScoredRunner[]): AwSameOrDecision {
  const t1 = runners.find(r => r.runnerId === originalT1);
  if (!t1 || new Set(runners.map(r => r.runnerId)).size !== runners.length ||
      runners.some(r => !Number.isFinite(r.remainingScore))) throw new Error("Invalid AW same-OR scoring field");
  if (!normalizeCompleteMarket(runners.map(r => r.capturedPrice))) {
    return { originalT1, leaderWithoutSameOr: null, selection: null, originalMarketRank: null, triggered: false };
  }

  const probabilities = raceSoftmax(runners.map(r => r.remainingScore));
  const [leader] = runners.map((r, i) => ({ id: r.runnerId, probability: probabilities[i] }))
    .sort((a, b) => b.probability - a.probability || a.id.localeCompare(b.id));
  const originalMarketRank = 1 + runners.filter(r => r.capturedPrice! < t1.capturedPrice!).length;
  const triggered = originalMarketRank >= 4 && leader.id !== originalT1;
  return { originalT1, leaderWithoutSameOr: leader.id, selection: triggered ? leader.id : originalT1, originalMarketRank, triggered };
}

/** Verify the original rank, probabilities and feature values before evaluating this policy. */
export function decideAwSameOr(model: TissueGenerationModel, book: GenerationRace): AwSameOrDecision {
  const { checksum, ...content } = model;
  if (model.family !== "AW" || model.version !== "AW_TISSUE_V3" || checksum !== GENERATION_MODEL_HASHES.AW ||
      generationChecksum(content) !== checksum || book.family !== "AW" || !validGenerationCapture(book) ||
      JSON.stringify(book.featureNames) !== JSON.stringify(model.baseModel.names) ||
      JSON.stringify(book.adjustmentFeatureNames) !== JSON.stringify(GENERATION_FEATURES.AW)) {
    throw new Error("Invalid frozen AW V3 model or capture");
  }
  const original = predictTissueGeneration(model, book);
  if (original.some((r, i) => r.rank !== book.runners[i].rank ||
    Math.abs(r.probability - book.runners[i].probability) > 1e-12 ||
    r.adjustmentInputs.some((v, j) => v !== book.runners[i].adjustmentInputs[j]))) {
    throw new Error("AW V3 score replay differs from frozen capture");
  }
  return selectAwSameOr(original.find(r => r.rank === 1)!.runnerId, book.runners.map((r, i) => ({
    runnerId: r.runnerId, capturedPrice: r.capturedPrice,
    remainingScore: scoreWithoutSameOr(score(model.baseModel, r.modelInputs), model, original[i].adjustmentInputs),
  })));
}

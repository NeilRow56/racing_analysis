import { generationRaceSchema, validGenerationCapture, type GenerationRace } from "./tissue-generation-forward";
import { generationChecksum, predictTissueGeneration, type TissueGenerationModel } from "./tissue-generation-model";

export const AW_V3_NO_SAME_OR_T2 = {
  id: "AW_V3_NO_SAME_OR_T2",
  revision: 1,
  sourceVersion: "AW_TISSUE_V3",
  sourceChecksum: "c8f75faa0aeacc88ba76f100e7d154a872bc9b2ee31a5a42d18e611e3e64f9a5",
  omittedFeature: "same_or_speed_gap",
  replacementWeight: 0,
  selectionRank: 2,
} as const;

type NoSelectionReason =
  | "unsupported-family" | "model-mismatch" | "invalid-capture" | "captured-input-mismatch"
  | "race-mismatch" | "capture-not-yet-available" | "race-closed" | "active-field-changed";

type RankedRunner = { runnerId: string; horseName: string; probability: number; rank: number };
type Original = Omit<RankedRunner, "rank">;
export type AwV3NoSameOrDecision =
  | { status: "no-selection"; model: typeof AW_V3_NO_SAME_OR_T2; reason: NoSelectionReason }
  | {
    status: "selection"; model: typeof AW_V3_NO_SAME_OR_T2; raceId: string; capturedAt: string; featureCutoffAt: string;
    scheduledOff: string; selection: RankedRunner; originalT2: Original; rankings: RankedRunner[];
  };

function unavailable(reason: NoSelectionReason): AwV3NoSameOrDecision {
  return { status: "no-selection", model: AW_V3_NO_SAME_OR_T2, reason };
}

function validateSource(model: TissueGenerationModel) {
  const { checksum, ...content } = model;
  return model.family === "AW" && model.version === AW_V3_NO_SAME_OR_T2.sourceVersion &&
    checksum === AW_V3_NO_SAME_OR_T2.sourceChecksum && generationChecksum(content) === checksum;
}

/** Replay one original full AW capture. Settlements and market prices have no role in the selection. */
export function predictAwV3NoSameOrT2(model: TissueGenerationModel, book: unknown): AwV3NoSameOrDecision {
  const parsed = generationRaceSchema.safeParse(book);
  if (!parsed.success) return unavailable("invalid-capture");
  const captured = parsed.data;
  if (captured.family !== "AW") return unavailable("unsupported-family");
  if (!validateSource(model)) return unavailable("model-mismatch");
  if (!validGenerationCapture(captured) ||
      JSON.stringify(captured.featureNames) !== JSON.stringify(model.baseModel.names) ||
      JSON.stringify(captured.adjustmentFeatureNames) !== JSON.stringify(model.adjustment.names)) {
    return unavailable("invalid-capture");
  }

  const originals = predictTissueGeneration(model, captured);
  if (originals.some((row, i) => {
    const stored = captured.runners[i];
    return row.rank !== stored.rank || !Number.isFinite(row.probability) ||
      Math.abs(row.probability - stored.probability) > 1e-12 ||
      row.adjustmentInputs.some((value, j) => value !== stored.adjustmentInputs[j]);
  })) return unavailable("captured-input-mismatch");

  const variant = {
    ...model,
    adjustment: {
      ...model.adjustment,
      weights: model.adjustment.weights.map((weight, i) =>
        model.adjustment.names[i] === AW_V3_NO_SAME_OR_T2.omittedFeature ? AW_V3_NO_SAME_OR_T2.replacementWeight : weight),
    },
  };
  const predictions = predictTissueGeneration(variant, captured);
  if (predictions.some(row => !Number.isFinite(row.probability))) {
    return unavailable("captured-input-mismatch");
  }
  const rankings = predictions.map(({ runnerId, rank, probability }, i) => ({
    runnerId, rank, probability, horseName: captured.runners[i].horseName,
  })).sort((a, b) => a.rank - b.rank);
  const selection = rankings.find(row => row.rank === AW_V3_NO_SAME_OR_T2.selectionRank);
  const original = captured.runners.find(row => row.rank === AW_V3_NO_SAME_OR_T2.selectionRank);
  if (!selection || !original) return unavailable("invalid-capture");

  return {
    status: "selection", model: AW_V3_NO_SAME_OR_T2, raceId: captured.raceId, capturedAt: captured.capturedAt,
    featureCutoffAt: captured.featureCutoffAt, scheduledOff: captured.scheduledOff,
    selection, rankings, originalT2: { runnerId: original.runnerId, horseName: original.horseName, probability: original.probability },
  };
}

export type AwV3NoSameOrTodayContext = {
  raceId: string;
  scheduledOff: Date | null;
  activeRunnerIds: readonly string[];
  raceClosed: boolean;
  asOf: Date;
};

/** Pre-off preview for a live racecard. Keep the original roster until an independently valid capture replaces it. */
export function selectAwV3NoSameOrT2ForToday(
  model: TissueGenerationModel, book: GenerationRace, context: AwV3NoSameOrTodayContext,
): AwV3NoSameOrDecision {
  const decision = predictAwV3NoSameOrT2(model, book);
  if (decision.status !== "selection") return decision;
  const asOf = context.asOf.getTime();
  const off = Date.parse(decision.scheduledOff);
  if (context.raceId !== decision.raceId || context.scheduledOff?.getTime() !== off) return unavailable("race-mismatch");
  if (!Number.isFinite(asOf) || asOf < Date.parse(decision.capturedAt)) return unavailable("capture-not-yet-available");
  if (asOf >= off || context.raceClosed ||
      book.runners.some(runner => runner.outcome?.status === "settled" || runner.outcome?.status === "void")) {
    return unavailable("race-closed");
  }

  const active = new Set(context.activeRunnerIds);
  if (active.size !== context.activeRunnerIds.length || active.size !== decision.rankings.length ||
      decision.rankings.some(row => !active.has(row.runnerId)) ||
      book.runners.some(runner => runner.outcome?.status === "NR")) return unavailable("active-field-changed");
  return decision;
}

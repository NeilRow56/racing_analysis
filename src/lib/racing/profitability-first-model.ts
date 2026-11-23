import { createHash } from "node:crypto";
import definitions from "../../../docs/profitability-first-model-definitions-v1.json";
import { choose } from "../../../scripts/profitability-first-research";
import { frozenFeature } from "./chase-t3-research";
import { captureIdentity } from "./frozen-capture-selection";
import { generationRaceSchema, validGenerationCapture } from "./tissue-generation-forward";
import { GENERATION_FEATURES } from "./tissue-generation-features";
import { GENERATION_MODEL_HASHES } from "./tissue-generation-config";
import type { TissueGenerationModel } from "./tissue-generation-model";

const definitionHash = "a18f5feb280fdbd634b5b1eb0477f3f6d05a35a8a2e30e3b762fa7524c77784e";
if (definitions.sha256 !== definitionHash ||
    createHash("sha256").update(JSON.stringify(definitions.content)).digest("hex") !== definitionHash) {
  throw new Error("Invalid frozen profitability model definitions");
}
const weights = Object.freeze([...definitions.content.weights]);

export const PROFITABILITY_FIRST_V1 = {
  id: definitions.content.specification.id,
  definitionHash,
  policies: {
    A: definitions.content.specification.experiments.A.id,
    B: definitions.content.specification.experiments.B.id,
    C: definitions.content.specification.experiments.C.id,
  },
} as const;

type NoSelectionReason =
  | "invalid-capture" | "incomplete-market" | "race-mismatch" | "capture-not-yet-available"
  | "race-closed" | "active-field-changed" | "no-unique-tissue-2" | "insufficient-edge" | "no-matching-capture";
type Decision =
  | { status: "no-selection"; modelId: string; reason: NoSelectionReason }
  | {
    status: "selection"; modelId: string; runnerId: string; horseName: string;
    tissueRank: number; price: number; probability: number; edge: number; utility?: number;
  };
type Decisions = Record<keyof typeof PROFITABILITY_FIRST_V1.policies, Decision>;

export type ProfitabilityRacecardContext = {
  raceId: string;
  scheduledOff: Date | null;
  asOf: Date;
  raceClosed: boolean;
  activeRunnerIds: readonly string[];
};

function noSelection(modelId: string, reason: NoSelectionReason): Decision {
  return { status: "no-selection", modelId, reason };
}

export function profitabilityAbstain(reason: NoSelectionReason): Decisions {
  const { A, B, C } = PROFITABILITY_FIRST_V1.policies;
  return { A: noSelection(A, reason), B: noSelection(B, reason), C: noSelection(C, reason) };
}

/** Replay a validated whole pre-off book, or check it against a current racecard. */
export function predictProfitabilityFirstV1(
  model: Pick<TissueGenerationModel, "family" | "checksum" | "baseModel">,
  input: unknown,
  context?: ProfitabilityRacecardContext,
) {
  const parsed = generationRaceSchema.safeParse(input);
  if (!parsed.success) return { capture: null, decisions: profitabilityAbstain("invalid-capture") };
  const book = parsed.data;
  const capture = { raceId: book.raceId, family: book.family, capturedAt: book.capturedAt, bookIdentity: captureIdentity(book) };
  const abstain = (reason: NoSelectionReason) => ({ capture, decisions: profitabilityAbstain(reason) });
  if (!validGenerationCapture(book) || model.family !== book.family || model.checksum !== GENERATION_MODEL_HASHES[book.family] ||
      JSON.stringify(book.featureNames) !== JSON.stringify(model.baseModel.names) ||
      JSON.stringify(book.adjustmentFeatureNames) !== JSON.stringify(GENERATION_FEATURES[book.family])) {
    return abstain("invalid-capture");
  }
  if (context) {
    const off = Date.parse(book.scheduledOff), asOf = context.asOf.getTime();
    if (context.raceId !== book.raceId || context.scheduledOff?.getTime() !== off) return abstain("race-mismatch");
    if (!Number.isFinite(asOf) || asOf < Date.parse(book.capturedAt)) return abstain("capture-not-yet-available");
    if (context.raceClosed || asOf >= off || book.runners.some(runner =>
      runner.outcome?.status === "settled" || runner.outcome?.status === "void")) return abstain("race-closed");
    const active = new Set(context.activeRunnerIds);
    if (active.size !== context.activeRunnerIds.length || active.size !== book.runners.length ||
        book.runners.some(runner => !active.has(runner.runnerId) || runner.outcome?.status === "NR")) {
      return abstain("active-field-changed");
    }
  }
  const flat = book.family === "AW" || book.family === "TURF";
  const speed = flat ? "turf_speed" : "jump_speed";
  const offers = book.runners.flatMap(runner => {
    if (runner.capturedPrice === null) return [];
    const feature = (name: string) => frozenFeature(book, runner, name);
    const runs = feature(flat ? "log_prior_runs" : "log_prior_jump_starts");
    return [{
      id: runner.runnerId, price: runner.capturedPrice, tissue: runner.probability, tissueRank: runner.rank,
      or: feature("official_rating"), speed: feature("best_l3_" + speed), recent: feature("latest_" + speed),
      prior: runs === null ? null : Math.round(Math.expm1(runs)),
    }];
  });
  if (!book.completeMarket || offers.length !== book.runners.length) return abstain("incomplete-market");

  const uniqueT2 = offers.filter(offer => offer.tissueRank === 2).length === 1;
  const { a, b, c } = choose(offers, weights, uniqueT2);
  const decode = (pick: typeof a, modelId: string, reason: NoSelectionReason = "insufficient-edge"): Decision => {
    if (!pick) return noSelection(modelId, reason);
    const runner = book.runners[pick.index];
    return { status: "selection", modelId, runnerId: runner.runnerId, horseName: runner.horseName, tissueRank: runner.rank,
      price: offers[pick.index].price, probability: pick.p, edge: pick.edge, utility: pick.utility };
  };
  const { A, B, C } = PROFITABILITY_FIRST_V1.policies;
  return { capture, decisions: { A: decode(a, A, uniqueT2 ? "insufficient-edge" : "no-unique-tissue-2"), B: decode(b, B), C: decode(c, C) } };
}

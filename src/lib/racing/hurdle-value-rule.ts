import type { ForwardValuePriceSnapshot } from "./forward-value";
import type { JumpTissueRace } from "./jump-tissue-forward";
import { JUMP_TISSUE_VERSION } from "./jump-tissue-model";
import { frozenTissueRankOneEdge } from "./tissue-rank-one-edge";

export const HURDLE_VALUE_RULE_VERSION = "HURDLE_VALUE_MAX_PRICE_V1" as const;
export const HURDLE_VALUE_RULE_EPOCH = "2026-10-12T18:59:58.000Z" as const;
export const HURDLE_VALUE_MAX_DECIMAL_PRICE = 15;
export type HurdleValueQualification = {
  capturedAt: string;
  qualifyingPrice: number;
  stage: "early" | "t180" | "t60";
  snapshot: ForwardValuePriceSnapshot;
};
export type HurdleValueRuleState = {
  version: typeof HURDLE_VALUE_RULE_VERSION;
  epoch: typeof HURDLE_VALUE_RULE_EPOCH;
  modelVersion: typeof JUMP_TISSUE_VERSION;
  captureDateTime: string;
  normalValueCriteriaPassed: boolean | null;
  excludedByPriceCap: boolean | null;
  qualification: HurdleValueQualification | null;
  qualifyingPriceProfitLoss: number | null;
};
export function newHurdleValueRuleState(capturedAt: string): HurdleValueRuleState {
  return { version: HURDLE_VALUE_RULE_VERSION, epoch: HURDLE_VALUE_RULE_EPOCH, modelVersion: JUMP_TISSUE_VERSION,
    captureDateTime: capturedAt, normalValueCriteriaPassed: null, excludedByPriceCap: null, qualification: null, qualifyingPriceProfitLoss: null };
}
export function captureHurdleValueQualification(record: JumpTissueRace, capturedAt: Date): JumpTissueRace {
  const state = record.hurdleValueRule;
  if (!state || state.qualification || record.subtype !== "Hurdle" || record.settledAt ||
      capturedAt.toISOString() < state.captureDateTime || capturedAt.toISOString() >= record.currentOffAt) return record;
  const leader = record.runners.find((runner) => runner.runnerId === record.top1);
  if (!leader) return record;
  const comparison = frozenTissueRankOneEdge(leader.probability, record.raceId, leader.runnerId, record.prices, null);
  if (!comparison || comparison.qualificationPrice.capturedAt < state.epoch || comparison.qualificationPrice.capturedAt < state.captureDateTime) return record;
  const normalValueCriteriaPassed = comparison.edge > 0;
  if (!normalValueCriteriaPassed) return state.normalValueCriteriaPassed === false ? record : { ...record,
    hurdleValueRule: { ...state, normalValueCriteriaPassed: false, excludedByPriceCap: false } };
  return { ...record, hurdleValueRule: { ...state, normalValueCriteriaPassed: true,
    excludedByPriceCap: comparison.qualificationPrice.decimalPrice > HURDLE_VALUE_MAX_DECIMAL_PRICE,
    qualification: { capturedAt: comparison.qualificationPrice.capturedAt, qualifyingPrice: comparison.qualificationPrice.decimalPrice,
      stage: comparison.qualificationStage, snapshot: comparison.qualificationPrice } } };
}
export function jumpTissueQualificationPrices(race: JumpTissueRace) {
  const qualification = race.hurdleValueRule?.qualification;
  return qualification ? { early: null, t180: null, t60: null, [qualification.stage]: qualification.snapshot } : race.prices;
}
export function jumpTissueValueCategory(race: JumpTissueRace): "MAIN" | "LONG_PRICE_SHADOW" | "PRE_CAP" | "UNAVAILABLE" {
  if (race.subtype !== "Hurdle") return "MAIN";
  const rule = race.hurdleValueRule;
  if (!rule) return "PRE_CAP";
  if (!rule.qualification || rule.normalValueCriteriaPassed !== true) return "UNAVAILABLE";
  return rule.excludedByPriceCap ? "LONG_PRICE_SHADOW" : "MAIN";
}
export function isMainJumpTissueValue(race: JumpTissueRace, includePreCap = false) {
  const category = jumpTissueValueCategory(race);
  return category === "MAIN" || (includePreCap && category === "PRE_CAP");
}

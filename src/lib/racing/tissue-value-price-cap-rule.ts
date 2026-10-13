import type { ForwardValuePriceSnapshot } from "./forward-value";

export const TISSUE_VALUE_PRICE_CAP_RULE_VERSION = "TISSUE_VALUE_FAMILY_PRICE_CAP_V1" as const;
export const TISSUE_VALUE_PRICE_CAP_RULE_EPOCH = "2026-10-13T00:47:53.000Z" as const;
export const AW_TURF_VALUE_MAX_DECIMAL_PRICE = 21;

export type CappedTissueValueFamily = "aw" | "turf";

export type TissueValuePriceCapQualification = {
  capturedAt: string;
  qualifyingPrice: number;
  stage: "early" | "t180" | "t60";
  snapshot: ForwardValuePriceSnapshot;
};

export type TissueValuePriceCapRuleState = {
  family: CappedTissueValueFamily;
  ruleVersion: typeof TISSUE_VALUE_PRICE_CAP_RULE_VERSION;
  epoch: typeof TISSUE_VALUE_PRICE_CAP_RULE_EPOCH;
  modelVersion: string;
  captureDateTime: string;
  originalValueStatus: boolean | null;
  excludedByPriceCap: boolean | null;
  qualification: TissueValuePriceCapQualification | null;
  qualifyingPriceProfitLoss: number | null;
  qualifyingOutcome: "WIN" | "LOSS" | "VOID" | null;
  qualifyingFinishingPosition: number | null;
  qualifyingResultStatus: string | null;
};

export function newTissueValuePriceCapRuleState(input: {
  family: CappedTissueValueFamily;
  modelVersion: string;
  capturedAt: string;
}): TissueValuePriceCapRuleState {
  return {
    family: input.family,
    ruleVersion: TISSUE_VALUE_PRICE_CAP_RULE_VERSION,
    epoch: TISSUE_VALUE_PRICE_CAP_RULE_EPOCH,
    modelVersion: input.modelVersion,
    captureDateTime: input.capturedAt,
    originalValueStatus: null,
    excludedByPriceCap: null,
    qualification: null,
    qualifyingPriceProfitLoss: null,
    qualifyingOutcome: null,
    qualifyingFinishingPosition: null,
    qualifyingResultStatus: null,
  };
}

export function capCategory(state: TissueValuePriceCapRuleState | null | undefined): "MAIN" | "LONG_PRICE_SHADOW" | "PRE_CAP" | "UNAVAILABLE" {
  if (!state) return "PRE_CAP";
  if (!state.qualification || state.originalValueStatus !== true) return "UNAVAILABLE";
  return state.excludedByPriceCap ? "LONG_PRICE_SHADOW" : "MAIN";
}

export function capturedTissueValuePriceCapState(
  state: TissueValuePriceCapRuleState | null | undefined,
  input: {
    capturedAt: Date;
    edge: number | null;
    qualification: TissueValuePriceCapQualification | null;
  },
): TissueValuePriceCapRuleState | null | undefined {
  if (!state || state.qualification) return state;
  const capturedAt = input.capturedAt.toISOString();
  if (capturedAt < state.captureDateTime || capturedAt < state.epoch) return state;
  if (input.edge === null || input.qualification === null) return state;
  const { snapshot, qualifyingPrice } = input.qualification;
  if (!Number.isFinite(input.edge) || !Number.isFinite(qualifyingPrice) || qualifyingPrice <= 1 ||
      (snapshot.bookmakerQuoteCount ?? 0) <= 0 || snapshot.capturedAt < state.captureDateTime ||
      snapshot.capturedAt < state.epoch || snapshot.capturedAt > capturedAt) return state;
  const originalValueStatus = input.edge > 0;
  if (!originalValueStatus) {
    return state.originalValueStatus === false ? state : { ...state, originalValueStatus: false, excludedByPriceCap: false };
  }
  return {
    ...state,
    originalValueStatus: true,
    excludedByPriceCap: input.qualification.qualifyingPrice > AW_TURF_VALUE_MAX_DECIMAL_PRICE,
    qualification: input.qualification,
  };
}

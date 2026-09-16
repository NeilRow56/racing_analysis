export type StartingPriceCondition = {
  minDecimal?: number;
  maxDecimalExclusive?: number;
};

export type StartingPriceFilterValue =
  | "under_1_1"
  | "1_1"
  | "2_1"
  | "3_1"
  | "4_1"
  | "5_1"
  | "6_1"
  | "7_1"
  | "8_1"
  | "9_1"
  | "10_1"
  | "11_1"
  | "12_1"
  | "13_1"
  | "14_1"
  | "15_1"
  | "16_1"
  | "17_1"
  | "18_1"
  | "19_1"
  | "20_1_plus";

export type StartingPriceFilterOption = {
  value: StartingPriceFilterValue;
  label: string;
};

const FRACTION_OPTIONS = Array.from({ length: 19 }, (_, index) => index + 1)
  .map((price) => ({ value: `${price}_1` as StartingPriceFilterValue, label: `${price}/1` }));

export const STARTING_PRICE_MIN_OPTIONS: StartingPriceFilterOption[] = [
  { value: "under_1_1", label: "Under 1/1" },
  ...FRACTION_OPTIONS,
  { value: "20_1_plus", label: "20/1+" },
];

export const STARTING_PRICE_MAX_OPTIONS: StartingPriceFilterOption[] = [
  { value: "under_1_1", label: "Under 1/1" },
  ...FRACTION_OPTIONS,
];

export function startingPriceConditionFromValues(
  minValue: string | null | undefined,
  maxValue: string | null | undefined,
): StartingPriceCondition | undefined {
  const minBoundary = startingPriceMinBoundary(minValue);
  const maxBoundary = startingPriceMaxBoundary(maxValue);
  const condition: StartingPriceCondition = {};
  if (minBoundary?.kind === "under") {
    condition.maxDecimalExclusive = 2;
  } else if (minBoundary) {
    condition.minDecimal = minBoundary.decimal;
  }
  if (maxBoundary?.kind === "under") {
    condition.maxDecimalExclusive = Math.min(condition.maxDecimalExclusive ?? Infinity, 2);
  } else if (maxBoundary) {
    condition.maxDecimalExclusive = Math.min(condition.maxDecimalExclusive ?? Infinity, maxBoundary.decimalExclusive);
  }
  if (condition.maxDecimalExclusive === Infinity) {
    condition.maxDecimalExclusive = undefined;
  }
  return condition.minDecimal === undefined && condition.maxDecimalExclusive === undefined
    ? undefined
    : condition;
}

export function startingPriceMinValue(condition: StartingPriceCondition | undefined): string {
  if (!condition) {
    return "";
  }
  if (condition.minDecimal === undefined && condition.maxDecimalExclusive === 2) {
    return "under_1_1";
  }
  if (condition.minDecimal === undefined) {
    return "";
  }
  if (condition.minDecimal >= 21) {
    return "20_1_plus";
  }
  const fraction = condition.minDecimal - 1;
  return fraction >= 1 && fraction <= 19 ? `${fraction}_1` : "";
}

export function startingPriceMaxValue(condition: StartingPriceCondition | undefined): string {
  if (!condition || condition.maxDecimalExclusive === undefined) {
    return "";
  }
  if (condition.maxDecimalExclusive === 2) {
    return "under_1_1";
  }
  const fraction = condition.maxDecimalExclusive - 2;
  return fraction >= 1 && fraction <= 19 ? `${fraction}_1` : "";
}

export function startingPriceDecimalMatches(
  value: number | null,
  condition: StartingPriceCondition | undefined,
): boolean {
  if (!condition || (condition.minDecimal === undefined && condition.maxDecimalExclusive === undefined)) {
    return true;
  }
  if (value === null || !Number.isFinite(value)) {
    return false;
  }
  if (
    condition.minDecimal !== undefined &&
    condition.maxDecimalExclusive !== undefined &&
    condition.minDecimal >= condition.maxDecimalExclusive
  ) {
    return false;
  }
  return (condition.minDecimal === undefined || value >= condition.minDecimal) &&
    (condition.maxDecimalExclusive === undefined || value < condition.maxDecimalExclusive);
}

export function isImpossibleStartingPriceCondition(condition: StartingPriceCondition | undefined): boolean {
  return Boolean(
    condition &&
      condition.minDecimal !== undefined &&
      condition.maxDecimalExclusive !== undefined &&
      condition.minDecimal >= condition.maxDecimalExclusive,
  );
}

function startingPriceMinBoundary(value: string | null | undefined):
  | { kind: "under" }
  | { kind: "min"; decimal: number }
  | null {
  if (!value) {
    return null;
  }
  if (value === "under_1_1") {
    return { kind: "under" };
  }
  if (value === "20_1_plus") {
    return { kind: "min", decimal: 21 };
  }
  const fraction = fractionValue(value);
  return fraction === null ? null : { kind: "min", decimal: fraction + 1 };
}

function startingPriceMaxBoundary(value: string | null | undefined):
  | { kind: "under" }
  | { kind: "max"; decimalExclusive: number }
  | null {
  if (!value) {
    return null;
  }
  if (value === "under_1_1") {
    return { kind: "under" };
  }
  const fraction = fractionValue(value);
  return fraction === null ? null : { kind: "max", decimalExclusive: fraction + 2 };
}

function fractionValue(value: string): number | null {
  const match = /^(\d+)_1$/.exec(value);
  if (!match) {
    return null;
  }
  const fraction = Number(match[1]);
  return Number.isInteger(fraction) && fraction >= 1 && fraction <= 19 ? fraction : null;
}

export const WINNER_CAP_20_FRACTIONAL = 20;

export function winGrossReturn(input: {
  won: boolean;
  decimalOdds: number;
  deadHeatDivisor?: number;
  maxFractionalOdds?: number;
}): number {
  if (!input.won) return 0;
  const divisor = validDeadHeatDivisor(input.deadHeatDivisor);
  const decimalOdds = input.maxFractionalOdds === undefined
    ? input.decimalOdds
    : Math.min(input.decimalOdds, input.maxFractionalOdds + 1);
  // Decimal SP includes stake. The entire winning stake is divided in a dead heat.
  return decimalOdds / divisor;
}

export function validDeadHeatDivisor(value: number | undefined): number {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : 1;
}

export type DevelopmentSettlementMode = "actual" | "cap_20_1" | "cap_33_1";

export const DEVELOPMENT_SETTLEMENT_MODE_OPTIONS: Array<{
  value: DevelopmentSettlementMode;
  label: string;
}> = [
  { value: "actual", label: "Actual result SP" },
  { value: "cap_20_1", label: "Cap winners at 20/1" },
  { value: "cap_33_1", label: "Cap winners at 33/1" },
];

export function parseDevelopmentSettlementMode(
  value: string | null | undefined,
): DevelopmentSettlementMode {
  return value === "cap_20_1" || value === "cap_33_1" ? value : "actual";
}

export function developmentSettlementModeLabel(mode: DevelopmentSettlementMode): string {
  return DEVELOPMENT_SETTLEMENT_MODE_OPTIONS.find((option) => option.value === mode)?.label ??
    "Actual result SP";
}

export function developmentSettlementModeDescription(mode: DevelopmentSettlementMode): string {
  if (mode === "cap_20_1") {
    return "Winner returns capped at 20/1";
  }
  if (mode === "cap_33_1") {
    return "Winner returns capped at 33/1";
  }
  return "Actual result SP";
}

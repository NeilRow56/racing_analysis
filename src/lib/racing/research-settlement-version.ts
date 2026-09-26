export const CANONICAL_SETTLEMENT_VERSION = "canonical_settlement_v2" as const;

export type ResearchSettlementVersion = typeof CANONICAL_SETTLEMENT_VERSION;

export type SettlementVersionedSnapshot = {
  settlementVersion?: ResearchSettlementVersion;
};

export function isLegacySettlementSnapshot(snapshot: SettlementVersionedSnapshot): boolean {
  return snapshot.settlementVersion !== CANONICAL_SETTLEMENT_VERSION;
}

export function settlementVersionLabel(snapshot: SettlementVersionedSnapshot): string {
  return isLegacySettlementSnapshot(snapshot) ? "Legacy" : "Canonical v2";
}

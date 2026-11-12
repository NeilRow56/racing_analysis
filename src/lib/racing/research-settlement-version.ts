export const LEGACY_SETTLEMENT_VERSION = "canonical_settlement_v2" as const;
export const CANONICAL_SETTLEMENT_VERSION = "canonical_settlement_v3" as const;

export type ResearchSettlementVersion = typeof CANONICAL_SETTLEMENT_VERSION | typeof LEGACY_SETTLEMENT_VERSION;

export type SettlementVersionedSnapshot = {
  settlementVersion?: ResearchSettlementVersion;
};

export function isLegacySettlementSnapshot(snapshot: SettlementVersionedSnapshot): boolean {
  return snapshot.settlementVersion !== CANONICAL_SETTLEMENT_VERSION;
}

export function settlementVersionLabel(snapshot: SettlementVersionedSnapshot): string {
  return snapshot.settlementVersion === CANONICAL_SETTLEMENT_VERSION
    ? "Corrected v3"
    : snapshot.settlementVersion === LEGACY_SETTLEMENT_VERSION ? "Original v2 (superseded)" : "Original / unversioned";
}

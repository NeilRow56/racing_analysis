import { CANONICAL_SETTLEMENT_VERSION, LEGACY_SETTLEMENT_VERSION, type SettlementVersionedSnapshot } from "./research-settlement-version";

export function recordedSettlementBasis(row: SettlementVersionedSnapshot): string {
  return row.settlementVersion ?? "unversioned";
}
export function settlementReportLabel(basis: string): string {
  return basis === CANONICAL_SETTLEMENT_VERSION ? "Corrected V3 recorded outcomes (canonical_settlement_v3)"
    : basis === LEGACY_SETTLEMENT_VERSION ? "Legacy recorded V2 (canonical_settlement_v2)"
    : basis === "unversioned" ? "Legacy recorded / unversioned" : `Unknown recorded version: ${basis}`;
}
export function settlementReportGroups<T extends SettlementVersionedSnapshot>(rows: readonly T[]): Array<{ basis: string; label: string; rows: T[] }> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const basis = recordedSettlementBasis(row);
    const group = groups.get(basis) ?? [];
    group.push(row); groups.set(basis, group);
  }
  return [...groups].map(([basis, rows]) => ({ basis, label: settlementReportLabel(basis), rows }));
}
export function settlementReportDisclosure(rows: readonly SettlementVersionedSnapshot[]): string {
  const groups = settlementReportGroups(rows);
  return ["Settlement basis: retained recorded figures; no historical recalculation or ledger rewrite.",
    ...groups.map(group => `${group.label}: ${group.rows.length} records`),
    groups.length > 1 ? "MIXED SETTLEMENT VERSIONS: combined recorded totals are not pure V3 performance. Use the version-specific sections." : "",
    "Corrected V3 recalculations require separate labelled artifacts; legacy money is retained."].filter(Boolean).join("\n");
}

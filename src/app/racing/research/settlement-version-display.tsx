import {
  CANONICAL_SETTLEMENT_VERSION,
  type ResearchSettlementVersion,
} from "@/lib/racing/research-settlement-version";

export function SettlementVersionBadge({
  version,
}: {
  version?: ResearchSettlementVersion;
}) {
  return (
    <span className={version === CANONICAL_SETTLEMENT_VERSION ? "text-emerald-800" : "font-semibold text-amber-800"}>
      Settlement: {version === CANONICAL_SETTLEMENT_VERSION ? "Canonical v2" : "Legacy"}
    </span>
  );
}

export function LegacySettlementWarning() {
  return (
    <div className="border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
      <div className="font-semibold">Settlement: Legacy</div>
      <p className="mt-1">
        Historical P/L, ROI, strike and settled counts may exclude started non-finishers. Re-run Research for current settlement results.
      </p>
    </div>
  );
}

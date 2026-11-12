import {
  CANONICAL_SETTLEMENT_VERSION,
  type ResearchSettlementVersion,
  settlementVersionLabel,
} from "@/lib/racing/research-settlement-version";

export function SettlementVersionBadge({
  version,
}: {
  version?: ResearchSettlementVersion;
}) {
  return (
    <span className={version === CANONICAL_SETTLEMENT_VERSION ? "text-emerald-800" : "font-semibold text-amber-800"}>
      Settlement: {settlementVersionLabel({ settlementVersion: version })}
    </span>
  );
}

export function LegacySettlementWarning() {
  return (
    <div className="border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
      <div className="font-semibold">Settlement: Legacy</div>
      <p className="mt-1">
        Original reported figures are preserved. They may omit non-finisher losses or use superseded void/dead-heat treatment. A new analysis uses corrected v3; it does not overwrite this snapshot.
      </p>
    </div>
  );
}

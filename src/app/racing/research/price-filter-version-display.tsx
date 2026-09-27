import { ACTUAL_SP_FILTER_VERSION } from "@/lib/racing/starting-price-filter";

export function PriceFilterVersionBadge({
  active,
  version,
}: {
  active: boolean;
  version?: typeof ACTUAL_SP_FILTER_VERSION;
}) {
  if (!active) {
    return null;
  }
  return (
    <span className={version === ACTUAL_SP_FILTER_VERSION ? "text-emerald-800" : "font-semibold text-amber-800"}>
      Price filter: {version === ACTUAL_SP_FILTER_VERSION ? "Actual SP v2" : "Legacy"}
    </span>
  );
}

export function LegacyPriceFilterWarning({
  active,
  version,
  sampleLabel,
}: {
  active: boolean;
  version?: typeof ACTUAL_SP_FILTER_VERSION;
  sampleLabel?: string;
}) {
  if (!active || version === ACTUAL_SP_FILTER_VERSION) {
    return null;
  }
  return (
    <div className="mt-2 border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
      {sampleLabel ? <div className="font-medium">{sampleLabel}</div> : null}
      <div className={sampleLabel ? "mt-1 font-semibold" : "font-semibold"}>Price filter: Legacy</div>
      <p className="mt-1">
        Legacy SP filtering may exclude priced started non-finishers. Re-run Research for current results.
      </p>
    </div>
  );
}

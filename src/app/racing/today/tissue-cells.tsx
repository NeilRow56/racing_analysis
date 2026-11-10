import { summarizeTodayMarketPrice, type TodayRunner } from "@/lib/racing/todays-racing";
import { isTissueTop2SpeedRankWatch, TISSUE_SPEED_RANK_WATCH_TOOLTIP } from "@/lib/racing/tissue-speed-rank-watch";
import { TISSUE_INPUT_RELIABILITY_TOOLTIP } from "@/lib/racing/tissue-input-reliability";
import { isLongerPriceTissueTop2, LONGER_PRICE_TISSUE_WATCH_TOOLTIP } from "@/lib/racing/longer-price-tissue-watch";
import { isTissue1Value1Agreement } from "@/lib/racing/tissue-value-agreement";
import { TissueValueAgreementBadge } from "./tissue-value-agreement-badge";
import { isLiveRunnerEligible } from "@/lib/racing/live-runner-eligibility";
import { tissueMarketBadge } from "./tissue-market-badge";

export function AwTissueCell({ runner }: { runner: TodayRunner }) {
  if (!isLiveRunnerEligible(runner)) return <FrozenValueRankCell runner={runner} kind="tissueRank" />;
  if (runner.activeTissue) return <div className="tabular-nums"><span className="font-semibold">{(runner.activeTissue.probability * 100).toFixed(1)}%</span> #{runner.activeTissue.rank}<div className="text-[10px] text-slate-500">{runner.activeTissue.modelVersion}</div></div>;
  if (runner.tissueGenerationActive) return <span title="No frozen new-generation Tissue capture">-</span>;
  const prediction = runner.awTissue;
  if (!prediction?.predictionAvailable || prediction.probability === null) return <span title={prediction?.unavailableReason ?? "No prospective capture"}>-</span>;
  return <div className="tabular-nums">
    <span className="font-semibold">{(prediction.probability * 100).toFixed(1)}%</span>
    <span className="ml-1 text-slate-600">#{prediction.rank}</span>
    {prediction.zeroHistoryRunner ? <div className="text-[10px] text-slate-500">0 prior AW starts</div> : null}
  </div>;
}

export function JumpTissueCell({ runner }: { runner: TodayRunner }) {
  if (!isLiveRunnerEligible(runner)) return <FrozenValueRankCell runner={runner} kind="tissueRank" />;
  if (runner.activeTissue) return <div className="tabular-nums"><span className="font-semibold">{(runner.activeTissue.probability * 100).toFixed(1)}%</span> #{runner.activeTissue.rank}<div className="text-[10px] text-slate-500">{runner.activeTissue.modelVersion} · JPR-A {runner.jumpRating?.jprA?.rank ? `#${runner.jumpRating.jprA.rank}` : "-"}</div></div>;
  if (runner.tissueGenerationActive) return <span title="No frozen new-generation Tissue capture">-</span>;
  const prediction = runner.jumpTissue;
  if (!prediction?.predictionAvailable || prediction.probability === null) return <span title={prediction?.unavailableReason ?? "No prospective capture"}>-</span>;
  return <div className="tabular-nums">
    <span className="font-semibold">{(prediction.probability * 100).toFixed(1)}%</span>
    <span className="ml-1 text-slate-600">#{prediction.rank}</span>
    <div className="text-[10px] text-slate-500">
      JPR-A {runner.jumpRating?.jprA?.rank ? `#${runner.jumpRating.jprA.rank}` : "-"}
    </div>
    {prediction.historyBucket !== "unknown" ? <div className="text-[10px] text-slate-500">{prediction.historyBucket.replace("_", "+")} prior Jump</div> : null}
  </div>;
}

export function TodayMarketOdds({ runner }: { runner: TodayRunner }) {
  const market = summarizeTodayMarketPrice(runner);
  const forecast = market.forecastOdds
    ? `${market.forecastOdds}${market.forecastDecimalOdds === null ? "" : ` (${market.forecastDecimalOdds.toFixed(2)})`}`
    : "-";
  if (market.medianDecimalOdds === null) {
    return (
      <span className="text-slate-400" title={`No market quote. Forecast: ${forecast}`}>
        -
      </span>
    );
  }
  const median = market.medianFractionalOdds ?? market.medianDecimalOdds.toFixed(2);
  const best = market.bestFractionalOdds ?? market.bestDecimalOdds?.toFixed(2) ?? "-";
  const providers = market.bestBookmakerNames.length ? ` ${market.bestBookmakerNames.join(" / ")}` : "";
  const quotes = market.quotes.map((quote) =>
    `${quote.bookmakerName ?? quote.bookmakerId ?? "Unknown"}: ${quote.fractionalOdds ?? quote.decimalOdds.toFixed(2)} (${quote.decimalOdds.toFixed(2)})`
  ).join("\n");
  const title = [
    `Median market: ${median} (${market.medianDecimalOdds.toFixed(2)}), ${market.quoteCount} quotes`,
    `Best: ${best}${providers}`,
    `Forecast: ${forecast}`,
    quotes,
  ].filter(Boolean).join("\n");
  return (
    <div className="leading-4" title={title}>
      <div className="font-semibold text-slate-900">{median}</div>
      <div className="truncate text-[10px] text-slate-500">Best {best}</div>
    </div>
  );
}


export const FROZEN_RANK_TOOLTIPS = {
  tissueRank: "Model rank by estimated probability of winning.",
  valueRank: "Rank by model probability versus captured bookmaker price. Active Value 1 uses the frozen V2 experience gate on post-epoch captures. Research only — not a betting recommendation.",
  marketRank: "Rank from the captured bookmaker market.",
} as const;
type FrozenRankKind = keyof typeof FROZEN_RANK_TOOLTIPS;
const rankLabels = { tissueRank: "Tissue", valueRank: "Value", marketRank: "Mkt" } as const;
type FrozenRankRunner = { resultStatus?: string | null; tissueValue?: Partial<NonNullable<TodayRunner["tissueValue"]>>; activeTissue?: TodayRunner["activeTissue"]; tissueGenerationActive?: boolean };
const positiveRank = (value: number | null | undefined): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;

/** Stored fields only. Missing ranks never fall back to current odds or other model generations. */
export function FrozenValueRankCell({ runner, kind }: { runner: FrozenRankRunner; kind: FrozenRankKind }) {
  const generation = runner.tissueGenerationActive === true || runner.activeTissue !== undefined;
  const row = kind === "tissueRank" && generation ? { ...runner.tissueValue,
    tissueRank: runner.activeTissue?.rank, probability: runner.activeTissue?.probability,
    modelVersion: runner.activeTissue?.modelVersion, capturedAt: runner.activeTissue?.capturedAt,
    family: runner.activeTissue?.family } : runner.tissueValue;
  // Never pair a new production probability with a legacy/different capture's market.
  const matchingCapture = !generation || (runner.activeTissue !== undefined && runner.tissueValue !== undefined &&
    runner.activeTissue.capturedAt === runner.tissueValue.capturedAt &&
    runner.activeTissue.modelVersion === runner.tissueValue.modelVersion &&
    runner.activeTissue.family === runner.tissueValue.family &&
    runner.activeTissue.probability === runner.tissueValue.probability);
  if (!isLiveRunnerEligible(runner)) return <div className="text-xs text-slate-500" data-rank-kind={kind}
    title="Non-runner: historical frozen rank only; ineligible for active selections.">
    Frozen {rankLabels[kind]} {positiveRank(row?.[kind]) ? row[kind] : "—"}
    {kind === "tissueRank" && typeof row?.probability === "number" ? <div className="text-[10px]">{(row.probability * 100).toFixed(2)}% frozen</div> : null}
  </div>;
  const marketPrice = row?.marketPrice, probability = row?.probability, ratio = row?.modelMarketRatio;
  const hasMarket = typeof marketPrice === "number" && Number.isFinite(marketPrice) && marketPrice > 1;
  const hasScore = typeof probability === "number" && Number.isFinite(probability) && probability > 0 && probability <= 1;
  const rejectedValue1 = kind === "valueRank" && row?.valueRank === 1 && row.activeValue1 === false;
  const available = !rejectedValue1 && positiveRank(row?.[kind]) && (kind === "tissueRank" ? hasScore : hasMarket);
  const active = runner.activeTissue;
  // Production capture data is independent of Value. Legacy matching is only a compatibility path.
  const marketProbability = generation
    ? active?.completeMarket === true ? active.marketProbability
      : active?.completeMarket === undefined && matchingCapture ? row?.marketProbability : null
    : row?.marketProbability;
  const comparison = available && kind === "tissueRank" ? tissueMarketBadge(probability, marketProbability) : null;
  const missing = rejectedValue1 ? "No active Value 1: the frozen experience gate rejected the original leader." : kind === "tissueRank" ? "No frozen Tissue score/rank available." : !hasMarket ? "No captured bookmaker market available." : kind === "valueRank" ? "No frozen Value rank available." : "No captured market rank available.";
  const auditPrice = kind === "tissueRank" && generation ? active?.capturedPrice : marketPrice;
  const marketAudit = kind === "tissueRank" && generation && active?.completeMarket !== undefined
    ? ` · complete market ${active.completeMarket ? "yes" : "no"} · book ${active.bookIdentity} · ${active.marketSource}` : "";
  const provenance = row ? `${row.family} / ${row.modelVersion} · captured ${row.capturedAt}${typeof auditPrice === "number" ? ` · captured price ${auditPrice.toFixed(2)}` : ""}${marketAudit}${kind === "valueRank" && row.valueSelectionVersion ? ` · ${row.valueSelectionVersion}` : ""}${rejectedValue1 ? " · No active Value 1; experience gate rejected the legacy leader. No promotion." : ""}` : "No frozen prospective Tissue value observation.";
  const title = `${FROZEN_RANK_TOOLTIPS[kind]} ${available ? provenance : `${missing} ${provenance}`}`;
  const disagreement = available && kind === "valueRank" && typeof ratio === "number" && Number.isFinite(ratio) && ratio >= 1.5;
  const watch = !generation && available && kind === "tissueRank" && isTissueTop2SpeedRankWatch({ tissueRank: row?.tissueRank, bestL3SpeedRank: row?.bestL3SpeedRank });
  const longerPrice = available && kind === "tissueRank" && isLongerPriceTissueTop2({ tissueRank: row?.tissueRank, capturedPrice: row?.marketPrice });
  const caution = !generation && available && kind === "tissueRank" && (row?.tissueRank === 1 || row?.tissueRank === 2) && row.inputReliability?.level === "CAUTION";
  const agreement = available && kind === "tissueRank" && hasMarket && isTissue1Value1Agreement({ ...runner.tissueValue, resultStatus: runner.resultStatus, activeTissueRank: generation ? runner.activeTissue?.rank ?? null : undefined });
  const prominent = available && kind === "tissueRank" && !watch && (!comparison || comparison.state === "positive") && (row?.tissueRank === 1 || row?.tissueRank === 2);
  const badgeStyle = comparison?.state === "negative" ? "border-amber-300 bg-amber-50 text-amber-900"
    : comparison?.state === "neutral" ? "border-slate-300 bg-slate-100 text-slate-700"
    : watch ? "border-red-200 bg-red-50"
    : prominent ? row?.tissueRank === 1 ? "border-slate-900 bg-slate-900 text-white" : "border-blue-800 bg-blue-800 text-white"
    : "border-slate-200 bg-slate-50";
  return <div className="tabular-nums" data-rank-kind={kind} title={title}>
    <span data-tissue-market-state={comparison?.state} tabIndex={comparison ? 0 : undefined}
      aria-label={comparison ? `Tissue ${row?.tissueRank}. ${comparison.tooltip}` : undefined}
      title={[comparison?.tooltip, watch ? TISSUE_SPEED_RANK_WATCH_TOOLTIP : longerPrice ? LONGER_PRICE_TISSUE_WATCH_TOOLTIP : undefined].filter(Boolean).join("\n") || undefined}
      className={`inline-flex items-center gap-1 rounded-sm border ${badgeStyle} px-1.5 py-0.5 text-xs whitespace-nowrap group relative focus-visible:outline-2 focus-visible:outline-offset-2${watch && comparison && comparison.state !== "positive" ? " underline decoration-red-300 decoration-dotted underline-offset-4" : ""}`}>
      <span className={prominent ? "text-white" : "text-slate-600"}>{rankLabels[kind]}</span>
      <span className="font-semibold">{available ? row![kind] : "—"}</span>
      {disagreement ? <span className="text-amber-700" role="img" aria-label="Large model/market disagreement" title="Large model/market disagreement">●</span> : null}
      {comparison ? <span aria-hidden="true" className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-64 whitespace-normal rounded border border-slate-200 bg-white p-2 text-left text-xs font-normal text-slate-700 shadow-sm group-hover:block group-focus:block">{comparison.tooltip}</span> : null}
    </span>
    {longerPrice ? <span className="ml-1 inline-flex rounded-sm border border-blue-300 bg-blue-50 px-1 py-0.5 text-[10px] text-slate-900" aria-label="Longer-price Tissue watch" title={LONGER_PRICE_TISSUE_WATCH_TOOLTIP}>Price</span> : null}
    {caution ? <span className="ml-1 inline-flex rounded-sm border border-amber-300 px-1 py-0.5 text-[10px] text-amber-800" aria-label="Tissue input data caution"
      title={`${TISSUE_INPUT_RELIABILITY_TOOLTIP}${row.inputReliability!.reasons.length ? ` ${row.inputReliability!.reasons.join(" ")}` : ""}`}>Data</span> : null}
    {agreement ? <TissueValueAgreementBadge /> : null}
    {kind === "tissueRank" && available ? <div className="mt-0.5 text-[10px] text-slate-500">{(probability! * 100).toFixed(2)}% frozen</div> : null}
  </div>;
}

export function FrozenRacecardRanks({ runner, shadowRank }: { runner: FrozenRankRunner; shadowRank?: 1 | 2 }) {
  return <div className="flex flex-wrap items-start gap-1" aria-label="Frozen Tissue, Value and market ranks">
    <FrozenValueRankCell runner={runner} kind="tissueRank" />
    <FrozenValueRankCell runner={runner} kind="valueRank" />
    <FrozenValueRankCell runner={runner} kind="marketRank" />
    {isLiveRunnerEligible(runner) && !runner.tissueGenerationActive && !runner.activeTissue && (shadowRank === 1 || shadowRank === 2) ? <span
      className="inline-flex items-center rounded-sm border border-violet-300 px-1.5 py-0.5 text-xs whitespace-nowrap text-violet-800"
      title={`CHASE_SHADOW_V1 research rank ${shadowRank}. Shadow model only; not used for the current Tissue ranking.`}
    >Shadow {shadowRank}</span> : null}
  </div>;
}

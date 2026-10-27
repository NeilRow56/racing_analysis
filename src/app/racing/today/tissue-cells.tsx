import { summarizeTodayMarketPrice, type TodayRunner } from "@/lib/racing/todays-racing";
import { isTissueTop2SpeedRankWatch, TISSUE_SPEED_RANK_WATCH_TOOLTIP } from "@/lib/racing/tissue-speed-rank-watch";
import { TISSUE_INPUT_RELIABILITY_TOOLTIP } from "@/lib/racing/tissue-input-reliability";

export function AwTissueCell({ runner }: { runner: TodayRunner }) {
  const prediction = runner.awTissue;
  if (!prediction?.predictionAvailable || prediction.probability === null) return <span title={prediction?.unavailableReason ?? "No prospective capture"}>-</span>;
  return <div className="tabular-nums">
    <span className="font-semibold">{(prediction.probability * 100).toFixed(1)}%</span>
    <span className="ml-1 text-slate-600">#{prediction.rank}</span>
    {prediction.zeroHistoryRunner ? <div className="text-[10px] text-slate-500">0 prior AW starts</div> : null}
  </div>;
}

export function JumpTissueCell({ runner }: { runner: TodayRunner }) {
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
  valueRank: "Rank by model probability versus captured bookmaker price. Research only — not a betting recommendation.",
  marketRank: "Rank from the captured bookmaker market.",
} as const;
type FrozenRankKind = keyof typeof FROZEN_RANK_TOOLTIPS;
const rankLabels = { tissueRank: "Tissue", valueRank: "Value", marketRank: "Mkt" } as const;
type FrozenRankRunner = { tissueValue?: Partial<NonNullable<TodayRunner["tissueValue"]>> };
const positiveRank = (value: number | null | undefined): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;

/** Stored fields only. Missing ranks never fall back to current odds or other model generations. */
export function FrozenValueRankCell({ runner, kind }: { runner: FrozenRankRunner; kind: FrozenRankKind }) {
  const row = runner.tissueValue;
  const marketPrice = row?.marketPrice, probability = row?.probability, ratio = row?.modelMarketRatio;
  const hasMarket = typeof marketPrice === "number" && Number.isFinite(marketPrice) && marketPrice > 1;
  const hasScore = typeof probability === "number" && Number.isFinite(probability) && probability > 0 && probability <= 1;
  const available = positiveRank(row?.[kind]) && (kind === "tissueRank" ? hasScore : hasMarket);
  const missing = kind === "tissueRank" ? "No frozen Tissue score/rank available." : !hasMarket ? "No captured bookmaker market available." : kind === "valueRank" ? "No frozen Value rank available." : "No captured market rank available.";
  const provenance = row ? `${row.family} / ${row.modelVersion} · captured ${row.capturedAt}${hasMarket ? ` · captured price ${marketPrice!.toFixed(2)}` : ""}` : "No frozen prospective Tissue value observation.";
  const title = `${FROZEN_RANK_TOOLTIPS[kind]} ${available ? provenance : `${missing} ${provenance}`}`;
  const disagreement = available && kind === "valueRank" && typeof ratio === "number" && Number.isFinite(ratio) && ratio >= 1.5;
  const watch = available && kind === "tissueRank" && isTissueTop2SpeedRankWatch({ tissueRank: row?.tissueRank, bestL3SpeedRank: row?.bestL3SpeedRank });
  const caution = available && kind === "tissueRank" && (row?.tissueRank === 1 || row?.tissueRank === 2) && row.inputReliability?.level === "CAUTION";
  return <div className="tabular-nums" data-rank-kind={kind} title={title}>
    <span title={watch ? TISSUE_SPEED_RANK_WATCH_TOOLTIP : undefined} className={`inline-flex items-center gap-1 rounded-sm border ${watch ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"} px-1.5 py-0.5 text-xs whitespace-nowrap`}>
      <span className="text-slate-600">{rankLabels[kind]}</span>
      <span className="font-semibold">{available ? row![kind] : "—"}</span>
      {disagreement ? <span className="text-amber-700" role="img" aria-label="Large model/market disagreement" title="Large model/market disagreement">●</span> : null}
    </span>
    {caution ? <span className="ml-1 inline-flex rounded-sm border border-amber-300 px-1 py-0.5 text-[10px] text-amber-800" aria-label="Tissue input data caution"
      title={`${TISSUE_INPUT_RELIABILITY_TOOLTIP}${row.inputReliability!.reasons.length ? ` ${row.inputReliability!.reasons.join(" ")}` : ""}`}>Data</span> : null}
    {kind === "tissueRank" && available ? <div className="mt-0.5 text-[10px] text-slate-500">{(probability! * 100).toFixed(2)}% frozen</div> : null}
  </div>;
}

export function FrozenRacecardRanks({ runner }: { runner: FrozenRankRunner }) {
  return <div className="flex flex-wrap items-start gap-1" aria-label="Frozen Tissue, Value and market ranks">
    <FrozenValueRankCell runner={runner} kind="tissueRank" />
    <FrozenValueRankCell runner={runner} kind="valueRank" />
    <FrozenValueRankCell runner={runner} kind="marketRank" />
  </div>;
}

import { summarizeTodayMarketPrice, type TodayRunner } from "@/lib/racing/todays-racing";

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


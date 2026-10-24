"use client";

import { useState } from "react";
import type { DisplayValueRace } from "@/lib/racing/tissue-value-view";
import { sortValueRunners, type ValueSort } from "@/lib/racing/tissue-value-metrics";
import { isTissueTop2SpeedRankWatch, TISSUE_SPEED_RANK_WATCH_TOOLTIP } from "@/lib/racing/tissue-speed-rank-watch";


const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
const signed = (value: number) => `${value >= 0 ? "+" : ""}${pct(value)}`;
const time = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

export function TissueValueRaceTables({ races, date }: { races: DisplayValueRace[]; date: string }) {
  const [sort, setSort] = useState<ValueSort>("valueRank");
  const [selectedDate, setDate] = useState(date);
  const dates = [...new Set([date, ...races.map(r => r.raceDate)])].sort().reverse();
  const shown = races.filter(r => selectedDate === "all" || r.raceDate === selectedDate)
    .sort((a, b) => b.raceDate.localeCompare(a.raceDate) || a.scheduledOff.localeCompare(b.scheduledOff) || a.raceId.localeCompare(b.raceId));
  return <div className="mt-4">
    <div className="flex flex-wrap gap-4 text-xs">
      <label>Capture date <select className="ml-2 border border-slate-300 bg-white p-2" value={selectedDate} onChange={event => setDate(event.target.value)}>
        <option value="all">All capture dates</option>{dates.map(day => <option key={day} value={day}>{day}</option>)}
      </select></label>
      <label>Sort runners by <select className="ml-2 border border-slate-300 bg-white p-2" value={sort} onChange={event => setSort(event.target.value as ValueSort)}>
        <option value="valueRank">Value rank</option><option value="tissueRank">Tissue rank</option><option value="marketRank">Market rank</option>
      </select></label>
    </div>
    {!shown.length ? <p className="mt-3 text-sm text-slate-500">No prospective Tissue value captures for this date. Capture begins with the first eligible fully priced field after activation.</p> : null}
    {shown.map(race => <details open key={`${race.family}|${race.raceId}`} className="mt-4 border border-slate-200 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold">{race.raceDate} · {time(race.scheduledOff)} {race.course} · {race.family} · {race.modelVersion}</summary>
      <p className="mt-1 text-xs text-slate-500">{race.raceName} · Captured {time(race.capturedAt)} London time · {race.runners.length} runners · market book {(race.marketBookSum * 100).toFixed(2)}%</p>
      <div className="mt-2 overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
        <caption className="sr-only">Frozen model probabilities, captured bookmaker market and apparent value for {race.course} {time(race.scheduledOff)}</caption>
        <thead><tr>{["Time", "Course", "Horse", "Family", "Model version", "Tissue rank", "Tissue %", "Fair odds", "Market price", "Market rank", "Market %", "Probability edge", "Model/market ratio", "Expected return", "Value rank", "Result", "Captured-price P/L"].map(h => <th key={h} scope="col" className="border-b p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{sortValueRunners(race.runners, sort).map(runner => <tr key={runner.runnerId} className={runner.modelMarketRatio >= 2 ? "bg-amber-100/70" : runner.modelMarketRatio >= 1.5 ? "bg-amber-50" : ""}>
          <td className="p-2">{time(race.scheduledOff)}</td><td className="p-2">{race.course}</td>
          <th scope="row" className="p-2 font-medium">{runner.horseName}{runner.modelMarketRatio >= 1.5 ? <span className="mt-1 block text-[10px] font-normal text-amber-900">Large model/market disagreement{runner.modelMarketRatio >= 2 ? " · 2.00+" : " · 1.50–<2.00"}</span> : null}</th>
          <td className="p-2">{race.family}</td><td className="p-2">{race.modelVersion}</td>
          <td className="p-2">{runner.tissueRank === 1 || runner.tissueRank === 2 ? <span title={isTissueTop2SpeedRankWatch(runner) ? TISSUE_SPEED_RANK_WATCH_TOOLTIP : undefined} className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 ${isTissueTop2SpeedRankWatch(runner) ? `border-red-200 bg-red-50 ${runner.tissueRank === 1 ? "font-semibold text-slate-900" : "font-medium text-slate-700"}` : runner.tissueRank === 1 ? "border-slate-400 bg-slate-200 font-semibold text-slate-900" : "border-slate-300 bg-slate-50 font-medium text-slate-700"}`}>
            Tissue {runner.tissueRank}
          </span> : runner.tissueRank}</td><td className="p-2">{pct(runner.probability)}</td><td className="p-2">{runner.fairOdds.toFixed(2)}</td>
          <td className="p-2">{runner.marketPrice.toFixed(2)}</td><td className="p-2">{runner.marketRank}</td><td className="p-2">{pct(runner.marketProbability)}</td>
          <td className="p-2">{runner.probabilityEdge >= 0 ? "+" : ""}{(runner.probabilityEdge * 100).toFixed(2)} pp</td>
          <td className="p-2">{runner.modelMarketRatio.toFixed(2)}×</td><td className="p-2">{signed(runner.expectedReturn)}</td><td className="p-2" title={`Probability edge rank ${runner.probabilityEdgeRank}; model/market ratio rank ${runner.modelMarketRatioRank}`}>{runner.valueRank}</td>
          <td className="p-2">{!runner.outcome ? "Pending" : runner.outcome.status !== "settled" ? runner.outcome.status : runner.outcome.winner ? `Won${runner.outcome.deadHeatDivisor > 1 ? " (dead heat)" : ""}` : runner.outcome.finishPosition ? `Finished ${runner.outcome.finishPosition}` : runner.outcome.resultStatus?.replaceAll("_", " ") ?? "Settled"}</td>
          <td className="p-2">{runner.outcome?.profitLoss == null ? "—" : `${runner.outcome.profitLoss >= 0 ? "+" : ""}${runner.outcome.profitLoss.toFixed(2)}`}</td>
        </tr>)}</tbody>
      </table></div>
    </details>)}
  </div>;
}

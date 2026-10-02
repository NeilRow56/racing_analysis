import { awTissueValueAgreement, cleanAwTissueRace, type AwTissueForwardData } from "@/lib/racing/aw-tissue-forward";
import type { ForwardValueRecord, ForwardValuePriceSnapshot } from "@/lib/racing/forward-value";
import { formatRaceTimeForDisplay } from "@/lib/racing/todays-racing";

export function AwTissueValueSection({ data, ratings }: { data: AwTissueForwardData; ratings: ForwardValueRecord[] }) {
  const agreement = awTissueValueAgreement(data, ratings);
  const races = data.races.filter(cleanAwTissueRace).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, 100);
  return <section className="mt-8" aria-labelledby="aw-tissue-value-heading">
    <h2 className="text-lg font-semibold" id="aw-tissue-value-heading">AW Tissue (diagnostic)</h2>
    <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
      {[
        ["Comparable AW-D races", agreement.comparable], ["Same leader", agreement.sameLeader], ["Different leader", agreement.differentLeader],
        ["Both positive", agreement.bothPositive], ["AW-D positive only", agreement.awDPositiveOnly],
        ["AW Tissue positive only", agreement.tissuePositiveOnly], ["Neither positive", agreement.neitherPositive],
      ].map(([label, count]) => <div key={label}><dt className="text-slate-600">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{count}</dd></div>)}
    </dl>
    <div className="mt-3 overflow-x-auto border border-slate-200 bg-white">
      <table className="w-full min-w-[1200px] text-left text-xs">
        <thead className="bg-slate-100 text-[10px] uppercase text-slate-600"><tr>
          {["Date / time", "Course / horse", "AW Tissue probability", "Median bookmaker", "Implied", "Edge", "Best", "Forecast", "Quotes", "Early", "T-180", "T-60", "Final SP", "Median P/L"].map((label) => <th key={label} className="px-2 py-2 font-semibold">{label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-slate-200">
          {!races.length ? <tr><td colSpan={14} className="px-2 py-5 text-slate-500">No prospective AW Tissue observations.</td></tr> : races.map((race) => {
            const leader = race.runners.find((r) => r.runnerId === race.top1)!;
            const price = race.prices.t60 ?? race.prices.t180 ?? race.prices.early;
            const profit = race.prices.t60 ? race.selectedPriceProfitLoss.t60 : race.prices.t180 ? race.selectedPriceProfitLoss.t180 : race.selectedPriceProfitLoss.early;
            return <tr key={race.raceId}>
              <td className="whitespace-nowrap px-2 py-2">{race.raceDate}<br />{formatRaceTimeForDisplay({ raceDateTime: new Date(race.currentOffAt), scheduledTime: race.scheduledTime })}</td>
              <td className="px-2 py-2"><span className="font-medium">{race.course}</span><br />{leader.horseName}</td>
              <td className="px-2 py-2 tabular-nums">{pct(leader.probability)}</td>
              <td className="px-2 py-2 tabular-nums">{decimal(price?.decimalPrice)}</td>
              <td className="px-2 py-2 tabular-nums">{pct(price?.impliedProbability)}</td>
              <td className="px-2 py-2 tabular-nums">{price ? `${price.ratingEdgePercentagePoints.toFixed(2)}pp` : "-"}</td>
              <td className="px-2 py-2 tabular-nums" title={price?.bestBookmakerName ?? undefined}>{decimal(price?.bestBookmakerPriceDecimal)}</td>
              <td className="px-2 py-2">{price?.forecastPrice ?? "-"}</td>
              <td className="px-2 py-2 tabular-nums">{price?.bookmakerQuoteCount ?? 0}</td>
              <AwSnapshot snapshot={race.prices.early} /><AwSnapshot snapshot={race.prices.t180} /><AwSnapshot snapshot={race.prices.t60} />
              <td className="px-2 py-2 tabular-nums">{decimal(leader.outcome?.finalSp)}</td>
              <td className="px-2 py-2 tabular-nums">{decimal(profit)}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </section>;
}

function AwSnapshot({ snapshot }: { snapshot: ForwardValuePriceSnapshot | null }) {
  return <td className="px-2 py-2 tabular-nums">{snapshot ? <details>
    <summary className="cursor-pointer">{snapshot.decimalPrice.toFixed(2)}</summary>
    <div className="mt-1 whitespace-nowrap text-[11px] text-slate-600">
      <p>{snapshot.capturedAt}</p>
      <p>Edge {snapshot.ratingEdgePercentagePoints.toFixed(2)}pp</p>
      {(snapshot.bookmakerQuotes ?? []).map((q, i) => <p key={`${q.bookmakerId}:${i}`}>{q.bookmakerName ?? "Bookmaker"}: {q.decimalOdds.toFixed(2)}</p>)}
    </div>
  </details> : "-"}</td>;
}
function decimal(value: number | null | undefined) { return value == null ? "-" : value.toFixed(2); }
function pct(value: number | null | undefined) { return value == null ? "-" : `${(value * 100).toFixed(1)}%`; }

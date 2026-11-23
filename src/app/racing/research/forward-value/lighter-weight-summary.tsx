import {
  summarizeTodaysRatingWeight,
  type TodaysRatingWeightForwardData,
  type TodaysRatingWeightObservation,
} from "@/lib/racing/todays-rating-weight-forward";
import { CaptureTime, profitMoney } from "./aw-profitability";

const percent = (value: number | null) => value === null ? "—" : `${(100 * value).toFixed(2)}%`;

type Contribution = { horse: string; course: string; date: string; profit: number };

function summarizeBand(observations: TodaysRatingWeightObservation[]) {
  const totals = summarizeTodaysRatingWeight(observations);
  let finalStakes = 0;
  let finalProfit = 0;
  let capturedWinner: Contribution | null = null;
  let finalWinner: Contribution | null = null;
  for (const { horseName: horse, course, raceDate: date, outcome, market } of observations) {
    if (outcome?.status !== "settled") continue;
    const final = outcome.finalSpProfitLoss;
    const captured = outcome.qualifyingPriceProfitLoss;
    if (final !== null) {
      finalStakes++;
      finalProfit += final;
    }
    if (!outcome.won) continue;
    if (captured !== null && market.qualifying.impliedProbability !== null &&
        (capturedWinner === null || captured > capturedWinner.profit)) {
      capturedWinner = { horse, course, date, profit: captured };
    }
    if (final !== null && (finalWinner === null || final > finalWinner.profit)) {
      finalWinner = { horse, course, date, profit: final };
    }
  }
  return { ...totals, finalStakes, finalProfit: finalStakes ? finalProfit : null,
    finalRoi: finalStakes ? finalProfit / finalStakes : null, capturedWinner, finalWinner };
}

function Winner({ contribution }: { contribution: Contribution | null }) {
  if (!contribution) return <>—</>;
  return <>{contribution.horse} · {profitMoney(contribution.profit)}
    <span className="block text-slate-500">{contribution.course} · {contribution.date}</span></>;
}

export function LighterWeightSummary({ data }: { data: TodaysRatingWeightForwardData }) {
  const { observations } = data;
  const bands = [
    { label: "4–7 lb lighter", summary: summarizeBand(observations.filter(row => row.weightBand === "4-7 lb lighter")) },
    { label: "8+ lb lighter", summary: summarizeBand(observations.filter(row => row.weightBand === "8+ lb lighter")) },
    { label: "Combined", summary: summarizeBand(observations) },
  ];
  const combined = bands[2].summary;
  const metrics = [
    ["Qualifying selections", (s) => s.tracked],
    ["Settled bets", (s) => s.settled],
    ["Winners", (s) => s.winners],
    ["Pending selections", (s) => s.pending],
    ["Void selections", (s) => s.voided],
    ["Captured-price stakes", (s) => s.pricedSettled],
    ["Captured-price £1 P/L", (s) => profitMoney(s.profitLoss)],
    ["Captured-price ROI", (s) => percent(s.roi)],
    ["Final-SP stakes", (s) => s.finalStakes],
    ["Final-SP £1 P/L", (s) => profitMoney(s.finalProfit)],
    ["Final-SP ROI", (s) => percent(s.finalRoi)],
  ] satisfies [string, (summary: typeof combined) => number | string][];
  return <article className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-sm" aria-labelledby="lighter-weight-heading">
    <h3 id="lighter-weight-heading" className="font-semibold">Today&apos;s Rating · Lighter Weight <span className="text-xs text-slate-600">· SHADOW</span></h3>
    <p className="mt-1 text-xs text-slate-600">
      Collection epoch <CaptureTime value={data.epoch} exact /> · Latest capture <CaptureTime value={observations.map(row => row.recordedAt).sort().at(-1) ?? null} />
    </p>
    {observations.length === 0 && <p className="mt-2 text-xs font-semibold text-slate-600">NO DATA · No qualifying selections recorded.</p>}
    <div className="mt-2 overflow-x-auto">
      <table aria-labelledby="lighter-weight-heading" className="w-full text-left text-xs tabular-nums">
        <thead className="border-b border-slate-200 text-slate-600">
          <tr><th scope="col" className="py-1.5 pr-2">Metric</th>
            {bands.map(({ label }) => <th scope="col" className="px-1 py-1.5 text-right sm:px-2" key={label}>{label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {metrics.map(([label, value]) => <tr key={label}>
            <th scope="row" className="py-1.5 pr-2 font-medium">{label}</th>
            {bands.map(({ label: band, summary }) => <td className="whitespace-nowrap px-1 py-1.5 text-right last:font-semibold sm:px-2" key={band}>{value(summary)}</td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
    <p className="mt-2 text-xs tabular-nums text-slate-600">
      Combined · {new Set(observations.map(row => row.raceId)).size} races · {percent(combined.strike)} strike rate · {combined.ae?.toFixed(2) ?? "—"} market A/E
    </p>
    <p className="mt-1 text-xs text-slate-600">Each ROI uses its own settled £1 stakes. Captured-price returns use the bookmaker median at qualification.</p>
    {combined.winners > 0 && <details className="mt-2 border-t border-slate-100 pt-2 text-xs">
      <summary className="cursor-pointer font-medium text-emerald-800">Largest winning contribution</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left tabular-nums">
          <thead className="border-b border-slate-200 text-slate-600"><tr>
            <th scope="col" className="p-1">Band</th><th scope="col" className="p-1">Captured price</th><th scope="col" className="p-1">Final SP</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">{bands.map(({ label, summary }) => <tr key={label}>
            <th scope="row" className="p-1 font-medium">{label}</th>
            <td className="p-1"><Winner contribution={summary.capturedWinner} /></td>
            <td className="p-1"><Winner contribution={summary.finalWinner} /></td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
  </article>;
}

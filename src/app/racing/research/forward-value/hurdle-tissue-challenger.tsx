import { hurdlePairLeader, hurdlePairOutcome, summarizeHurdlePairs, type HurdlePairData, type HurdlePairModel } from "@/lib/racing/hurdle-tissue-challenger-forward";
import { formatRaceTimeForDisplay } from "@/lib/racing/todays-racing";

export function HurdleTissueChallengerSection({ data, date }: { data: HurdlePairData; date: string }) {
  const summary = summarizeHurdlePairs(data);
  const races = data.races.filter((race) => race.raceDate === date).sort((a, b) => a.control.scheduledOffAt.localeCompare(b.control.scheduledOffAt));
  return <section aria-label="Hurdle Tissue Challenger" className="mt-6 border-t border-slate-200 pt-4 text-sm">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold">HURDLE TISSUE CHALLENGER</h2>
      <span className="text-xs text-slate-500">Prospective shadow only</span>
    </div>
    <p className="mt-1 text-xs text-slate-500">CONTROL: Jump Tissue V1 · CHALLENGER: Hurdle Tissue – Excuse Half</p>
    <dl className="my-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[["Tracked", summary.tracked], ["Settled", summary.settled], ["Agree", summary.agree], ["Disagree", summary.disagree]].map(([label, count]) =>
        <div key={label} className="rounded border border-slate-200 bg-white px-3 py-2"><dt className="text-xs text-slate-500">{label}</dt><dd className="font-semibold tabular-nums">{count}</dd></div>)}
    </dl>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px] text-left text-xs">
        <thead className="border-b border-slate-200 text-slate-500"><tr>
          {["Time", "Course", "Control #1", "Control p", "Challenger #1", "Challenger p", "Captured price", "Result", "Agreement"].map((label) => <th key={label} className="px-2 py-2 font-medium">{label}</th>)}
        </tr></thead>
        <tbody>{races.map((race) => <tr key={race.raceId} className="border-b border-slate-100 align-top">
          <td className="whitespace-nowrap px-2 py-2 tabular-nums">{formatRaceTimeForDisplay({ raceDateTime: new Date(race.control.scheduledOffAt), scheduledTime: race.control.scheduledTime })}</td>
          <td className="px-2 py-2">{race.course}</td>
          <td className="px-2 py-2">{hurdlePairLeader(race.control).horseName}</td>
          <td className="px-2 py-2 tabular-nums">{pct(hurdlePairLeader(race.control).probability)}</td>
          <td className="px-2 py-2">{race.classification === "AGREE" ? "Same horse" : hurdlePairLeader(race.challenger).horseName}</td>
          <td className="px-2 py-2 tabular-nums">{pct(hurdlePairLeader(race.challenger).probability)}</td>
          <td className="px-2 py-2 tabular-nums"><div>C {price(race.control)}</div><div>H {price(race.challenger)}</div></td>
          <td className="px-2 py-2"><div>C {result(race.control)}</div><div>H {result(race.challenger)}</div>{race.control.excludedReason && <span className="text-slate-500">Excluded: field changed</span>}</td>
          <td className="px-2 py-2 font-medium">{race.classification}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {!races.length && <p className="py-3 text-xs text-slate-500">No prospective Hurdle captures for {date}.</p>}
  </section>;
}
function pct(value: number | null) { return value === null ? "-" : `${(value * 100).toFixed(1)}%`; }
function price(model: HurdlePairModel) { return model.prices.early ? model.prices.early.decimalPrice.toFixed(2) : "-"; }
function result(model: HurdlePairModel) {
  const profit = model.selectedPriceProfitLoss.early;
  return `${hurdlePairOutcome(model)}${profit === null ? "" : ` · £${profit.toFixed(2)}`}`;
}

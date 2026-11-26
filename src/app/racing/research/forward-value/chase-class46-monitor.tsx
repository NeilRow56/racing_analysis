import {
  chaseClass46Difference, loadChaseClass46, summarizeChaseClass46, type ChaseClass46Data, type ChaseClass46Observation,
} from "@/lib/racing/chase-t3-class46-handicap";
import { CaptureTime, profitMoney, profitPercent } from "./aw-profitability";

const offTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "short" });
const odds = (price: number | null | undefined) => price?.toFixed(2) ?? "Missing";
const classLabel = (value: number | string) => typeof value === "number" ? "Class " + value : value;

function result(outcome: ChaseClass46Observation["outcomes"]["t2"]) {
  if (!outcome) return "Pending";
  if (outcome.status !== "settled") return outcome.status;
  return outcome.winner ? outcome.deadHeatDivisor > 1 ? "Won (dead heat)" : "Won" : "Lost";
}

export async function ChaseClass46Research() {
  const state = await loadChaseClass46().then(data => ({ data, unavailable: false }), () => ({ data: null, unavailable: true }));
  return <ChaseClass46Monitor {...state} />;
}

export function ChaseClass46Monitor({ data, unavailable = false }: { data: ChaseClass46Data | null; unavailable?: boolean }) {
  const m = summarizeChaseClass46(data);
  const changes = data?.races.filter(r => r.decision === "T3_SUBSTITUTION").reverse() ?? [];
  return <section className="mt-4 rounded-md border border-slate-200 bg-white p-3" aria-labelledby="chase-class46-heading">
    <h3 id="chase-class46-heading" className="text-sm font-semibold">Chase T3 Class 4–6 Handicap V1</h3>
    <p className="mt-1 text-xs text-slate-600">
      <strong>{unavailable ? "UNAVAILABLE" : data ? "ARMED" : "UNARMED"}</strong>
      {data && <> · Activated <CaptureTime value={data.armedAt} exact /> · Latest successful collection <CaptureTime value={m.latestCapture} exact /></>}
    </p>
    {data && <>
      <p className="mt-2 text-xs tabular-nums text-slate-700">
        Captured {m.captured} · Pending {m.pending} · Settled {m.settled} ·
        T3 substitutions {m.substitutions} · T2 retained {m.retained} · No selection {m.noSelection} · Winners {m.winners}
      </p>
      <p className="mt-1 text-xs tabular-nums text-slate-700">
        £1 captured P/L {profitMoney(m.capturedPrice.shadow.profit)} · ROI {profitPercent(m.capturedPrice.shadow.roi)} ·
        £1 final-SP P/L {profitMoney(m.finalSp.shadow.profit)} · ROI {profitPercent(m.finalSp.shadow.roi)}
      </p>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-medium text-emerald-800">Matched comparison against original Chase T2</summary>
        <p className="mt-1 text-slate-600">
          Both quotes {m.pairedQuotes}/{m.captured - m.noSelection} selections · Missing either quote {m.missingPrices} ·
          Verified SP or refund on both arms {m.finalSp.pairs}/{m.settled} settled ·
          Winners gained {m.winnersGained} · Winners missed {m.winnersMissed}
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left tabular-nums">
            <thead><tr>{["Cohort", "Price basis", "Pairs", "T2 stakes / W", "T2 P/L", "T2 ROI", "Shadow stakes / W", "Shadow P/L", "Shadow ROI", "Shadow − T2"]
              .map(label => <th key={label} scope="col" className="border-b p-2">{label}</th>)}</tr></thead>
            <tbody>{[{ group: "All", ...m }, ...m.byClass].flatMap(row =>
              [row.capturedPrice, row.finalSp].map(({ basis, pairs, benchmark, shadow, difference }) => <tr key={row.group + "-" + basis}>
                <th scope="row" className="p-2">{classLabel(row.group)}</th>
                {[basis === "captured" ? "Captured bookmaker" : "Final SP", pairs, benchmark.bets + " / " + benchmark.winners, profitMoney(benchmark.profit),
                  profitPercent(benchmark.roi), shadow.bets + " / " + shadow.winners, profitMoney(shadow.profit),
                  profitPercent(shadow.roi), profitMoney(difference)].map((value, i) => <td key={i} className="p-2">{value}</td>)}
              </tr>))}</tbody>
          </table>
        </div>
        <p className="mt-1 text-slate-500">Captured comparison requires both frozen quotes and both outcomes. Refunds contribute £0 with zero stake.</p>
        <p className="mt-2 text-slate-600">Decisions by class · T3 / T2 / no selection</p>
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-slate-700">
          {m.byClass.map(row => <li key={row.group}>{classLabel(row.group)} {row.substitutions} / {row.retained} / {row.noSelection}</li>)}
        </ul>
      </details>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-medium text-emerald-800">Inspect substitutions · {changes.length}</summary>
        <div className="mt-1 overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left tabular-nums">
            <thead><tr>{["Course / off", "Official class", "Original T2 / quote", "Replacement T3 / quote", "T2 / T3 result", "Captured difference", "SP difference"]
              .map(label => <th key={label} scope="col" className="border-b p-2">{label}</th>)}</tr></thead>
            <tbody>{changes.map(row => <tr key={row.raceId}>
              <th scope="row" className="p-2">{row.course} · <time dateTime={row.scheduledOff}>{offTime.format(new Date(row.scheduledOff))}</time></th>
              <td className="p-2">{row.officialClass}</td>
              <td className="p-2">{row.t2?.horseName} / {odds(row.t2?.capturedPrice)}</td>
              <td className="p-2">{row.t3?.horseName} / {odds(row.t3?.capturedPrice)}</td>
              <td className="p-2">{result(row.outcomes.t2)} / {result(row.outcomes.shadow)}</td>
              <td className="p-2">{profitMoney(chaseClass46Difference(row, "captured"))}</td>
              <td className="p-2">{profitMoney(chaseClass46Difference(row, "sp"))}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </>}
  </section>;
}

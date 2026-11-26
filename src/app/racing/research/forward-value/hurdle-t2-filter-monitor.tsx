import { loadHurdleT2Filter, summarizeHurdleT2Filter, type HurdleT2FilterData } from "@/lib/racing/hurdle-t2-nonhandicap-filter";
import { CaptureTime, profitMoney, profitPercent } from "./aw-profitability";

export async function HurdleT2FilterResearch() {
  const result = await loadHurdleT2Filter().then(data => ({ data, unavailable: false }), () => ({ data: null, unavailable: true }));
  return <HurdleT2FilterMonitor {...result} />;
}

export function HurdleT2FilterMonitor({ data, unavailable = false }: { data: HurdleT2FilterData | null; unavailable?: boolean }) {
  const metrics = summarizeHurdleT2Filter(data);
  const final = metrics.prices.find(row => row.basis === "sp")!;
  return <section className="mt-4 rounded-md border border-slate-200 bg-white p-3" aria-labelledby="hurdle-t2-filter-heading">
    <h3 id="hurdle-t2-filter-heading" className="text-sm font-semibold">Hurdle T2 Non-Handicap Filter V1</h3>
    <p className="mt-1 text-xs text-slate-600">
      <strong>{unavailable ? "UNAVAILABLE" : data ? "ARMED" : "UNARMED"}</strong>
      {data && <> · Activated <CaptureTime value={data.armedAt} exact /> · Latest successful collection <CaptureTime value={metrics.latestCapture} exact /></>}
    </p>
    {data && <>
      <p className="mt-2 text-xs tabular-nums text-slate-700">
        Eligible {metrics.eligible} · Selected bets {metrics.selected} · Abstentions {metrics.abstentions} ·
        Pending {metrics.pending} · Settled starters {metrics.settled} · Refunds {metrics.refunds} ·
        Winners {metrics.winners} · Winners missed {metrics.missedWinners} · £1 SP P/L {profitMoney(final.shadow.profit)} · ROI {profitPercent(final.shadow.roi)}
      </p>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-medium text-emerald-800">Matched comparison against original T2</summary>
        <p className="mt-1 text-slate-600">
          Original T2 winners {metrics.benchmarkWinners} · Captured T2 quotes {metrics.capturedQuotes}/{metrics.eligible} ·
          Verified final SP {final.benchmark.bets}/{metrics.settled} settled starters.
        </p>
        <div className="mt-1 overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left tabular-nums">
            <thead><tr>{["Price basis", "T2 stakes", "T2 P/L", "T2 ROI", "Shadow stakes", "Shadow P/L", "Shadow ROI", "Shadow − T2"]
              .map(label => <th key={label} scope="col" className="border-b p-2">{label}</th>)}</tr></thead>
            <tbody>{metrics.prices.map(({ basis, benchmark, shadow, difference }) => <tr key={basis}>
              <th scope="row" className="p-2">{basis === "captured" ? "Captured bookmaker" : "Final SP"}</th>
              {[benchmark.bets, profitMoney(benchmark.profit), profitPercent(benchmark.roi), shadow.bets,
                profitMoney(shadow.profit), profitPercent(shadow.roi), profitMoney(difference)].map((value, index) => <td key={index} className="p-2">{value}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
        <p className="mt-1 text-slate-500">Same frozen opportunities. Abstentions contribute £0. Missing prices and refunds have no stake on that basis.</p>
      </details>
    </>}
  </section>;
}

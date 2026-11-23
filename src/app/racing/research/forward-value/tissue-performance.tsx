import { summarizeTissueGeneration, type GenerationData } from "@/lib/racing/tissue-generation-forward";
import { profitMoney, profitPercent } from "./aw-profitability";
import { TissueGenerationMonitor } from "./tissue-generation-monitor";

const labels = { TURF: "Turf", AW: "All Weather", HURDLE: "Hurdle", CHASE: "Chase" } as const;

export function TissuePerformance({ generation }: { generation: GenerationData }) {
  const groups = summarizeTissueGeneration(generation).filter(group => group.rank !== "TOP_2");
  return <>
    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-xs tabular-nums">
        <caption className="px-3 pt-3 text-left font-semibold text-slate-700">Original T1 and T2 · captured bookmaker prices</caption>
        <thead className="border-b border-slate-200 text-slate-600"><tr>
          {["Family", "Rank", "Settled", "Wins", "Priced stakes", "£1 P/L", "ROI", "Model A/E"].map(h => <th scope="col" key={h} className="px-2 py-2">{h}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-slate-100">
          {Object.entries(labels).flatMap(([family, label]) => groups.map(({ rank, rows }) => {
            const row = rows.find(r => r.family === family)!;
            return <tr key={`${family}-${rank}`}><th scope="row" className="px-2 py-1.5 font-medium">{label}</th>
              {[`T${rank}`, row.settled, row.winners, row.priceN, profitMoney(row.profitLoss), profitPercent(row.roi),
                row.actualModelExpected?.toFixed(2) ?? "—"].map((value, i) => <td key={i} className="whitespace-nowrap px-2 py-1.5">{value}</td>)}
            </tr>;
          }))}
        </tbody>
      </table>
    </div>
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer font-medium text-emerald-800">Detailed Tissue performance and Top 2 totals</summary>
      <TissueGenerationMonitor data={generation} />
    </details>
  </>;
}

import { summarizeTissueGeneration, type GenerationData } from "@/lib/racing/tissue-generation-forward";
import { TISSUE_GENERATION_EPOCH } from "@/lib/racing/tissue-generation-config";
const pct = (v: number | null) => v === null ? "—" : `${(v * 100).toFixed(2)}%`;
const num = (v: number | null) => v === null ? "—" : v.toFixed(2);

export function TissueGenerationMonitor({ data }: { data: GenerationData }) {
  return <section className="mt-5 border border-slate-300 bg-white p-4" aria-labelledby="clean-tissue-heading">
    <h3 id="clean-tissue-heading" className="text-base font-semibold">New Tissue generation · prospective evaluation</h3>
    <p className="mt-1 text-sm text-slate-600">How is the new Tissue generation performing prospectively? Since {TISSUE_GENERATION_EPOCH}. Models remain frozen; no historical backfill.</p>
    <p className="mt-2 text-xs text-slate-500">The models incorporate findings from the previous research period. Development results are not independent prospective validation. Only new-generation captures enter these headline counts.</p>
    {summarizeTissueGeneration(data).map(group => <div key={group.rank} className="mt-4 overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
      <caption className="mb-2 text-left font-semibold">{group.rank === "TOP_2" ? "TISSUE TOP 2" : `TISSUE RANK ${group.rank}`}</caption>
      <thead><tr>{["Family", "Captured", "Settled", "Winners", "Strike", "Model expected", "Actual/model", "Price n", "Captured-price £1 P/L", "ROI", "Sample"].map(h => <th key={h} scope="col" className="border-b p-2">{h}</th>)}</tr></thead>
      <tbody>{group.rows.map(row => <tr key={row.family}><th scope="row" className="p-2 font-medium">{row.family}</th><td className="p-2">{row.captured}</td>
        <td className="p-2">{row.settled}</td><td className="p-2">{row.winners}</td><td className="p-2">{pct(row.strikeRate)}</td><td className="p-2">{num(row.modelExpected)}</td>
        <td className="p-2">{num(row.actualModelExpected)}</td><td className="p-2">{row.priceN}</td><td className="p-2">{num(row.profitLoss)}</td><td className="p-2">{pct(row.roi)}</td>
        <td className="p-2">{row.sample === "TOO EARLY" ? "EARLY" : row.sample}</td></tr>)}</tbody>
    </table></div>)}
    <p className="mt-3 text-xs text-slate-500">Model performance uses the broader family model cohort. Monetary results use only the smaller complete-market frozen-price subset, separately from the Value cohort; do not mix these denominators. Value 1 logic and its existing capture cohorts are unchanged. NR/void are excluded from settled stakes; pending results stay pending. Top 2 counts selections, not races.</p>
  </section>;
}

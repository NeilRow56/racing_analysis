import { summarizeProspectiveTissue, type ProspectiveTissueObservation } from "@/lib/racing/tissue-prospective-summary";

const pct = (n: number | null) => n === null ? "—" : `${(n * 100).toFixed(2)}%`;
const number = (n: number | null) => n === null ? "—" : n.toFixed(2);
const money = (n: number | null) => n === null ? "—" : `${n < 0 ? "−" : n > 0 ? "+" : ""}£${Math.abs(n).toFixed(2)}`;
const labels = { TURF: "Turf", AW: "AW", HURDLE: "Hurdle", CHASE: "Chase", ALL: "All families" };

export function TissueProspectiveSummary({ observations, priceObservations = [], quarantined = [], unresolvedResults = [] }: {
  observations: ProspectiveTissueObservation[]; priceObservations?: ProspectiveTissueObservation[];
  quarantined?: Array<{ family: string; sourceId: string; raceId: string; reason: string }>; unresolvedResults?: string[];
}) {
  const prices = summarizeProspectiveTissue(priceObservations);
  return <section className="mt-6 border-t-2 border-slate-300 pt-4" aria-labelledby="tissue-prospective-heading">
    <h3 id="tissue-prospective-heading" className="text-base font-semibold">Tissue Rank 1 &amp; 2 — Prospective</h3>
    <p className="mt-1 text-sm text-slate-600">Frozen prospective Tissue ranks since 20 October 2026</p>
    {summarizeProspectiveTissue(observations).map((section, sectionIndex) => <div key={section.rank} className="mt-3 overflow-x-auto">
      <table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
        <caption className="mb-1 text-left font-semibold">{section.rank === "TOP_2" ? "TISSUE TOP 2" : `TISSUE RANK ${section.rank}`}</caption>
        <thead><tr><th scope="colgroup" colSpan={7} className="border-b px-2 py-1 text-slate-600">Family Tissue books · model results</th><th scope="colgroup" colSpan={3} className="border-b bg-amber-50 px-2 py-1 text-slate-600">Separate Value cohort · captured-price returns</th><th scope="col" rowSpan={2} className="border-b px-2 py-1">Sample</th></tr><tr>{["Family", "Captured", "Settled", "Winners", "Strike", "Model exp.", "Actual/model", "Price n", "Captured-price P/L", "ROI"].map(h => <th scope="col" key={h} className="border-b px-2 py-1 font-medium">{h}</th>)}</tr></thead>
        <tbody>{section.rows.map((row, rowIndex) => {
          const priced = prices[sectionIndex].rows[rowIndex];
          return <tr key={row.family} className={row.family === "ALL" ? "border-t bg-slate-50 font-medium" : ""}>
          <th scope="row" className="px-2 py-1 font-medium">{labels[row.family]}</th>
          <td className="px-2 py-1">{row.captured}</td><td className="px-2 py-1">{row.settled}</td><td className="px-2 py-1">{row.winners}</td>
          <td className="px-2 py-1">{pct(row.strikeRate)}</td><td className="px-2 py-1">{number(row.modelExpected)}</td><td className="px-2 py-1">{number(row.actualModelExpected)}</td>
          <td className="bg-amber-50/50 px-2 py-1">{priced.priceN}</td><td className="bg-amber-50/50 px-2 py-1">{money(priced.profitLoss)}</td><td className="bg-amber-50/50 px-2 py-1">{pct(priced.roi)}</td><td className="px-2 py-1 text-[10px]">{row.sample}</td>
        </tr>;
        })}</tbody>
      </table>
    </div>)}
    <p className="mt-2 text-xs text-slate-600">Model results use the broader family books (Turf v3, AW v2, Jump v1). Price n, P/L and ROI use only the separate complete-market Value Monitoring cohort, filtered by its own frozen Tissue ranks. Capture times and probabilities can differ; these returns do not describe every runner in the model-result columns.</p>
    <p className="mt-2 text-xs text-slate-500">Tissue rank only. All families is a descriptive pool of different Tissue models. Model expected sums frozen probabilities for settled starters; pending observations count only in Captured. NR/void are excluded from settled metrics and stakes. Each dead-heat winner counts as a winner; P/L uses the stored canonical settlement.</p>
    <p className="mt-1 text-xs text-slate-500">Price n counts settled £1 stakes with a genuine frozen bookmaker price &gt;1 and a stored return. Missing prices contribute no stake or P/L. ROI uses Price n only. Sample labels describe the primary settled sample size, not model quality. Top 2 counts runner observations; runners in the same race are dependent.</p>
    {quarantined.length > 0 ? <details className="mt-2 text-xs text-amber-800"><summary className="cursor-pointer">Reporting quarantine: {quarantined.length} unresolved race identities excluded from captured totals</summary><ul className="mt-1 list-inside list-disc">{quarantined.map(row => <li key={row.raceId}>{row.family} {row.sourceId}: {row.reason} (stored race {row.raceId})</li>)}</ul><p>Reporting exclusion only; stored records remain intact pending identity review.</p></details> : null}
    {unresolvedResults.length > 0 ? <p className="mt-2 text-xs text-amber-800">{unresolvedResults.length} Turf runner results lack unambiguous status evidence; counted in Captured only until canonical result evidence is available.</p> : null}
  </section>;
}

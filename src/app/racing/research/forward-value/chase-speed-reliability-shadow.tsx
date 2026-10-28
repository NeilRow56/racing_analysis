import { CHASE_SPEED_RELIABILITY_DECLARED, CHASE_SPEED_RELIABILITY_EPOCH, summarizeChaseSpeedReliability, type ChaseSpeedObservation } from "@/lib/racing/chase-speed-reliability-shadow";
const num = (v: number | null) => v === null ? "—" : v.toFixed(3);
const pct = (v: number | null) => v === null ? "—" : `${(v * 100).toFixed(2)}%`;
const money = (v: number | null) => v === null ? "—" : `£${v.toFixed(2)}`;
export function ChaseSpeedReliabilityShadow({ observations, priceObservations }: { observations: ChaseSpeedObservation[]; priceObservations: ChaseSpeedObservation[] }) {
  const periods = summarizeChaseSpeedReliability(observations, priceObservations);
  return <section className="mt-6 border-t border-slate-300 pt-4" aria-labelledby="chase-speed-heading">
    <h3 id="chase-speed-heading" className="text-base font-semibold">Chase Speed Reliability — Research Watch</h3>
    <p className="mt-1 text-sm text-slate-600">Prospective Chase Tissue Rank 1/2 performance by Jump Speed reliability. No exclusion rule applied.</p>
    <p className="mt-1 text-xs text-slate-500">Primary comparison: HIGH vs MEDIUM/LOW. Actual/model expected is primary; ROI is secondary. Chase Speed Reliability Shadow epoch: {CHASE_SPEED_RELIABILITY_EPOCH}. Hypothesis declared: {CHASE_SPEED_RELIABILITY_DECLARED}.</p>
    {periods.map(period => <details key={period.phase} open={period.phase === "POST"} className="mt-3 text-xs">
      <summary className="cursor-pointer font-semibold">{period.phase === "POST" ? "POST-DECLARATION / prospective confirmation" : period.phase === "PRE" ? "PRE-DECLARATION / discovery context" : "UNKNOWN CAPTURE CLOCK"}</summary>
      <p className="mt-1 text-slate-500">Unclassified frozen state: {period.unavailable} family-book observations; {period.priceUnavailable} Value observations. These remain in existing summaries and are absent from reliability groups.</p>
      {period.ranks.map(section => <div key={section.rank} className="mt-2 overflow-x-auto"><table className="w-full whitespace-nowrap text-left tabular-nums">
        <caption className="text-left font-semibold">{section.rank === "TOP_2" ? "CHASE TOP 2" : `CHASE TISSUE RANK ${section.rank}`}</caption>
        <thead><tr>{["Reliability", "Captured", "Settled", "Winners", "Strike", "Mean Tissue p", "Model exp.", "Actual/model", "Value price n", "Value P/L", "Value ROI", "Sample"].map(h => <th key={h} scope="col" className="border-b px-2 py-1">{h}</th>)}</tr></thead>
        <tbody>{section.rows.map(r => <tr key={r.group}><th scope="row" className="px-2 py-1 text-left">{r.group}</th>{[r.captured, r.settled, r.winners, pct(r.strikeRate), pct(r.meanTissueProbability), num(r.modelExpected), num(r.actualModelExpected), r.price.priceN, money(r.price.profitLoss), pct(r.price.roi), r.sample].map((v, i) => <td key={i} className="px-2 py-1">{v}</td>)}</tr>)}</tbody>
      </table></div>)}
      <details className="mt-2"><summary className="cursor-pointer">Descriptive Top 2 context — HIGH vs MEDIUM/LOW</summary>
        {period.contexts.map(context => <div key={context.name} className="mt-2 overflow-x-auto"><table className="w-full whitespace-nowrap text-left tabular-nums"><caption className="text-left font-semibold">{context.name}</caption>
          <thead><tr>{["Reliability", "Band", "Settled", "Winners", "Actual/model", "Value settled", "Value winners", "Value Actual/model"].map(h => <th key={h} scope="col" className="border-b px-2 py-1">{h}</th>)}</tr></thead>
          <tbody>{context.rows.map(r => <tr key={`${r.group}-${r.label}`}><th scope="row" className="px-2 py-1">{r.group}</th>{[r.label, r.settled, r.winners, num(r.actualModelExpected), r.price.settled, r.price.winners, num(r.price.actualModelExpected)].map((v, i) => <td key={i} className="px-2 py-1">{v}</td>)}</tr>)}</tbody>
        </table></div>)}
      </details>
    </details>)}
    <p className="mt-2 text-xs text-slate-500">Family-book model results and separate complete-market Value returns use their own frozen ranks, probabilities, reliability and capture clocks; populations may differ. Market rank and ratio are available in Value only. Mean Tissue probability uses settled starters. Pending counts only in Captured; NR/void excluded. Prices and returns follow existing canonical settlement. Top 2 runners share races and are dependent. Context splits are descriptive, with no combined rule.</p>
    <p className="mt-1 text-xs text-slate-500">Earlier diagnostic reliability was reconstructed from history, not frozen at capture. It is not prospective confirmation and is not backfilled here. Missing frozen state is not LOW. Sample: &lt;50 TOO EARLY; 50–149 EARLY; 150–299 DEVELOPING; 300+ MEANINGFUL.</p>
  </section>;
}

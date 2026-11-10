import { loadPositiveNeutralContext, type PositiveNeutralData } from "@/lib/racing/tissue-positive-neutral";
import { summarizePositiveNeutral } from "@/lib/racing/tissue-positive-neutral-metrics";
import type { GenerationData } from "@/lib/racing/tissue-generation-forward";

const pct = (x: number | null) => x === null ? "—" : `${(100 * x).toFixed(2)}%`;
const num = (x: number | null) => x === null ? "—" : x.toFixed(4);
const money = (x: number | null) => x === null ? "—" : `£${x.toFixed(2)}`;
type Summary = ReturnType<typeof summarizePositiveNeutral>;
type MetricsRow = Omit<Summary["negative"][number], "rank"> & { rank: 1 | 2 | "TOP2"; badge?: string; band?: string };
function BadgeMetricsTable({ caption, rows }: { caption: string; rows: MetricsRow[] }) {
  return <div className="mt-3 overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs tabular-nums"><caption className="mb-1 text-left font-semibold">{caption}</caption>
    <thead><tr>{["Family", "Selection", "Badge / band", "Captured", "Settled", "Winners", "Strike", "Expected", "Actual/Model", "Price N", "£1 P/L", "ROI", "Binary log loss", "Brier", "Avg market rank", "Avg edge pp"].map(h => <th className="border-b p-2" key={h}>{h}</th>)}</tr></thead>
    <tbody>{rows.map(r => <tr key={`${r.family}-${r.rank}-${r.badge ?? r.band ?? "all"}`}><th className="p-2 font-medium">{r.family}</th><td className="p-2">{r.rank === "TOP2" ? "Top2" : `T${r.rank}`}</td><td className="p-2">{r.badge ?? r.band ?? "NEGATIVE"}</td><td className="p-2">{r.captured}</td><td className="p-2">{r.settled}</td><td className="p-2">{r.winners}</td><td className="p-2">{pct(r.strikeRate)}</td><td className="p-2">{num(r.expected)}</td><td className="p-2">{num(r.actualModel)}</td><td className="p-2">{r.priceObservations}</td><td className="p-2">{money(r.profitLoss)}</td><td className="p-2">{pct(r.roi)}</td><td className="p-2">{num(r.logLoss)}</td><td className="p-2">{num(r.brier)}</td><td className="p-2">{num(r.averageMarketRank)}</td><td className="p-2">{num(r.averageEdgePP)}</td></tr>)}</tbody>
  </table></div>;
}
export async function TissuePositiveNeutralResearch() {
  const context = await loadPositiveNeutralContext().catch(() => null);
  if (!context) return <p className="mt-4 text-sm text-amber-800">Tissue badge monitor unavailable. Production is unchanged.</p>;
  return <TissuePositiveNeutralMonitor {...context} />;
}
export function TissuePositiveNeutralMonitor({ data, generation }: { data: PositiveNeutralData | null; generation: GenerationData | null }) {
  const s = summarizePositiveNeutral(data, generation);
  return <section className="mt-5 border border-slate-300 bg-white p-4" aria-labelledby="tissue-positive-neutral-heading">
    <h3 id="tissue-positive-neutral-heading" className="text-base font-semibold">TISSUE — POSITIVE / NEUTRAL MARKET BADGES</h3>
    <p className="mt-1 text-sm text-slate-600">{data ? "ARMED" : "NOT ARMED"}. Epoch: {data?.epoch ?? "pending first genuine capture"}. No historical backfill. Production Tissue only; Hurdle V2, with V3 shadow kept separate.</p>
    <p className="mt-1 text-xs text-slate-500">{s.capturedRaces} captured races; {s.includedSelections} frozen positive/neutral selections; {s.fallbackSelections} fallback selections excluded; {s.unavailableRaces.length} exact sources unavailable. Negative badges are reference only.</p>
    <div className="mt-3 overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs tabular-nums"><caption className="mb-1 text-left font-semibold">Positive + Neutral, T1 and T2 separately</caption>
      <thead><tr>{["Family", "T1 settled", "T1 winners", "T1 Actual/Model", "T1 ROI", "T2 settled", "T2 winners", "T2 Actual/Model", "T2 ROI"].map(h => <th key={h} className="border-b p-2">{h}</th>)}</tr></thead>
      <tbody>{s.headline.map(r => <tr key={r.family}><th className="p-2 font-medium">{r.family === "ALL" ? "ALL FAMILIES" : r.family}</th><td className="p-2">{r.t1.settled}</td><td className="p-2">{r.t1.winners}</td><td className="p-2">{num(r.t1.actualModel)}</td><td className="p-2">{pct(r.t1.roi)}</td><td className="p-2">{r.t2.settled}</td><td className="p-2">{r.t2.winners}</td><td className="p-2">{num(r.t2.actualModel)}</td><td className="p-2">{pct(r.t2.roi)}</td></tr>)}</tbody>
    </table></div>
    <details className="mt-3"><summary className="cursor-pointer text-sm">Positive versus Neutral and combined Top2</summary><BadgeMetricsTable caption="Badge cohorts" rows={s.cohorts} /><BadgeMetricsTable caption="TOP2 POSITIVE + NEUTRAL COMBINED (pooled selections, £1 per horse)" rows={s.top2.map(r => ({ ...r, badge: "T1 + T2 pooled" }))} /></details>
    <details className="mt-3"><summary className="cursor-pointer text-sm">Price bands and positive edge bands</summary><BadgeMetricsTable caption="Positive/Neutral selections by captured price" rows={s.price} /><BadgeMetricsTable caption="Positive selections by frozen edge pp" rows={s.edge} /></details>
    <details className="mt-3"><summary className="cursor-pointer text-sm">All Tissue versus filtered Tissue</summary>
      <BadgeMetricsTable caption="Same prospective period; ALL includes negative and fallback references" rows={s.comparisons.flatMap(r => [{ ...r.all, family: r.family, rank: r.rank, badge: "ALL TISSUE" }, { ...r.filtered, family: r.family, rank: r.rank, badge: "POSITIVE + NEUTRAL" }])} />
      <div className="mt-3 overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs"><caption className="mb-1 text-left font-semibold">Filtered minus all Tissue</caption><thead><tr>{["Family", "Selection", "Strike delta pp", "Actual/Model delta", "ROI delta pp", "Log-loss delta", "Market-rank delta"].map(h => <th key={h} className="border-b p-2">{h}</th>)}</tr></thead><tbody>{s.comparisons.map(r => <tr key={`${r.family}-${r.rank}`}><th className="p-2">{r.family}</th><td className="p-2">T{r.rank}</td><td className="p-2">{r.difference.strikeRate === null ? "—" : (100 * r.difference.strikeRate).toFixed(2)}</td><td className="p-2">{num(r.difference.actualModel)}</td><td className="p-2">{r.difference.roi === null ? "—" : (100 * r.difference.roi).toFixed(2)}</td><td className="p-2">{num(r.difference.logLoss)}</td><td className="p-2">{num(r.difference.averageMarketRank)}</td></tr>)}</tbody></table></div>
    </details>
    <details className="mt-3"><summary className="cursor-pointer text-sm">Negative reference only</summary><BadgeMetricsTable caption="Excluded from headline" rows={s.negative} /></details>
    <p className="mt-2 text-xs text-slate-500">Badge tolerance stays 0.5 pp. Edge bands: +0.5–&lt;2, 2–&lt;5, 5–&lt;10, 10+ pp. Price bands: &lt;3, 3–&lt;5, 5–&lt;11, 11+. Descriptive monitoring only; no new betting rule.</p>
    <p className="mt-1 text-xs text-slate-500">NR/void selections are excluded from settled denominators and stakes, with no promotion. Dead heats split Actual/Model credit; strike counts winning selections. Scores are selection-level Bernoulli loss/Brier at the frozen probability. P/L uses canonical £1 settlements and frozen prices. Average rank/edge cover captured selections with available values. All-Tissue baseline includes fallback observations, which may lack a priced settlement.</p>
  </section>;
}

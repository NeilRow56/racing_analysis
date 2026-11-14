import type { LowFormData } from "@/lib/racing/hurdle-low-form";
import { loadLowFormContext } from "@/lib/racing/profiled-monitor-readers";
import { summarizeLowForm } from "@/lib/racing/hurdle-low-form-metrics";
import type { HurdleV3ShadowData } from "@/lib/racing/hurdle-v3-shadow";
const num = (n: number | null) => n === null ? "—" : n.toFixed(4);
export async function LowFormHurdleResearch() {
  const result = await loadLowFormContext().catch(() => null);
  if (!result) return <p className="mt-3 text-xs text-amber-800">Low-form Hurdle monitor unavailable.</p>;
  return <LowFormHurdleMonitor data={result.data} shadows={result.shadows} />;
}
export function LowFormHurdleMonitor({ data, shadows }: { data: LowFormData | null; shadows: HurdleV3ShadowData | null }) {
  const summary = summarizeLowForm(data, shadows);
  type Row = typeof summary.rows[number];
  const hits = (r: Row["v3"], rank: number | string) => { const pick = r.selections.find(s => s.rank === rank)!; return `${pick.winners}/${pick.eligible}`; };
  const table = (rows: Row[], monthly = false) => <div className="mt-2 overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
    <thead><tr>{[...(monthly ? ["Month"] : []), "Cohort", "Races", "Settled", "Priced / settled", "V3 log loss (paired)", "Market log loss", "V3 Top1", "Market Top1", "V3 Top2", "Market Top2"].map(h => <th key={h} className="border-b p-2">{h}</th>)}</tr></thead>
    <tbody>{rows.map(r => <tr key={`${r.month}-${r.cohort}`}>{monthly && <td className="p-2">{r.month}</td>}<th className="p-2 font-medium">{r.cohort}</th>
      <td className="p-2">{r.races}</td><td className="p-2">{r.settled}</td><td className="p-2">{r.market.racesCaptured} / {r.market.racesSettled}</td>
      <td className="p-2">{num(r.pairedV3.logLoss)}</td><td className="p-2">{num(r.market.logLoss)}</td>
      <td className="p-2">{hits(r.pairedV3, 1)}</td><td className="p-2">{hits(r.market, 1)}</td><td className="p-2">{hits(r.pairedV3, "TOP2")}</td><td className="p-2">{hits(r.market, "TOP2")}</td></tr>)}</tbody>
  </table></div>;
  const details = (rows: Row[]) => rows.map(r => <div key={`${r.month}-${r.cohort}`} className="mt-3">
    <p className="font-medium">{r.month} {r.cohort} · market unavailable/incomplete {r.marketUnavailable}; source unavailable {r.sourceUnavailable}</p>
    <table className="w-full text-left tabular-nums"><thead><tr>{["Model / coverage", "Captured / settled", "Log loss", "Brier", "ECE", "Top1", "Top2"].map(h => <th className="p-1" key={h}>{h}</th>)}</tr></thead><tbody>
      {[r.v3, r.market, r.v2].map(m => <tr key={m.model}><td className="p-1">{m.model}{m.model === "MARKET" ? " · complete only" : " · all captures"}</td><td>{m.racesCaptured} / {m.racesSettled}</td><td>{num(m.logLoss)}</td><td>{num(m.brier)}</td><td>{num(m.calibrationECE)}</td><td>{hits(m, 1)}</td><td>{hits(m, "TOP2")}</td></tr>)}
    </tbody></table>
    <p>Head-to-head: MARKET BETTER {r.headToHead.filter(h => h.verdict === "MARKET BETTER").length}; V3 BETTER {r.headToHead.filter(h => h.verdict === "V3 BETTER").length}; SAME {r.headToHead.filter(h => h.verdict === "SAME").length}. Exclusive Top2: market {r.headToHead.filter(h => h.marketOnlyTop2).length}; V3 {r.headToHead.filter(h => h.v3OnlyTop2).length}.</p>
  </div>);
  return <section className="mt-5 border border-slate-300 bg-white p-4" aria-labelledby="low-form-heading">
    <h3 id="low-form-heading" className="text-sm font-semibold">LOW-FORM HURDLE — PROSPECTIVE V3 VS MARKET</h3>
    <p className="mt-1 text-xs text-slate-600">Epoch: {data?.epoch ?? "pending first genuine low-form pre-off capture"}. Primary cohort: VERY LOW + LIMITED. MIXED is separate. V2 is secondary. No historical backfill.</p>
    {table(summary.rows)}
    <p className="mt-2 text-xs text-slate-500">Headline comparisons use identical complete-market races. Hits show winners / eligible settled selections. NR/void picks are excluded without replacement. Dead heats split probability target credit equally; probabilities renormalize over starters. Established fields are outside these totals ({summary.established} captured).</p>
    <details className="mt-3 text-xs"><summary>Monthly breakdown · October–January and other captured months</summary>{table(summary.monthly, true)}{details(summary.monthly)}</details>
    <details className="mt-3 text-xs"><summary>All-capture V3, market, V2 and probability metrics</summary>{details(summary.rows)}<p>Calibration ECE uses ten fixed bins. Full calibration bins are retained in the summary. Verdict uses race log loss, then winner rank to break a numerical tie; both criteria are shown below.</p></details>
    <details className="mt-3 text-xs"><summary>Settled race head-to-head</summary><div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left"><thead><tr>{["Race", "Cohort", "Month", "V3 / market winner rank", "V3 / market loss", "Rank verdict", "Loss verdict", "Verdict", "Exclusive Top2"].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{summary.rows.slice(0, 3).flatMap(r => r.headToHead.map(h => <tr key={h.raceId}><td className="p-2">{h.raceId}</td><td>{h.classification}</td><td>{h.month}</td><td>{h.v3WinnerRanks.join("/")} / {h.marketWinnerRanks.join("/")}</td><td>{num(h.v3LogLoss)} / {num(h.marketLogLoss)}</td><td>{h.winnerRankVerdict}</td><td>{h.logLossVerdict}</td><td>{h.verdict}</td><td>{h.marketOnlyTop2 ? "Market" : h.v3OnlyTop2 ? "V3" : "—"}</td></tr>))}</tbody></table></div></details>
    {summary.unavailable.length > 0 && <p className="mt-2 text-xs text-amber-800">{summary.unavailable.length} frozen shadow references unavailable; excluded from metrics.</p>}
  </section>;
}

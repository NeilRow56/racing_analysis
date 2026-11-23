import type { EarlyTurfData } from "@/lib/racing/turf-early-season";
import { loadEarlyTurfContext } from "@/lib/racing/profiled-monitor-readers";
import { summarizeEarlyTurf } from "@/lib/racing/turf-early-season-metrics";
import type { GenerationData } from "@/lib/racing/tissue-generation-forward";
import { CaptureTime } from "./aw-profitability";
import { EARLY_TURF_VERSION } from "@/lib/racing/turf-early-season-method";
const num = (n: number | null) => n === null ? "—" : n.toFixed(4);
export async function EarlyTurfResearch() {
  const context = await loadEarlyTurfContext().catch(() => null);
  return context ? <EarlyTurfMonitor {...context} /> : <p className="mt-3 text-xs text-amber-800">2027 Early Turf monitor unavailable.</p>;
}
export function EarlyTurfMonitor({ data, generation }: { data: EarlyTurfData | null; generation: GenerationData }) {
  const summary = summarizeEarlyTurf(data, generation);
  type Row = typeof summary.rows[number];
  const hits = (m: Row["v4"], rank: number | string) => { const p = m.selections.find(p => p.rank === rank)!; return `${p.winners}/${p.eligible}`; };
  const table = (rows: Row[], monthly = false) => <div className="mt-2 overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
    <thead><tr>{[...(monthly ? ["Month"] : []), "Cohort", "Races", "Settled", "V4 log loss (paired)", "Market log loss", "Difference", "V4 Top1", "Market Top1", "V4 Top2", "Market Top2", "Market coverage"].map(h => <th key={h} className="border-b p-2">{h}</th>)}</tr></thead>
    <tbody>{rows.map(r => <tr key={`${r.month}-${r.cohort}`}>{monthly && <td className="p-2">{r.month}</td>}<th className="p-2 font-medium">{r.cohort}</th>
      <td className="p-2">{r.races}</td><td className="p-2">{r.settled}</td><td className="p-2">{num(r.pairedV4.logLoss)}</td><td className="p-2">{num(r.market.logLoss)}</td><td className="p-2">{num(r.logLossDifference)}</td>
      <td className="p-2">{hits(r.pairedV4, 1)}</td><td className="p-2">{hits(r.market, 1)}</td><td className="p-2">{hits(r.pairedV4, "TOP2")}</td><td className="p-2">{hits(r.market, "TOP2")}</td><td className="p-2">{r.races - r.marketUnavailable}/{r.races}</td></tr>)}</tbody>
  </table></div>;
  return <section className="mt-5 border border-slate-300 bg-white p-4" aria-labelledby="early-turf-heading">
    <h3 id="early-turf-heading" className="text-sm font-semibold">TURF V4 — 2027 Early-Season Monitoring</h3>
    <p className="mt-1 text-sm text-slate-600">Prospective Turf V4 versus market evaluation for 1 March–31 July 2027.</p>
    <p className="mt-1 break-words text-xs text-slate-500">
      {data ? data.epoch ? "ARMED" : "ARMED · AWAITING FIRST CAPTURE" : "NOT ARMED"} · {data?.version ?? EARLY_TURF_VERSION}
      {data?.epoch && <> · First capture <time dateTime={data.epoch}>{data.epoch}</time></>}. Primary cohort: VERY LOW + LIMITED. No historical backfill.
    </p>
    {data && <p className="mt-1 text-xs text-slate-600">Activated <CaptureTime value={data.armedAt} exact /> · Latest capture <CaptureTime value={data.observations.at(-1)?.frozenAt ?? null} exact /></p>}
    {table(summary.rows)}
    <p className="mt-2 text-xs text-slate-500">Comparisons use identical complete pre-off books. Difference = V4 minus market log loss. Hits = winners / eligible races. NR/void picks excluded without replacement. Native V4 competition ranks retained, including ties.</p>
    <details className="mt-3 text-xs"><summary>Monthly breakdown · March–July 2027</summary>{table(summary.monthly, true)}</details>
    <details className="mt-3 text-xs"><summary>All-capture V4 and market probability metrics</summary>{summary.rows.map(r => <div className="mt-2" key={r.cohort}><p className="font-medium">{r.cohort} · missing market {r.marketUnavailable}; unavailable source {r.sourceUnavailable}</p>
      {[r.v4, r.market].map((m, i) => <p key={i}>{i ? "Market" : "V4 all captures"}: captured {m.races}; settled {m.settled}; pending {m.pending}; void {m.void}; log loss {num(m.logLoss)}; Brier {num(m.brier)}; ECE {num(m.calibrationECE)}; winner rank {num(m.meanWinnerRank)}; Top1 {hits(m, 1)}; Top2 {hits(m, "TOP2")}</p>)}
    </div>)}<p>Calibration uses ten fixed probability bins; dead heats use fractional winner targets. Full bins and selection credit are available in the terminal summary.</p></details>
    <details className="mt-3 text-xs"><summary>Settled head-to-head · {summary.headToHead.length} races</summary>
      <p>V4 BETTER {summary.headToHead.filter(h => h.verdict === "V4 BETTER").length}; MARKET BETTER {summary.headToHead.filter(h => h.verdict === "MARKET BETTER").length}; SAME / INCONCLUSIVE {summary.headToHead.filter(h => h.verdict === "SAME / INCONCLUSIVE").length}.</p>
      {summary.headToHead.map(h => <p key={h.raceId}>{h.raceId} · {h.month} · {h.cohort} · {h.verdict} · winner ranks V4 {h.v4WinnerRanks.join("/")} / market {h.marketWinnerRanks.join("/")} · loss {num(h.v4LogLoss)} / {num(h.marketLogLoss)} · exclusive Top2 {h.marketOnlyTop2 ? "market" : h.v4OnlyTop2 ? "V4" : "neither"}</p>)}
    </details>
    {summary.unavailable.length > 0 && <p className="mt-2 text-xs text-amber-800">{summary.unavailable.length} frozen capture references unavailable; excluded from metrics.</p>}
  </section>;
}

import { activeValueDay, activeValuePerformance } from "@/lib/racing/active-value-performance";
import type { TissueValueData } from "@/lib/racing/tissue-value-forward";
import { latestPreOffCaptures } from "@/lib/racing/frozen-capture-selection";
import { validGenerationCapture, type GenerationData } from "@/lib/racing/tissue-generation-forward";
import { VALUE_RANK_REJECTION_LABELS, VALUE_RANK_EPOCH, VALUE_RANK_PRICE_CAP_EPOCH } from "@/lib/racing/value-rank-v2";

const pct = (n: number | null) => n === null ? "—" : `${(n * 100).toFixed(2)}%`;
const num = (n: number | null) => n === null ? "—" : n.toFixed(2);
export function ActiveValuePerformance({ datasets, generation, date }: { datasets: TissueValueData[]; generation: GenerationData; date: string }) {
  const summary = activeValuePerformance(datasets);
  const today = activeValueDay(summary, date);
  const daily = summary.leaders.filter(r => r.date === date && r.active);
  const tissue = new Map(latestPreOffCaptures(generation.races.filter(validGenerationCapture)).flatMap(r => r.runners.map(x => [`${r.raceId}|${x.runnerId}`, x.rank] as const)));
  const rows = [...summary.families.map(r => ({ ...r, label: r.family === "ALL" ? "All" : r.family === "TURF" ? "Turf" : r.family === "AW" ? "AW" : r.family === "HURDLE" ? "Hurdle" : "Chase" })),
    { label: "Legacy V1 shadow · same post-epoch latest books", ...summary.legacyShadow },
    { label: "Rejected V1 shadow · same books", ...summary.rejected }];
  return <section className="mt-6 border-t-2 border-slate-700 pt-5" aria-labelledby="all-active-value-heading">
    <h3 id="all-active-value-heading" className="text-base font-semibold">All active Value 1 V2 selections</h3>
    <p className="mt-1 text-xs text-slate-600">Since {VALUE_RANK_EPOCH}. Uses Today’s latest frozen Value book per race and its retained V2 leaders, with no additional research-cohort filter. £1 stakes at the frozen Value price; settled starters only, canonical dead-heat returns; pending/NR/void excluded from stakes. Shadow overlaps V2. From {VALUE_RANK_PRICE_CAP_EPOCH}, original Value 1 requires price ≤67.00; 21.00–&lt;51.00 still requires 5–9 prior runs. Rejection means no Value 1 and no promotion. Earlier frozen policies remain unchanged.</p>
    <div className="mt-3 overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
      <thead><tr>{["Family / population", "Selections", "Settled", "Winners", "Strike", "£1 P/L", "ROI"].map(h => <th key={h} className="border-b p-2" scope="col">{h}</th>)}</tr></thead>
      <tbody>{rows.map(r => <tr key={r.label}><th className="p-2 font-normal" scope="row">{r.label}</th><td className="p-2">{r.tracked}</td><td className="p-2">{r.runners}</td><td className="p-2">{r.winners}</td><td className="p-2">{pct(r.strikeRate)}</td><td className="p-2">{num(r.profitLoss)}</td><td className="p-2">{pct(r.roi)}</td></tr>)}</tbody>
    </table></div>
    <h4 className="mt-4 text-sm font-semibold">TODAY’S ACTIVE VALUE 1 V2 · {date}</h4>
    <p className="mt-2 text-xs tabular-nums" aria-label="Today V2 totals">Today: {today.summary.tracked} selections · {today.summary.runners} settled · {today.summary.winners} winners · {pct(today.summary.strikeRate)} strike · £1 P/L {num(today.summary.profitLoss)}{today.summary.runners > 0 ? <> · {pct(today.summary.roi)} ROI</> : null}</p>
    <DailyTable rows={today.rows} tissue={tissue} />
    {today.rejected.length ? <details className="mt-3"><summary className="cursor-pointer text-xs">NO V2 — legacy V1 rejected · {today.rejected.length}</summary>
      <ul className="mt-2 text-xs">{today.rejected.map(r => <li key={`${r.raceId}|${r.runnerId}`}>{r.time} {r.course} · {r.horse} · price {num(r.runner.marketPrice)} · prior runs {r.priorCareerRuns ?? "Missing"} · {r.rejectionReason ? VALUE_RANK_REJECTION_LABELS[r.rejectionReason] : "—"}</li>)}</ul>
    </details> : null}
    <details className="mt-3"><summary className="cursor-pointer text-sm">Reconcile all Today Value 1 markers · {daily.length} total ({daily.filter(r => !r.v2).length} frozen V1)</summary>
      <p className="mt-2 text-xs text-slate-600">Today also retains pre-epoch V1 markers. Those records are excluded from V2 performance and are never retrospectively reclassified. Tissue rank below follows Today’s current frozen Tissue book; the Value price stays with the Value book.</p>
      <DailyTable rows={daily} tissue={tissue} provenance />
    </details>
  </section>;
}
function DailyTable({ rows, tissue, provenance = false }: { rows: ReturnType<typeof activeValuePerformance>["leaders"]; tissue: ReadonlyMap<string, number>; provenance?: boolean }) {
  return <div className="mt-2 overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs tabular-nums"><thead><tr>{["Time", "Course", "Horse", "Family", "Captured price", "Prior runs", "Tissue rank", "Result", "£1 P/L", ...(provenance ? ["Value policy / Research membership"] : [])].map(h => <th key={h} className="border-b p-2" scope="col">{h}</th>)}</tr></thead><tbody>
    {rows.map(r => <tr key={`${r.raceId}|${r.runnerId}`}><td className="p-2">{r.time}</td><td className="p-2">{r.course}</td><th scope="row" className="p-2 font-normal">{r.horse}</th><td className="p-2">{r.family}</td><td className="p-2">{num(r.runner.marketPrice)}</td><td className="p-2">{r.priorCareerRuns ?? "—"}</td><td className="p-2">{tissue.get(`${r.raceId}|${r.runnerId}`) ?? "—"}</td><td className="p-2">{r.runner.outcome?.status === "settled" ? r.runner.outcome.winner ? "WINNER" : r.runner.outcome.finishPosition ?? r.runner.outcome.resultStatus : r.runner.outcome?.status ?? "Pending"}</td><td className="p-2">{num(r.runner.outcome?.profitLoss ?? null)}</td>{provenance ? <td className="p-2" title={r.researchReason}>{r.version} · {r.includedInResearch ? "Included" : "Excluded: pre-epoch capture"}</td> : null}</tr>)}
  </tbody></table>{rows.length === 0 ? <p className="p-2 text-xs">No active V2 selections.</p> : null}</div>;
}

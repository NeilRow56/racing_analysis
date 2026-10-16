import { HURDLE_RECENCY_HELPER, summarizeHurdleRecency, type HurdleRecencyData } from "@/lib/racing/hurdle-recency-forward";

const number = (value: number | null) => value === null ? "—" : value.toFixed(2);
const percent = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;
const labels: Record<string, string> = {
  RECENT_COMPLETER: "RECENT COMPLETERS", RECENT_NON_COMPLETER: "RECENT NON-COMPLETERS", LATEST_RUN_PU: "LATEST RUN PU",
  NOT_LATEST_RUN_PU: "NOT LATEST RUN PU", ANY_RECENT_PU: "ANY RECENT PU", NO_RECENT_PU: "NO RECENT PU", NO_RECENT_COMPLETION: "NO RECENT COMPLETION",
};
export function HurdleRecencyResearchSection({ data }: { data: HurdleRecencyData }) {
  const summary = summarizeHurdleRecency(data);
  const recent = [...data.observations].sort((a, b) => b.firstCapturedAt.localeCompare(a.firstCapturedAt) || a.horseName.localeCompare(b.horseName)).slice(0, 50);
  return <section aria-label="Hurdle Recency / Completion Research" className="mt-6 border-t border-slate-200 pt-4 text-sm">
    <h2 className="font-semibold">Hurdle Recency / Completion Research</h2>
    <p className="mt-1 text-xs text-slate-500">{HURDLE_RECENCY_HELPER}</p>
    <p className="mt-1 text-xs text-slate-500">Prospective since {data.epoch} · {summary.overall.observations} observations · {summary.overall.settled} settled · {summary.overall.nonRunners} NR · {summary.overall.voids} void</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      {summary.groups.slice(0, 3).map((group) => <div key={group.group} className="rounded border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-semibold">{labels[group.group]}</h3>
          <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-medium">{group.sampleStatus === "MEANINGFUL PROSPECTIVE SAMPLE" ? "MEANINGFUL" : group.sampleStatus}</span></div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
          {[["Settled", group.settled], ["Mean rank improvement", number(group.meanRankImprovement)], ["Top-3 rate", percent(group.top3Rate)], ["Actual / Market expected", number(group.actualOverExpected)]].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>)}
        </dl>
      </div>)}
    </div>
    <p className="mt-2 text-xs text-slate-500">Recent = ≤30 elapsed days, using the latest recorded start; completion history = last three recorded starts, any code. Positive rank improvement means better than captured market rank. Top-3 rates use settled fields of six or more. Groups overlap; no-history runners are included in the “not PU” comparisons and the zero-completion group. The last-three count has no calendar window. Empty groups display no estimate.</p>
    {summary.overall.settled < 300 && <p className="mt-2 text-xs text-slate-600">{summary.overall.sampleStatus}: descriptive only; no strong conclusion from this sample.</p>}
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-semibold">All comparisons and market bands</summary>
      <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[1400px] text-left text-xs">
        <thead><tr>{["Group", "Observations", "Settled", "Status", "Mean market p", "Market rank", "Finish rank", "Norm finish", "Rank improvement", "Outperform %", "Top-3", "Top-half", "Winner rate", "Expected winners", "Actual / Expected"].map((label) => <th key={label} className="px-2 py-2 font-medium">{label}</th>)}</tr></thead>
        <tbody>{summary.groups.map((g) => <tr key={g.group} className="border-t border-slate-100">{[labels[g.group], g.observations, g.settled, g.sampleStatus, percent(g.meanMarketProbability), number(g.meanMarketRank), number(g.meanFinishRank), number(g.meanNormalizedFinish), number(g.meanRankImprovement), percent(g.outperformingMarketRank), percent(g.top3Rate), percent(g.topHalfRate), percent(g.winnerRate), number(g.marketExpectedWinners), number(g.actualOverExpected)].map((v, i) => <td key={i} className="px-2 py-2 tabular-nums">{v}</td>)}</tr>)}</tbody>
      </table></div>
      <p className="my-2 text-xs text-slate-500">Fixed within-band comparisons describe market adjustment; no model is fitted. A/E uses settled runners and dead-heat winner credit. Frozen probabilities remain unchanged after withdrawals, so final fields can differ from capture.</p>
      {[{ label: "Market probability", rows: summary.probabilityBands }, { label: "Market rank", rows: summary.rankBands }].map((bands) => <details key={bands.label} className="my-2"><summary className="cursor-pointer text-xs">{bands.label} bands</summary>
        <div className="overflow-x-auto"><table className="min-w-[700px] text-left text-xs"><thead><tr>{["Band", "Group", "Settled", "Sample", "Mean p", "Norm finish", "Rank improvement"].map((label) => <th key={label} className="px-2 py-2">{label}</th>)}</tr></thead><tbody>
          {bands.rows.flatMap((band) => band.groups.map((g) => <tr key={`${band.band}-${g.group}`} className="border-t border-slate-100">{[band.band, labels[g.group], g.settled, g.sampleStatus, percent(g.meanMarketProbability), number(g.meanNormalizedFinish), number(g.meanRankImprovement)].map((value, i) => <td key={i} className="px-2 py-2 tabular-nums">{value}</td>)}</tr>))}
        </tbody></table></div>
      </details>)}
    </details>
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-semibold">Recent frozen observations ({recent.length})</summary>
      <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[1300px] text-left text-xs">
        <thead><tr>{["Date", "Course", "Race", "Horse", "First price", "Market rank", "Days since run", "Latest status", "Recent non-completions", "Latest PU", "Finish", "Rank improvement"].map((label) => <th key={label} className="px-2 py-2 font-medium">{label}</th>)}</tr></thead>
        <tbody>{recent.map((r) => <tr key={`${r.version}-${r.raceId}-${r.runnerId}`} className="border-t border-slate-100">{[r.raceDate, r.course, r.raceName ?? "—", r.horseName, number(r.market.medianBookmakerDecimal), r.market.marketRank, r.features.daysSinceLastRun ?? "—", r.features.latestCompletionStatus, r.features.recentNonCompletionCount, r.flags.LATEST_RUN_PU ? "Yes" : "No", !r.outcome ? "Pending" : r.outcome.status !== "settled" ? r.outcome.status : r.outcome.finishPosition ?? r.outcome.resultStatus, number(r.outcome?.rankImprovement ?? null)].map((value, i) => <td key={i} className="px-2 py-2 tabular-nums">{value}</td>)}</tr>)}</tbody>
      </table></div>
      {!recent.length && <p className="py-3 text-xs text-slate-500">No prospective Hurdle observations yet. Morning capture records eligible runners before the off; past races are never backfilled.</p>}
    </details>
  </section>;
}

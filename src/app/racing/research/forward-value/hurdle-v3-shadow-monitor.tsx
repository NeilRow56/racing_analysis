import { loadHurdleV3Shadow, type HurdleV3ShadowData } from "@/lib/racing/hurdle-v3-shadow";
import { hurdleShadowComparison, hurdleShadowOutcome, summarizeHurdleV3Shadow } from "@/lib/racing/hurdle-v3-shadow-metrics";

const pct = (x: number | null) => x === null ? "—" : `${(x * 100).toFixed(2)}%`;
const num = (x: number | null) => x === null ? "—" : x.toFixed(4);
export async function HurdleV3ShadowResearch() {
  const result = await loadHurdleV3Shadow().then(data => ({ data, failed: false })).catch(() => ({ data: null, failed: true }));
  if (result.failed) return <p className="mt-4 text-sm text-amber-800">Hurdle V3 shadow ledger unavailable. Production V2 is unchanged.</p>;
  return <HurdleV3ShadowMonitor data={result.data} />;
}
export function HurdleV3ShadowMonitor({ data }: { data: HurdleV3ShadowData | null }) {
  const summary = summarizeHurdleV3Shadow(data);
  const rows = [...(data?.observations ?? [])].reverse();
  const disagreements = rows.filter(o => hurdleShadowComparison(o).orderingDiffers);
  const raceRows = (observations: typeof rows) => observations.map(o => {
    const c = hurdleShadowComparison(o), names = (ids: string[]) => ids.map(id => o.production.runners.find(r => r.runnerId === id)?.horseName ?? id).join(" / ");
    return <tr key={o.raceId}><td className="p-2">{o.production.raceDate} {o.production.course} {o.production.scheduledOff.slice(11, 16)} UTC</td>
      <td className="p-2">{names(c.v2.slice(0, 2))}</td><td className="p-2">{names(c.v3.slice(0, 2))}</td>
      <td className="p-2">{c.winnerIds.length ? names(c.winnerIds) : hurdleShadowOutcome(o)}</td>
      <td className="p-2">{c.top2Differs ? "Yes" : "No"}</td><td className="p-2">{c.v2WinnerRanks.join(" / ") || "—"}</td><td className="p-2">{c.v3WinnerRanks.join(" / ") || "—"}</td>
      <td className="p-2">{c.v3MissedLedWinners.length}</td><td className="p-2">{c.ledChangedTop2 ? "Yes" : "No"}</td></tr>;
  });
  const headers = ["Race", "V2 T1 / T2", "V3 SHADOW T1 / T2", "Winner / status", "Top2 differs", "V2 winner rank", "V3 winner rank", "Missed LED winners", "LED would change Top2"];
  return <section className="mt-5 border border-slate-300 bg-white p-4" aria-labelledby="hurdle-v3-shadow-heading">
    <h3 id="hurdle-v3-shadow-heading" className="text-base font-semibold">Hurdle V2 vs V3 · prospective shadow</h3>
    <p className="mt-1 text-sm text-slate-600">V2 LIVE PRODUCTION. V3 SHADOW. Epoch: {data?.epoch ?? "pending first genuine pre-off capture"}. No historical backfill.</p>
    <p className="mt-1 text-xs text-slate-500">{summary.racesCaptured} races captured; {summary.racesSettled} settled; {summary.pendingRaces} pending; {summary.voidRaces} void. First capture per race is frozen for both models.</p>
    <div className="mt-3 overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
      <caption className="mb-1 text-left font-semibold">Race winners and model expectation</caption>
      <thead><tr>{["Model", "Selection", "Eligible settled races", "Winners", "Strike rate", "Expected winners", "Actual / Model"].map(h => <th key={h} className="border-b p-2">{h}</th>)}</tr></thead>
      <tbody>{summary.rows.flatMap(r => r.selections.map(s => <tr key={`${r.model}-${s.rank}`}><th className="p-2 font-medium">{r.model === "V3" ? "V3 SHADOW" : "V2 LIVE"}</th><td className="p-2">{s.rank === "TOP2" ? "Top2" : `T${s.rank}`}</td><td className="p-2">{s.eligible}</td><td className="p-2">{s.winners}</td><td className="p-2">{pct(s.strikeRate)}</td><td className="p-2">{num(s.expected)}</td><td className="p-2">{num(s.actualModel)}</td></tr>))}</tbody>
    </table></div>
    <div className="mt-3 overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
      <caption className="mb-1 text-left font-semibold">Probability quality, shared settled race cohort</caption>
      <thead><tr>{["Model", "Captured", "Settled", "Log loss", "Brier", "Calibration ECE"].map(h => <th key={h} className="border-b p-2">{h}</th>)}</tr></thead>
      <tbody>{summary.rows.map(r => <tr key={r.model}><th className="p-2 font-medium">{r.model}</th><td className="p-2">{r.racesCaptured}</td><td className="p-2">{r.racesSettled}</td><td className="p-2">{num(r.logLoss)}</td><td className="p-2">{num(r.brier)}</td><td className="p-2">{pct(r.calibrationECE)}</td></tr>)}</tbody>
    </table></div>
    <p className="mt-2 text-xs">Winner rank comparison: V2 better {summary.headToHead.v2Better}; V3 better {summary.headToHead.v3Better}; same {summary.headToHead.same}. Exclusive Top2 hits: V2 {summary.headToHead.v2Only}; V3 {summary.headToHead.v3Only}.</p>
    <p className="mt-1 text-xs">Frozen LED observation: {summary.led.v3MissedTaggedWinners} V3-missed winners tagged; {summary.led.recoveredWinners} recovered by the counterfactual. Would change T1 in {summary.led.changedT1}, T2 in {summary.led.changedT2}, Top2 in {summary.led.changedTop2} captured races. PU is observation only.</p>
    <p className="mt-2 text-xs text-slate-500">NR/void selections are excluded, with no replacement of frozen T1/T2. Probability metrics renormalize over actual starters. Dead heats split target credit equally; strike rates count race hits, Actual/Model uses fractional winner credit. ECE uses ten fixed probability bins. No ROI comparison.</p>
    <details className="mt-3"><summary className="cursor-pointer text-sm">Latest 30 pairs</summary><div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs"><thead><tr>{headers.map(h => <th key={h} className="border-b p-2">{h}</th>)}</tr></thead><tbody>{raceRows(rows.slice(0, 30))}</tbody></table></div></details>
    <details className="mt-2"><summary className="cursor-pointer text-sm">All ranking disagreements ({disagreements.length})</summary><div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs"><thead><tr>{headers.map(h => <th key={h} className="border-b p-2">{h}</th>)}</tr></thead><tbody>{raceRows(disagreements)}</tbody></table></div></details>
  </section>;
}

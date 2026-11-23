import type { HurdleMarketEdgeData } from "@/lib/racing/hurdle-v3-market-edge";
import { loadHurdleMarketEdgeContext } from "@/lib/racing/profiled-monitor-readers";
import { summarizeHurdleMarketEdge } from "@/lib/racing/hurdle-v3-market-edge-metrics";
import type { HurdleV3ShadowData } from "@/lib/racing/hurdle-v3-shadow";
import { MARKET_EDGE_VERSION } from "@/lib/racing/hurdle-v3-market-edge-method";
import { hurdleEdgeFinalSp, loadHurdleFinalSpResults, summarizeHurdleFinalSp, type HurdleFinalSpResults } from "@/lib/racing/hurdle-final-sp";
import { profileCall } from "@/lib/racing/performance-profile";
import { HurdleFinalSpCells, HurdleFinalSpSensitivity, hurdleFinalSpHeaders } from "./hurdle-final-sp-columns";

const num = (x: number | null) => x === null ? "—" : x.toFixed(4);
const pct = (x: number | null) => x === null ? "—" : `${(100 * x).toFixed(2)}%`;
type Row = ReturnType<typeof summarizeHurdleMarketEdge>["headline"];
type EdgePick = ReturnType<typeof hurdleEdgeFinalSp>[number];
function EdgeTable({ caption, rows, picks, matches }: {
  caption: string; rows: Row[]; picks: EdgePick[]; matches: (pick: EdgePick, row: Row) => boolean;
}) {
  return <div className="mt-3 overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
    <caption className="mb-1 text-left font-semibold">{caption}</caption>
    <thead><tr>{["Band / split", "Captured", "Settled", "Winners", "Strike", "Expected", "Actual/Model", "V3 log loss", "Market log loss", "Brier", "ECE", "Average market rank", "Market Top1 strike", ...hurdleFinalSpHeaders].map(h => <th key={h} className="border-b p-2">{h}</th>)}</tr></thead>
    <tbody>{rows.map(r => <tr key={r.label}><th className="p-2 font-medium">{r.label}</th><td className="p-2">{r.captured}</td><td className="p-2">{r.settled}</td><td className="p-2">{r.winners}</td><td className="p-2">{pct(r.strikeRate)}</td><td className="p-2">{num(r.expected)}</td><td className="p-2">{num(r.actualModel)}</td><td className="p-2">{num(r.logLoss)}</td><td className="p-2">{num(r.marketLogLoss)}</td><td className="p-2">{num(r.brier)}</td><td className="p-2">{pct(r.calibrationECE)}</td><td className="p-2">{num(r.averageMarketRank)}</td><td className="p-2">{pct(r.marketTop1WinnerRate)}</td><HurdleFinalSpCells summary={summarizeHurdleFinalSp(picks.filter(p => p.rank === r.pickRank && matches(p, r)))} /></tr>)}</tbody>
  </table></div>;
}
export async function HurdleV3MarketEdgeResearch() {
  const context = await loadHurdleMarketEdgeContext().catch(() => null);
  if (!context) return <p className="mt-4 text-sm text-amber-800">Hurdle V3 market-edge monitor unavailable. Production and V3 shadow are unchanged.</p>;
  const raceIds = new Set(context.data?.observations.filter(o => o.completeMarket).map(o => o.raceId));
  const results = await profileCall("loadHurdleMarketEdgeFinalSp", () =>
    loadHurdleFinalSpResults(context.shadows?.observations.filter(o => raceIds.has(o.raceId)) ?? [])).catch(() => null);
  return <HurdleV3MarketEdgeMonitor {...context} results={results} />;
}
export function HurdleV3MarketEdgeMonitor({ data, shadows, results }: {
  data: HurdleMarketEdgeData | null; shadows: HurdleV3ShadowData | null; results?: HurdleFinalSpResults | null;
}) {
  const s = summarizeHurdleMarketEdge(data, shadows);
  const picks = hurdleEdgeFinalSp(data, shadows, results ?? new Map());
  const large = picks.filter(p => p.rank === 1 && p.edgeBand === "LARGE POSITIVE");
  const sameBand = (p: EdgePick, r: Row) => p.edgeBand === r.label;
  return <section className="mt-5 border border-slate-300 bg-white p-4" aria-labelledby="hurdle-v3-edge-heading">
    <h3 id="hurdle-v3-edge-heading" className="text-base font-semibold">HURDLE V3 — Market Edge Monitor</h3>
    <p className="mt-1 text-sm text-slate-600">Prospective V3 market-probability edge diagnostics for experimental research.</p>
    <p className="mt-1 break-words text-xs text-slate-500">DIAGNOSTIC · {data ? "ARCHIVED COLLECTION" : "Collection record unavailable"} · {data?.version ?? MARKET_EDGE_VERSION}{data?.epoch ? <> · First capture <time dateTime={data.epoch}>{data.epoch}</time></> : data && " · No recorded first capture"}. No historical backfill.</p>
    <p className="mt-1 text-xs text-slate-500">{s.captured} captured; {s.marketUnavailable} incomplete market; {s.sourceUnavailable.length} exact source unavailable. Edge = 100 × (V3 probability − same-capture normalized market probability).</p>
    <EdgeTable caption="V3 T1 EDGE >=10 PP" rows={[s.headline]} picks={large} matches={sameBand} />
    <p className="mt-1 text-xs text-slate-500">Large-edge T1: {s.headline.pending} pending; {s.headline.nonRunnerSelections} NR/void selections excluded; {s.headline.voidRaces} void races.</p>
    <p className="mt-1 text-xs text-slate-500">SP ROI uses verified £1 stakes only. Unverified settled picks remain in the prediction metrics. Final SP is used for settlement only. Edge bands use the frozen market probabilities.</p>
    {results === null && <p className="mt-1 text-xs text-amber-800">Final-SP result data unavailable.</p>}
    <HurdleFinalSpSensitivity rows={[{ label: "V3 T1 large positive", summary: summarizeHurdleFinalSp(large) }]} />
    <EdgeTable caption="V3 T1 by frozen edge band" rows={s.t1} picks={picks} matches={sameBand} />
    <EdgeTable caption="LARGE EDGE T1 by Speed evidence and market rank" rows={[...s.speed, ...s.marketRank]} picks={large} matches={(p, r) => p.speedEvidence === r.label || p.marketRankBand === r.label} />
    <details className="mt-3"><summary className="cursor-pointer text-sm">T2 bands and large-edge form depth</summary><EdgeTable caption="V3 T2 only (separate selections)" rows={s.t2} picks={picks} matches={sameBand} /><EdgeTable caption="LARGE EDGE T1 by existing field form depth" rows={s.form} picks={large} matches={(p, r) => p.form === r.label} /></details>
    <details className="mt-3"><summary className="cursor-pointer text-sm">Large-edge T1 V2 reference and contribution context</summary>
      <div className="overflow-x-auto"><table className="mt-2 w-full whitespace-nowrap text-left text-xs"><thead><tr>{["Race", "V3 T1", "Edge pp", "V2 rank", "V2 T1 / T2", "V3 T1 / T2", "Market first / second", "V2 Top2 hit", "V3 Top2 hit", "Top positive groups", ...hurdleFinalSpHeaders].map(h => <th key={h} className="border-b p-2">{h}</th>)}</tr></thead>
        <tbody>{s.references.map(r => { const o = data!.observations.find(o => o.raceId === r.raceId)!, t1 = o.runners.find(p => p.v3Rank === 1)!;
          const name = (id: string | null) => o.runners.find(p => p.runnerId === id)?.horseName ?? "—";
          return <tr key={r.raceId}><td className="p-2">{r.date} {r.course} {o.scheduledOff.slice(11, 16)} UTC</td><td className="p-2">{r.v3Horse}</td><td className="p-2">{t1.edgePP?.toFixed(2)}</td><td className="p-2">{r.v2RankOfV3T1}</td><td className="p-2">{name(r.v2T1)} / {name(r.v2T2)}</td><td className="p-2">{name(r.v3T1)} / {name(r.v3T2)}</td><td className="p-2">{name(r.marketFavourite)} / {name(r.marketSecondFavourite)}</td><td className="p-2">{r.v2Top2Winner === null ? "—" : r.v2Top2Winner ? "Yes" : "No"}</td><td className="p-2">{r.v3Top2Winner === null ? "—" : r.v3Top2Winner ? "Yes" : "No"}</td><td className="p-2">{t1.topPositiveGroups.map(g => `${g.name} +${g.contribution.toFixed(3)}`).join("; ") || "None"}</td><HurdleFinalSpCells summary={summarizeHurdleFinalSp(large.filter(p => p.raceId === r.raceId))} /></tr>;
        })}</tbody></table></div>
    </details>
    <p className="mt-2 text-xs text-slate-500">Bands: &lt;0, 0–&lt;5, 5–&lt;10, ≥10 pp. Low Speed means 0–1 usable ratings in the actual last three Hurdle starts; established means 2–3. Market-rank bands: 1–2, 3–5, 6–8, 9+.</p>
    <p className="mt-1 text-xs text-slate-500">Frozen T1/T2 are never replaced. NR/void picks do not count as losses. Quality scores compare full race books over actual starters, restricted to started selections; dead heats split credit. ECE uses ten fixed bins. Market Top1 has its own eligible denominator if its frozen favourite is NR. Average market rank covers captured selections.</p>
  </section>;
}

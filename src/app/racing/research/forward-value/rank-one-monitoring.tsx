import { TISSUE_V3_LIVE_SEMANTICS_VERSION } from "@/lib/racing/tissue-forward";
import { summarizeRankOne, type RankOneData } from "@/lib/racing/rank-one-forward";
import { AW_TISSUE_V2_SCORER } from "@/lib/racing/aw-tissue-v2";
const pct=(n:number|null)=>n===null?"—":`${(n*100).toFixed(1)}%`;
const decimal=(n:number|null)=>n===null?"—":n.toFixed(2);
export function RankOneMonitoring({data,date}:{data:RankOneData;date:string}){
  const summary=summarizeRankOne(data);
  const rows=data.observations.filter(r=>r.raceDate===date).sort((a,b)=>a.scheduledOff.localeCompare(b.scheduledOff)||a.course.localeCompare(b.course));
  return <section className="mt-5" aria-labelledby="rank-one-monitoring-heading">
    <h3 id="rank-one-monitoring-heading" className="text-base font-semibold">Rank 1 Monitoring</h3>
    <p className="mt-1 text-sm text-slate-500">Prospective monitoring of the current rank-1 selection in each race family. Historical profitability has not been established.</p>
    <p className="mt-1 text-xs text-slate-500">Tissue rank 1 in all four families. Observations since {data.epoch.slice(0,10)}; model cohorts shown separately; no historical backfill.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summary.map(s=><article key={`${s.family}|${s.cohort}`} className="border border-slate-200 bg-white p-3">
      <h4 className="text-xs font-semibold">{s.family} RANK 1</h4>
      {s.family==="TURF"?<p className="mt-1 text-xs text-slate-500">{s.cohort===TISSUE_V3_LIVE_SEMANTICS_VERSION?"Turf v3 · pre-race counts":s.cohort==="legacy live semantics"?"Before the Turf history fix":"Turf v2 · corrected history"} · since {s.epoch}</p>:null}
      {s.family==="AW"?<p className="mt-1 text-xs text-slate-500">{s.cohort===AW_TISSUE_V2_SCORER?"AW v2 · canonical core + surface history":"AW v1 · historical reference"} · since {s.epoch}</p>:null}
      <dl className="mt-2 space-y-1 text-xs tabular-nums">
        <div><dt className="inline">Tracked / settled: </dt><dd className="inline">{s.tracked} / {s.settled}</dd></div>
        <div><dt className="inline">Winners / strike: </dt><dd className="inline">{s.winners} / {pct(s.strikeRate)}</dd></div>
        <div><dt className="inline">A/E: </dt><dd className="inline">{decimal(s.ae)}</dd></div>
        <div><dt className="inline">Qualifying-price ROI: </dt><dd className="inline">{pct(s.roi)} (n={s.pricedSettled})</dd></div>
        <div><dt className="inline">Cap: </dt><dd className="inline">{s.cap===null?"NONE":`≤${s.cap.toFixed(1)}`}</dd></div>
        {s.cap!==null?<div><dt className="inline">Within-cap tracked / settled / winners / ROI: </dt><dd className="inline">{s.withinCap.tracked} / {s.withinCap.settled} / {s.withinCap.winners} / {pct(s.withinCap.roi)}</dd></div>:null}
      </dl>
    </article>)}</div>
    <h4 className="mt-4 text-sm font-semibold">Today&apos;s captured rank-1 runners</h4>
    <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{["Time","Course","Horse","Family","Rank source","Market price","Market rank","Cap status","Result"].map(h=><th key={h} className="border-b p-2 font-medium">{h}</th>)}</tr></thead>
      <tbody>{rows.map(r=><tr key={`${r.raceId}|${r.family}|${r.runnerId}`}>
        <td className="p-2">{new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",hour:"2-digit",minute:"2-digit"}).format(new Date(r.scheduledOff))}</td>
        <td className="p-2">{r.course}</td><td className="p-2">{r.horseName}</td><td className="p-2">{r.family}</td><td className="p-2">{r.rankSource}</td>
        <td className="p-2">{decimal(r.market.medianBookmakerDecimal)}</td><td className="p-2">{r.market.marketRank}</td><td className="p-2">{r.cap===null?"NONE":r.withinCap?"IN CAP":"ABOVE CAP"}</td>
        <td className="p-2">{!r.outcome?"Pending":r.outcome.status!=="settled"?r.outcome.status:r.outcome.winner?"Won":r.outcome.finishPosition?`Finished ${r.outcome.finishPosition}`:r.outcome.resultStatus?.replaceAll("_"," ")??"Settled"}</td>
      </tr>)}{!rows.length?<tr><td className="p-3 text-slate-500" colSpan={9}>No prospective rank-1 captures today.</td></tr>:null}</tbody></table></div>
    <p className="mt-3 text-xs text-slate-500">{summary.every(s=>s.cap===null)?"No price cap currently applied.":"Any displayed cap was selected from a fixed 20/1 vs 25/1 historical robustness check; no bespoke threshold optimisation was used."}</p>
    <p className="mt-1 text-xs text-slate-500">A/E uses normalized probabilities from the complete bookmaker market at first capture. NR and void observations are excluded from settled metrics. Research monitoring only.</p>
  </section>;
}

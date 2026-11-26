import { loadAwSprint, summarizeAwSprint, type AwSprintData } from "@/lib/racing/aw-profit-sprint-filter";
import { CaptureTime, profitMoney, profitPercent } from "./aw-profitability";

export async function AwSprintResearch() {
  const props = await loadAwSprint().then(data => ({ data }), () => ({ data: null, unavailable: true }));
  return <AwSprintMonitor {...props} />;
}

const label = (basis: string) => basis === "captured" ? "Captured bookmaker" : "Final SP";

export function AwSprintMonitor({ data, unavailable = false }: { data: AwSprintData | null; unavailable?: boolean }) {
  const m = summarizeAwSprint(data);
  return <section className="mt-4 rounded-md border border-slate-200 bg-white p-3" aria-labelledby="aw-sprint-heading">
    <h3 id="aw-sprint-heading" className="text-sm font-semibold">AW Profit V1 Sprint Handicap Filter</h3>
    <p className="mt-1 text-xs text-slate-600"><strong>{unavailable ? "UNAVAILABLE" : data ? "ARMED" : "UNARMED"}</strong>
      {data && <> · Activated <CaptureTime value={data.armedAt} exact /></>}
    </p>
    {data && <>
      <p className="mt-2 text-xs tabular-nums">
        Observed {m.races} · V1 selections {m.v1Selections} · Filter selections {m.shadowSelections} · Sprint abstentions {m.sprintAbstentions} ·
        Winners missed {m.missed} · Complete bookmaker boards {m.completeBoards}/{m.races}
      </p>
      {m.prices.map(row => <p key={row.basis} className="mt-1 text-xs tabular-nums">
        {label(row.basis)} · V1 bets {row.v1.bets} · Filter bets {row.shadow.bets} · P/L {profitMoney(row.shadow.profit)} ·
        ROI {profitPercent(row.shadow.roi)} · Gain vs V1 {profitMoney(row.gainV1)}
      </p>)}
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-medium text-emerald-800">Matched comparison and equal-abstention control</summary>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left tabular-nums">
            <thead><tr>{["Basis / matched", "Policy", "Bets", "Abstentions", "Winners", "Missed", "£1 P/L", "ROI", "Filter gain vs T2"]
              .map(x => <th key={x} scope="col" className="border-b p-2">{x}</th>)}</tr></thead>
            <tbody>{m.prices.flatMap(row => [
              { name: "Original T2", stats: row.t2 }, { name: "Original V1", stats: row.v1 }, { name: "Sprint filter", stats: row.shadow },
            ].map(({ name, stats }) => <tr key={row.basis + name}>
              <td className="p-2">{label(row.basis)} / {row.matched}</td><th scope="row" className="p-2">{name}</th>
              {[stats.bets, stats.abstentions, stats.winners, stats.missed, profitMoney(stats.profit), profitPercent(stats.roi),
                name === "Sprint filter" ? profitMoney(row.gainT2) : "—"].map((v, i) => <td key={i} className="p-2">{v}</td>)}
            </tr>))}</tbody>
          </table>
        </div>
        <p className="mt-1 text-slate-600">Controls draw the same number of retained V1 handicap stakes within calendar month and surface material.
          The 1,000 fixed draws use race IDs and never use outcomes to select omissions. Refunds have zero stake and each price basis has its own matched sample.</p>
        {m.controls.map(row => <p key={row.basis} className="mt-1 tabular-nums">
          {label(row.basis)} · Comparable {row.comparable} · Matched abstentions {row.count}/{row.target}
          {row.delta === null ? " · Insufficient matched sample" : <> · Filter gain {profitMoney(row.actual)} ·
            Control median gain {profitMoney(row.median)} (5th–95th {profitMoney(row.low)} to {profitMoney(row.high)}) ·
            Control P/L {profitMoney(row.controlProfit?.median ?? null)} (5th–95th {profitMoney(row.controlProfit?.low ?? null)} to {profitMoney(row.controlProfit?.high ?? null)}) ·
            Gain over median {profitMoney(row.delta)} · Control draws at least as good {profitPercent(row.atLeastActual)}
            {row.count < row.target && " · Partial coverage"}</>}
        </p>)}
      </details>
      {data.races.length > 0 && <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-medium text-emerald-800">Race decisions</summary>
        <ul className="mt-1 divide-y divide-slate-100">
          {[...data.races].reverse().map(r => <li key={r.raceId} className="py-1">
            {r.raceDate} · {r.course} · Off <CaptureTime value={r.scheduledOff} exact /> · {r.handicap} · {r.distanceYards ?? "unknown"} yd ·
            T2 {r.t2.horseName} · V1 {r.v1 ? r.v1.horseName : "NO BET"} ·
            {r.reason === "sprint_handicap_filter" ? "NO BET — SPRINT HANDICAP FILTER" : r.v1 ? "V1 retained" : "V1 NO BET retained"} ·
            V1 quote {r.v1?.capturedPrice ?? "—"} · V1 SP {r.outcomes.v1?.finalSp?.fractional ?? "—"} ·
            {r.outcomes.v1?.status === "settled" ? r.outcomes.v1.winner ? "Winner" : "Lost" : r.outcomes.v1?.status ?? "—"}
          </li>)}
        </ul>
      </details>}
    </>}
  </section>;
}

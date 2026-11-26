import { loadHurdleClass4, summarizeHurdleClass4, type HurdleClass4Data } from "@/lib/racing/hurdle-t2-class4-filter";
import { CaptureTime, profitMoney, profitPercent } from "./aw-profitability";

export async function HurdleClass4Research() {
  const result = await loadHurdleClass4().then(data => ({ data, unavailable: false }), () => ({ data: null, unavailable: true }));
  return <HurdleClass4Monitor {...result} />;
}

const basisLabel = (basis: string) => basis === "captured" ? "Captured bookmaker" : "Final SP";

export function HurdleClass4Monitor({ data, unavailable = false }: { data: HurdleClass4Data | null; unavailable?: boolean }) {
  const m = summarizeHurdleClass4(data);
  return <section className="mt-4 rounded-md border border-slate-200 bg-white p-3" aria-labelledby="hurdle-class4-heading">
    <h3 id="hurdle-class4-heading" className="text-sm font-semibold">Hurdle T2 Class 4 Filter V1</h3>
    <p className="mt-1 text-xs text-slate-600">
      <strong>{unavailable ? "UNAVAILABLE" : data ? "ARMED" : "UNARMED"}</strong>
      {data && <> · Activated <CaptureTime value={data.armedAt} exact /></>}
    </p>
    {data && <>
      <p className="mt-2 text-xs tabular-nums text-slate-700">
        Observed {m.eligible} · Additional Class 4 abstentions {m.additionalAbstentions} · T2 retained {m.retained} ·
        Winners {m.winners} · Missed winners {m.missedWinners} · Missing captured price {m.missingCapturedPrice}/{m.eligible}
      </p>
      {m.prices.map(row => <p key={row.basis} className="mt-1 text-xs tabular-nums text-slate-700">
        {basisLabel(row.basis)} · Bets {row.combined.bets} · P/L {profitMoney(row.combined.profit)} ·
        ROI {profitPercent(row.combined.roi)} · Gain over existing filter {profitMoney(row.incremental)}
      </p>)}
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-medium text-emerald-800">Matched results and equal-stake control</summary>
        <p className="mt-1 text-slate-600">
          On each basis, all three policies use the same settled, priced T2 opportunities. Pending {m.pending} · Refunds {m.refunds} ·
          Existing abstentions {m.existingAbstentions} · First review at 150 settled Class 4 abstentions ({m.class4Settled} settled).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left tabular-nums">
            <thead><tr>{["Basis / matched", "Policy", "Bets", "Abstentions", "Winners", "Missed", "£1 P/L", "ROI", "Gain vs T2", "Gain vs existing"]
              .map(label => <th key={label} scope="col" className="border-b p-2">{label}</th>)}</tr></thead>
            <tbody>{m.prices.flatMap(row => [
              { name: "Original T2", stats: row.original, improvement: null, incremental: null },
              { name: "Existing filter", stats: row.existing, improvement: row.existing.profit === null || row.original.profit === null
                ? null : row.existing.profit - row.original.profit, incremental: null },
              { name: "Combined filter", stats: row.combined, improvement: row.improvement, incremental: row.incremental },
            ].map(({ name, stats, improvement, incremental }) => <tr key={row.basis + name}>
              <td className="p-2">{basisLabel(row.basis)} / {row.matched}</td><th scope="row" className="p-2">{name}</th>
              {[stats.bets, stats.abstentions, stats.winners, stats.missedWinners, profitMoney(stats.profit), profitPercent(stats.roi),
                profitMoney(improvement), profitMoney(incremental)].map((value, index) => <td key={index} className="p-2">{value}</td>)}
            </tr>))}</tbody>
          </table>
        </div>
        <p className="mt-1 text-slate-600">
          The research control uses 1,000 fixed-seed samples of equal size from existing-filter bets outside the Class 4 trigger,
          matched within calendar month and confirmed handicap status. Strata with too few eligible controls are excluded on that price basis.
        </p>
        {m.controls.map(row => <p key={row.basis} className="mt-1 tabular-nums">
          {basisLabel(row.basis)} · Covered {row.covered}/{row.target} · Class 4 gain {profitMoney(row.actual)} ·
          Control median {profitMoney(row.median)} (5th–95th {profitMoney(row.p05)} to {profitMoney(row.p95)}) ·
          Gain over control median {profitMoney(row.actualMinusMedian)} · Draws matching or exceeding Class 4 {profitPercent(row.fractionAtLeastActual)}
        </p>)}
        {m.reviewCutoff && <p className="mt-1">First 150 review cutoff <CaptureTime value={m.reviewCutoff} exact />.
          {m.reviewPrices.map(row => <span key={row.basis}> {basisLabel(row.basis)} gain over existing {profitMoney(row.incremental)}.</span>)}
        </p>}
        {m.outsideDiscoveryCourses.map(row => <p key={row.basis} className="mt-1">
          Outside Phase 5 discovery courses · {basisLabel(row.basis)} · {row.matched} matched · Gain over existing {profitMoney(row.incremental)}
        </p>)}
      </details>
      {data.races.length > 0 && <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-medium text-emerald-800">Race decisions and meeting results</summary>
        <ul className="mt-1 divide-y divide-slate-100">
          {[...data.races].reverse().map(r => <li key={r.raceId} className="py-1">
            {r.raceDate} · {r.course} · Off <CaptureTime value={r.scheduledOff} exact /> · {r.t2.horseName} ·
            Class {r.officialClass ?? "unknown"} · {r.confirmedHandicap} · Distance {r.confirmedDistanceYards ?? "unknown"} yd ·
            Original {r.originalDecision} / Existing {r.existingDecision} / Combined {r.decision}
            {r.abstentionReason && <> · {r.abstentionReason === "confirmed_class_4" ? "Confirmed Class 4" : "Non-handicap under 18f"}</>}
            {" · "}Quote {r.t2.capturedPrice ?? "missing"} · SP {r.settlement?.finalSp?.fractional ?? "—"} ·
            {r.settlement?.status === "settled" ? r.settlement.winner ? "Winner" : "Lost" : r.settlement?.status ?? "Pending"}
          </li>)}
        </ul>
        <ul className="mt-2 divide-y divide-slate-100">
          {m.meetings.map(({ meeting, prices }) => <li key={meeting} className="py-1">{meeting}
            {prices.map(row => <span key={row.basis}> · {basisLabel(row.basis)} gain over existing {profitMoney(row.incremental)}</span>)}
          </li>)}
        </ul>
      </details>}
    </>}
  </section>;
}

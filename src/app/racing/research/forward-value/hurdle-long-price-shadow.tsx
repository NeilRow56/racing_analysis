import { summarizeHurdleValueRows, type HurdleValueRow } from "@/lib/racing/hurdle-value-report";
import type { LongPriceShadowRow } from "@/lib/racing/research-monitor";

export function HurdleLongPriceShadowSection({ rows, date, awTurfRows = [] }: { rows: HurdleValueRow[]; date: string; awTurfRows?: LongPriceShadowRow[] }) {
  const shadow = rows.filter((row) => row.category === "LONG_PRICE_SHADOW");
  const today = shadow.filter((row) => row.race.raceDate === date);
  const preCap = rows.filter((row) => row.category === "PRE_CAP");
  const cumulative = summarizeHurdleValueRows(shadow);
  const daily = summarizeHurdleValueRows(today);
  return <section className="mt-5 border-t border-slate-200 pt-4" aria-label="Hurdle long-price shadow">
    <h2 className="text-sm font-semibold">LONG-PRICE SHADOWS</h2>
    <p className="mt-1 text-xs text-slate-500">Research only — excluded from main VALUE by family qualifying-price caps.</p>
    {(["AW", "TURF"] as const).map((family) => <FamilyShadowTable key={family} title={`${family} LONG-PRICE SHADOW`} rows={awTurfRows.filter((row) => row.family === family)} />)}
    <h3 className="mt-5 text-xs font-semibold uppercase text-slate-600">HURDLE LONG-PRICE SHADOW</h3>
    <p className="mt-1 text-xs text-slate-500">Research only — excluded from main VALUE because qualifying price &gt;14/1</p>
    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
      {[["Selections", cumulative.selections], ["Settled", cumulative.settled], ["Winners", cumulative.winners], ["£1 P/L", money(cumulative.profitLoss)], ["ROI", pct(cumulative.roi)]].map(([label, value]) =>
        <div key={label} className="rounded border border-slate-200 bg-white px-3 py-2"><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>)}
    </dl>
    <p className="my-3 text-xs text-slate-500">Hurdle long-price shadow today: {daily.selections} selections / {daily.settled} settled / {daily.winners} winners · P/L {money(daily.profitLoss)} · ROI {pct(daily.roi)}</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-xs">
      <thead className="border-b border-slate-200 text-slate-500"><tr>{["Time", "Course", "Horse", "Tissue probability", "Market probability", "Qualifying price", "Latest price", "Result", "£1 P/L", "Outcome"].map((heading) => <th key={heading} className="px-2 py-2 font-medium">{heading}</th>)}</tr></thead>
      <tbody>{today.map((row) => <tr key={row.race.raceId} className="border-b border-slate-100">
        <td className="whitespace-nowrap px-2 py-2">{row.time}</td><td className="px-2 py-2">{row.race.course}</td><td className="px-2 py-2 font-medium">{row.runner.horseName}</td>
        <td className="px-2 py-2 tabular-nums">{pct(row.runner.probability)}</td><td className="px-2 py-2 tabular-nums">{pct(row.comparison.impliedProbability)}</td>
        <td className="px-2 py-2 tabular-nums">{row.comparison.qualificationPrice.decimalPrice.toFixed(2)}</td><td className="px-2 py-2 tabular-nums">{row.comparison.latestPrice?.marketDecimalOdds?.toFixed(2) ?? "—"}</td>
        <td className="px-2 py-2">{row.runner.outcome?.finishingPosition != null ? `Finished ${row.runner.outcome.finishingPosition}` : row.runner.outcome?.resultStatus ?? "Pending"}</td>
        <td className="px-2 py-2 tabular-nums">{money(row.profitLoss)}</td><td className="px-2 py-2">{row.outcome}</td>
      </tr>)}</tbody>
    </table></div>
    {!today.length && <p className="py-3 text-xs text-slate-500">No Hurdle long-price shadow selections today.</p>}
    {preCap.length > 0 && <details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer">Hurdle PRE-CAP history · {preCap.length} selections</summary>
      <p className="mt-2">Stored history retained separately from POST-CAP Hurdle VALUE. P/L {money(summarizeHurdleValueRows(preCap).profitLoss)}.</p>
    </details>}
  </section>;
}
function FamilyShadowTable({ title, rows }: { title: string; rows: LongPriceShadowRow[] }) {
  const settled = rows.filter((row) => row.outcome !== "Pending");
  const returns = settled.flatMap((row) => row.profitLoss === null ? [] : [row.profitLoss]);
  return <section className="mt-4" aria-label={title}>
    <h3 className="text-xs font-semibold uppercase text-slate-600">{title}</h3>
    <p className="mt-1 text-xs text-slate-500">Research only — excluded from main VALUE because qualifying price &gt;20/1</p>
    <p className="my-2 text-xs text-slate-500">Today: {rows.length} selections / {settled.length} settled / {rows.filter((row) => row.outcome === "WIN").length} winners · £1 P/L {money(returns.length ? returns.reduce((total, value) => total + value, 0) : null)}</p>
    <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs">
      <thead className="border-b border-slate-200 text-slate-500"><tr>{["Time", "Course", "Horse", "Family", "Tissue probability", "Market probability", "Qualifying price", "Latest price", "Result", "Outcome", "£1 P/L"].map((heading) => <th key={heading} className="px-2 py-2 font-medium">{heading}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={`${row.family}|${row.sortTime}|${row.course}|${row.horseName}`} className="border-b border-slate-100">
        <td className="whitespace-nowrap px-2 py-2">{row.time}</td><td className="px-2 py-2">{row.course}</td><td className="px-2 py-2 font-medium">{row.horseName}</td>
        <td className="px-2 py-2">{row.family}</td><td className="px-2 py-2 tabular-nums">{pct(row.tissueProbability)}</td><td className="px-2 py-2 tabular-nums">{pct(row.marketProbability)}</td>
        <td className="px-2 py-2 tabular-nums">{decimal(row.qualifyingPrice)}</td><td className="px-2 py-2 tabular-nums">{decimal(row.latestPrice)}</td>
        <td className="px-2 py-2">{row.result}</td><td className="px-2 py-2">{row.outcome}</td><td className="px-2 py-2 tabular-nums">{money(row.profitLoss)}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}
function pct(value: number | null) { return value === null ? "—" : `${(value * 100).toFixed(1)}%`; }
function decimal(value: number | null) { return value === null ? "—" : value.toFixed(2); }
function money(value: number | null) { return value === null ? "—" : `${value < 0 ? "-" : value > 0 ? "+" : ""}£${Math.abs(value).toFixed(2)}`; }

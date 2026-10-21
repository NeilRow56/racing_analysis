import Link from "next/link";
import { summarizeOrSpeed, type OrSpeedData } from "@/lib/racing/or-speed-forward";

export function OrSpeedSummary({ data }: { data: OrSpeedData }) {
  const summary = summarizeOrSpeed(data);
  return <main className="mx-auto max-w-7xl space-y-6 p-6">
    <Link href="/racing/research" className="text-sm text-blue-700 underline">Research</Link>
    <h1 className="text-2xl font-semibold">Prospective OR + Best L3 Speed</h1>
    <p className="text-sm text-slate-600">Activation: {data.epoch}. Morning captures freeze the first eligible pre-race observation for each runner/race. No historical backfill.</p>
    <p className="text-sm text-slate-600">Research only. Cohorts overlap. Rates and sample labels use settled starters; non-runners and voids are excluded. Small samples do not establish significance.</p>
    <p className="text-sm text-slate-600">Normalized finish: 0 = first, 1 = last. Started non-finishers rank last. Dead-heat winners each count as winners.</p>
    {(["TURF", "AW"] as const).map(family => <section key={family} className="space-y-3">
      <h2 className="text-lg font-semibold">{family}</h2>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr>{["Cohort", "Observations", "Settled", "Winners", "Win %", "Top-3 finish %", "Mean normalized finish", "Sample"].map(label => <th key={label} scope="col" className="border-b p-2">{label}</th>)}</tr></thead>
        <tbody>{summary.filter(row => row.family === family).map(row => <tr key={row.cohort}>
          <th scope="row" className="border-b p-2 font-medium">{row.cohort}</th>
          {[row.observations, row.settled, row.winners, format(row.winPercent), format(row.top3Percent), format(row.meanNormalizedFinish, 3), row.sample].map((value, index) => <td key={index} className="border-b p-2">{value}</td>)}
        </tr>)}</tbody>
      </table></div>
    </section>)}
    <p className="text-sm text-slate-600">Fewer than 50 settled: TOO EARLY · 50–149: EARLY · 150–299: DEVELOPING · 300+: MEANINGFUL. These labels describe sample size.</p>
  </main>;
}
function format(value: number | null, decimals = 1) { return value === null ? "—" : value.toFixed(decimals); }

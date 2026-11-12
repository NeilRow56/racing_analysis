import { summarizeOrSpeed, type OrSpeedData } from "@/lib/racing/or-speed-forward";

export function OrSpeedSummary({ data }: { data: OrSpeedData }) {
  const summary = summarizeOrSpeed(data);
  return <section id="or-speed-monitoring" aria-labelledby="or-speed-monitoring-heading" className="mt-6 space-y-4 border border-slate-200 bg-white p-4">
    <h3 id="or-speed-monitoring-heading" className="text-base font-semibold">OR + Best L3 Speed — Prospective Monitoring</h3>
    <p className="text-sm text-slate-600">Activation: {data.epoch}. Morning captures freeze the first eligible pre-race observation for each runner/race. No historical backfill.</p>
    <p className="text-sm text-slate-600">Research only. Cohorts overlap. Rates and sample labels use settled starters; non-runners and voids are excluded. Small samples do not establish significance.</p>
    <p className="text-sm text-slate-600">Independent of Value filters, settlement summaries and headline totals.</p>
    <p className="text-sm text-slate-600">Normalized finish: 0 = first, 1 = last. Started non-finishers rank last. Dead-heat winners each count as winners.</p>
    {(["TURF", "AW"] as const).map(family => <section key={family} className="space-y-3">
      <h4 className="text-sm font-semibold">{family === "TURF" ? "Turf (TURF)" : "All Weather (AW)"}</h4>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr>{["Cohort", "Observations", "Settled starters", "Winners", "Win %", "Top-3 finish %", "Mean normalized finish", "Sample"].map(label => <th key={label} scope="col" className="border-b p-2">{label}</th>)}</tr></thead>
        <tbody>{summary.filter(row => row.family === family).map(row => <tr key={row.cohort}>
          <th scope="row" className="border-b p-2 font-medium">{row.cohort}</th>
          {[row.observations, row.settled, row.winners, format(row.winPercent), format(row.top3Percent), format(row.meanNormalizedFinish, 3), row.sample].map((value, index) => <td key={index} className="border-b p-2">{value}</td>)}
        </tr>)}</tbody>
      </table></div>
    </section>)}
    <p className="text-sm text-slate-600">Fewer than 50 settled: TOO EARLY · 50–149: EARLY · 150–299: DEVELOPING · 300+: MEANINGFUL. These labels describe sample size.</p>
  </section>;
}
function format(value: number | null, decimals = 1) { return value === null ? "—" : value.toFixed(decimals); }

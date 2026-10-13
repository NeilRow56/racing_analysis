import type { AwTissuePairedForwardData } from "@/lib/racing/aw-tissue-paired-forward";
import { buildAwTurfChallengerReport } from "@/lib/racing/aw-turf-challenger-report";
import type { SportingLifeCurrentPrice } from "@/lib/racing/todays-racing";

const percent = (value: number | null) => value === null ? "-" : `${(value * 100).toFixed(1)}%`;
const price = (value: number | null) => value?.toFixed(2) ?? "-";
const adjustedRunnerSummary = (runners: ReturnType<typeof buildAwTurfChallengerReport>["rows"][number]["suppressed"]) =>
  runners.length
    ? `${runners.length} adjusted: ${runners.map((runner) => `${runner.horseName} ${price(runner.firstCapturedPriceDecimal)}`).join(", ")}`
    : null;

export function AwTurfChallengerSection({ data, date, prices }: { data: AwTissuePairedForwardData; date: string; prices?: SportingLifeCurrentPrice[] }) {
  const { rows, summary } = buildAwTurfChallengerReport(data, date, prices);
  return (
    <section aria-labelledby="aw-turf-challenger-heading" className="mt-6 border-t border-slate-200 py-4">
      <h2 id="aw-turf-challenger-heading" className="text-sm font-semibold text-slate-700">AW LONGSHOT TRAINER/JOCKEY CHALLENGER</h2>
      <p className="mt-2 max-w-4xl text-xs text-slate-500">
        Market-conditioned research shadow: runners above 20/1 at first capture have trainer/jockey influence removed. The table shows the resulting challenger #1 horse, which may itself be priced below 20/1. The AW VALUE cap remains unchanged.
      </p>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-600">
        {[["Tracked today", summary.tracked], ["Agree", summary.agree], ["Disagree", summary.disagree], [">20/1 runners adjusted", summary.suppressed], ["Challenger edge", summary.value], ["Settled", summary.settled], ["Winners", summary.winners]].map(([label, value]) => (
          <div key={label} className="flex gap-1"><dt>{label}:</dt><dd className="font-semibold tabular-nums">{value}</dd></div>
        ))}
      </dl>
      {rows.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-xs">
            <thead className="border-y border-slate-200 text-slate-500">
              <tr>{["Time", "Course", "LONGSHOT_TJ_ZERO #1", "Probability", "Market probability", "Captured price", "Latest price", ">20/1 runners adjusted", "Result", "Agreement"].map((heading) => <th key={heading} className="px-3 py-2 font-medium">{heading}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const adjusted = adjustedRunnerSummary(row.suppressed);
                return (
                  <tr key={row.raceId}>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{row.time}</td>
                    <td className="whitespace-nowrap px-3 py-2">{row.course}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{row.horse}</span>{row.value ? <span className="ml-2 inline-block border border-emerald-200 px-1 py-0.5 text-[10px] text-emerald-700">CHALLENGER EDGE</span> : null}
                      {adjusted ? <div className="mt-1 max-w-xs text-[11px] leading-4 text-slate-500">Adjusted &gt;20/1: {adjusted}</div> : null}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{percent(row.probability)}</td>
                    <td className="px-3 py-2 tabular-nums">{percent(row.marketProbability)}</td>
                    <td className="px-3 py-2 tabular-nums">{price(row.capturedPrice)}</td>
                    <td className="px-3 py-2 tabular-nums">{price(row.latestPrice)}</td>
                    <td className="px-3 py-2 tabular-nums">{row.suppressedCount}</td>
                    <td className="whitespace-nowrap px-3 py-2">{row.result}</td>
                    <td className="px-3 py-2 text-[10px] text-slate-600">
                      {row.agrees ? "AGREES WITH CONTROL" : "Adjusted longshots changed rank #1"}
                      {row.agrees ? <div className="mt-1 text-xs text-slate-500">Adjusted longshots did not change rank #1</div> : <div className="mt-1 text-xs text-slate-500">CONTROL #1: {row.awHorse} · {percent(row.awProbability)}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-3 text-xs text-slate-500">No challenger selections recorded for this date.</p>}
    </section>
  );
}

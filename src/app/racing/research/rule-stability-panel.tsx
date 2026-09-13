import type { ResearchRuleStabilityResult } from "@/lib/racing/research-rule-stability";

export function RuleStabilityPanel({ stability }: { stability: ResearchRuleStabilityResult }) {
  const nearbyCount = stability.rows.filter((row) => !row.isCurrent).length;
  return (
    <details className="border border-slate-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer text-lg font-semibold">Rule stability</summary>
      <div className="mt-3 flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm text-slate-600">
            Tests small one-at-a-time changes to the current 2025 rule. 2026 holdout data is not used.
          </p>
          <p className="mt-2 text-sm font-medium text-slate-700">{stability.summaryLabel}</p>
        </div>
        <p className="text-sm text-slate-500">
          {nearbyCount} nearby variants · evaluated in {Math.round(stability.elapsedMs)}ms
        </p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-y border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-3 font-medium">Variant</th>
              <th className="py-2 pr-3 text-right font-medium">Eligible</th>
              <th className="py-2 pr-3 text-right font-medium">Selections</th>
              <th className="py-2 pr-3 text-right font-medium">Settled</th>
              <th className="py-2 pr-3 text-right font-medium">Winners</th>
              <th className="py-2 pr-3 text-right font-medium">Strike</th>
              <th className="py-2 pr-3 text-right font-medium">Places</th>
              <th className="py-2 pr-3 text-right font-medium">Place strike</th>
              <th className="py-2 pr-3 text-right font-medium">P/L</th>
              <th className="py-2 pr-3 text-right font-medium">ROI</th>
              <th className="py-2 pr-3 text-right font-medium">Max losing run</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stability.rows.map((row) => (
              <tr key={row.id}>
                <td className="py-2 pr-3 font-medium text-slate-800">{row.label}</td>
                <td className="py-2 pr-3 text-right">{row.eligibleRunners}</td>
                <td className="py-2 pr-3 text-right">{row.summary.selections}</td>
                <td className="py-2 pr-3 text-right">{row.summary.settledSelections}</td>
                <td className="py-2 pr-3 text-right">{row.summary.wins}</td>
                <td className="py-2 pr-3 text-right">{formatPct(row.summary.winStrikeRate)}</td>
                <td className="py-2 pr-3 text-right">{row.summary.places}</td>
                <td className="py-2 pr-3 text-right">{formatPct(row.summary.placeStrikeRate)}</td>
                <td className="py-2 pr-3 text-right">{formatMoney(row.summary.profitLoss)}</td>
                <td className="py-2 pr-3 text-right">{formatPct(row.summary.roiPercentage)}</td>
                <td className="py-2 pr-3 text-right">{row.summary.maxConsecutiveLosers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function formatPct(value: number | null) {
  return value === null ? "-" : `${value.toFixed(1)}%`;
}

function formatMoney(value: number | null) {
  if (value === null) return "-";
  return value < 0 ? `-£${Math.abs(value).toFixed(2)}` : `£${value.toFixed(2)}`;
}

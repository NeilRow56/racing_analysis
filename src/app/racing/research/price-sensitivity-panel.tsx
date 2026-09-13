import type { ResearchPriceSensitivityResult } from "@/lib/racing/research-price-sensitivity";

export function PriceSensitivityPanel({
  priceSensitivity,
}: {
  priceSensitivity: ResearchPriceSensitivityResult;
}) {
  return (
    <details className="border border-slate-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer text-lg font-semibold">Result price sensitivity</summary>
      <div className="mt-3 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-sm text-slate-600">
            Shows whether 2025 profitability depends heavily on large-priced winners. Result SP is post-race data and is not part of the frozen selection rule.
          </p>
          <p className="mt-2 text-sm font-medium text-slate-700">{priceSensitivity.summaryLabel}</p>
          <p className="mt-1 text-xs text-slate-500">
            Exclusion rows remove winning selections strictly above the named result SP threshold. Cap rows keep all selections but cap winning returns for this diagnostic only.
          </p>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <Diagnostic label="Largest winning SP" value={formatDecimalSp(priceSensitivity.diagnostics.largestWinningDecimalSp)} />
          <Diagnostic label="Largest winner profit" value={formatMoney(priceSensitivity.diagnostics.largestWinnerProfit)} />
          <Diagnostic label="Top 1 winner share" value={formatPct(priceSensitivity.diagnostics.top1WinnerProfitShare)} />
          <Diagnostic label="Top 3 winner share" value={formatPct(priceSensitivity.diagnostics.top3WinnerProfitShare)} />
          <Diagnostic label="Top 5 winner share" value={formatPct(priceSensitivity.diagnostics.top5WinnerProfitShare)} />
        </dl>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-y border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-3 font-medium">Scenario</th>
              <th className="py-2 pr-3 text-right font-medium">Selections</th>
              <th className="py-2 pr-3 text-right font-medium">Settled</th>
              <th className="py-2 pr-3 text-right font-medium">Winners</th>
              <th className="py-2 pr-3 text-right font-medium">Strike</th>
              <th className="py-2 pr-3 text-right font-medium">P/L</th>
              <th className="py-2 pr-3 text-right font-medium">ROI</th>
              <th className="py-2 pr-3 text-right font-medium">Max losing run</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {priceSensitivity.scenarios.map((scenario) => (
              <tr key={scenario.id}>
                <td className="py-2 pr-3 font-medium text-slate-800">{scenario.label}</td>
                <td className="py-2 pr-3 text-right">{scenario.summary.selections}</td>
                <td className="py-2 pr-3 text-right">{scenario.summary.settledSelections}</td>
                <td className="py-2 pr-3 text-right">{scenario.summary.wins}</td>
                <td className="py-2 pr-3 text-right">{formatPct(scenario.summary.winStrikeRate)}</td>
                <td className="py-2 pr-3 text-right">{formatMoney(scenario.summary.profitLoss)}</td>
                <td className="py-2 pr-3 text-right">{formatPct(scenario.summary.roiPercentage)}</td>
                <td className="py-2 pr-3 text-right">{scenario.summary.maxConsecutiveLosers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Diagnostic({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-100 bg-slate-50 p-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

function formatPct(value: number | null) {
  return value === null ? "-" : `${value.toFixed(1)}%`;
}

function formatMoney(value: number | null) {
  if (value === null) return "-";
  return value < 0 ? `-£${Math.abs(value).toFixed(2)}` : `£${value.toFixed(2)}`;
}

function formatDecimalSp(value: number | null) {
  if (value === null) return "-";
  const fractionalOdds = value - 1;
  return `${Number.isInteger(fractionalOdds) ? fractionalOdds : fractionalOdds.toFixed(1)}/1`;
}

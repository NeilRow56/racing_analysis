import type { summarizeHurdleFinalSp } from "@/lib/racing/hurdle-final-sp";

type Summary = ReturnType<typeof summarizeHurdleFinalSp>;
const money = (value: number | null) => {
  if (value === null) return "—";
  const amount = Math.abs(value).toFixed(2);
  const sign = amount === "0.00" ? "" : value > 0 ? "+" : "−";
  return `${sign}£${amount}`;
};

export const hurdleFinalSpHeaders = ["SP stakes", "£1 SP P/L", "SP ROI"];
export function HurdleFinalSpCells({ summary }: { summary: Summary }) {
  const missing = summary.eligible - summary.stakes;
  return <>
    <td className="p-2">{summary.stakes}{missing > 0 && <span className="text-amber-800"> ({missing} unverified)</span>}</td>
    <td className="p-2">{money(summary.profit)}</td>
    <td className="p-2">{summary.roi === null ? "—" : `${(100 * summary.roi).toFixed(1)}%`}</td>
  </>;
}

export function HurdleFinalSpSensitivity({ rows }: { rows: { label: string; summary: Summary }[] }) {
  if (!rows.some(r => r.summary.stakes)) return null;
  return <details className="mt-3">
    <summary className="cursor-pointer text-sm">Largest-winner sensitivity (exploratory)</summary>
    <p className="mt-1 text-xs text-slate-500">Races are ranked by the largest winning payout. Each exclusion removes all stakes in that race.</p>
    <div className="overflow-x-auto"><table className="mt-2 w-full whitespace-nowrap text-left text-xs tabular-nums">
      <thead><tr>{["Selection", "£1 SP P/L", "Excluding largest winning race", "Excluding two largest winning races"].map(h => <th key={h} className="border-b p-2">{h}</th>)}</tr></thead>
      <tbody>{rows.map(({ label, summary }) => <tr key={label}>
        <th className="p-2 font-medium">{label}</th><td className="p-2">{money(summary.profit)}</td>
        <td className="p-2">{money(summary.withoutLargest)}</td><td className="p-2">{money(summary.withoutTwoLargest)}</td>
      </tr>)}</tbody>
    </table></div>
  </details>;
}

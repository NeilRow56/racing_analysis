import type { loadCurrentPositiveNeutralSummary } from "@/lib/racing/current-positive-neutral-summary";
import { EPOCHS } from "@/lib/racing/prospective-epoch-config";
import { TissueFamilyModels } from "./tissue-family-models";

type Summary = Awaited<ReturnType<typeof loadCurrentPositiveNeutralSummary>>;

const familyLabels = { ALL: "All Families", TURF: "Turf", AW: "All Weather", HURDLE: "Hurdle", CHASE: "Chase" };
const columns = ["Family", "Captured", "Settled", "Winners", "Strike rate", "Expected winners", "A/E", "Priced", "£1 P/L", "ROI"];
const percent = (value: number | null) => value === null ? "—" : `${(100 * value).toFixed(1)}%`;
const decimal = (value: number | null) => value === null ? "—" : value.toFixed(2);
const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export function CurrentPositiveNeutralSummary({ summary }: { summary: Summary }) {
  return (
    <section className="mt-5 border border-slate-300 bg-white p-4" aria-labelledby="current-positive-neutral-heading">
      <h3 id="current-positive-neutral-heading" className="text-base font-semibold">CURRENT — Tissue Positive/Neutral Collection V2</h3>
      <p className="mt-1 text-sm text-slate-600">Collection epoch activated 11 November 2026. T1 and T2 are the first- and second-ranked selections.</p>
      <p className="mt-1 break-words text-xs text-slate-500">{EPOCHS.positiveNeutral.id}</p>
      <TissueFamilyModels />
      {summary ? <>
        <div className="mt-2 space-y-3">
          {summary.map(({ rank, rows }) => (
            <div key={rank} className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-right text-xs tabular-nums sm:text-sm">
                <caption className="pb-1 text-left font-semibold">T{rank}</caption>
                <thead className="border-y border-slate-200 text-slate-600">
                  <tr>
                    {columns.map((column, index) => (
                      <th key={column} scope="col" className={index === 0 ? "py-1.5 pr-2 text-left" : "px-2 py-1.5"}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(row => (
                    <tr key={row.family} className={row.family === "ALL" ? "bg-slate-50 font-semibold" : undefined}>
                      <th scope="row" className="py-1.5 pr-2 text-left font-medium">{familyLabels[row.family]}</th>
                      <td className="px-2">{row.captured}</td>
                      <td className="px-2">{row.settled}</td>
                      <td className="px-2">{row.winners}</td>
                      <td className="px-2">{percent(row.strikeRate)}</td>
                      <td className="px-2">{decimal(row.expectedWinners)}</td>
                      <td className="px-2">{decimal(row.actualExpected)}</td>
                      <td className="px-2">{row.priced}</td>
                      <td className="px-2">{row.profitLoss === null ? "—" : money.format(row.profitLoss)}</td>
                      <td className="px-2">{percent(row.roi)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-600">
          Expected winners and A/E use settled candidates with a frozen market probability. A/E above 1 means more winners than the market expected.
          Priced counts settled candidates with recorded capture odds and a recorded return. Each counts as one £1 stake for ROI.
          A dash indicates insufficient data. Results can swing sharply with few settled candidates.
        </p>
      </> : <p className="mt-2 text-sm text-slate-600">The V2 collection summary is unavailable.</p>}
    </section>
  );
}

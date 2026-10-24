import type { ProspectiveTissueObservation } from "@/lib/racing/tissue-prospective-summary";
import { summarizeTissueSpeedRankWatch, TISSUE_SPEED_RANK_WATCH_START, TISSUE_SPEED_RANK_WATCH_DECLARED } from "@/lib/racing/tissue-speed-rank-watch-summary";

const pct = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(2)}%`;
const number = (value: number | null) => value === null ? "—" : value.toFixed(2);
const money = (value: number | null) => value === null ? "—" : `${value < 0 ? "−" : value > 0 ? "+" : ""}£${Math.abs(value).toFixed(2)}`;
const labels = { TURF: "Turf", AW: "AW", HURDLE: "Hurdle", CHASE: "Chase", ALL: "All families" };

export function TissueSpeedRankWatch({ observations, priceObservations = [] }: {
  observations: ProspectiveTissueObservation[]; priceObservations?: ProspectiveTissueObservation[];
}) {
  const model = summarizeTissueSpeedRankWatch(observations), prices = summarizeTissueSpeedRankWatch(priceObservations);
  return <section className="mt-5 border-t border-red-200 pt-4" aria-labelledby="tissue-speed-watch-heading">
    <h3 id="tissue-speed-watch-heading" className="text-base font-semibold">Best L3 Speed Rank 2–3 — Research Watch</h3>
    <p className="mt-1 text-sm text-slate-600">Prospective Tissue Rank 1/2 runners currently being monitored; no exclusion rule applied.</p>
    <p className="mt-1 text-xs text-slate-500">Frozen prospective data since {TISSUE_SPEED_RANK_WATCH_START}. Hypothesis declared {TISSUE_SPEED_RANK_WATCH_DECLARED}; earlier results are discovery context, not independent confirmation.</p>
    <details className="mt-2">
      <summary className="cursor-pointer text-sm font-medium">BEST L3 SPEED RANK 2–3 — SHADOW · compare both Tissue ranks and the complement</summary>
      {(["watch", "complement"] as const).map(group => <div key={group} className="mt-3">
        <h4 className="text-sm font-medium">{group === "watch" ? "Best L3 Speed rank 2–3" : "Best L3 Speed rank NOT 2–3 (includes missing)"}</h4>
        {model[group].map((section, sectionIndex) => <div key={section.rank} className="mt-2 overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
            <caption className="mb-1 text-left font-semibold">{section.rank === "TOP_2" ? "TISSUE TOP 2" : `TISSUE RANK ${section.rank}`}</caption>
            <thead><tr><th scope="colgroup" colSpan={7} className="border-b px-2 py-1 text-slate-600">Family Tissue books · model results</th><th scope="colgroup" colSpan={3} className="border-b bg-amber-50 px-2 py-1 text-slate-600">Separate Value cohort · captured-price returns</th></tr>
              <tr>{["Family", "Captured", "Settled", "Winners", "Strike", "Model exp.", "Actual/model", "Price n", "Captured-price P/L", "ROI"].map(label => <th key={label} scope="col" className="border-b px-2 py-1 font-medium">{label}</th>)}</tr></thead>
            <tbody>{section.rows.map((row, rowIndex) => {
              const price = prices[group][sectionIndex].rows[rowIndex];
              return <tr key={row.family} className={row.family === "ALL" ? "border-t bg-slate-50 font-medium" : ""}>
                <th scope="row" className="px-2 py-1">{labels[row.family]}</th>
                <td className="px-2 py-1">{row.captured}</td><td className="px-2 py-1">{row.settled}</td><td className="px-2 py-1">{row.winners}</td>
                <td className="px-2 py-1">{pct(row.strikeRate)}</td><td className="px-2 py-1">{number(row.modelExpected)}</td><td className="px-2 py-1">{number(row.actualModelExpected)}</td>
                <td className="bg-amber-50/50 px-2 py-1">{price.priceN}</td><td className="bg-amber-50/50 px-2 py-1">{money(price.profitLoss)}</td><td className="bg-amber-50/50 px-2 py-1">{pct(price.roi)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>)}
      </div>)}
    </details>
    <p className="mt-2 text-xs text-slate-500">Different family models are pooled descriptively. Money uses the separate complete-market Value cohort’s own frozen Tissue and Speed ranks; it does not describe every runner in the model columns. NR/void, pending and dead heats retain the existing prospective summary and canonical price-settlement semantics.</p>
    <p className="mt-1 text-xs text-slate-500">Missing Speed ranks are unflagged and included in the complement: {model.missingSpeedRank} model captures; {prices.missingSpeedRank} Value captures. No runner is suppressed; Tissue probabilities, ranks and Value logic are unchanged. Jump Speed reliability remains separate.</p>
  </section>;
}

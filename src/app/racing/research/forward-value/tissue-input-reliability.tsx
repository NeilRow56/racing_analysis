import type { ProspectiveTissueObservation } from "@/lib/racing/tissue-prospective-summary";
import { TISSUE_INPUT_RELIABILITY_DECLARED } from "@/lib/racing/tissue-input-reliability";
import { summarizeTissueInputReliability, summarizeTissueReliabilityInteraction, summarizeTissueReliabilityChronology } from "@/lib/racing/tissue-input-reliability-summary";

const pct = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(2)}%`;
const number = (value: number | null) => value === null ? "—" : value.toFixed(2);
const money = (value: number | null) => value === null ? "—" : `${value < 0 ? "−" : value > 0 ? "+" : ""}£${Math.abs(value).toFixed(2)}`;
const labels = { TURF: "Turf", AW: "AW", HURDLE: "Hurdle", CHASE: "Chase", ALL: "All families" };
type RankSummary = ReturnType<typeof summarizeTissueInputReliability>[number]["ranks"];

function ReliabilityTables({ model, prices }: { model: RankSummary; prices: RankSummary }) {
  return model.map((section, sectionIndex) => <div key={section.rank} className="mt-2 overflow-x-auto">
    <table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
      <caption className="mb-1 text-left font-semibold">{section.rank === "TOP_2" ? "TISSUE TOP 2" : `TISSUE RANK ${section.rank}`}</caption>
      <thead><tr><th scope="colgroup" colSpan={7} className="border-b px-2 py-1 text-slate-600">Family Tissue books · model results</th><th scope="colgroup" colSpan={3} className="border-b bg-amber-50 px-2 py-1 text-slate-600">Separate Value cohort · captured-price returns</th></tr>
        <tr>{["Family", "Captured", "Settled", "Winners", "Strike", "Model exp.", "Actual/model", "Price n", "Captured-price P/L", "ROI"].map(label => <th key={label} scope="col" className="border-b px-2 py-1 font-medium">{label}</th>)}</tr>
      </thead>
      <tbody>{section.rows.map((row, rowIndex) => {
        const price = prices[sectionIndex].rows[rowIndex];
        return <tr key={row.family} className={row.family === "ALL" ? "border-t bg-slate-50 font-medium" : ""}>
          <th scope="row" className="px-2 py-1">{labels[row.family]}</th>
          <td className="px-2 py-1">{row.captured}</td>
          <td className="px-2 py-1">{row.settled}</td><td className="px-2 py-1">{row.winners}</td>
          <td className="px-2 py-1">{pct(row.strikeRate)}</td><td className="px-2 py-1">{number(row.modelExpected)}</td>
          <td className="px-2 py-1 font-medium">{number(row.actualModelExpected)}</td>
          <td className="bg-amber-50/50 px-2 py-1">{price.priceN}</td><td className="bg-amber-50/50 px-2 py-1">{money(price.profitLoss)}</td><td className="bg-amber-50/50 px-2 py-1">{pct(price.roi)}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>);
}

export function TissueInputReliabilityWatch({ observations, priceObservations = [] }: {
  observations: ProspectiveTissueObservation[]; priceObservations?: ProspectiveTissueObservation[];
}) {
  const model = summarizeTissueInputReliability(observations), prices = summarizeTissueInputReliability(priceObservations);
  const interaction = summarizeTissueReliabilityInteraction(observations);
  const chronology = summarizeTissueReliabilityChronology(observations), priceChronology = summarizeTissueReliabilityChronology(priceObservations);
  return <section className="mt-5 border-t border-amber-200 pt-4" aria-labelledby="tissue-reliability-heading">
    <h3 id="tissue-reliability-heading" className="text-base font-semibold">Tissue Input Reliability — Research Watch</h3>
    <p className="mt-1 text-sm text-slate-600">GOOD vs CAUTION: compare Actual/model first; captured-price ROI is secondary. No exclusion rule is applied.</p>
    <p className="mt-1 text-xs text-slate-500">Frozen prospective Tissue Top-2 observations since 20 October 2026, across all market ratios. Monitor declared {TISSUE_INPUT_RELIABILITY_DECLARED}; earlier captures are discovery context, not independent confirmation. GOOD means no encoded numeric missingness and a nonzero prior-start count. It does not certify fresh or sufficient history. CAUTION means an existing numeric missing flag or zero prior starts; UNKNOWN means insufficient frozen metadata.</p>
    <details className="mt-2">
      <summary className="cursor-pointer text-sm font-medium">INPUT RELIABILITY — SHADOW · compare both ranks and all families</summary>
      {model.map((group, i) => <div key={group.level} className="mt-3">
        <h4 className="text-sm font-medium">{group.level}</h4>
        <ReliabilityTables model={group.ranks} prices={prices[i].ranks} />
      </div>)}
    </details>
    <details className="mt-2">
      <summary className="cursor-pointer text-sm font-medium">Best L3 watch × input reliability · descriptive interaction</summary>
      <p className="mt-1 text-xs text-slate-500">Four known-status groups remain independent. UNKNOWN reliability is shown separately; missing Speed ranks remain NON-WATCH under the existing watch semantics.</p>
      {model[0].ranks.map((section, si) => <div key={section.rank} className="mt-3 overflow-x-auto">
        <table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
          <caption className="mb-1 text-left font-semibold">{section.rank === "TOP_2" ? "TISSUE TOP 2" : `TISSUE RANK ${section.rank}`}</caption>
          <thead><tr>{["Family", "Watch × reliability", "Settled", "Winners", "Actual/model"].map(label => <th key={label} scope="col" className="border-b px-2 py-1 font-medium">{label}</th>)}</tr></thead>
          <tbody>{section.rows.flatMap((row, ri) => interaction.map(group => {
            const metrics = group.ranks[si].rows[ri];
            return <tr key={`${row.family}-${group.watch}-${group.level}`}>
              <th scope="row" className="px-2 py-1">{labels[row.family]}</th><td className="px-2 py-1">{group.watch ? "WATCH" : "NON-WATCH"} + {group.level}</td>
              <td className="px-2 py-1">{metrics.settled}</td><td className="px-2 py-1">{metrics.winners}</td><td className="px-2 py-1">{number(metrics.actualModelExpected)}</td>
            </tr>;
          }))}</tbody>
        </table>
      </div>)}
    </details>
    <details className="mt-2">
      <summary className="cursor-pointer text-sm font-medium">Capture chronology · earlier and later halves</summary>
      <p className="mt-1 text-xs text-slate-500">Untuned median of distinct race captures; entire books and equal timestamps stay together. Boundaries update as captures accumulate, independently for each cohort. Primary boundary (UTC): {chronology.boundary ?? "unknown"}. Value boundary (UTC): {priceChronology.boundary ?? "unknown"}. Later follow-up may be incomplete; missing clocks remain UNKNOWN CAPTURE TIME.</p>
      {chronology.windows.map((window, wi) => <div key={window.window} className="mt-3">
        <h4 className="text-sm font-semibold">{window.window}</h4>
        {window.groups.map((group, gi) => <div key={group.level} className="mt-2">
          <h5 className="text-xs font-medium">{group.level}</h5>
          <ReliabilityTables model={group.ranks} prices={priceChronology.windows[wi].groups[gi].ranks} />
        </div>)}
      </div>)}
    </details>
    <p className="mt-2 text-xs text-slate-500">Model results use each primary family book’s own frozen inputs, ranks and probabilities. Money uses the separate complete-market Value cohort’s own reliability, ranks and canonical captured-price returns; these are different populations. Pending counts only in Captured; NR/void are excluded from settled metrics and stakes. Model expected sums settled frozen probabilities. Missing prices contribute no stake or loss; stored dead-heat settlement is preserved.</p>
    <p className="mt-1 text-xs text-slate-500">Different family models are pooled descriptively. The sparse-data diagnostic’s weakness did not persist across both chronological halves. Small trainer/jockey sample sizes are a separate concept. The amber Data indicator and pale-red Speed watch are independent; no runner, daily-list entry, probability, rank or Value eligibility is changed.</p>
  </section>;
}

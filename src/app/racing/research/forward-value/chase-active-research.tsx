import type { ReactNode } from "react";
import { CHASE_T3_VALIDATION_START, chaseT3Research } from "@/lib/racing/chase-t3-research";
import type { GenerationData } from "@/lib/racing/tissue-generation-forward";
import experiment from "../../../../../data/research/chase-market-experiment-2026-11-18.json";

type T3Report = ReturnType<typeof chaseT3Research>["prospective"];
type Stats = T3Report["headline"];
type BreakdownRow = Pick<Stats, "captured" | "settled" | "dates" | "winners" | "marketExpected" | "ae" | "priced" | "n" | "profit" | "roi">;
const number = (value: number | null, digits = 2) => value === null ? "—" : value.toFixed(digits);
const percent = (value: number | null) => value === null ? "—" : `${number(value * 100, 1)}%`;
const money = (value: number | null) => value === null ? "—" : `${value < 0 ? "−" : ""}£${number(Math.abs(value))}`;
const interval = (range: readonly number[] | null, format: (value: number) => string = number) =>
  range ? range.map(value => format(value)).join(" to ") : "—";

function ResearchTable({ headers, rows }: { headers: string[]; rows: { label: string; cells: ReactNode[] }[] }) {
  return <div className="mt-2 overflow-x-auto">
    <table className="w-full text-left text-xs tabular-nums">
      <thead className="border-b border-slate-200 text-slate-600">
        <tr>{headers.map(header => <th key={header} scope="col" className="px-2 py-2">{header}</th>)}</tr>
      </thead>
      <tbody>{rows.map(({ label, cells }) => <tr key={label} className="border-b border-slate-100">
        <th scope="row" className="whitespace-nowrap px-2 py-2 font-medium">{label}</th>
        {cells.map((cell, i) => <td key={headers[i + 1]} className="whitespace-nowrap px-2 py-2">{cell}</td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}

function Breakdown({ label, rows }: { label: string; rows: readonly (readonly [string, BreakdownRow])[] }) {
  return <>
    <h4 className="mt-4 text-sm font-semibold">{label}</h4>
    <ResearchTable headers={["Group", "Captured", "Settled", "Dates", "Wins", "Market E", "Market A/E", "Priced", "V3 stakes", "£1 P/L", "ROI"]}
      rows={rows.map(([label, s]) => ({
        label, cells: [s.captured, s.settled, s.dates, s.winners, number(s.marketExpected), number(s.ae), s.priced, s.n, money(s.profit), percent(s.roi)],
      }))} />
  </>;
}

function RankBreakdowns({ report }: { report: Omit<T3Report, "periods"> & { periods: readonly (readonly [string, BreakdownRow])[] } }) {
  return <>
    <Breakdown label="Captured market rank" rows={report.marketRanks} />
    <Breakdown label="Captured decimal odds" rows={report.odds} />
    <Breakdown label="Race dates" rows={report.dates} />
    <Breakdown label="Chronological periods" rows={report.periods} />
  </>;
}

function T3Rows({ rows }: { rows: Array<[string, Stats]> }) {
  return <>
    <ResearchTable headers={["Evidence", "Captured / settled", "Settled dates", "Winners", "Strike", "Model E", "Market E", "Market A/E", "Recorded price", "V3 stakes", "£1 P/L", "ROI"]}
      rows={rows.map(([label, s]) => ({
        label, cells: [`${s.captured} / ${s.settled}`, s.dates, s.winners, percent(s.strike), number(s.modelExpected), number(s.marketExpected),
          number(s.ae), `${s.priced} / ${s.captured}`, s.n, money(s.profit), percent(s.roi)],
      }))} />
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-medium text-emerald-900">Largest winners and uncertainty</summary>
      <ResearchTable headers={["Evidence", "Priced settled", "Stake dates", "Excluding largest", "Excluding two largest", "Market A/E interval", "ROI interval"]}
        rows={rows.map(([label, s]) => ({
          label, cells: [`${s.settledPriced} / ${s.settled}`, s.stakeDates,
            `${money(s.afterOne?.profit ?? null)} / ${percent(s.afterOne?.roi ?? null)}`,
            `${money(s.afterTwo?.profit ?? null)} / ${percent(s.afterTwo?.roi ?? null)}`,
            interval(s.aeInterval), interval(s.roiInterval, percent)],
        }))} />
      <p className="mt-1 text-xs text-slate-600">Descriptive 95% race-date bootstrap intervals. A/E uses frozen market probabilities and fractional dead-heat credit. Returns use recorded corrected v3 settlements only.</p>
    </details>
  </>;
}

function ExperimentComparison() {
  return <>
    <h3 className="text-base font-semibold">Can form ranks improve on the market?</h3>
    <p className="mt-1 text-sm text-slate-700">The captured market led on log loss and Brier score. Adding official-rating and recent-speed ranks made both scores worse.</p>
    <p className="mt-1 text-xs text-slate-600">Chronological validation · exploratory · {experiment.training.races} training races from 20 October to 4 November, followed by {experiment.validation.races} matched Chase races from 5 to 18 November 2026.</p>
    <ResearchTable headers={["Forecast", "Top-choice wins", "Log loss ↓", "Brier ↓", "Paired Δ log loss (95% interval)", "Top-choice market E", "Top-choice market A/E"]}
      rows={experiment.models.map(m => ({
        label: m.label, cells: [`${m.winners} / ${m.races}`, number(m.logLoss, 3), number(m.brier, 3),
          m.label === "Captured market" ? "Baseline" : `${number(m.pairedLogLoss, 3)} (${interval(m.pairedLogLossInterval, value => number(value, 3))})`,
          number(m.expected), number(m.marketAE)],
      }))} />
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-medium text-emerald-900">Calibration, price bands and chronological results</summary>
      <p className="mt-2 text-xs text-slate-600">Normalized inverse odds from the full pre-race bookmaker book set the market baseline. All forecasts use the same settled fields. Monetary comparisons use one fixed top choice per forecast on the shared corrected-v3 subset.</p>
      <ResearchTable headers={["Forecast", "Canonical price coverage", "Shared stakes / dates / wins", "£1 P/L", "ROI", "ROI interval", "Excluding largest", "Excluding two largest"]}
        rows={experiment.models.map(m => ({
          label: m.label, cells: [`${m.canonicalPriced} / ${m.priced}`, `${m.n} / ${m.stakeDates} / ${m.stakedWinners}`, money(m.profit), percent(m.roi),
            interval(m.roiInterval, percent), money(m.afterOne?.profit ?? null), money(m.afterTwo?.profit ?? null)],
        }))} />
      {experiment.periods.map(period => <div key={period.name} className="mt-3">
        <h4 className="text-sm font-semibold">{period.name}</h4>
        <ResearchTable headers={["Forecast", "Races / dates", "Wins", "Log loss", "Brier", "Paired Δ Brier", "£1 P/L"]}
          rows={period.models.map(m => ({ label: m.label, cells: [`${m.races} / ${m.dates}`, m.winners, number(m.logLoss, 3), number(m.brier, 3), number(m.pairedBrier, 3), money(m.profit)] }))} />
      </div>)}
      {experiment.models.map(m => <div key={m.label} className="mt-3">
        <h4 className="text-sm font-semibold">{m.label}</h4>
        <ResearchTable headers={["Probability band", "Runners", "Mean forecast", "Observed win credit"]}
          rows={m.calibration.map(bin => ({
            label: `${percent(bin.lower)}–${percent(bin.upper)}`, cells: [bin.n, percent(bin.forecast), percent(bin.actual)],
          }))} />
        <ResearchTable headers={["Top-choice odds", "Races", "Winner credit", "Market E", "Market A/E"]}
          rows={m.priceBands.map(band => ({ label: band.band, cells: [band.races, number(band.actual), number(band.marketExpected), number(band.marketAE)] }))} />
      </div>)}
    </details>
  </>;
}

export function ChaseActiveResearch({ generation, historicalOnly = false }: { generation: GenerationData; historicalOnly?: boolean }) {
  const { historical, prospective } = chaseT3Research(generation);
  return <div className="mt-3 grid gap-3">
    <section aria-labelledby="chase-t3-validation" className="rounded-lg border border-emerald-200 bg-white p-4">
      <h3 id="chase-t3-validation" className="text-base font-semibold">CHASE V2 — T3 MARKET VALIDATION</h3>
      {historicalOnly ? <>
      <p className="mt-1 text-xs text-slate-600">Exploratory review through 18 November 2026 at 16:05 UTC. Returns use frozen Sporting Life median bookmaker prices.</p>
      <T3Rows rows={[["Historical exploratory · 18 November review", historical.headline]]} />
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-emerald-900">Historical diagnostics and matched runners</summary>
        <RankBreakdowns report={historical} />
        <h4 className="mt-4 text-sm font-semibold">Tissue ranks and market favourite on identical fields</h4>
        <ResearchTable headers={["Selection", "Wins / races", "Market A/E", "Mean market rank", "Mean OR rank", "Mean speed rank", "Mean odds", "Mean prior jump starts"]}
          rows={experiment.matchedRanks.map(m => ({
            label: m.label, cells: [`${m.winners} / ${m.settled}`, number(m.ae), number(m.marketRank.mean),
              number(m.officialRatingRank.mean), number(m.speedRank.mean), number(m.decimalOdds.mean), number(m.priorJumpStarts.mean)],
          }))} />
        {experiment.contextBands.map(group => <Breakdown key={group.label} label={group.label}
          rows={group.bands.map(band => [band.band, band])} />)}
      </details>
      </> : <>
        <T3Rows rows={[[prospective.headline.captured ? "Genuine prospective" : "Prospective · awaiting collection", prospective.headline]]} />
        <p className="mt-2 text-xs text-slate-600">Monitoring from {CHASE_T3_VALIDATION_START}. Returns use frozen Sporting Life median bookmaker prices.</p>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-emerald-900">Prospective evidence by rank, odds and date</summary>
          {prospective.headline.captured ? <RankBreakdowns report={prospective} /> : <p className="mt-2 text-sm text-slate-600">Awaiting eligible Chase captures.</p>}
        </details>
      </>}
    </section>
    {historicalOnly && <><section className="rounded-lg border border-slate-200 bg-white p-4">
      <ExperimentComparison />
    </section>
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-base font-semibold">Findings and next evidence</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
        <li>T3 matched the market favourite’s winner count on the strict matched fields. Its above-market winner count merits a prospective check. Returns depend heavily on a few races.</li>
        <li>The form-rank experiment uses exploratory 2026 Chase evidence. A separate disagreement model and a pace or conditions model remain proposals. The frozen books lack audited sectional and comparable-condition histories.</li>
        <li>Keep the T3 rule fixed on newly captured races. Review after 200 settled races across 30 dates with at least 80% recorded-price coverage. The first test is whether the market A/E interval clears 1.</li>
      </ul>
    </section></>}
  </div>;
}

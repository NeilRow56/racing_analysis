"use client";

import { useState } from "react";
import type { ValueCohortDisplay } from "@/lib/racing/tissue-value-view";
import { filterValueRaces } from "@/lib/racing/tissue-value-view";
import { TISSUE_VALUE_FAMILIES, type TissueValueFamilyFilter } from "@/lib/racing/tissue-value-metrics";
import { summarizeValueBands, summarizeValueRunners } from "@/lib/racing/tissue-value-metrics";
import { TissueValueRaceTables } from "./tissue-value-race-tables";
const pct = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(2)}%`;
const number = (value: number | null) => value === null ? "—" : value.toFixed(2);

export function TissueValueMonitoringClient({ cohorts, date }: { cohorts: ValueCohortDisplay[]; date: string }) {
  const [family, setFamily] = useState<TissueValueFamilyFilter>("ALL");
  const races = filterValueRaces(cohorts.filter(c => c.available).flatMap(c => c.races), family);
  const runners = races.flatMap(r => r.runners), summary = summarizeValueRunners(runners), bands = summarizeValueBands(runners);
  return <section className="mt-6 border-t-2 border-amber-300 pt-5" aria-labelledby="tissue-value-monitoring-heading">
    <h3 id="tissue-value-monitoring-heading" className="text-base font-semibold">Tissue Value Monitoring</h3>
    <p className="mt-1 text-sm text-slate-600">All eligible Tissue runners · separate family/model cohorts · no historical backfill.</p>
    <p className="mt-2 text-sm"><strong>Tissue rank</strong> orders likelihood of winning. <strong>Value rank</strong> orders model-vs-market apparent value by expected return at the captured price.</p>
    <p className="mt-1 text-xs text-slate-500">Large disagreements are highlighted for review, whether the runner wins or loses. No runner is suppressed. These estimates are descriptive research, with no betting recommendation or proven superior value metric.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cohorts.map(cohort => {
      const totals = summarizeValueRunners(cohort.races.flatMap(r => r.runners));
      return <article key={cohort.version} className="border border-slate-200 bg-white p-3 text-xs">
        <h4 className="font-semibold">{cohort.family}</h4><p className="mt-1">{cohort.modelVersion}</p>
        {cohort.available ? <p className="mt-2">Captured / settled: {totals.tracked} / {totals.runners}</p> : <p className="mt-2">VALUE MONITORING NOT AVAILABLE<br />Reason: {cohort.reason ?? "Valid all-runner model probabilities unavailable"}</p>}
        <p className="mt-1 text-slate-500">Since {cohort.epoch}</p>
      </article>;
    })}</div>
    <label className="mt-4 block text-xs">Family <select className="ml-2 border border-slate-300 bg-white p-2" value={family} onChange={event => setFamily(event.target.value as TissueValueFamilyFilter)}>
      <option value="ALL">ALL</option>{TISSUE_VALUE_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
    </select></label>
    <p className="mt-2 text-xs text-slate-600">{family === "ALL" ? "Pooled descriptive summary of eligible families. These are different models; inspect each family/model separately for calibration." : `${family} · current model cohort only`}</p>
    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
      <div><dt className="text-xs text-slate-500">Captured / settled runners</dt><dd>{summary.tracked} / {summary.runners}</dd></div>
      <div><dt className="text-xs text-slate-500">Actual / model expected</dt><dd>{number(summary.actualModelExpected)}</dd></div>
      <div><dt className="text-xs text-slate-500">Actual / market expected</dt><dd>{number(summary.actualMarketExpected)}</dd></div>
    </dl>
    <p className="mt-2 text-xs text-slate-500">Calibration comes first: compare strike rate with mean model probability and actual/model expected with 1.00. Small samples and runners within the same race are not independent. Captured-price ROI is secondary.</p>
    <details className="mt-4" open>
      <summary className="cursor-pointer text-sm font-medium">Prospective calibration · all capture dates</summary>
      <CalibrationTable title="Fixed model/market ratio bands" rows={bands.ratio} />
      <CalibrationTable title="Fixed captured market-rank groups" rows={bands.marketRank} />
      <p className="mt-2 text-xs text-slate-500">Runners in these tables are settled starters only. Pending: {summary.pending}; NR: {summary.nonRunners}; void: {summary.voids}. NR/void are excluded from stakes and expected-winner sums. Frozen probabilities are retained without hindsight renormalization after withdrawals. Dead-heat winners each count as a winner; canonical dead-heat deductions apply to captured-price P/L.</p>
    </details>
    <p className="mt-3 text-xs text-slate-500">Market % is normalized across the complete captured median-bookmaker field. A positive normalized edge need not imply a positive expected return at the quoted price. Value and market ties share competition ranks; Tissue ranks retain each model’s native tie policy. Runner IDs order tied rows. Alternative edge and ratio ranks appear on the Value rank cell tooltip.</p>
    <TissueValueRaceTables races={races} date={date} />
  </section>;
}
function CalibrationTable({ title, rows }: { title: string; rows: Array<{ band: string } & ReturnType<typeof summarizeValueRunners>> }) {
  return <div className="mt-3 overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
    <caption className="mb-2 text-left font-semibold">{title}</caption>
    <thead><tr>{["Band", "Runners", "Winners", "Strike rate", "Mean model %", "Mean market %", "Model expected", "Market expected", "Actual/model expected", "Actual/market expected", "Captured-price ROI"].map(h => <th key={h} scope="col" className="border-b p-2 font-medium">{h}</th>)}</tr></thead>
    <tbody>{rows.map(row => <tr key={row.band}><th scope="row" className="p-2 font-normal">{row.band}</th>
      <td className="p-2">{row.runners}</td><td className="p-2">{row.winners}</td><td className="p-2">{pct(row.strikeRate)}</td><td className="p-2">{pct(row.meanModelProbability)}</td><td className="p-2">{pct(row.meanMarketProbability)}</td>
      <td className="p-2">{number(row.modelExpected)}</td><td className="p-2">{number(row.marketExpected)}</td><td className="p-2">{number(row.actualModelExpected)}</td><td className="p-2">{number(row.actualMarketExpected)}</td><td className="p-2">{pct(row.roi)}</td>
    </tr>)}</tbody>
  </table></div>;
}

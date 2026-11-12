import { readIsolatedJumpCandidate } from "@/lib/racing/jump-candidate-reader";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import {
  canCompareExploratory2025, compare2025Outcomes, evaluateJumpExploratory, exploratoryEligibilityText,
  EXPLORATORY_FEATURE_OPTIONS, JUMP_EXPLORATORY_LABEL, JUMP_EXPLORATORY_WARNING, parseExploratoryOptions, SP_BANDS,
  type ExploratoryOptions,
} from "@/lib/racing/jump-exploratory-research";
import { ResearchSourceSelect } from "./research-source-select";

const box = "border border-slate-200 bg-white p-5 shadow-sm";
const input = "mt-1 block w-full rounded border border-slate-300 bg-white p-2 text-sm";
const number = (n: number | null) => n === null ? "Unavailable" : n.toFixed(2);
type Result = ReturnType<typeof evaluateJumpExploratory>;
type Comparison = ReturnType<typeof compare2025Outcomes>;

export async function JumpExploratoryWorkspace({ params }: { params: URLSearchParams }) {
  const options = parseExploratoryOptions(params);
  let candidate: Awaited<ReturnType<typeof readIsolatedJumpCandidate>>;
  try { candidate = await readIsolatedJumpCandidate(); }
  catch (error) {
    console.error("Controlled Jump source verification failed", error);
    return <div className="space-y-5"><EvidenceWarning /><ExploratoryForm options={options} /><section className={box} role="status">Controlled source unavailable: candidate evidence could not be verified. No fallback cache or results are used.</section></div>;
  }
  const analysis = candidate.analyze(options.feature === "outcomeSP" ? "officialRating" : options.feature);
  const result = evaluateJumpExploratory(analysis.races, options);
  let comparison: Comparison = null, comparisonMessage = "";
  if (options.compare2025) {
    if (!canCompareExploratory2025(options)) comparisonMessage = "2025 comparison unavailable: rating eligibility and independently verified starter filters do not have compatible 2025 evidence. Select outcome/SP analysis and clear starter filters.";
    else {
      try {
        // Legacy compatibility guards remain mandatory. This never reads the 2026 legacy cache.
        const cache = await loadLatestBacktestFeatureCacheForYear({ year: "2025", family: "jump" });
        if (cache) comparison = compare2025Outcomes(cache.rows, options);
        else comparisonMessage = "2025 comparison unavailable: no compatible Jump 2025 cache.";
      } catch (error) {
        console.error("Exploratory 2025 comparison unavailable", error);
        comparisonMessage = "2025 comparison unavailable: source or settlement evidence could not be read.";
      }
    }
  }
  return <JumpExploratoryResults result={result} sourceId={candidate.sourceId} buildDate={candidate.buildDate} comparison={comparison} comparisonMessage={comparisonMessage} />;
}
function EvidenceWarning() {
  return <section className="border border-slate-300 bg-slate-100 p-5" aria-label="Reconstructed evidence provenance"><h2 className="text-xl font-semibold">{JUMP_EXPLORATORY_LABEL}</h2><p className="mt-2 font-medium">{JUMP_EXPLORATORY_WARNING}</p></section>;
}
function ExploratoryForm({ options: o }: { options: ExploratoryOptions }) {
  return <form action="/racing/research" method="get" className={box}>
    <ResearchSourceSelect exploratory />
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      <label className="text-sm">Analysis / rating<select className={input} name="jumpFeature" defaultValue={o.feature}>{EXPLORATORY_FEATURE_OPTIONS.map(f => <option value={f.value} key={f.value}>{f.label}</option>)}</select></label>
      {(["from", "to"] as const).map(bound => <label key={bound} className="text-sm">{bound === "from" ? "From" : "To"}<input type="date" className={input} name={bound === "from" ? "jumpFrom" : "jumpTo"} defaultValue={o[bound]} min="2026-01-01" max="2026-10-14" required /></label>)}
      {([
        ["jumpMin", "Minimum feature value", o.min, false], ["jumpMax", "Maximum feature value", o.max, false],
        ["jumpRankMax", "Maximum verified whole-race rank", o.rankMax, true], ["jumpLeadMin", "Minimum verified lead over best other starter", o.leadMin, false],
        ["jumpStartersMin", "Minimum verified actual starters", o.startersMin, true], ["jumpStartersMax", "Maximum verified actual starters", o.startersMax, true],
      ] as const).map(([name, label, value, integer]) => <label key={name} className="text-sm">{label}<input name={name} type="number" step={integer ? "1" : "any"} min={integer ? 1 : undefined} className={input} defaultValue={value} /></label>)}
      <label className="text-sm">Retrospective final SP diagnostic band<select name="jumpSPBand" defaultValue={o.spBand} className={input}>{SP_BANDS.map(b => <option key={b} value={b}>{b === "all" ? "All valid SP" : b}</option>)}</select></label>
      <label className="text-sm">Original declared field size<input className={input} disabled value="Unavailable — pre-race provenance missing" readOnly /></label>
    </div>
    <p className="mt-4 text-sm">{exploratoryEligibilityText(o.feature)}</p>
    <p className="mt-2 text-sm">Missing values stay unavailable. Partial ranks are diagnostic only. Leads and rank criteria require every verified starter&apos;s eligible value. Starter filters use independently verified counts. Clear rating/rank criteria when switching to outcome/SP analysis.</p>
    <p className="mt-2 text-sm">Final SP supports retrospective returns and price-band diagnostics only. Captured bookmaker prices and pre-race price rules are unavailable.</p>
    <label className="mt-4 block text-sm"><input type="checkbox" name="jumpCompare2025" value="yes" defaultChecked={o.compare2025} /> Compare compatible 2025 Jump outcome/SP evidence over the same calendar window</label>
    <p className="mt-2 text-sm">Read-only exploratory analysis. Existing Advanced Filters and saved rules are not applied. Saving and freezing rules is disabled for this source, including rank-based rules from incomplete fields.</p>
    {o.errors.length ? <ul role="status" className="mt-3 text-sm text-red-800">{o.errors.map(error => <li key={error}>{error}</li>)}</ul> : null}
    <button type="submit" className="mt-4 bg-emerald-800 px-4 py-2 font-semibold text-white">Run exploratory analysis</button>
  </form>;
}
export function JumpExploratoryResults({ result: r, sourceId, buildDate, comparison, comparisonMessage }: { result: Result; sourceId: string; buildDate: string; comparison: Comparison; comparisonMessage: string }) {
  const c = r.coverage;
  return <div className="space-y-5">
    <EvidenceWarning />
    <section className={box}><p className="break-all text-sm">Source identifier: {sourceId}</p><p className="mt-1 text-sm">Build date: {buildDate}. Settlement: canonical_settlement_v3; uncapped £1 SP returns.</p><p className="mt-2 text-sm">Available candidate: 32,901 runners / 3,353 races · 1 January–14 October 2026. Source selection is optional and is never added to saved rules, frozen comparisons or default periods.</p></section>
    <ExploratoryForm options={r.options} />
    <section className={box}><h2 className="text-xl font-semibold">Usable population and exclusions</h2>
      <p className="mt-2 text-sm">Selected period: {c.runners.toLocaleString()} stored runners / {c.races.toLocaleString()} races. {c.settled.toLocaleString()} valid SP settlements; {c.settlementExcluded.toLocaleString()} NR, void, invalid-price or unverified outcomes excluded.</p>
      <p className="mt-2 text-sm">{c.usableBeforeCriteria.toLocaleString()} usable settled observations before criteria; {c.featureExcluded.toLocaleString()} excluded by requested-feature eligibility. {c.rankUnavailable.toLocaleString()} excluded for unavailable whole-race rank/lead; {c.starterUnavailable.toLocaleString()} for unverified starters; {c.criteriaExcluded.toLocaleString()} by remaining criteria.</p>
      {r.options.errors.length ? <p className="mt-2 text-sm" role="status">Invalid criteria: results withheld.</p> : null}
      <p className="mt-2 text-sm">Complete eligible comparison races: {c.completeComparisonFields ?? "Not applicable to outcome/SP"}. Partial diagnostic races: {c.partialComparisonFields ?? "Not applicable"}. Rank unavailable races: {c.unavailableComparisonFields ?? "Not applicable"}.</p>
      <p className="mt-2 text-sm">Validated market benchmarks before selection: {c.validMarketFields.toLocaleString()} complete starter fields / {c.validMarketObservations.toLocaleString()} observations. Selected observations missing a valid benchmark: {r.summary.missingMarket}. Market comparisons are unavailable for those observations.</p>
      <details className="mt-3 text-sm"><summary>Feature exclusion reasons (overlapping; settled population)</summary>{Object.keys(c.exclusionsByReason).length ? <ul className="mt-2">{Object.entries(c.exclusionsByReason).map(([reason, count]) => <li key={reason}>{reason.replaceAll("_", " ")}: {count.toLocaleString()}</li>)}</ul> : <p className="mt-2">No feature eligibility exclusions for this analysis.</p>}</details>
      <details className="mt-3 text-sm"><summary>Settlement exclusion reasons (overlapping; stored population)</summary><ul className="mt-2">{Object.entries(c.settlementExclusionsByReason).map(([reason, count]) => <li key={reason}>{reason.replaceAll("_", " ")}: {count.toLocaleString()}</li>)}</ul></details>
    </section>
    <section className={box}><h2 className="text-xl font-semibold">Exploratory historical returns</h2><p className="mt-2 text-sm">£1 flat stake at final SP. Genuine non-finisher losses and split-stake dead heats retained. Long-priced winner returns are uncapped. Historical returns are descriptive.</p><SummaryTable result={r} />
      <p className="mt-2 text-sm">A/E uses only selected runners from independently verified complete markets: {r.summary.benchmarkRunners} benchmark runners, with dead-heat winner shares on the same subset. No A/E is calculated for incomplete fields. Ratings are not calibrated win probabilities.</p>
    </section>
    {r.options.compare2025 ? <section className={box}><h2 className="text-xl font-semibold">2025 versus 2026 exploratory comparison</h2><p className="mt-2 text-sm">{JUMP_EXPLORATORY_WARNING} 2025 is development evidence. Source populations can differ; this is a side-by-side descriptive comparison, not a matched-runner experiment.</p>
      {comparison ? <><p className="mt-2 text-sm">Compatible definition: source-verified terminal Jump outcomes, canonical Settlement V3, valid final SP, identical retrospective SP band and calendar window. No rating, rank or field-size criteria. 2025 market comparisons are unavailable because equivalent independent field proof is absent.</p><div className="mt-3 overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{["Evidence", "Dates", "Stored runners / races", "Usable", "Settlement/source exclusions", "SP-band exclusions", "Selected / races", "Wins", "£1 P/L", "ROI"].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
        <tr>{["2025 development", `${comparison.from}–${comparison.to}`, `${comparison.runners} / ${comparison.races}`, comparison.usable, comparison.exclusions, comparison.criteriaExcluded, `${comparison.selected} / ${comparison.selectedRaces}`, comparison.wins, number(comparison.profit), number(comparison.roi)].map((v, i) => <td className="p-2" key={i}>{v}</td>)}</tr>
        <tr>{["2026 reconstructed exploratory", `${r.options.from}–${r.options.to}`, `${c.runners} / ${c.races}`, c.usableBeforeCriteria, c.settlementExcluded, c.criteriaExcluded, `${r.summary.runners} / ${r.summary.races}`, r.summary.wins, number(r.summary.profit), number(r.summary.roi)].map((v, i) => <td className="p-2" key={i}>{v}</td>)}</tr>
      </tbody></table></div><p className="mt-2 text-sm">2025 records with unverified/non-terminal race source evidence: {comparison.unverifiedSource}; excluded from usable outcomes.</p></> : <p className="mt-2 text-sm" role="status">{comparisonMessage}</p>}
    </section> : null}
    <section className={box}><h2 className="text-xl font-semibold">Selected observations</h2><p className="mt-2 text-sm">Showing first {Math.min(100, r.selected.length)} of {r.selected.length} observations. Whole-race ranks are unavailable for incomplete eligible comparison fields.</p><div className="mt-3 overflow-auto"><table className="w-full min-w-[1000px] text-left text-xs"><thead><tr>{["Date", "Course", "Horse", "Feature value", "Verified rank", "Partial diagnostic rank", "Verified lead", "Final SP (retrospective)", "£1 gross return", "Normalized SP benchmark"].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{r.selected.slice(0, 100).map(o => <tr key={o.runnerId} className="border-t border-slate-100">{[o.date, o.course, o.horse, r.options.feature === "outcomeSP" ? "Not required" : number(o.value), r.options.feature === "outcomeSP" ? "Not applicable" : o.rank.wholeFieldRank ?? "Unavailable", r.options.feature === "outcomeSP" ? "Not applicable" : o.rank.diagnosticRank === null ? "—" : `${o.rank.diagnosticRank} · diagnostic only`, r.options.feature === "outcomeSP" ? "Not applicable" : number(o.lead), number(o.historicalSP), number(o.settlement?.grossReturn ?? null), o.normalizedSPProbability === null ? "Unavailable — incomplete field" : `${(o.normalizedSPProbability * 100).toFixed(2)}%`].map((v, i) => <td className="p-2" key={i}>{v}</td>)}</tr>)}</tbody></table></div></section>
  </div>;
}
function SummaryTable({ result: { summary: s } }: { result: Result }) {
  return <div className="mt-3 overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{["Runners", "Races", "Settled", "Wins", "£1 P/L", "SP ROI", "Expected wins (valid markets)", "A/E (valid markets)", "Missing benchmark"].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody><tr>{[s.runners, s.races, s.settled, s.wins, s.settled ? `£${number(s.profit)}` : "Unavailable", s.roi === null ? "Unavailable" : `${number(s.roi)}%`, number(s.expected), number(s.ae), s.missingMarket].map((v, i) => <td className="p-2" key={i}>{v}</td>)}</tr></tbody></table></div>;
}

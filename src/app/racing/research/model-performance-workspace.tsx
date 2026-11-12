import { coverage, evidenceLabel, inPeriod, matchedPopulation, modelBreakdowns, RESEARCH_MODELS, selectObservations, summarizeModel, type HistoricalPeriod, type ModelSummary, type ResearchModelId } from "@/lib/racing/research-model-comparison";
import { loadResearchModelSources } from "@/lib/racing/research-model-sources";
import { evaluateResearchRule, FAMILY_OPTIONS, serializeResearchRule, type ResearchRuleV1 } from "@/lib/racing/research-rule";
import { observationKey } from "@/lib/racing/research-model-comparison";
import { isVoidBetResultStatus, settleSelection } from "@/lib/racing/backtest";
import { winnerContributionDiagnostics } from "@/lib/racing/research-price-sensitivity";
import { CANONICAL_SETTLEMENT_VERSION } from "@/lib/racing/research-settlement-version";
import { SettlementVersionBadge } from "./settlement-version-display";
import { isJumpExploratorySource } from "@/lib/racing/jump-exploratory-research";
import { JumpExploratoryWorkspace } from "./jump-exploratory-workspace";
import { ResearchSourceSelect } from "./research-source-select";

const box = "border border-slate-200 bg-white p-5 shadow-sm";
const input = "mt-1 block w-full rounded border border-slate-300 bg-white p-2 text-sm";
const number = (n: number | null, suffix = "") => n === null ? "—" : `${n.toFixed(2)}${suffix}`;
function modelId(value: string | null, fallback: ResearchModelId): ResearchModelId { return RESEARCH_MODELS.find(m => m.id === value)?.id ?? fallback; }
function date(value: string | null, fallback: string) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) ? value : fallback; }
function optionalNumber(value: string | null, min: number) { if (!value?.trim()) return undefined; const n = Number(value); return Number.isFinite(n) && n >= min ? n : undefined; }
export async function ModelPerformanceWorkspace({ params, rule }: { params: URLSearchParams; rule: ResearchRuleV1 }) {
  if (isJumpExploratorySource(params)) return <JumpExploratoryWorkspace params={params} />;
  const family = FAMILY_OPTIONS.find(f => f.value === params.get("cmpFamily"))?.value ?? rule.family;
  const sources = await loadResearchModelSources(family);
  const primary = modelId(params.get("cmpModel"), "latestSpeedRating");
  const comparator = modelId(params.get("cmpCompare"), "latestTodaysRating");
  const chosen = [...new Set([primary, comparator])].map(id => sources.models.find(m => m.id === id)!);
  const populationMode = params.get("cmpPopulation") === "native" ? "native" : "matched";
  const shared = matchedPopulation(chosen.map(m => m.observations));
  const periods: HistoricalPeriod[] = [
    { from: date(params.get("cmpFromA"), "2025-01-01"), to: date(params.get("cmpToA"), "2025-12-31") },
    { from: date(params.get("cmpFromB"), "2026-01-01"), to: date(params.get("cmpToB"), "2026-12-31") },
  ];
  const invalidPeriods = periods.some(p => p.from > p.to);
  const overlaps = periods[0].from <= periods[1].to && periods[1].from <= periods[0].to;
  const rankMax = optionalNumber(params.get("cmpRankMax"), 1) ?? 1;
  const edgeMin = optionalNumber(params.get("cmpEdgeMin"), -100);
  const applyAdvanced = params.get("cmpAdvanced") === "yes";
  const advancedUnavailable = applyAdvanced && (rule.family !== family || Boolean(rule.runner.trainerCohort));
  // Re-evaluate a clone across the requested periods; never modify or persist the original rule.
  const advancedKeys = applyAdvanced ? new Set(advancedUnavailable ? [] : evaluateResearchRule({ rows: sources.rows, rule: { ...rule, dateRange: { from: "2025-01-01", to: "2026-12-31" } } }).selectedRunners.map(r => observationKey(r.features.targetRaceId, r.id))) : undefined;
  const results = chosen.map(model => ({ model, periods: periods.map(period => {
    const options = { period, population: populationMode === "matched" ? shared : undefined, rankMax, edgeMin, advancedKeys };
    const selected = invalidPeriods ? [] : selectObservations(model.observations, options);
    const sourceRunners = model.id === "turf-v3" ? null : sources.rows.filter(r => r.features.raceDate >= period.from && r.features.raceDate <= period.to && !isVoidBetResultStatus(r.outcome.resultStatus)).length;
    const nativeRunners = model.observations.filter(r => inPeriod(r, period)).length;
    const eligible = model.observations.filter(r => inPeriod(r, period) && (populationMode !== "matched" || shared.has(r.key)));
    return { period, selected, eligible, missingModel: sourceRunners === null ? null : sourceRunners - nativeRunners, summary: summarizeModel(selected), sensitivity: [Math.max(1, rankMax - 1), rankMax + 1].map(rank => ({ label: `Rank ≤ ${rank}`, ...summarizeModel(invalidPeriods ? [] : selectObservations(model.observations, { ...options, rankMax: rank })) })), outliers: winnerContributionDiagnostics(selected.map(r => ({ outcome: r.outcome, settlement: settleSelection(r.outcome) }))) };
  }) }));
  return <div className="space-y-5">
    <form action="/racing/research" className="space-y-5">
      <input type="hidden" name="rule" value={serializeResearchRule(rule)} />
      <section className={box}>
        <h2 className="text-xl font-semibold">A. Evidence and model selection</h2>
        <ResearchSourceSelect />
        <p className="mt-2 text-sm"><SettlementVersionBadge version={CANONICAL_SETTLEMENT_VERSION} />. New calculations use void exclusions, started non-finisher losses and split-stake dead heats. Original saved figures remain unchanged.</p>
        <p className="mt-2 text-sm text-slate-600">Investigate existing models and reject weak hypotheses. Historical ROI is descriptive. Versions below identify existing stored sources; no predictions are reconstructed.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">{[["cmpModel", "Primary model / version", primary], ["cmpCompare", "Comparison model / version", comparator]].map(([name, label, value]) => <label key={name} className="text-sm font-medium">{label}<select name={name} defaultValue={value} className={input}>{sources.models.map(m => <option key={m.id} value={m.id}>{m.name} · {m.version}</option>)}</select></label>)}</div>
        <div className="mt-4 space-y-3 text-sm">{chosen.map(m => {
          const native = coverage(m.observations); const matched = coverage(m.observations.filter(r => shared.has(r.key)));
          return <div key={m.id} className="border-l-2 border-emerald-600 pl-3"><strong>{m.name} · {m.version}</strong><p>Available dates: {native.from ?? "none"} to {native.to ?? "none"}. Native coverage: {native.runners} runners / {native.races} races. Matched comparison coverage: {matched.runners} runners / {matched.races} races.</p>
            <p>{m.id === "turf-v3" ? `Stored Turf V3 only; ordinary flat turf. Training/provenance: ${sources.training}. Ledger contains ${sources.tissueRawCoverage.runners} runner predictions / ${sources.tissueRawCoverage.races} races; ${sources.excludedTissueRaces} races excluded by provenance validation. No 2025 V3 predictions are reconstructed.` : "Cached historical pre-race metrics. Cache creation is retrospective; source/calculation versions do not establish prospective availability. These ratings are not calibrated win probabilities."}</p></div>;
        })}</div>
        {sources.tissueError ? <p className="mt-2 text-sm text-amber-800">{sources.tissueError}</p> : null}
        <p className="mt-3 text-sm">Market price basis: historical result SP for £1 settlement; normalized full-field SP for market expectations. These are retrospective prices. The overlapping Value ledger is not counted as independent evidence. Genuinely captured pre-race bookmaker quotes are a separate source and are not included in this Phase 1 workspace. Missing prices stay missing.</p>
        <p className="mt-3 text-sm text-amber-800">{[2025, 2026].filter(year => !sources.versions.some(v => v.year === year)).map(year => `No compatible ${year} rating cache for this family. `)}</p>
        <details className="mt-3 text-xs"><summary>Cache provenance and actual date coverage</summary><pre className="mt-2 overflow-auto">{JSON.stringify(sources.versions, null, 2)}</pre></details>
      </section>
      <section className={box}>
        <h2 className="text-xl font-semibold">B. Population and historical periods</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm">Race family<select name="cmpFamily" defaultValue={family} className={input}>{FAMILY_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select></label><label className="text-sm">Comparison population<select name="cmpPopulation" defaultValue={populationMode} className={input}><option value="matched">Matched runners · identical eligible population</option><option value="native">Native coverage · populations may differ</option></select></label></div>
        <div className="mt-4 grid gap-4 md:grid-cols-4">{periods.flatMap((p, i) => (["from", "to"] as const).map(bound => <label className="text-sm" key={`${i}${bound}`}>Period {i ? "B" : "A"} {bound}<input type="date" className={input} name={`cmp${bound === "from" ? "From" : "To"}${i ? "B" : "A"}`} defaultValue={p[bound]} min="2025-01-01" max="2026-12-31" required /></label>))}</div>
        <p className="mt-3 text-sm">2025 is development evidence. All 2026 records shown here are exploratory / previously used evidence. Original holdout snapshots retain their historical labels under Advanced Filters.</p>
        {invalidPeriods || overlaps ? <p role="status" className="mt-2 text-sm text-amber-800">{invalidPeriods ? "Invalid period: from must precede to. No results shown." : "Periods overlap; they are not independent evidence."}</p> : null}
        {!shared.size && populationMode === "matched" ? <p className="mt-2 text-sm text-amber-800">No matched population for these models and race family. Empty comparisons are intentional; select flat turf when comparing Turf V3.</p> : null}
      </section>
      <section className={box}>
        <h2 className="text-xl font-semibold">C. Selection criteria</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm">Maximum model rank<input className={input} type="number" name="cmpRankMax" min="1" step="1" defaultValue={rankMax} /></label><label className="text-sm">Minimum edge versus normalized SP (percentage points)<input className={input} type="number" name="cmpEdgeMin" min="-100" max="100" step="any" defaultValue={edgeMin} /></label></div>
        <p className="mt-2 text-sm text-slate-600">Ranks and market probabilities use the full available race before population or selection filters. Edge is supported only by stored tissue probabilities and is a retrospective SP comparison; rating models have no predicted edge and are excluded when an edge threshold is set. Tied ranks include every tied runner.</p>
        <label className="mt-3 block text-sm"><input type="checkbox" name="cmpAdvanced" value="yes" defaultChecked={applyAdvanced} /> Apply the current Advanced Filters rule (population and selection conditions; historical period controls above replace its dates)</label>
        <p className="mt-1 text-xs text-slate-600">Rule family: {rule.family}. Configure existing filters below, run that rule, then enable this option. Records without matching cached features are excluded. Trainer cohort rules require their existing year-specific workflow and are unavailable here.</p>
        {advancedUnavailable ? <p role="status" className="text-sm text-amber-800">Advanced rule is incompatible with this comparison: family mismatch or trainer cohort condition. No selections shown.</p> : null}
        <button className="mt-4 bg-emerald-800 px-4 py-2 font-semibold text-white" type="submit">Compare historical performance</button>
      </section>
    </form>
    <section className={box}><h2 className="mb-3 text-xl font-semibold">D. Performance summary</h2>
      <p className="mb-3 text-sm">{populationMode === "matched" ? "Models share eligible runners before their rank/edge selections; selected runners can differ." : "Native populations differ; use matched mode for model comparisons."} A/E uses only settled selections with valid complete-field normalized SP. Its actual winners use the same subset (dead-heat shares); missing observations are excluded from both sides.</p>
      <PerformanceTable rows={results.flatMap(({ model, periods }) => periods.map((p, i) => ({ label: `${model.name} · ${i ? "B" : "A"} (${p.period.from} to ${p.period.to})`, ...p.summary })))} />
      <div className="mt-3 space-y-1 text-xs">{results.flatMap(({ model, periods }) => periods.map((p, i) => <p key={`${model.id}${i}`}>{model.name} / {i ? "B" : "A"}: {p.eligible.length} eligible observations before selection; {p.eligible.length - p.selected.length} excluded by criteria. {model.observations.filter(r => inPeriod(r, p.period)).length - p.eligible.length} native observations excluded by matched population. {p.missingModel === null ? "Stored tissue provenance exclusions are reported above; uncaptured predictions are not inferred." : `${p.missingModel} cached active runners excluded for missing/invalid model values.`}</p>))}</div>
    </section>
    <section className={box}><h2 className="text-xl font-semibold">E. Automatic performance breakdowns</h2>
      {results.map(({ model, periods }) => <details key={model.id} className="mt-4" open={model.id === primary}><summary className="cursor-pointer font-semibold">{model.name}</summary>{periods.map((p, i) => <div key={i} className="mt-4"><h3 className="font-semibold">Period {i ? "B" : "A"} · {evidenceLabel(p.period.from)}</h3>{modelBreakdowns(p.selected, model.id === "turf-v3").map(b => <details key={b.name} className="mt-3" open={b.name === "Historical period"}><summary className="cursor-pointer text-sm font-medium">{b.name}</summary><PerformanceTable rows={b.rows} /></details>)}</div>)}</details>)}
    </section>
    <section className={box}><h2 className="text-xl font-semibold">F. Robustness and advanced filters</h2>
      <p className="mt-2 text-sm">Small samples and concentrated wins can reject a hypothesis; they do not establish an advantage. Nearby rank thresholds below keep the same eligible population, dates, edge and advanced criteria. Existing rule stability, time-slice and price sensitivity diagnostics remain available in Advanced Filters.</p>
      {results.map(({ model, periods }) => <div className="mt-4" key={model.id}><h3 className="font-semibold">{model.name}</h3>{periods.map((p, i) => <div key={i} className="mt-2"><p className="text-sm">Period {i ? "B" : "A"}: {p.summary.settled < 30 ? "Insufficient sample (<30 settled)." : `${p.summary.settled} settled; exploratory evidence.`} Largest winner profit: £{number(p.outliers.largestWinnerProfit)}; top three winners&apos; share of winning profit: {number(p.outliers.top3WinnerProfitShare, "%")}.</p><PerformanceTable rows={p.sensitivity} /></div>)}</div>)}
    </section>
  </div>;
}

export function PerformanceTable({ rows }: { rows: (ModelSummary & { label: string })[] }) {
  return <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[1300px] text-left text-xs"><thead className="border-y border-slate-200"><tr>{["Sample", "Qualifying runners", "Races", "Settled", "Wins", "Strike", "£1 P/L", "Actual SP ROI", "Expected wins", "A/E", "Benchmark runners", "Missing settlement", "Missing benchmark"].map(h => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.label} className="border-b border-slate-100">{[r.label, r.runners, r.races, r.settled, r.wins, number(r.strikeRate, "%"), r.settled ? `£${number(r.profit)}` : "—", number(r.roi, "%"), number(r.expected), number(r.ae), r.benchmarkRunners, r.missingSettlement, r.missingMarket].map((v, i) => <td className="py-2 pr-3" key={i}>{v}</td>)}</tr>)}</tbody></table>{!rows.length ? <p className="py-3 text-sm text-slate-500">No qualifying observations.</p> : null}</div>;
}

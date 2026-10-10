import Link from "next/link";
import type { ReactNode } from "react";
import { SavedRuleResearchNote } from "../saved-rule-research-note";
import { RESEARCH_SIGNALS, RESEARCH_STATUS, type DailyResearchHorse, type ProspectiveMonitor, type ResearchDashboard, type ResearchSignal } from "@/lib/racing/research-monitor";

export function DailyResearchDashboard({ dashboard, children }: { dashboard: ResearchDashboard; children?: ReactNode }) {
  const tissueRows = tissueValueRows(dashboard.horses);
  const pendingTissueRows = tissueRows.filter(({ signal }) => signal.result !== "settled" && signal.result !== "void");
  const settledTissueRows = tissueRows.filter(({ signal }) => signal.result === "settled" || signal.result === "void");
  const settledTissueSummary = summarizeSettledTissueRows(settledTissueRows);
  const shadowRows = dashboard.horses.filter((horse) =>
    !horse.signals.some((signal) => RESEARCH_SIGNALS[signal.kind].category === "VALUE") &&
    horse.signals.some((signal) => RESEARCH_SIGNALS[signal.kind].category !== "VALUE")
  );
  return <>
    <section className="mt-7" aria-labelledby="tissue-value-heading">
      <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 pb-3">
        <h2 className="text-xl font-semibold" id="tissue-value-heading">Today&apos;s Tissue VALUE</h2>
        <span className="text-sm tabular-nums text-slate-500">{tissueRows.length} selections</span>
      </div>
      <TissueMonitorSummary monitors={dashboard.monitors} rows={tissueRows} />
      {dashboard.emptyMessage && tissueRows.length === 0 ? <p className="py-10 text-sm text-slate-600">{dashboard.emptyMessage}</p> : <>
      <div className="mt-5 overflow-x-auto border border-slate-200 bg-white">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-600">
            <tr>
              {["Time", "Course", "Horse", "Family", "Tissue probability", "Market probability", "Qualifying price", "Latest price", "Result"].map((heading) => (
                <th className="px-3 py-3 font-semibold" key={heading}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {pendingTissueRows.map(({ horse, signal }) => (
              <tr key={`${horse.raceId}|${horse.runnerId}|${signal.kind}`}>
                <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums">{horse.time}</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-700">{horse.course}</td>
                <td className="px-3 py-3">
                  <Link href={`/horses/${horse.horseId}`} className="font-semibold text-slate-950 hover:text-emerald-800 hover:underline">{horse.horseName}</Link>
                  {signal.movement ? <p className="mt-1 text-xs text-slate-500">{signal.movement}</p> : null}
                  <SecondarySignals horse={horse} />
                </td>
                <td className="whitespace-nowrap px-3 py-3"><span className="bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">{familyLabel(signal.kind)}</span></td>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums">{pct(signal.tissueProbability ?? null)}</td>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums">{pct(signal.marketProbability ?? null)}</td>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums">{decimal(signal.qualifyingPrice ?? null)}</td>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums">{decimal(signal.latestPrice ?? horse.price)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">{resultLabel(signal.result ?? null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {pendingTissueRows.length === 0 ? <p className="px-3 py-6 text-sm text-slate-600">{tissueRows.length === 0 ? "No Tissue VALUE selections today." : "No pending Tissue VALUE selections today."}</p> : null}
      </div>
      <section className="mt-6" aria-labelledby="settled-tissue-value-heading">
        <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 pb-2">
          <h3 id="settled-tissue-value-heading" className="text-sm font-semibold uppercase text-slate-700">Settled Tissue VALUE Today</h3>
          <span className="text-xs tabular-nums text-slate-500">{formatSettledTissueSummary(settledTissueSummary)}</span>
        </div>
        <div className="mt-3 overflow-x-auto border border-slate-200 bg-white">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-600">
              <tr>
                {["Time", "Course", "Horse", "Family", "Qualifying price", "Finishing position / result", "Outcome", "£1 P/L"].map((heading) => (
                  <th className="px-3 py-3 font-semibold" key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {settledTissueRows.map(({ horse, signal }) => (
                <tr key={`${horse.raceId}|${horse.runnerId}|${signal.kind}|settled`}>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums">{horse.time}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">{horse.course}</td>
                  <td className="px-3 py-3">
                    <Link href={`/horses/${horse.horseId}`} className="font-semibold text-slate-950 hover:text-emerald-800 hover:underline">{horse.horseName}</Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3"><span className="bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">{familyLabel(signal.kind)}</span></td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums">{decimal(signal.qualifyingPrice ?? null)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">{settledResultLabel(signal)}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold">{signal.outcome ?? "VOID"}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums">{money(signal.profitLoss ?? (signal.outcome === "VOID" ? 0 : null))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {settledTissueRows.length === 0 ? <p className="px-3 py-6 text-sm text-slate-600">No settled Tissue VALUE selections today.</p> : null}
        </div>
      </section>
      </>}
    </section>
    {children}
    <details className="mt-6 border-t border-slate-200 py-4">
      <summary className="cursor-pointer text-sm font-semibold">Research shadows and disagreement signals</summary>
      {shadowRows.length === 0 ? <p className="py-5 text-sm text-slate-600">No secondary research signals today.</p> : <div>
        <div className="hidden grid-cols-[5rem_minmax(12rem,1fr)_minmax(15rem,1.4fr)_9rem] gap-4 border-b border-slate-200 py-2 text-xs font-medium text-slate-500 xl:grid" aria-hidden="true">
          <span>Time</span><span>Course / horse</span><span>Signal / why shown</span><span>Bookmaker median</span>
        </div>
        <ul className="divide-y divide-slate-200">
          {shadowRows.map((horse) => <li className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 py-5 xl:grid-cols-[5rem_minmax(12rem,1fr)_minmax(15rem,1.4fr)_9rem] xl:gap-x-4" key={`${horse.raceId}|${horse.runnerId}`}>
            <time className="text-sm font-semibold tabular-nums">{horse.time}</time>
            <div className="min-w-0">
              <Link href={`/horses/${horse.horseId}`} className="break-words text-base font-semibold text-slate-950 hover:text-emerald-800 hover:underline">{horse.horseName}</Link>
              <p className="mt-1 text-sm text-slate-500">{horse.course}</p>
            </div>
            <div className="col-start-2 min-w-0 space-y-3 xl:col-start-auto">
              {horse.signals.map((signal) => <div key={signal.kind}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className={`rounded-sm px-1.5 py-0.5 font-semibold ${RESEARCH_SIGNALS[signal.kind].category === "VALUE" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{RESEARCH_SIGNALS[signal.kind].category}</span>
                  <span className="font-medium text-slate-700">{RESEARCH_SIGNALS[signal.kind].name}</span>
                </div>
                <p className="mt-1.5 break-words text-sm leading-relaxed text-slate-800">{signal.reason}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{signal.context}{signal.movement ? ` · ${signal.movement}` : ""}</p>
              </div>)}
            </div>
            <div className="col-start-2 text-sm xl:col-start-auto">
              <span className="mr-2 text-xs text-slate-500 xl:hidden">Bookmaker median</span>
              <span className={horse.price === null ? "text-slate-500" : "font-semibold tabular-nums"}>{horse.price === null ? "Market unavailable" : horse.price.toFixed(2)}</span>
              {horse.priceSource ? <p className="mt-1 text-xs text-slate-500">{priceSourceLabel(horse.priceSource)}</p> : null}
            </div>
          </li>)}
        </ul>
      </div>}
    </details>
    <section className="mt-6 border-t border-slate-200 pt-6" aria-labelledby="monitors-heading">
      <h2 className="text-lg font-semibold" id="monitors-heading">Prospective monitors</h2>
      <HistoricalTissueEvidence monitors={dashboard.historicalTissueMonitors ?? []} />
      <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-5">
        {dashboard.monitors.map((monitor) => <article className="min-w-0 rounded border border-slate-200 bg-white p-4" key={monitor.name}>
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{monitor.name}</h3><span className="text-[10px] font-semibold text-slate-500">{monitor.status}</span></div>
          <p className="mt-2 text-xs text-slate-500">{monitor.cohort}</p>
          <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(7rem,max-content)] gap-x-3 gap-y-2 text-xs">
            <dt className="text-slate-500">Tracked / settled</dt><dd className="text-right font-medium tabular-nums">{monitor.tracked} / {monitor.settled}</dd>
            <dt className="text-slate-500">Winners / strike</dt><dd className="text-right font-medium tabular-nums">{monitor.winners} / {pct(monitor.strike)}</dd>
            <dt className="text-slate-500">{aeLabel(monitor)}</dt><dd className="text-right font-medium tabular-nums">{aeValue(monitor)}</dd>
            <dt className="text-slate-500">{roiLabel(monitor)}</dt><dd className="text-right font-medium tabular-nums">{roiValue(monitor)}</dd>
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{evidenceText(monitor)}</p>
        </article>)}
      </div>
    </section>
  </>;
}

function SecondarySignals({ horse }: { horse: DailyResearchHorse }) {
  const signals = horse.signals.filter((signal) => RESEARCH_SIGNALS[signal.kind].category !== "VALUE");
  if (signals.length === 0) return null;
  return (
    <details className="mt-2 text-xs text-slate-600">
      <summary className="cursor-pointer font-medium">Also tracked by {signals.map((signal) => RESEARCH_SIGNALS[signal.kind].name).join(", ")}</summary>
      <div className="mt-1 space-y-1">
        {signals.map((signal) => (
          <p key={signal.kind}>{signal.reason}</p>
        ))}
      </div>
    </details>
  );
}

function TissueMonitorSummary({ monitors, rows }: { monitors: ProspectiveMonitor[]; rows: ReturnType<typeof tissueValueRows> }) {
  const tissue = monitors.filter((monitor) => ["Turf Tissue", "Jump Tissue", "AW Tissue"].includes(monitor.name));
  const displayTotals = summarizeSettledTissueRows(rows);
  const familyTotals = summarizeTodayFamilies(rows);
  const todaySettled = rows.filter((row) => row.signal.result === "settled" || row.signal.result === "void").length;
  const summaryRows = [...tissue.map((monitor) => ({ ...monitor, profit: monitor.profitLoss ?? (monitor.tracked === 0 ? 0 : monitor.roi === null ? null : monitor.roi * monitor.pricedSettled) })),
    { name: "Today", tracked: rows.length, settled: todaySettled, winners: displayTotals.winners, roi: null, profit: displayTotals.profitLoss, unavailableReturns: displayTotals.unavailableReturns }];
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs text-slate-500">Clean priced prospective record from 11 Oct 2026</p>
      <dl className="grid border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4">
      {summaryRows.map((monitor) => (
        <div className="border-b border-slate-200 px-4 py-3 last:border-b-0 sm:border-r lg:border-b-0" key={monitor.name}>
          <dt className="text-xs font-semibold uppercase text-slate-500">{monitor.name === "Today" ? "Today" : `${monitor.name.replace(" Tissue", "")} VALUE`}</dt>
          <dd className="mt-2 text-sm tabular-nums text-slate-900">
            {monitor.tracked} selections / {monitor.settled} settled / {monitor.winners} winners
          </dd>
          <dd className="mt-1 text-xs tabular-nums text-slate-500">P/L {monitor.profit === null ? "—" : money(monitor.profit)}</dd>
          {monitor.name === "Today" ? (
            <dd className="mt-1 text-xs tabular-nums text-slate-500">{familyTotals.map(formatTodayFamilyTotal).join(" · ")}</dd>
          ) : (
            <dd className="mt-1 text-xs tabular-nums text-slate-500">ROI {monitor.roi === null ? "—" : signedPct(monitor.roi)}</dd>
          )}
          {(monitor.unavailableReturns ?? 0) > 0 ? <dd className="mt-1 text-xs text-slate-500">{monitor.unavailableReturns} {monitor.unavailableReturns === 1 ? "return" : "returns"} unavailable</dd> : null}
        </div>
      ))}
      </dl>
    </div>
  );
}

function tissueValueRows(horses: DailyResearchHorse[]): Array<{ horse: DailyResearchHorse; signal: ResearchSignal }> {
  return horses.flatMap((horse) => {
    const signal = horse.signals.find((entry) => RESEARCH_SIGNALS[entry.kind].category === "VALUE");
    return signal ? [{ horse, signal }] : [];
  });
}

type TissueValueRow = ReturnType<typeof tissueValueRows>[number];

export function summarizeSettledTissueRows(rows: TissueValueRow[]) {
  return rows.reduce((summary, row) => {
    if (row.signal.result !== "settled" && row.signal.result !== "void") return summary;
    if (row.signal.outcome === "VOID" || row.signal.result === "void") return summary;
    const profitLoss = row.signal.profitLoss;
    return {
      bets: summary.bets + 1,
      winners: summary.winners + (row.signal.outcome === "WIN" ? 1 : 0),
      profitLoss: Number.isFinite(profitLoss) ? summary.profitLoss + profitLoss! : summary.profitLoss,
      pricedBets: Number.isFinite(profitLoss) ? summary.pricedBets + 1 : summary.pricedBets,
      unavailableReturns: Number.isFinite(profitLoss) ? summary.unavailableReturns : summary.unavailableReturns + 1,
    };
  }, { bets: 0, winners: 0, profitLoss: 0, pricedBets: 0, unavailableReturns: 0 });
}

function summarizeTodayFamilies(rows: TissueValueRow[]) {
  return (["turf_tissue", "jump_tissue", "aw_tissue"] as const).map((kind) => {
    const summary = summarizeSettledTissueRows(rows.filter((row) => row.signal.kind === kind));
    return { kind, ...summary };
  });
}

function formatTodayFamilyTotal(summary: ReturnType<typeof summarizeTodayFamilies>[number]) {
  const unavailable = summary.unavailableReturns > 0 ? ` · ${summary.unavailableReturns} ${summary.unavailableReturns === 1 ? "return" : "returns"} unavailable` : "";
  return `${familyLabel(summary.kind)} P/L ${money(summary.profitLoss)}${unavailable}`;
}

function HistoricalTissueEvidence({ monitors }: { monitors: ProspectiveMonitor[] }) {
  if (monitors.length === 0) return null;
  return (
    <section className="mt-4" aria-labelledby="historical-tissue-evidence-heading">
      <h3 id="historical-tissue-evidence-heading" className="text-sm font-semibold">Historical Tissue evidence</h3>
      <p className="mt-1 text-xs text-slate-500">Pre clean-price epoch</p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {monitors.map((monitor) => (
          <article className="border border-slate-200 bg-white p-3" key={monitor.name}>
            <h4 className="text-xs font-semibold uppercase text-slate-500">{monitor.name}</h4>
            <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_max-content] gap-x-3 gap-y-1 text-xs">
              <dt className="text-slate-500">Tracked / settled</dt><dd className="tabular-nums">{monitor.tracked} / {monitor.settled}</dd>
              <dt className="text-slate-500">Winners / strike</dt><dd className="tabular-nums">{monitor.winners} / {pct(monitor.strike)}</dd>
              <dt className="text-slate-500">A/E</dt><dd className="tabular-nums">{aeValue(monitor)}</dd>
            </dl>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Historical ROI is not manufactured when qualifying-price returns are unavailable.</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatSettledTissueSummary(summary: ReturnType<typeof summarizeSettledTissueRows>) {
  const parts = [
    `${summary.bets} ${summary.bets === 1 ? "bet" : "bets"}`,
    `${summary.winners} ${summary.winners === 1 ? "winner" : "winners"}`,
    `£1 P/L ${money(summary.profitLoss)}`,
  ];
  if (summary.pricedBets > 0) parts.push(`ROI ${signedPct(summary.profitLoss / summary.pricedBets)}`);
  if (summary.unavailableReturns > 0) parts.push(`${summary.unavailableReturns} ${summary.unavailableReturns === 1 ? "return" : "returns"} unavailable`);
  return parts.join(" · ");
}

export function ResearchHistory() {
  return (
    <section className="mt-8 border-t border-slate-200 pt-5" aria-labelledby="research-status-heading">
      <h2 className="text-sm font-semibold" id="research-status-heading">Research status</h2>
      <dl className="mt-3 grid gap-x-8 gap-y-2 text-xs md:grid-cols-2">
        {RESEARCH_STATUS.map(([name, status]) => <div className="flex flex-wrap justify-between gap-x-4 gap-y-1" key={name}><dt className="text-slate-700">{name}</dt><dd className="text-slate-500">{status}</dd></div>)}
      </dl>
      <div className="mt-4">
        <Link href="/racing/research#saved-rules" className="text-sm text-slate-600 hover:text-emerald-800 hover:underline">
          Saved rule research
        </Link>
        <SavedRuleResearchNote />
      </div>
    </section>
  );
}
function pct(value: number | null) { return value === null ? "—" : `${(value * 100).toFixed(1)}%`; }
function signedPct(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value * 100).toFixed(1)}%`;
}
function decimal(value: number | null) { return value === null ? "—" : value.toFixed(2); }
function familyLabel(kind: ResearchSignal["kind"]) {
  if (kind === "turf_tissue") return "Turf";
  if (kind === "jump_tissue") return "Jump";
  if (kind === "aw_tissue") return "AW";
  return RESEARCH_SIGNALS[kind].name;
}
function resultLabel(value: ResearchSignal["result"]) {
  if (value === "settled") return "Settled";
  if (value === "void") return "Void";
  return "Pending";
}
function settledResultLabel(signal: ResearchSignal) {
  if (signal.result === "void" || signal.outcome === "VOID") return "Void";
  if (signal.finishingPosition !== null && signal.finishingPosition !== undefined) return `Finished ${signal.finishingPosition}`;
  return signal.resultStatus ?? "Settled";
}
function money(value: number | null) {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}£${Math.abs(value).toFixed(2)}`;
}
function aeLabel(monitor: ProspectiveMonitor) { return monitor.roiBasis === "median" ? "Actual / model expected" : "Market A/E"; }
function aeValue(monitor: ProspectiveMonitor) {
  if (monitor.settled === 0) return "Awaiting results";
  return monitor.ae === null ? "Unavailable" : monitor.ae.toFixed(2);
}
function roiLabel(monitor: ProspectiveMonitor) {
  return monitor.roiBasis === "final_sp" ? "Final SP ROI" : monitor.roiBasis === "qualifying_median" ? "Qualifying median ROI" : "Stored median ROI";
}
function roiValue(monitor: ProspectiveMonitor) {
  if (monitor.roi !== null) return pct(monitor.roi);
  if (monitor.settled === 0) return "Awaiting returns";
  return monitor.roiBasis !== "final_sp" ? "Insufficient stored-price evidence" : "Unavailable";
}
function priceSourceLabel(source: "imported_card" | "stored_snapshot" | "g4_capture" | "weight_capture") {
  if (source === "imported_card") return "Latest imported card";
  if (source === "stored_snapshot") return "Stored qualification price";
  if (source === "weight_capture") return "Weight shadow capture";
  return "G4 capture";
}
function evidenceText(monitor: ProspectiveMonitor) {
  const sample = monitor.settled < 30 ? "Early sample" : "Prospective evidence";
  if (monitor.roiBasis === "final_sp") return `${sample} · ${monitor.pricedSettled} of ${monitor.settled} settled have final SP returns.`;
  if (monitor.roiBasis === "qualifying_median") return `${sample} · ${monitor.pricedSettled} of ${monitor.settled} settled have qualifying median returns.`;
  return `${sample} · ${monitor.pricedSettled} of ${monitor.settled} settled have stored median returns; ROI needs stored prospective market prices.`;
}

import Link from "next/link";
import { SavedRuleResearchNote } from "../saved-rule-research-note";
import { RESEARCH_SIGNALS, RESEARCH_STATUS, type ProspectiveMonitor, type ResearchDashboard } from "@/lib/racing/research-monitor";

export function DailyResearchDashboard({ dashboard }: { dashboard: ResearchDashboard }) {
  return <>
    <section className="mt-7" aria-labelledby="daily-signals-heading">
      <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 pb-3">
        <h2 className="text-xl font-semibold" id="daily-signals-heading">Today&apos;s research signals</h2>
        <span className="text-sm tabular-nums text-slate-500">{dashboard.horses.length} horses</span>
      </div>
      {dashboard.emptyMessage ? <p className="py-10 text-sm text-slate-600">{dashboard.emptyMessage}</p> : <div>
        <div className="hidden grid-cols-[5rem_minmax(12rem,1fr)_minmax(15rem,1.4fr)_9rem] gap-4 border-b border-slate-200 py-2 text-xs font-medium text-slate-500 xl:grid" aria-hidden="true">
          <span>Time</span><span>Course / horse</span><span>Signal / why shown</span><span>Bookmaker median</span>
        </div>
        <ul className="divide-y divide-slate-200">
          {dashboard.horses.map((horse) => <li className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 py-5 xl:grid-cols-[5rem_minmax(12rem,1fr)_minmax(15rem,1.4fr)_9rem] xl:gap-x-4" key={`${horse.raceId}|${horse.runnerId}`}>
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
    </section>
    <section className="mt-6 border-t border-slate-200 pt-6" aria-labelledby="monitors-heading">
      <h2 className="text-lg font-semibold" id="monitors-heading">Prospective monitors</h2>
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

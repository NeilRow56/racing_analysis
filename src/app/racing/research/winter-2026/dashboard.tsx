import Link from "next/link";
import type { ReactNode } from "react";
import { WINTER_QUESTIONS, WINTER_RECENT_BLOCK, type WinterResearchSummary } from "@/lib/racing/winter-research";

const number = (n: number | null) => n === null ? "—" : n.toFixed(2);
const pct = (n: number | null) => n === null ? "—" : `${(n * 100).toFixed(2)}%`;
type Row = WinterResearchSummary["cards"][number] | WinterResearchSummary["aw"][number];
function MetricsTable({ title, rows, tone, chronology = false, missing = false }: {
  title: string; rows: Row[]; tone?: "red" | "blue"; chronology?: boolean; missing?: boolean;
}) {
  return <div className="mt-4 overflow-x-auto">
    <table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
      <caption className="mb-2 text-left text-sm font-semibold">{title}</caption>
      <thead className="border-y border-slate-200 text-slate-600"><tr>
        {(missing ? ["Family", "Settled", "Winners", "Actual/model"] :
          [chronology ? "Period (UTC)" : "Group", "Settled", "Winners", "Strike", "Model expected", "Actual/model", "Price n", "Captured-price ROI",
            ...(chronology ? ["HIGH A/M (n)", "MEDIUM/LOW A/M (n)"] : [])]).map(label => <th key={label} scope="col" className="px-3 py-2 font-medium">{label}</th>)}
      </tr></thead>
      <tbody>{rows.map(row => <tr key={row.label} className={`border-b border-slate-100 ${tone === "blue" ? "bg-sky-50" : tone === "red" && row.label.endsWith("PALE RED") ? "bg-red-50" : ""}`}>
        <th scope="row" className="px-3 py-2 font-medium">{row.label}</th>
        <td className="px-3 py-2">{row.settled}</td><td className="px-3 py-2">{row.winners}</td>
        {!missing && <><td className="px-3 py-2">{pct(row.strikeRate)}</td><td className="px-3 py-2">{number(row.modelExpected)}</td></>}
        <td className="px-3 py-2">{number(row.actualModelExpected)}</td>
        {!missing && <><td className="px-3 py-2">{row.price.priceN}</td><td className="px-3 py-2">{pct(row.price.roi)}</td></>}
        {chronology && ["high", "mediumLow"].map(key => {
          const cell = key in row ? (row as WinterResearchSummary["chaseChronology"][number])[key as "high" | "mediumLow"] : null;
          return <td key={key} className="px-3 py-2">{cell ? `${number(cell.actualModelExpected)} (${cell.settled})` : "—"}</td>;
        })}
      </tr>)}</tbody>
    </table>
  </div>;
}
const panel = "mt-5 border border-slate-200 bg-white p-4";

export function WinterResearchDashboard({ summary: s, quarantined = 0, shadowPanel }: { summary: WinterResearchSummary; quarantined?: number; shadowPanel?: ReactNode }) {
  return <main className="min-h-screen bg-gray-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1600px]">
      <header className="border-b border-slate-200 pb-5">
        <Link href="/racing/research/forward-value" className="text-sm font-medium text-emerald-800 hover:underline">Racing Research</Link>
        <h1 className="mt-2 text-2xl font-semibold">Winter Research · 2026/27</h1>
        <p className="mt-2 text-sm text-slate-600">Reporting only · Tissue Top 2 · frozen prospective records since 20 October 2026. Retrain now: NO for AW, Hurdle and Chase.</p>
        <p className="mt-2 text-xs text-slate-500">Model columns use primary family books. Price n and ROI use separate complete-market Value books with their own frozen ranks and classifications; returns are not available for every primary runner. Price-conditioned rows use the Value cohort for every metric.</p>
        <p className="mt-1 text-xs text-slate-500">Expected winners sum original settled probabilities; Actual/model counts winning runners. ROI uses stored £1 canonical settlement, including dead heats. Pending, NR and void rows are excluded. Missing denominators display —. Small and overlapping samples are descriptive.</p>
        <p className="mt-1 text-xs text-slate-500">{quarantined} primary books excluded by existing identity quarantine. Primary models, filters and settlement remain unchanged; Chase Shadow uses a separate prospective ledger.</p>
      </header>
      {shadowPanel}
      <section aria-label="Winter family summaries" className="mt-5 grid gap-3 md:grid-cols-3">
        {s.cards.map(card => <article key={card.label} className="border border-slate-200 bg-white p-4">
          <h2 className="flex justify-between text-sm font-semibold">{card.label}<span>{card.status}</span></h2>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs tabular-nums">
            <dt>Settled / winners</dt><dd>{card.settled} / {card.winners}</dd>
            <dt>Strike rate</dt><dd>{pct(card.strikeRate)}</dd>
            <dt>Model expected winners</dt><dd>{number(card.modelExpected)}</dd>
            <dt>Actual/model</dt><dd>{number(card.actualModelExpected)}</dd>
            <dt>Captured-price ROI</dt><dd>{pct(card.price.roi)} (n={card.price.priceN})</dd>
          </dl>
        </article>)}
      </section>
      <section className={panel} aria-labelledby="winter-red">
        <h2 id="winter-red" className="font-semibold">Red vs non-red · VISUAL ONLY</h2>
        <p className="mt-1 text-xs text-slate-500">Classification C: prospective separation present, sample small and weakening recently. PALE RED = Tissue Rank 1/2 + Best L3 Speed rank 2–3. NON-RED = rank NOT 2–3, including missing Speed. Declaration: 24 October; earlier observations are discovery context. Conservative confirmation begins with captures on 25 October.</p>
        <MetricsTable title="Complete available period · winter families only" rows={s.red} tone="red" />
        <MetricsTable title={`RECENT BLOCK · ${WINTER_RECENT_BLOCK.label}`} rows={s.recentRed} tone="red" />
        <p className="mt-2 text-xs text-slate-500">Recent uses the review’s full-sample Q4 boundary, fixed across all families including the original Turf population; no quantiles are recalculated. This is an off-time block, not a post-declaration capture filter.</p>
      </section>
      <section className={panel} aria-labelledby="winter-chase">
        <h2 id="winter-chase" className="font-semibold">Chase investigation · INVESTIGATE</h2>
        <p className="mt-1 text-xs text-slate-500">Speed reliability uses exact frozen cohort/race/capture/runner annotations from 28 October 09:35:43 UTC. Unclassified rows remain visible; no historical labels are backfilled. Race type and OR position use each owning full-field frozen feature vector, with missing flags and competition ranks.</p>
        <div className="grid gap-x-6 lg:grid-cols-2">
          <MetricsTable title="SPEED RELIABILITY" rows={s.chaseReliability} />
          <MetricsTable title="RANK" rows={s.chaseRank} />
          <MetricsTable title="RACE TYPE" rows={s.chaseRaceType} />
          <MetricsTable title="OR POSITION" rows={s.chaseOr} />
        </div>
        <MetricsTable title="CHASE CHRONOLOGY · fixed diagnostic blocks" rows={s.chaseChronology} chronology />
        <p className="mt-2 text-xs text-slate-500">Weeks, quarters and halves overlap. Boundaries stay fixed at the 30 October review; final quarter and second half remain open as monitoring continues. No reliability coverage means unavailable A/M, not zero performance.</p>
      </section>
      <section className={panel} aria-labelledby="winter-aw">
        <h2 id="winter-aw" className="font-semibold">AW stability · KEEP</h2>
        <MetricsTable title="AW Tissue Top 2" rows={s.aw} tone="red" />
        <MetricsTable title="AW fixed review halves" rows={s.awChronology} />
      </section>
      <section className={panel} aria-labelledby="winter-hurdle">
        <h2 id="winter-hurdle" className="font-semibold">Hurdle stability · KEEP</h2>
        <MetricsTable title="Hurdle Tissue Top 2" rows={s.hurdle} tone="red" />
        <p className="mt-2 text-xs text-slate-500">Recency joins only an existing pre-off snapshot captured no later than the owning Tissue book. PU and non-completer rows overlap. HIGH / MEDIUM/LOW Speed reliability is unavailable for Hurdle: the frozen annotation ledger covers Chase only.</p>
      </section>
      <section className={panel} aria-labelledby="winter-longer">
        <h2 id="winter-longer" className="font-semibold">Longer-price context · DESCRIPTIVE ONLY</h2>
        <p className="mt-1 text-xs text-slate-500">Blue marker: Tissue Rank 1/2 and genuine frozen captured price &gt;6.00. Every column below uses the separate Value population. No betting recommendations.</p>
        <MetricsTable title="Longer-price Tissue Top 2" rows={s.longerPrice} tone="blue" />
      </section>
      <section className={panel} aria-labelledby="winter-missing">
        <h2 id="winter-missing" className="font-semibold">Best L3 Speed rank missing</h2>
        <MetricsTable title="Missing Speed · included in the non-red complement" rows={s.missingSpeed} missing />
      </section>
      <section className={panel} aria-labelledby="winter-questions">
        <h2 id="winter-questions" className="font-semibold">WINTER RESEARCH QUESTIONS</h2>
        <ol className="mt-3 grid list-inside list-decimal gap-3 text-sm md:grid-cols-3">
          {WINTER_QUESTIONS.map(([label, question]) => <li key={label}><strong>{label}</strong><p className="mt-1 text-xs text-slate-600">{question}</p></li>)}
        </ol>
        <p className="mt-3 text-xs text-slate-500">Research questions, not filters.</p>
      </section>
    </div>
  </main>;
}

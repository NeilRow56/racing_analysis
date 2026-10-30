import Link from "next/link";
import type { ReactNode } from "react";

export function ResearchPageLayout({ date, active, secondary, children }: {
  date: string;
  active: ReactNode;
  secondary: ReactNode;
  children: ReactNode;
}) {
  return <main className="min-h-screen bg-gray-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1600px]">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link className="text-sm font-medium text-emerald-800 hover:underline" href="/racing/research">Racing Research</Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">Racing Research</h1>
          <p className="mt-2 text-sm text-slate-500">Current prospective research first; previous Tissue and model experiments are retained below for reference.</p>
        </div>
        <nav aria-label="Racing Research" className="flex flex-wrap gap-2 text-sm font-semibold">
          <Link className="border border-slate-300 bg-white px-3 py-2 text-slate-700 hover:border-emerald-400 hover:text-emerald-800" href="/racing/research/winter-2026">Winter 2026/27</Link>
          <time className="self-center px-2 text-xs font-normal tabular-nums text-slate-500" dateTime={date}>{date}</time>
          <a className="px-3 py-2 text-slate-700 hover:text-emerald-800" href="/racing/research/forward-value">Refresh</a>
          <Link className="border border-slate-300 bg-white px-3 py-2 text-slate-700 hover:border-emerald-400 hover:text-emerald-800" href="/racing/research">Research Filters</Link>
          <Link className="border border-slate-300 bg-white px-3 py-2 text-slate-700 hover:border-emerald-400 hover:text-emerald-800" href="/racing/today">Today&apos;s Racing</Link>
        </nav>
      </header>

      <section className="mt-7" aria-labelledby="active-research-heading">
        <h2 id="active-research-heading" className="text-lg font-semibold">ACTIVE RESEARCH</h2>
        <p className="mt-1 text-sm text-slate-500">Current prospective research being monitored. Historical model and Tissue experiments are preserved below for reference.</p>
        {active}
      </section>

      <details id="secondary-monitoring" className="mt-7 border-t border-slate-200 py-4">
        <summary className="cursor-pointer">
          <h2 className="inline text-sm font-semibold">SECONDARY MONITORING</h2>
          <span className="ml-2 text-xs text-slate-500">Rank 1 Monitoring · Today&apos;s Rating - Lighter Weight</span>
        </summary>
        {secondary}
      </details>

      <details id="archived-research" className="mt-3 border-t border-slate-200 py-4">
        <summary className="cursor-pointer">
          <h2 className="inline text-sm font-semibold">ARCHIVED / LEGACY RESEARCH</h2>
          <span className="ml-2 text-xs text-slate-500">Tissue VALUE, model monitors, challengers and research history</span>
        </summary>
        <p className="mt-2 text-sm text-slate-500">Previous prospective and historical experiments retained for audit and reference. These are not current active research signals.</p>
        <p className="mt-1 text-xs text-slate-500">Tissue VALUE did not establish a robust betting edge or material incremental predictive value beyond the market. Existing records and calculations are retained below.</p>
        {children}
      </details>
    </div>
  </main>;
}

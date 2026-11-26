import Link from "next/link";
import type { ReactNode } from "react";

const button = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-800";

export function ResearchPageLayout({ date, daily, tissue, active, historical, secondary, children, archiveLoaded, historyLoaded, secondaryOpen }: {
  date: string;
  daily: ReactNode;
  tissue: ReactNode;
  active: ReactNode;
  historical?: ReactNode;
  secondary: ReactNode;
  children: ReactNode;
  archiveLoaded: boolean;
  historyLoaded: boolean;
  secondaryOpen?: boolean;
}) {
  return <main className="min-h-screen bg-gray-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold">Racing Research</h1>
        <nav aria-label="Racing Research" className="flex flex-wrap gap-2">
          <Link className={button} href="/racing/research">Research Filters</Link>
          <Link className={button} href="/racing/today">Today&apos;s Racing</Link>
        </nav>
      </header>

      <section className="mt-5" aria-labelledby="daily-profitability">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="daily-profitability" className="text-lg font-semibold">Today&apos;s profitability selections</h2>
          <form method="get" action="/racing/research/forward-value" className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium">Racing date
              <input aria-label="Racing date" className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" type="date" name="date" defaultValue={date} required />
            </label>
            <button className={button} type="submit">Refresh</button>
          </form>
        </div>
        {daily}
      </section>

      <section className="mt-6 border-t border-slate-200 pt-4" aria-labelledby="tissue-performance">
        <h2 id="tissue-performance" className="text-lg font-semibold">Tissue Model Performance</h2>
        {tissue}
      </section>

      <section className="mt-6 border-t border-slate-200 pt-4" aria-labelledby="active-research-heading">
        <h2 id="active-research-heading" className="text-lg font-semibold">Active prospective research</h2>
        {active}
        <details open={secondaryOpen || undefined} id="secondary-monitoring" className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-emerald-800">Secondary monitoring · ratings and OR + Best L3 Speed</summary>
          {secondary}
        </details>
      </section>

      <details open={historyLoaded || undefined} id="historical-research" className="mt-6 border-t border-slate-200 py-4">
        <summary className="cursor-pointer"><h2 className="inline text-lg font-semibold">Historical development research</h2></summary>
        {historical}
        {!historyLoaded && <Link prefetch={false} className="mt-3 inline-block text-sm font-semibold text-emerald-800 underline"
          href={`?date=${date}&history=1#historical-research`}>Load historical diagnostics</Link>}
      </details>

      <details open={archiveLoaded || undefined} id="archived-research" className="border-t border-slate-200 py-4">
        <summary className="cursor-pointer"><h2 className="inline text-lg font-semibold">Archived and suspended research</h2></summary>
        <Link className="mt-3 block text-sm font-semibold text-emerald-800 underline" href="/racing/research/winter-2026">Winter Tissue archive</Link>
        {archiveLoaded ? children : <Link prefetch={false} className="mt-3 inline-block text-sm font-semibold text-emerald-800 underline"
          href={`?date=${date}&archive=1#archived-research`}>Load archived research</Link>}
      </details>
    </div>
  </main>;
}

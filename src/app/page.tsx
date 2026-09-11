import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-stone-50 px-6 py-10 text-slate-950">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Racing Analysis
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Racing workspace
          </h1>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <Link
            className="block border border-slate-200 bg-white p-6 shadow-sm hover:border-emerald-300"
            href="/racing/today"
          >
            <h2 className="text-xl font-semibold text-emerald-800">
              Today&apos;s Racing
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              View today&apos;s races, speed figures and Today&apos;s Ratings.
            </p>
          </Link>
          <Link
            className="block border border-slate-200 bg-white p-6 shadow-sm hover:border-emerald-300"
            href="/racing/research"
          >
            <h2 className="text-xl font-semibold text-emerald-800">
              Research Filters
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Test historical rating and race filters against the 2025 development dataset.
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}

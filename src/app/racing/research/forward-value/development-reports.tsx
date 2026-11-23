import Link from "next/link";

export const developmentReports = [
  ["aw-profitability-development-register", "AW Profit V1–V3, Same-OR, No-Hoper and market support register"],
  ["aw-profit-first-tissue-development-v1", "AW profitability experiments and historical final SP"],
  ["aw-v3-same-or-component-research", "Same-OR Speed component investigation"],
  ["aw-v3-no-same-or-t2", "Same-OR Speed T2 diagnostic"],
  ["full-history-profitability-model-research", "Full-history model comparisons"],
  ["retrospective-market-beating-models-2026", "2026 retrospective model comparisons"],
] as const;

export const trainerTargetingReportId = "trainer-targeting-prospective";

export function DevelopmentReports() {
  return <ul className="my-3 space-y-1 text-sm">
    {developmentReports.map(([id, label]) => <li key={id}>
      <Link prefetch={false} className="text-emerald-800 underline" href={`/racing/research/forward-value/reports/${id}`}>{label}</Link>
    </li>)}
    <li><Link className="text-emerald-800 underline" href="/racing/research">Turf, AW, Hurdle and Chase model comparisons and saved rules</Link></li>
  </ul>;
}

import Link from "next/link";
import { loadBacktestFeatureCache } from "@/lib/racing/backtest-cache";
import {
  DEVELOPMENT_FROM,
  DEVELOPMENT_TO,
  FAMILY_OPTIONS,
  HANDICAP_STATUS_OPTIONS,
  RANK_METRIC_OPTIONS,
  RATING_METRIC_OPTIONS,
  RELATIVE_METRIC_OPTIONS,
  RETURN_BUCKET_OPTIONS,
  RUN_AFTER_BREAK_OPTIONS,
  evaluateResearchRule,
  formatExactDistance,
  hydrateResearchRuleMetadata,
  researchFilterOptionsForRows,
  ruleFromSearchParams,
  type ResearchFilterOptions,
  type ResearchResult,
  type ResearchRuleV1,
} from "@/lib/racing/research-rule";
import { researchRuleKey } from "@/lib/racing/research-rule-identity";
import { ResearchWorkspace } from "./research-form-client";

export default async function ResearchPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams(await normalizedSearchParams(searchParams));
  const rule = ruleFromSearchParams(params);
  const data = await loadResearchData(rule);
  const displayRule = data?.rule ?? rule;
  const filterOptions = data?.filterOptions ?? emptyFilterOptions();

  return (
    <main className="min-h-screen bg-stone-50 px-5 py-6 text-slate-950">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <Link className="text-sm font-medium text-emerald-800 hover:underline" href="/">
              Racing Analysis
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Research Filters
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Development dataset: 2025. Holdout validation is intentionally not exposed here.
            </p>
          </div>
          <Link
            className="border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-400 hover:text-emerald-800"
            href="/racing/today"
          >
            Today&apos;s Racing
          </Link>
        </header>

        <ResearchWorkspace
          executedRule={displayRule}
          familyOptions={FAMILY_OPTIONS}
          filterOptions={filterOptions}
          handicapStatusOptions={HANDICAP_STATUS_OPTIONS}
          hasResults={data?.result !== undefined}
          key={researchRuleKey(displayRule)}
          rankMetricOptions={RANK_METRIC_OPTIONS}
          ratingMetricOptions={RATING_METRIC_OPTIONS}
          returnBucketOptions={RETURN_BUCKET_OPTIONS}
          relativeMetricOptions={RELATIVE_METRIC_OPTIONS}
          runAfterBreakOptions={RUN_AFTER_BREAK_OPTIONS}
        >
          {data?.result ? (
            <ResearchResults result={data.result} />
          ) : (
            <section className="mt-6 border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              Compatible 2025 cache not found for {familyLabel(rule.family)}.
              Build it with <code>bun run racing:build-backtest-cache --from 2025-01-01 --to 2025-12-31 --family {rule.family}</code>.
            </section>
          )}
        </ResearchWorkspace>
      </div>
    </main>
  );
}

type ResearchPageData = {
  filterOptions: ResearchFilterOptions;
  result: ResearchResult;
  rule: ResearchRuleV1;
};

async function loadResearchData(rule: ResearchRuleV1): Promise<ResearchPageData | null> {
  const startedAt = performance.now();
  const cached = await loadBacktestFeatureCache({
    from: DEVELOPMENT_FROM,
    to: DEVELOPMENT_TO,
    family: rule.family,
  });
  if (!cached) {
    return null;
  }
  const hydratedRule = hydrateResearchRuleMetadata(rule, cached.rows);
  return {
    filterOptions: researchFilterOptionsForRows(cached.rows),
    rule: hydratedRule,
    result: evaluateResearchRule({
        rows: cached.rows,
        rule: hydratedRule,
        cache: { manifest: cached.manifest, directory: cached.directory },
        elapsedMs: performance.now() - startedAt,
      }),
  };
}

function ResearchResults({ result }: { result: ResearchResult }) {
  const rankMetric = result.rule.ranks[0]?.metric ?? null;
  const relativeMetric = result.rule.relatives[0]?.metric ?? null;
  const sample = result.selectedRunners.slice(0, 100);
  return (
    <div className="mt-6 space-y-6">
      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">2025 development result</h2>
            <p className="text-sm text-slate-600">
              Cache {result.cache?.manifest.featureSchemaVersion ?? "-"} · {result.cache?.manifest.family ?? "-"} · evaluated in {Math.round(result.elapsedMs)}ms
            </p>
          </div>
          <p className="text-sm text-slate-500">No strategy confidence score is assigned in v1.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Eligible runners" value={result.baselineRows} />
          <Metric label="Selections" value={result.summary.selections} />
          <Metric label="Settled" value={result.summary.settledSelections} />
          <Metric label="Winners" value={result.summary.wins} />
          <Metric label="Strike rate" value={formatPct(result.summary.winStrikeRate)} />
          <Metric label="Places" value={result.summary.places} />
          <Metric label="Place strike" value={formatPct(result.summary.placeStrikeRate)} />
          <Metric label="£1 P/L" value={formatMoney(result.summary.profitLoss)} />
          <Metric label="ROI" value={formatPct(result.summary.roiPercentage)} />
          <Metric label="Max losing run" value={result.summary.maxConsecutiveLosers} />
        </div>
        <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Baseline for filtered race/runner population: {result.baselineRows} runners, {result.baselineWins} winners, {formatPct(result.baselineWinStrikeRate)} win strike rate.
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Strategy Definition</h2>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            {result.strategySummary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="mt-4 text-xs text-slate-500">
            Rating versions: {Object.entries(result.cache?.manifest.calculationVersions ?? {}).map(([key, value]) => `${key}=${value}`).join(", ")}
          </div>
        </div>

        <details className="border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer text-lg font-semibold">Eligible population data quality</summary>
          <p className="mt-2 text-sm text-slate-600">
            Counts below refer to runners before the final rating/rank selection is applied.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            {Object.entries(result.missingData).map(([key, value]) => (
              <div key={key} className="border border-slate-100 p-2">
                <dt className="text-slate-500">{diagnosticLabel(key)}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      </section>

      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3">
          <h2 className="text-lg font-semibold">Selected runners</h2>
          <p className="text-sm text-slate-500">Showing first {sample.length} of {result.selectedRunners.length} selections.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="border-y border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Course</th>
                <th className="py-2 pr-3 font-medium">Distance</th>
                <th className="py-2 pr-3 font-medium">Race</th>
                <th className="py-2 pr-3 font-medium">Horse</th>
                <th className="py-2 pr-3 font-medium">OR</th>
                <th className="py-2 pr-3 font-medium">Weight</th>
                <th className="py-2 pr-3 font-medium">Latest Speed</th>
                <th className="py-2 pr-3 font-medium">Latest Perf</th>
                <th className="py-2 pr-3 font-medium">Today&apos;s Rating</th>
                <th className="py-2 pr-3 font-medium">Rank</th>
                <th className="py-2 pr-3 font-medium">Key diff</th>
                <th className="py-2 pr-3 font-medium">Days</th>
                <th className="py-2 pr-3 font-medium">Finish</th>
                <th className="py-2 pr-3 font-medium">SP</th>
                <th className="py-2 pr-3 font-medium">£1 P/L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sample.map((selection) => (
                <tr key={selection.id}>
                  <td className="py-2 pr-3">{selection.features.raceDate}</td>
                  <td className="py-2 pr-3">{selection.features.courseName}</td>
                  <td className="py-2 pr-3">{formatExactDistance(selection.features.distanceYards)}</td>
                  <td className="py-2 pr-3">{selection.features.raceName ?? "-"}</td>
                  <td className="py-2 pr-3 font-medium text-emerald-800">{selection.features.horseName}</td>
                  <td className="py-2 pr-3">{selection.features.officialRating ?? "-"}</td>
                  <td className="py-2 pr-3">{selection.features.weight ?? "-"}</td>
                  <td className="py-2 pr-3">{formatNumber(selection.features.latestSpeedRating)}</td>
                  <td className="py-2 pr-3">{formatNumber(selection.features.latestPerformanceRating)}</td>
                  <td className="py-2 pr-3">{formatNumber(selection.features.latestTodaysRating)}</td>
                  <td className="py-2 pr-3">{rankMetric ? selection.ranks[rankMetric] ?? "-" : "-"}</td>
                  <td className="py-2 pr-3">{relativeMetric ? formatNumber(selection.derived[relativeMetric]) : "-"}</td>
                  <td className="py-2 pr-3">{selection.features.daysSinceLastRun ?? "-"}</td>
                  <td className="py-2 pr-3">{selection.outcome.finishingPosition ?? "-"}</td>
                  <td className="py-2 pr-3">{selection.outcome.startingPrice ?? "-"}</td>
                  <td className="py-2 pr-3">{formatMoney(selection.settlement?.profitLoss ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function emptyFilterOptions(): ResearchFilterOptions {
  return { courses: [], classes: [], distances: [], trainers: [], weights: [] };
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

async function normalizedSearchParams(
  searchParams?: Promise<Record<string, string | string[] | undefined>>,
): Promise<Record<string, string>> {
  const raw = await searchParams;
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (typeof value === "string") {
      output[key] = value;
    } else if (Array.isArray(value) && typeof value[0] === "string") {
      output[key] = value[0];
    }
  }
  return output;
}

function familyLabel(family: ResearchRuleV1["family"]) {
  return FAMILY_OPTIONS.find((option) => option.value === family)?.label ?? family;
}

function formatPct(value: number | null) {
  return value === null ? "-" : `${value.toFixed(1)}%`;
}

function formatMoney(value: number | null) {
  if (value === null) return "-";
  return value < 0 ? `-£${Math.abs(value).toFixed(2)}` : `£${value.toFixed(2)}`;
}

function formatNumber(value: number | null) {
  return value === null ? "-" : value.toFixed(1);
}

function diagnosticLabel(key: string) {
  const labels: Record<string, string> = {
    noSpeed: "No Speed",
    noPerformance: "No Performance",
    noTodaysRating: "No Today's Rating",
    noOr: "No OR",
    noWeight: "No Weight",
    noSettlementSp: "No Settlement SP",
    nonRunnerOrUnsettled: "Non-runner/unsettled",
  };
  return labels[key] ?? key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}

import Link from "next/link";
import {
  capturedPriceProfitLoss,
  formatForwardValueRaceTime,
  loadForwardValueData,
  valueExclusionReason,
} from "@/lib/racing/forward-value";
import {
  filterForwardValueObservations,
  forwardValueFamilyLabel,
  forwardValueObservationStatus,
  summarizeForwardValue,
  type ForwardValueEdgeFilter,
  type ForwardValueObservationFilters,
  type ForwardValueObservationState,
  type ForwardValueSummary,
  type TurfModelAgreementSummary,
} from "@/lib/racing/forward-value-summary";
import { RecentObservationsScroll } from "./recent-observations-scroll";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ForwardValuePage({ searchParams }: PageProps) {
  const data = await loadForwardValueData();
  const params = await searchParams;
  const filters = parseFilters(params);
  const summary = summarizeForwardValue(data);
  const observations = filterForwardValueObservations(data.races, filters).slice(0, 100);

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link className="text-sm font-medium text-emerald-800 hover:underline" href="/racing/research">
              Racing Research
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">Forward Value</h1>
            <p className="mt-2 text-sm font-medium text-amber-800">
              Prospective research — not a betting recommendation
            </p>
          </div>
          <nav aria-label="Racing Research" className="flex flex-wrap gap-2 text-sm font-semibold">
            <Link className="border border-slate-300 bg-white px-3 py-2 text-slate-700 hover:border-emerald-400 hover:text-emerald-800" href="/racing/research">
              Research Filters
            </Link>
            <Link className="border border-slate-300 bg-white px-3 py-2 text-slate-700 hover:border-emerald-400 hover:text-emerald-800" href="/racing/today">
              Today&apos;s Racing
            </Link>
          </nav>
        </header>

        <SparseSampleWarning show={summary.sparseSampleWarning} />

        <TopLevelCounts summary={summary} />
        <FamilySummaryTable summary={summary} />
        <EdgeBucketTables summary={summary} />
        <TurfModelAgreementCounts summary={summary.turfModelAgreement} />
        <RecentObservations filters={filters} observations={observations} />
      </div>
    </main>
  );
}

export function SparseSampleWarning({ show }: { show: boolean }) {
  return show ? (
    <div className="mt-5 border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
      Sample is still too small for meaningful profitability conclusions.
    </div>
  ) : null;
}

export function TopLevelCounts({ summary }: { summary: ForwardValueSummary }) {
  const values = [
    ["Prospective", summary.totalProspectiveObservations],
    ["Clean settled", summary.cleanSettledObservations],
    ["Unsettled", summary.unsettledObservations],
    ["Excluded", summary.excludedObservations],
    ["Earliest", summary.earliestObservationDate ?? "-"],
    ["Latest", summary.latestObservationDate ?? "-"],
  ];
  return (
    <section aria-labelledby="coverage-heading" className="mt-6">
      <h2 className="text-lg font-semibold" id="coverage-heading">Coverage</h2>
      <dl className="mt-3 grid border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-6">
        {values.map(([label, value]) => (
          <div className="border-b border-slate-200 px-4 py-3 last:border-b-0 sm:border-r lg:border-b-0" key={label}>
            <dt className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{value}</dd>
          </div>
        ))}
      </dl>
      {Object.keys(summary.exclusionCounts).length > 0 ? (
        <p className="mt-2 text-xs text-slate-600">
          Exclusions: {Object.entries(summary.exclusionCounts).map(([reason, count]) => `${reason} ${count}`).join("; ")}
        </p>
      ) : null}
    </section>
  );
}

export function FamilySummaryTable({ summary }: { summary: ForwardValueSummary }) {
  return (
    <section aria-labelledby="family-summary-heading" className="mt-8">
      <h2 className="text-lg font-semibold" id="family-summary-heading">Family Summary</h2>
      <div className="mt-3 overflow-x-auto border border-slate-200 bg-white">
        <table className="min-w-[1280px] w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase tracking-normal text-slate-600">
            <tr>
              {[
                "Family", "Prospective", "Clean settled", "Wins", "Strike", "Expected rate", "Expected wins",
                "Actual - expected", "Avg price", "Market implied", "Avg edge", "P/L", "ROI", "Sample",
              ].map((heading) => <th className="px-3 py-3 font-semibold" key={heading}>{heading}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {summary.families.map((family) => (
              <tr key={family.family}>
                <th className="whitespace-nowrap px-3 py-3 font-semibold text-slate-950">{family.label}</th>
                <Cell value={family.prospectiveObservations} />
                <Cell value={family.cleanSettledObservations} />
                <Cell value={family.metrics.wins} />
                <Cell value={pct(family.metrics.strikeRate)} />
                <Cell value={pct(family.metrics.expectedWinRate)} />
                <Cell value={decimal(family.metrics.expectedWins)} />
                <Cell value={signed(family.metrics.actualMinusExpectedWins)} />
                <Cell value={decimal(family.metrics.averageCapturedDecimalPrice)} />
                <Cell value={pct(family.metrics.averageMarketImpliedProbability)} />
                <Cell value={pp(family.metrics.averageRatingEdgePercentagePoints)} />
                <Cell value={money(family.metrics.profitLoss)} />
                <Cell value={pct(family.metrics.roi)} />
                <td className="whitespace-nowrap px-3 py-3 text-xs font-semibold text-slate-700">{family.metrics.sampleStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function TurfModelAgreementCounts({ summary }: { summary: TurfModelAgreementSummary }) {
  const values = [
    ["Comparable races", summary.comparableRaces],
    ["TPR/Tissue agree", summary.tprTissueAgree],
    ["Disagree", summary.disagree],
    ["Both positive edge", summary.bothPositiveEdge],
    ["TPR positive only", summary.tprPositiveOnly],
    ["Tissue positive only", summary.tissuePositiveOnly],
    ["Neither positive", summary.neitherPositive],
  ];
  return (
    <section aria-labelledby="turf-agreement-heading" className="mt-8">
      <h2 className="text-lg font-semibold" id="turf-agreement-heading">Turf Model Agreement</h2>
      <dl className="mt-3 grid border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-7">
        {values.map(([label, value]) => (
          <div className="border-b border-slate-200 px-3 py-3 last:border-b-0 sm:border-r lg:border-b-0" key={label}>
            <dt className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">{label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function EdgeBucketTables({ summary }: { summary: ForwardValueSummary }) {
  return (
    <section aria-labelledby="edge-buckets-heading" className="mt-8">
      <h2 className="text-lg font-semibold" id="edge-buckets-heading">Edge Buckets</h2>
      <div className="mt-3 grid gap-6 xl:grid-cols-3">
        {summary.families.map((family) => (
          <div key={family.family}>
            <h3 className="border-b border-slate-300 pb-2 text-sm font-semibold text-slate-800">{family.label}</h3>
            <div className="overflow-x-auto border-x border-b border-slate-200 bg-white" data-testid="edge-bucket-scroll">
              <table className="w-full min-w-[420px] table-fixed text-xs">
                <colgroup>
                  {[66, 34, 36, 52, 58, 60, 50, 64].map((width, index) => (
                    <col key={index} style={{ width }} />
                  ))}
                </colgroup>
                <thead className="bg-slate-100 text-[10px] uppercase text-slate-600">
                  <tr>
                    {['Edge', 'Obs', 'Wins', 'Strike', 'Expected', 'Avg edge', 'P/L', 'ROI'].map((heading, index) => (
                      <th className={`${index === 0 ? "text-left" : "text-right"} whitespace-nowrap px-1.5 py-1.5 font-semibold`} key={heading}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {family.edgeBuckets.map((bucket) => (
                    <tr key={bucket.band}>
                      <th className="whitespace-nowrap px-1.5 py-1.5 text-left font-medium">{edgeLabel(bucket.band)}</th>
                      <EdgeBucketCell value={bucket.observations} />
                      <EdgeBucketCell value={bucket.wins} />
                      <EdgeBucketCell value={pct(bucket.strikeRate)} />
                      <EdgeBucketCell value={pct(bucket.expectedWinRate)} />
                      <EdgeBucketCell value={pp(bucket.averageRatingEdgePercentagePoints)} />
                      <EdgeBucketCell value={money(bucket.profitLoss)} />
                      <EdgeBucketCell value={pct(bucket.roi)} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

type RecentProps = {
  filters: ForwardValueObservationFilters;
  observations: Awaited<ReturnType<typeof loadForwardValueData>>["races"];
};

const recentObservationColumnWidths = [84, 46, 170, 52, 96, 64, 78, 66, 52, 96, 64, 78, 66, 52, 58, 56, 54, 48, 92];
const recentObservationHeadings = [
  "Date", "Time", "Course / race", "Family", "TPR horse", "TPR prob.", "TPR price",
  "TPR mkt.", "TPR edge", "Tissue horse", "Tissue prob.", "Tissue price",
  "Tissue mkt.", "Tissue edge", "Agree", "Fav.", "Result", "P/L", "Status",
];
const recentObservationTableMinWidth = 1446;

export function RecentObservations({ filters, observations }: RecentProps) {
  return (
    <section aria-labelledby="recent-heading" className="mt-8 pb-10">
      <div className="border-b border-slate-300 pb-3">
        <h2 className="text-lg font-semibold" id="recent-heading">Recent Observations</h2>
        <p className="mt-1 text-xs text-slate-600">Newest first. Showing up to 100 observations.</p>
      </div>
      <RecentObservationsScroll
        controls={(
        <form className="flex flex-wrap items-end justify-end gap-2" method="get">
          <FilterSelect label="Family" name="family" value={filters.family} options={[["all", "All families"], ["turf", "TPR"], ["jump", "JPR-A"], ["aw", "AW-D"]]} />
          <FilterSelect label="Status" name="state" value={filters.state} options={[["all", "All statuses"], ["settled", "Settled"], ["unsettled", "Unsettled"], ["excluded", "Excluded"]]} />
          <FilterSelect label="Edge" name="edge" value={filters.edge} options={[["all", "All edges"], ["positive", "Positive"], ["non_positive", "Negative / zero"]]} />
          <button className="border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" type="submit">
            Apply
          </button>
        </form>
        )}
        stickyHeader={(
          <table className="w-full min-w-[1446px] table-fixed text-left text-xs">
            <RecentObservationColGroup />
            <RecentObservationHead />
          </table>
        )}
        tableMinWidth={recentObservationTableMinWidth}
      >
        <table className="w-full min-w-[1446px] table-fixed text-left text-xs">
          <RecentObservationColGroup />
          <RecentObservationHead />
          <tbody className="divide-y divide-slate-200">
            {observations.length === 0 ? (
              <tr><td className="px-2 py-8 text-center text-slate-500" colSpan={19}>No observations match these filters.</td></tr>
            ) : observations.map((race) => {
              const exclusion = valueExclusionReason(race);
              const profitLoss = capturedPriceProfitLoss(race);
              const raceDescription = `${race.course}${race.raceName ? ` / ${race.raceName}` : ""}`;
              return (
                <tr className={exclusion ? "bg-slate-50 text-slate-600" : ""} key={`${race.raceId}:${race.recordedAt}`}>
                  <td className="whitespace-nowrap px-2 py-2 tabular-nums">{race.raceDate}</td>
                  <td className="whitespace-nowrap px-2 py-2 tabular-nums">{formatForwardValueRaceTime(race)}</td>
                  <td className="px-2 py-2" title={raceDescription}>
                    <span className="line-clamp-2 break-words font-medium leading-4">{raceDescription}</span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 font-medium">{forwardValueFamilyLabel(race.family)}</td>
                  <HorseCell value={race.leaderHorseName} />
                  <CompactCell value={pct(race.calibratedProbability)} />
                  <CompactCell value={price(race.capturedPrice, race.capturedDecimalOdds)} />
                  <CompactCell value={pct(race.capturedMarketProbability)} />
                  <CompactCell value={pp(race.edgePercentagePoints)} />
                  <HorseCell value={race.tissueHorseName ?? "-"} />
                  <CompactCell value={pct(race.tissueProbability)} />
                  <CompactCell value={price(race.tissueCapturedPrice ?? null, race.tissueCapturedDecimalOdds ?? null)} />
                  <CompactCell value={pct(race.tissueMarketProbability ?? null)} />
                  <CompactCell value={pp(race.tissueEdgePercentagePoints ?? null)} />
                  <CompactCell value={yesNo(race.tissueAgreesWithTpr)} />
                  <CompactCell value={yesNo(race.leaderIsMarketFavourite ?? race.agreesWithMarketFavourite)} />
                  <CompactCell value={resultLabel(race)} />
                  <CompactCell value={money(profitLoss)} />
                  <td className="px-2 py-2 font-medium leading-4" title={forwardValueObservationStatus(race)}>
                    <span className="line-clamp-2 break-words">{forwardValueObservationStatus(race)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </RecentObservationsScroll>
    </section>
  );
}

function RecentObservationColGroup() {
  return (
    <colgroup>
      {recentObservationColumnWidths.map((width, index) => <col key={index} style={{ width }} />)}
    </colgroup>
  );
}

function RecentObservationHead() {
  return (
    <thead className="bg-slate-100 text-[10px] uppercase tracking-normal text-slate-600">
      <tr>
        {recentObservationHeadings.map((heading) => <th className="px-2 py-2 font-semibold leading-3" key={heading}>{heading}</th>)}
      </tr>
    </thead>
  );
}

function FilterSelect({ label, name, options, value }: { label: string; name: string; options: Array<[string, string]>; value: string }) {
  return (
    <label className="text-xs font-semibold text-slate-600">
      <span className="mb-1 block">{label}</span>
      <select className="h-9 border border-slate-300 bg-white px-2 text-sm font-normal text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" defaultValue={value} name={name}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function Cell({ compact = false, value }: { compact?: boolean; value: number | string }) {
  return <td className={`${compact ? "px-2 py-2" : "px-3 py-3"} whitespace-nowrap tabular-nums`}>{value}</td>;
}

function EdgeBucketCell({ value }: { value: number | string }) {
  return <td className="whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums">{value}</td>;
}

function CompactCell({ value }: { value: number | string }) {
  return <td className="whitespace-nowrap px-2 py-2 text-center tabular-nums">{value}</td>;
}

function HorseCell({ value }: { value: string }) {
  return <td className="px-2 py-2 font-medium leading-4" title={value}><span className="line-clamp-2 break-words">{value}</span></td>;
}

function parseFilters(params: Awaited<PageProps["searchParams"]>): ForwardValueObservationFilters {
  const family = scalar(params?.family);
  const state = scalar(params?.state);
  const edge = scalar(params?.edge);
  return {
    family: family === "turf" || family === "jump" || family === "aw" ? family : "all",
    state: state === "settled" || state === "unsettled" || state === "excluded" ? state as ForwardValueObservationState : "all",
    edge: edge === "positive" || edge === "non_positive" ? edge as ForwardValueEdgeFilter : "all",
  };
}

function scalar(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function resultLabel(race: RecentProps["observations"][number]) { return race.settledAt === null ? "Pending" : race.leaderResultStatus === "non_runner" ? "Non-runner" : race.leaderWon ? "Won" : "Lost"; }
function edgeLabel(value: string) { return value.replace(">0-2pp", "> 0–2pp").replace(">2-5pp", "> 2–5pp").replace(">5-10pp", "> 5–10pp").replace(">10pp", "> 10pp"); }
function pct(value: number | null) { return value === null ? "-" : `${(value * 100).toFixed(1)}%`; }
function pp(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}pp`; }
function decimal(value: number | null) { return value === null ? "-" : value.toFixed(2); }
function price(raw: string | null, decimalOdds: number | null) { return raw ? `${raw} (${decimal(decimalOdds)})` : decimal(decimalOdds); }
function signed(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}`; }
function money(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}`; }
function yesNo(value: boolean | null) { return value === null ? "-" : value ? "Yes" : "No"; }

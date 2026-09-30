import Link from "next/link";
import { createDbConnection } from "@/db";
import {
  capturedPriceProfitLoss,
  FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
  FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION,
  formatForwardValueRaceTime,
  forwardValuePriceSnapshot,
  loadForwardValueData,
  valueExclusionReason,
} from "@/lib/racing/forward-value";
import {
  buildTurfModelDisagreementDiagnostics,
  buildForwardValueReportingScope,
  filterForwardValueObservations,
  forwardValueFamilyLabel,
  forwardValueObservationStatus,
  summarizeForwardValue,
  type TurfModelDisagreementDiagnostic,
  type ForwardValueEdgeFilter,
  type ForwardValueObservationFilters,
  type ForwardValueObservationState,
  type ForwardValueSummary,
  type ForwardValueReportingStatus,
  type TurfModelAgreementSummary,
} from "@/lib/racing/forward-value-summary";
import { getSportingLifeCurrentCardRaceStatuses } from "@/lib/racing/todays-racing";
import { loadTissueForward, TISSUE_V2_CONFIG } from "@/lib/racing/tissue-forward";
import { RecentObservationsScroll } from "./recent-observations-scroll";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ForwardValuePage({ searchParams }: PageProps) {
  const [data, tissueData, params] = await Promise.all([
    loadForwardValueData(),
    loadTissueForward(TISSUE_V2_CONFIG.forwardPath, TISSUE_V2_CONFIG),
    searchParams,
  ]);
  const connection = createDbConnection();
  let currentCardStatuses;
  try {
    currentCardStatuses = await getSportingLifeCurrentCardRaceStatuses(
      connection.db,
      data.races.map((race) => race.raceId),
    );
  } finally {
    await connection.client.end();
  }
  const reportingScope = buildForwardValueReportingScope(data.races, currentCardStatuses);
  const filters = parseFilters(params);
  const summary = summarizeForwardValue(data, reportingScope);
  const disagreementDiagnostics = buildTurfModelDisagreementDiagnostics(reportingScope.analyticalRecords, tissueData).slice(0, 25);
  const observations = filterForwardValueObservations(data.races, filters, reportingScope).slice(0, 100);

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
        <PriceSnapshotDiagnostics observations={reportingScope.analyticalRecords} summary={summary} />
        <TurfModelAgreementCounts summary={summary.turfModelAgreement} />
        <TurfModelDisagreementExplainer diagnostics={disagreementDiagnostics} />
        <RecentObservations filters={filters} observations={observations} reportingStatuses={reportingScope.statusByRaceId} />
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
    ["Superseded", summary.supersededRaceVersions],
    ["Earliest", summary.earliestObservationDate ?? "-"],
    ["Latest", summary.latestObservationDate ?? "-"],
  ];
  return (
    <section aria-labelledby="coverage-heading" className="mt-6">
      <h2 className="text-lg font-semibold" id="coverage-heading">Coverage</h2>
      <dl className="mt-3 grid border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-7">
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
                "Actual - expected", "Avg price", "Market implied", "Avg edge", "Median P/L", "Best P/L", "Legacy P/L", "Final SP P/L", "Sample",
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
                <Cell value={returnSummary(family.metrics.medianMarketProfitLoss, family.metrics.medianMarketRoi, family.metrics.medianMarketSettled)} />
                <Cell value={returnSummary(family.metrics.bestBookmakerProfitLoss, family.metrics.bestBookmakerRoi, family.metrics.bestBookmakerSettled)} />
                <Cell value={returnSummary(family.metrics.legacyForecastProfitLoss, family.metrics.legacyForecastRoi, family.metrics.legacyForecastSettled)} />
                <Cell value={returnSummary(family.metrics.finalSpProfitLoss, family.metrics.finalSpRoi, family.metrics.finalSpSettled)} />
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
    ["Same leader", summary.tprTissueAgree],
    ["Different leader", summary.disagree],
    ["Large disagreements", summary.largeDisagreements],
    ["Both positive same horse", summary.bothPositiveSameHorse],
    ["Both positive different", summary.bothPositiveDifferentHorses],
    ["TPR positive only", summary.tprPositiveOnly],
    ["Tissue positive only", summary.tissuePositiveOnly],
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

export function TurfModelDisagreementExplainer({ diagnostics }: { diagnostics: TurfModelDisagreementDiagnostic[] }) {
  if (diagnostics.length === 0) return null;
  return (
    <section aria-labelledby="model-disagreement-heading" className="mt-8">
      <details className="border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-lg font-semibold text-slate-950" id="model-disagreement-heading">
          Why models disagree
        </summary>
        <div className="border-t border-slate-200 px-4 py-4">
          <p className="max-w-4xl text-xs leading-5 text-slate-600">
            Diagnostic only. Uses frozen prospective Turf observations and frozen Tissue v2 rows where available.
            No model, calibration, edge, selection, tracker, or betting-rule logic is changed.
          </p>
          <div className="mt-4 space-y-4">
            {diagnostics.map((diagnostic) => (
              <article className="border border-slate-200" key={`${diagnostic.race.raceId}:${diagnostic.race.recordedAt}`}>
                <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950">
                      {formatForwardValueRaceTime(diagnostic.race)} {diagnostic.race.course}{diagnostic.race.raceName ? ` - ${diagnostic.race.raceName}` : ""}
                    </h3>
                    <p className="mt-1 text-xs text-slate-600">
                      {classificationLabel(diagnostic.classification)} | prob diff {pp(diagnostic.probabilityDifferencePercentagePoints)} | edge diff {pp(diagnostic.edgeDifferencePercentagePoints)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase text-slate-700">
                    {diagnostic.largeDifference ? <span className="border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900">Large disagreement</span> : null}
                    <span className="border border-slate-300 bg-white px-2 py-1">Field {diagnostic.fieldSize ?? "-"}</span>
                  </div>
                </div>
                {diagnostic.sameHorse ? (
                  <SameHorseDiagnostic diagnostic={diagnostic} />
                ) : (
                  <div className="grid gap-0 md:grid-cols-2">
                    <DiagnosticHorsePanel
                      horse={diagnostic.tprHorse}
                      label="TPR selected"
                      model="tpr"
                      priceMovement={diagnostic.outcome.tprPriceMovement}
                    />
                    <DiagnosticHorsePanel
                      horse={diagnostic.tissueHorse}
                      label="Tissue selected"
                      model="tissue"
                      priceMovement={diagnostic.outcome.tissuePriceMovement}
                    />
                  </div>
                )}
                <div className="border-t border-slate-200 px-3 py-3 text-xs leading-5 text-slate-600">
                  <p>{diagnostic.contributionNote}</p>
                  <p className="mt-1">
                    Outcome: TPR {wonLabel(diagnostic.outcome.tprWon)}, Tissue {wonLabel(diagnostic.outcome.tissueWon)}, neither {yesNo(diagnostic.outcome.neitherWon)}.
                    Final SP TPR {decimal(diagnostic.outcome.tprFinalSp)}, Tissue {decimal(diagnostic.outcome.tissueFinalSp)}.
                    Movement TPR {pct(diagnostic.outcome.tprPriceMovement)}, Tissue {pct(diagnostic.outcome.tissuePriceMovement)}.
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </details>
    </section>
  );
}

function SameHorseDiagnostic({ diagnostic }: { diagnostic: TurfModelDisagreementDiagnostic }) {
  const tpr = diagnostic.tprHorse;
  const tissue = diagnostic.tissueHorse;
  const sharedMarket = tpr.capturedDecimalOdds != null &&
    tpr.capturedDecimalOdds === tissue.capturedDecimalOdds &&
    tpr.marketImpliedProbability === tissue.marketImpliedProbability;
  return (
    <div className="px-3 py-3">
      <h4 className="text-sm font-semibold text-slate-950">Horse: {tpr.horseName}</h4>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
        {sharedMarket ? (
          <>
            <dt className="text-slate-500">Market price</dt>
            <dd className="font-medium tabular-nums text-slate-900">{price(tpr.capturedPrice, tpr.capturedDecimalOdds)}</dd>
            <dt className="text-slate-500">Market implied</dt>
            <dd className="font-medium tabular-nums text-slate-900">{pct(tpr.marketImpliedProbability)}</dd>
          </>
        ) : (
          <>
            <dt className="text-slate-500">TPR market</dt>
            <dd className="font-medium tabular-nums text-slate-900">{price(tpr.capturedPrice, tpr.capturedDecimalOdds)} / {pct(tpr.marketImpliedProbability)}</dd>
            <dt className="text-slate-500">Tissue market</dt>
            <dd className="font-medium tabular-nums text-slate-900">{price(tissue.capturedPrice, tissue.capturedDecimalOdds)} / {pct(tissue.marketImpliedProbability)}</dd>
          </>
        )}
      </dl>
      <div className="mt-4 grid border-t border-slate-200 md:grid-cols-2">
        <ModelAssessment model="tpr" horse={tpr} />
        <ModelAssessment model="tissue" horse={tissue} />
      </div>
      <div className="border-t border-slate-200 pt-3 text-xs text-slate-700">
        <p className="font-semibold text-slate-900">Difference</p>
        <p className="mt-1">Probability {signedPp(tissue.tissueProbability, tpr.tprProbability)} Tissue vs TPR</p>
        <p>Edge {signedDifferencePp(tissue.edgePercentagePoints, tpr.edgePercentagePoints)} Tissue vs TPR</p>
      </div>
    </div>
  );
}

function ModelAssessment({ horse, model }: {
  horse: TurfModelDisagreementDiagnostic["tprHorse"];
  model: "tpr" | "tissue";
}) {
  const rows = model === "tpr" ? [
    ["Probability", pct(horse.tprProbability)],
    ["Edge", pp(horse.edgePercentagePoints)],
    ["TPR rank", nullable(horse.tprRank)],
    ["TPR score", decimal(horse.tprScore)],
    ["TPR rating gap", decimal(horse.tprGap)],
  ] : [
    ["Probability", pct(horse.tissueProbability)],
    ["Edge", pp(horse.edgePercentagePoints)],
    ["Tissue rank", nullable(horse.tissueRank)],
  ];
  return (
    <div className="py-3 md:px-3 md:first:pl-0 md:last:border-l md:last:border-slate-200">
      <h5 className="text-xs font-semibold uppercase text-slate-500">{model === "tpr" ? "TPR" : "Tissue"}</h5>
      <DiagnosticRows rows={rows} />
      {model === "tissue" ? (
        <p className="mt-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-700">Comment signals: </span>
          {horse.commentFeatures.length ? horse.commentFeatures.join(", ") : "-"}
        </p>
      ) : null}
    </div>
  );
}

function DiagnosticHorsePanel({ horse, label, model, priceMovement }: {
  horse: TurfModelDisagreementDiagnostic["tprHorse"];
  label: string;
  model: "tpr" | "tissue";
  priceMovement: number | null;
}) {
  const modelRows = model === "tpr" ? [
    ["TPR probability", pct(horse.tprProbability)],
    ["TPR rank", nullable(horse.tprRank)],
    ["TPR score", decimal(horse.tprScore)],
    ["TPR rating gap", decimal(horse.tprGap)],
  ] : [
    ["Tissue probability", pct(horse.tissueProbability)],
    ["Tissue rank", nullable(horse.tissueRank)],
  ];
  const rows = [
    ...modelRows,
    ["OR", nullable(horse.officialRating)],
    ["Speed latest/best/avg", triple(horse.latestSpeed, horse.bestSpeed, horse.averageSpeed)],
    ["Perf latest/best/avg", triple(horse.latestPerformance, horse.bestPerformance, horse.averagePerformance)],
    ["Trainer/Jockey SR", `${pctFromPercent(horse.trainerStrikeRate)} / ${pctFromPercent(horse.jockeyStrikeRate)}`],
    ["Price", price(horse.capturedPrice, horse.capturedDecimalOdds)],
    ["Market implied", pct(horse.marketImpliedProbability)],
    ["Edge", pp(horse.edgePercentagePoints)],
    ["Final SP", decimal(horse.finalSp)],
    ["Price movement", pct(priceMovement)],
  ];
  return (
    <div className="border-b border-slate-200 px-3 py-3 md:border-b-0 md:border-r md:last:border-r-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-xs font-semibold uppercase text-slate-500">{label}</h4>
          <p className="mt-1 text-sm font-semibold text-slate-950">{horse.horseName}</p>
        </div>
        <span className="whitespace-nowrap text-xs font-medium text-slate-700">{wonLabel(horse.won)}</span>
      </div>
      <DiagnosticRows rows={rows} />
      {model === "tissue" ? (
        <div className="mt-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-700">Comment signals: </span>
          {horse.commentFeatures.length ? horse.commentFeatures.join(", ") : "-"}
        </div>
      ) : null}
    </div>
  );
}

function DiagnosticRows({ rows }: { rows: string[][] }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {rows.map(([rowLabel, value]) => (
        <div className="contents" key={rowLabel}>
          <dt className="text-slate-500">{rowLabel}</dt>
          <dd className="text-right font-medium tabular-nums text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
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
                    {['Edge', 'Obs', 'Wins', 'Strike', 'Expected', 'Avg edge', 'Median P/L', 'Legacy P/L'].map((heading, index) => (
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
                      <EdgeBucketCell value={returnSummary(bucket.medianMarketProfitLoss, bucket.medianMarketRoi, bucket.medianMarketSettled)} />
                      <EdgeBucketCell value={returnSummary(bucket.legacyForecastProfitLoss, bucket.legacyForecastRoi, bucket.legacyForecastSettled)} />
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

export function PriceSnapshotDiagnostics({ observations, summary }: {
  observations: RecentProps["observations"];
  summary: ForwardValueSummary;
}) {
  const recent = [...observations]
    .filter((record) => record.recordedPreRace)
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
    .slice(0, 25);
  return (
    <section aria-labelledby="price-snapshot-heading" className="mt-8">
      <details className="border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-lg font-semibold text-slate-950" id="price-snapshot-heading">
          Price snapshot diagnostics
        </summary>
        <div className="border-t border-slate-200 px-4 py-4">
          <p className="text-xs text-slate-600">
            Current schedule: Early, T-180 (210-150 minutes), T-60 (90-30 minutes), Final SP. Legacy unversioned records retain T-15.
          </p>
          {summary.families.map((family) => {
            const diagnostics = family.priceDiagnostics.newSchedule;
            return (
              <div className="mt-5" key={family.family}>
                <h3 className="text-sm font-semibold text-slate-900">
                  {family.label} | {diagnostics.scheduleVersion} | {diagnostics.records} records
                </h3>
                <div className="mt-2 overflow-x-auto border border-slate-200">
                  <table className="w-full min-w-[760px] text-xs">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>{["Movement", "Comparable", "Mean", "Median", "Shortened", "Drifted", "Unchanged"].map((heading) => <th className="px-2 py-2 text-right first:text-left" key={heading}>{heading}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {([
                        ["Early -> T-180", diagnostics.movements.earlyToT180],
                        ["T-180 -> T-60", diagnostics.movements.t180ToT60],
                        ["T-60 -> Final SP", diagnostics.movements.t60ToFinalSp],
                        ["Early -> Final SP", diagnostics.movements.earlyToFinalSp],
                      ] as const).map(([label, value]) => (
                        <tr key={label}>
                          <th className="px-2 py-2 text-left font-medium">{label}</th>
                          <CompactCell value={value.observations} />
                          <CompactCell value={pct(value.meanMovement)} />
                          <CompactCell value={pct(value.medianMovement)} />
                          <CompactCell value={pct(value.shorteningProportion)} />
                          <CompactCell value={pct(value.driftingProportion)} />
                          <CompactCell value={pct(value.unchangedProportion)} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 overflow-x-auto border border-slate-200">
                  <table className="w-full min-w-[720px] text-xs">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>{["Positive edge persistence", "Source positive", "Comparable", "Still positive", "Neutral / negative"].map((heading) => <th className="px-2 py-2 text-right first:text-left" key={heading}>{heading}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {([
                        ["Early -> T-180", diagnostics.persistence.earlyToT180],
                        ["Early -> T-60", diagnostics.persistence.earlyToT60],
                        ["T-180 -> T-60", diagnostics.persistence.t180ToT60],
                      ] as const).map(([label, value]) => (
                        <tr key={label}>
                          <th className="px-2 py-2 text-left font-medium">{label}</th>
                          <CompactCell value={value.sourcePositiveObservations} />
                          <CompactCell value={value.comparableObservations} />
                          <CompactCell value={outcomeSummary(value.stillPositive)} />
                          <CompactCell value={outcomeSummary(value.turnedNonPositive)} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          <div className="mt-5 overflow-x-auto border border-slate-200">
            <table className="w-full min-w-[980px] text-xs">
              <thead className="bg-slate-100 text-slate-600">
                <tr>{["Race", "Schedule", "Early", "T-180", "T-60", "T-15", "Final SP"].map((heading) => <th className="px-2 py-2 text-left" key={heading}>{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {recent.map((record) => {
                  const current = record.priceSnapshotScheduleVersion === FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION;
                  return (
                    <tr key={`${record.raceId}:${record.recordedAt}`}>
                      <th className="px-2 py-2 text-left font-medium">{record.raceDate} {formatForwardValueRaceTime(record)} {record.course}</th>
                      <td className="px-2 py-2">{record.marketPriceBasisVersion === FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION
                        ? "Median bookmaker v1 | Early / T-180 / T-60 / SP"
                        : current ? "Legacy forecast | Early / T-180 / T-60 / SP" : "Legacy forecast | Early / T-60 / T-15 / SP"}</td>
                      <SnapshotCell snapshot={forwardValuePriceSnapshot(record, "early")} />
                      <SnapshotCell snapshot={current ? forwardValuePriceSnapshot(record, "t180") : null} />
                      <SnapshotCell snapshot={forwardValuePriceSnapshot(record, "t60")} />
                      <SnapshotCell snapshot={current ? null : forwardValuePriceSnapshot(record, "t15")} />
                      <CompactCell value={decimal(record.finalSp)} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </section>
  );
}

function SnapshotCell({ snapshot }: { snapshot: ReturnType<typeof forwardValuePriceSnapshot> }) {
  if (!snapshot) return <CompactCell value="-" />;
  const summary = `${snapshot.price ? `${snapshot.price} / ` : ""}${snapshot.decimalPrice.toFixed(2)} / ${pp(snapshot.ratingEdgePercentagePoints)}`;
  if (snapshot.marketPriceBasisVersion !== FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION) return <CompactCell value={summary} />;
  return (
    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
      <details>
        <summary className="cursor-pointer">{summary} ({snapshot.bookmakerQuoteCount ?? 0})</summary>
        <div className="mt-1 text-left text-[11px] leading-4 text-slate-600">
          <p>Best {price(snapshot.bestBookmakerPriceFractional ?? null, snapshot.bestBookmakerPriceDecimal ?? null)}{snapshot.bestBookmakerName ? ` ${snapshot.bestBookmakerName}` : ""}</p>
          <p>Forecast {price(snapshot.forecastPrice ?? null, snapshot.forecastDecimalPrice ?? null)}</p>
          {(snapshot.bookmakerQuotes ?? []).map((quote) => (
            <p key={`${quote.bookmakerId}:${quote.bookmakerName}:${quote.decimalOdds}`}>{quote.bookmakerName ?? quote.bookmakerId ?? "Unknown"}: {price(quote.fractionalOdds, quote.decimalOdds)}</p>
          ))}
        </div>
      </details>
    </td>
  );
}

function outcomeSummary(value: { observations: number; settledObservations: number; wins: number }) {
  return `${value.observations} (${value.wins}/${value.settledObservations} settled)`;
}

type RecentProps = {
  filters: ForwardValueObservationFilters;
  observations: Awaited<ReturnType<typeof loadForwardValueData>>["races"];
  reportingStatuses?: ReadonlyMap<string, ForwardValueReportingStatus>;
};

const recentObservationColumnWidths = [84, 46, 170, 52, 96, 64, 78, 66, 52, 96, 64, 78, 66, 52, 58, 56, 54, 48, 92];
const recentObservationHeadings = [
  "Date", "Time", "Course / race", "Family", "TPR horse", "TPR prob.", "TPR market price",
  "TPR mkt.", "TPR edge", "Tissue horse", "Tissue prob.", "Tissue market price",
  "Tissue mkt.", "Tissue edge", "Agree", "Fav.", "Result", "Basis P/L", "Status",
];
const recentObservationTableMinWidth = 1446;

export function RecentObservations({ filters, observations, reportingStatuses }: RecentProps) {
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
          <FilterSelect label="Status" name="state" value={filters.state} options={[["all", "All statuses"], ["settled", "Settled"], ["unsettled", "Unsettled"], ["excluded", "Excluded"], ["superseded", "Superseded"]]} />
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
                  <MarketPriceCell model="tpr" record={race} />
                  <CompactCell value={pct(race.capturedMarketProbability)} />
                  <CompactCell value={pp(race.edgePercentagePoints)} />
                  <HorseCell value={race.tissueHorseName ?? "-"} />
                  <CompactCell value={pct(race.tissueProbability)} />
                  <MarketPriceCell model="tissue" record={race} />
                  <CompactCell value={pct(race.tissueMarketProbability ?? null)} />
                  <CompactCell value={pp(race.tissueEdgePercentagePoints ?? null)} />
                  <CompactCell value={yesNo(race.tissueAgreesWithTpr)} />
                  <CompactCell value={yesNo(race.leaderIsMarketFavourite ?? race.agreesWithMarketFavourite)} />
                  <CompactCell value={resultLabel(race)} />
                  <CompactCell value={`${race.marketPriceBasisVersion === FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION ? "Median " : "Legacy "}${money(profitLoss)}`} />
                  <td className="px-2 py-2 font-medium leading-4" title={forwardValueObservationStatus(race, reportingStatuses?.get(race.raceId))}>
                    <span className="line-clamp-2 break-words">{forwardValueObservationStatus(race, reportingStatuses?.get(race.raceId))}</span>
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

function MarketPriceCell({ model, record }: {
  model: "tpr" | "tissue";
  record: RecentProps["observations"][number];
}) {
  const isTpr = model === "tpr";
  const displayed = price(
    isTpr ? record.capturedPrice : record.tissueCapturedPrice ?? null,
    isTpr ? record.capturedDecimalOdds : record.tissueCapturedDecimalOdds ?? null,
  );
  if (record.marketPriceBasisVersion !== FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION) {
    return <CompactCell value={displayed} />;
  }
  const quotes = isTpr ? record.bookmakerQuotes ?? [] : record.tissueBookmakerQuotes ?? [];
  const bestDecimal = isTpr ? record.bestBookmakerPriceDecimal ?? null : record.tissueBestBookmakerPriceDecimal ?? null;
  const bestFractional = isTpr ? record.bestBookmakerPriceFractional ?? null : record.tissueBestBookmakerPriceFractional ?? null;
  const bestName = isTpr ? record.bestBookmakerName ?? null : record.tissueBestBookmakerName ?? null;
  const forecast = price(
    isTpr ? record.forecastPrice ?? null : record.tissueForecastPrice ?? null,
    isTpr ? record.forecastDecimalPrice ?? null : record.tissueForecastDecimalPrice ?? null,
  );
  return (
    <td className="whitespace-nowrap px-2 py-2 text-center tabular-nums">
      <details>
        <summary className="cursor-pointer">{displayed}</summary>
        <div className="mt-1 text-left text-[11px] leading-4 text-slate-600">
          <p>Median bookmaker v1 ({quotes.length} quotes)</p>
          <p>Best {price(bestFractional, bestDecimal)}{bestName ? ` ${bestName}` : ""}</p>
          <p>Forecast {forecast}</p>
          {quotes.map((quote) => (
            <p key={`${quote.bookmakerId}:${quote.bookmakerName}:${quote.decimalOdds}`}>{quote.bookmakerName ?? quote.bookmakerId ?? "Unknown"}: {price(quote.fractionalOdds, quote.decimalOdds)}</p>
          ))}
        </div>
      </details>
    </td>
  );
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
    state: state === "settled" || state === "unsettled" || state === "excluded" || state === "superseded" ? state as ForwardValueObservationState : "all",
    edge: edge === "positive" || edge === "non_positive" ? edge as ForwardValueEdgeFilter : "all",
  };
}

function scalar(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function resultLabel(race: RecentProps["observations"][number]) { return race.settledAt === null ? "Pending" : race.leaderResultStatus === "non_runner" ? "Non-runner" : race.leaderWon ? "Won" : "Lost"; }
function classificationLabel(value: TurfModelDisagreementDiagnostic["classification"]) {
  if (value === "same_horse_similar_probability") return "A. same horse / similar probability";
  if (value === "same_horse_materially_different_probability") return "B. same horse / materially different probability";
  if (value === "different_horses_tpr_positive_only") return "C. different horses / TPR positive only";
  if (value === "different_horses_tissue_positive_only") return "D. different horses / Tissue positive only";
  if (value === "different_horses_both_positive") return "E. different horses / both positive";
  return "F. different horses / neither positive";
}
function edgeLabel(value: string) { return value.replace(">0-2pp", "> 0–2pp").replace(">2-5pp", "> 2–5pp").replace(">5-10pp", "> 5–10pp").replace(">10pp", "> 10pp"); }
function pct(value: number | null) { return value === null ? "-" : `${(value * 100).toFixed(1)}%`; }
function pctFromPercent(value: number | null) { return value === null ? "-" : `${value.toFixed(1)}%`; }
function pp(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}pp`; }
function signedPp(value: number | null, baseline: number | null) {
  return value === null || baseline === null ? "-" : pp((value - baseline) * 100);
}
function signedDifferencePp(value: number | null, baseline: number | null) {
  return value === null || baseline === null ? "-" : pp(value - baseline);
}
function decimal(value: number | null) { return value === null ? "-" : value.toFixed(2); }
function price(raw: string | null, decimalOdds: number | null) { return raw ? `${raw} (${decimal(decimalOdds)})` : decimal(decimalOdds); }
function signed(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}`; }
function money(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}`; }
function returnSummary(profitLoss: number | null, roi: number | null, observations: number) {
  return profitLoss === null ? "-" : `${money(profitLoss)} / ${pct(roi)} (n=${observations})`;
}
function nullable(value: number | null) { return value === null ? "-" : String(value); }
function triple(latest: number | null, best: number | null, average: number | null) {
  return `${decimal(latest)} / ${decimal(best)} / ${decimal(average)}`;
}
function yesNo(value: boolean | null) { return value === null ? "-" : value ? "Yes" : "No"; }
function wonLabel(value: boolean | null) { return value === null ? "Pending" : value ? "Won" : "Lost"; }

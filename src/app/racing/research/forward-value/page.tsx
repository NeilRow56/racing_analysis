import Link from "next/link";
import { createDbConnection } from "@/db";
import {
  capturedPriceProfitLoss,
  FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
  FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION,
  formatForwardValueRaceTime,
  forwardValuePriceSnapshot,
  isCleanPhase2Observation,
  loadForwardValueData,
  valueExclusionReason,
  type ForwardValueRecord,
} from "@/lib/racing/forward-value";
import {
  buildSameLeaderProbabilityGapDiagnostics,
  buildTurfModelDisagreementDiagnostics,
  buildForwardValueReportingScope,
  filterForwardValueObservations,
  forwardValueFamilyLabel,
  LARGE_PROBABILITY_GAP_PP,
  sameLeaderProbabilityGapPp,
  forwardValueObservationStatus,
  summarizeForwardValue,
  type SameLeaderProbabilityGapDiagnostics,
  type SameLeaderProbabilityGapOutcomeSummary,
  type TurfModelDisagreementDiagnostic,
  type ForwardValueEdgeFilter,
  type ForwardValueObservationFilters,
  type ForwardValueObservationState,
  type ForwardValueSummary,
  type ForwardValueReportingStatus,
  type TurfModelAgreementSummary,
} from "@/lib/racing/forward-value-summary";
import { getRacecardRowsForRaceIds, getSportingLifeCurrentCardRaceStatuses, groupTodaysRacingRows } from "@/lib/racing/todays-racing";
import { todayRaceHasConclusiveResult } from "@/lib/racing/today-race-status";
import { loadTissueForward, TISSUE_V2_CONFIG } from "@/lib/racing/tissue-forward";
import { RecentObservationsScroll } from "./recent-observations-scroll";
import { cleanAwTissueRace, loadAwTissueForward, type AwTissueForwardData, type AwTissueRace } from "@/lib/racing/aw-tissue-forward";
import { AwTissueValueSection, JumpTissueValueSection } from "./aw-tissue-value";
import { cleanJumpTissueRace, loadJumpTissueForward, type JumpTissueForwardData, type JumpTissueRace } from "@/lib/racing/jump-tissue-forward";
import type { SportingLifeBookmakerQuote } from "@/lib/racing/todays-racing";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ForwardValuePage({ searchParams }: PageProps) {
  const [data, tissueData, awTissueData, jumpTissueData, params] = await Promise.all([
    loadForwardValueData(),
    loadTissueForward(TISSUE_V2_CONFIG.forwardPath, TISSUE_V2_CONFIG),
    loadAwTissueForward(),
    loadJumpTissueForward(),
    searchParams,
  ]);
  const connection = createDbConnection();
  let currentCardStatuses;
  let canonicalResultRaceIds;
  try {
    const raceIds = data.races.map((race) => race.raceId);
    [currentCardStatuses, canonicalResultRaceIds] = await Promise.all([
      getSportingLifeCurrentCardRaceStatuses(connection.db, raceIds),
      getCanonicalResultRaceIds(connection.db, raceIds),
    ]);
  } finally {
    await connection.client.end();
  }
  const reportingScope = buildForwardValueReportingScope(data.races, currentCardStatuses);
  const filters = parseFilters(params);
  const summary = summarizeForwardValue(data, reportingScope);
  const disagreementDiagnostics = buildTurfModelDisagreementDiagnostics(reportingScope.analyticalRecords, tissueData).slice(0, 25);
  const diagnosticsRecords = filters.family === "all"
    ? reportingScope.analyticalRecords
    : reportingScope.analyticalRecords.filter((record) => record.family === filters.family);
  const observations = filterForwardValueObservations(data.races, filters, reportingScope).slice(0, 100);
  const probabilityGapDiagnostics = familyFilteredProbabilityGapDiagnostics(
    buildSameLeaderProbabilityGapDiagnostics(diagnosticsRecords, { aw: awTissueData, jump: jumpTissueData }),
    filters.family,
  );

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

        <TopLevelCounts summary={summary} syncRequiredCount={countPendingWithCanonicalResults(reportingScope.analyticalRecords, canonicalResultRaceIds)} />
        <FamilySummaryTable summary={summary} />
        <EdgeBucketTables summary={summary} />
        <PriceSnapshotDiagnostics observations={reportingScope.analyticalRecords} summary={summary} />
        <TurfModelAgreementCounts summary={summary.turfModelAgreement} />
        <SameLeaderProbabilityGapDiagnostics diagnostics={probabilityGapDiagnostics} />
        <TurfModelDisagreementExplainer diagnostics={disagreementDiagnostics} />
        <AwTissueValueSection data={awTissueData} ratings={reportingScope.analyticalRecords} />
        <JumpTissueValueSection data={jumpTissueData} ratings={reportingScope.analyticalRecords} />
        <RecentObservations
          filters={filters}
          observations={observations}
          tissueComparisons={buildFamilyTissueComparisons(observations, { aw: awTissueData, jump: jumpTissueData })}
          reportingStatuses={reportingScope.statusByRaceId}
          canonicalResultRaceIds={canonicalResultRaceIds}
        />
      </div>
    </main>
  );
}

async function getCanonicalResultRaceIds(
  db: ReturnType<typeof createDbConnection>["db"],
  raceIds: string[],
): Promise<ReadonlySet<string>> {
  const rows = await getRacecardRowsForRaceIds(db, raceIds);
  return new Set(groupTodaysRacingRows(rows).flatMap((meeting) =>
    meeting.races.filter(todayRaceHasConclusiveResult).map((race) => race.raceId)
  ));
}

function familyFilteredProbabilityGapDiagnostics(
  diagnostics: SameLeaderProbabilityGapDiagnostics,
  family: ForwardValueObservationFilters["family"],
): SameLeaderProbabilityGapDiagnostics {
  if (family === "all") return diagnostics;
  return {
    ...diagnostics,
    families: diagnostics.families.filter((entry) => entry.family === family),
  };
}

function countPendingWithCanonicalResults(
  records: ForwardValueRecord[],
  canonicalResultRaceIds: ReadonlySet<string>,
) {
  return records.filter((record) =>
    isCleanPhase2Observation(record) &&
    record.settledAt === null &&
    canonicalResultRaceIds.has(record.raceId)
  ).length;
}

export function SparseSampleWarning({ show }: { show: boolean }) {
  return show ? (
    <div className="mt-5 border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
      Sample is still too small for meaningful profitability conclusions.
    </div>
  ) : null;
}

export function TopLevelCounts({ summary, syncRequiredCount = 0 }: { summary: ForwardValueSummary; syncRequiredCount?: number }) {
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
      {syncRequiredCount > 0 ? (
        <p className="mt-2 border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          {syncRequiredCount} observations have results available but are awaiting tracker sync.
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

export function SameLeaderProbabilityGapDiagnostics({ diagnostics }: { diagnostics: SameLeaderProbabilityGapDiagnostics }) {
  const hasLargeGap = diagnostics.largeGapObservations.length > 0;
  return (
    <section aria-labelledby="probability-gap-heading" className="mt-8">
      <h2 className="text-lg font-semibold" id="probability-gap-heading">Same Leader Probability Gaps</h2>
      <p className="mt-1 text-xs text-slate-600">
        Diagnostic only. Same primary/Tissue leader with both probabilities present and gap at least {LARGE_PROBABILITY_GAP_PP.toFixed(0)}pp.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {diagnostics.families.map((family) => (
          <div className="border border-slate-200 bg-white px-3 py-3" key={family.family}>
            <h3 className="text-sm font-semibold text-slate-950">{family.label}</h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-slate-500">Same leader</dt>
              <dd className="text-right font-semibold tabular-nums">{family.sameLeaderComparableRaces}</dd>
              <dt className="text-slate-500">Large prob gap</dt>
              <dd className="text-right font-semibold tabular-nums">{family.largeProbabilityDisagreements}</dd>
              <dt className="text-slate-500">Rate</dt>
              <dd className="text-right font-semibold tabular-nums">{pct(family.largeProbabilityDisagreementRate)}</dd>
            </dl>
          </div>
        ))}
      </div>
      {hasLargeGap ? (
        <div className="mt-3 border border-slate-200 bg-white px-3 py-3">
          <div className="grid gap-4 lg:grid-cols-2">
            <ProbabilityGapOutcomeBlock title="Large-gap settled outcome" value={diagnostics.outcome} includeGap />
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Direction</h3>
              <CompactProbabilityGapTable rows={[
                ["Tissue higher", diagnostics.direction.tissue_higher],
                ["Primary higher", diagnostics.direction.primary_higher],
              ]} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Market Position</h3>
              <CompactProbabilityGapTable rows={[
                ["Below both", diagnostics.marketPosition.below_both],
                ["Between models", diagnostics.marketPosition.between_models],
                ["Above both", diagnostics.marketPosition.above_both],
              ]} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Edge Direction</h3>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-500">Primary negative / Tissue positive</dt>
                <dd className="text-right font-semibold tabular-nums">{diagnostics.edgeDirection.primary_negative_tissue_positive}</dd>
                <dt className="text-slate-500">Primary positive / Tissue negative</dt>
                <dd className="text-right font-semibold tabular-nums">{diagnostics.edgeDirection.primary_positive_tissue_negative}</dd>
                <dt className="text-slate-500">Both positive</dt>
                <dd className="text-right font-semibold tabular-nums">{diagnostics.edgeDirection.both_positive}</dd>
                <dt className="text-slate-500">Both negative</dt>
                <dd className="text-right font-semibold tabular-nums">{diagnostics.edgeDirection.both_negative}</dd>
              </dl>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-3 border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
          No same-leader probability gaps &gt;={LARGE_PROBABILITY_GAP_PP.toFixed(0)}pp yet.
        </p>
      )}
    </section>
  );
}

function ProbabilityGapOutcomeBlock({ title, value, includeGap = false }: {
  title: string;
  value: SameLeaderProbabilityGapOutcomeSummary;
  includeGap?: boolean;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-slate-500">Races</dt>
        <dd className="text-right font-semibold tabular-nums">{value.races}</dd>
        <dt className="text-slate-500">Winners</dt>
        <dd className="text-right font-semibold tabular-nums">{value.winners}</dd>
        <dt className="text-slate-500">Actual strike</dt>
        <dd className="text-right font-semibold tabular-nums">{pct(value.strikeRate)}</dd>
        <dt className="text-slate-500">Mean model prob</dt>
        <dd className="text-right font-semibold tabular-nums">{pct(value.meanModelProbability)}</dd>
        <dt className="text-slate-500">Mean Tissue prob</dt>
        <dd className="text-right font-semibold tabular-nums">{pct(value.meanTissueProbability)}</dd>
        <dt className="text-slate-500">Mean market implied</dt>
        <dd className="text-right font-semibold tabular-nums">{pct(value.meanMarketImpliedProbability)}</dd>
        {includeGap ? (
          <>
            <dt className="text-slate-500">Mean absolute gap</dt>
            <dd className="text-right font-semibold tabular-nums">{ppUnsigned(value.meanAbsoluteProbabilityGapPp)}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

function CompactProbabilityGapTable({ rows }: { rows: Array<[string, SameLeaderProbabilityGapOutcomeSummary]> }) {
  return (
    <div className="mt-2 overflow-x-auto border border-slate-200">
      <table className="w-full min-w-[520px] text-xs">
        <thead className="bg-slate-100 text-slate-600">
          <tr>{["Group", "Races", "Winners", "Strike", "Model", "Tissue", "Market"].map((heading) => <th className="px-2 py-2 text-right first:text-left" key={heading}>{heading}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th className="px-2 py-2 text-left font-medium">{label}</th>
              <CompactCell value={value.races} />
              <CompactCell value={value.winners} />
              <CompactCell value={pct(value.strikeRate)} />
              <CompactCell value={pct(value.meanModelProbability)} />
              <CompactCell value={pct(value.meanTissueProbability)} />
              <CompactCell value={pct(value.meanMarketImpliedProbability)} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
              <table className="w-full min-w-[820px] table-fixed text-xs">
                <EdgeBucketColGroup />
                <thead className="bg-slate-100 text-[9px] uppercase tracking-normal text-slate-600">
                  <tr>
                    {edgeBucketColumns.map((column, index) => (
                      <th
                        className={`${column.align === "left" ? "text-left" : "text-right"} whitespace-nowrap px-2 py-2 font-semibold leading-3 ${index === 0 ? "sticky left-0 z-10 bg-slate-100 shadow-[1px_0_0_0_rgb(203_213_225)]" : ""}`}
                        key={column.heading}
                      >
                        {column.heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {family.edgeBuckets.map((bucket) => (
                    <tr key={bucket.band}>
                      <th className="sticky left-0 z-10 whitespace-nowrap bg-white px-2 py-2 text-left font-medium shadow-[1px_0_0_0_rgb(226_232_240)]">{edgeLabel(bucket.band)}</th>
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

const edgeBucketColumns = [
  { heading: "Edge", width: 104, align: "left" },
  { heading: "Obs", width: 70, align: "right" },
  { heading: "Wins", width: 70, align: "right" },
  { heading: "Strike", width: 82, align: "right" },
  { heading: "Expected", width: 92, align: "right" },
  { heading: "Avg edge", width: 92, align: "right" },
  { heading: "Median P/L", width: 150, align: "right" },
  { heading: "Legacy P/L", width: 160, align: "right" },
] as const;

function EdgeBucketColGroup() {
  return (
    <colgroup>
      {edgeBucketColumns.map((column) => (
        <col key={column.heading} style={{ width: column.width }} />
      ))}
    </colgroup>
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
  tissueComparisons?: ReadonlyMap<string, FamilyTissueComparison>;
  reportingStatuses?: ReadonlyMap<string, ForwardValueReportingStatus>;
  canonicalResultRaceIds?: ReadonlySet<string>;
};

const recentObservationColumnWidths = [84, 46, 170, 52, 96, 64, 78, 66, 52, 96, 64, 78, 66, 52, 58, 56, 54, 48, 92];
const recentObservationHeadings = [
  "Date", "Time", "Course / race", "Family", "Model horse", "Model prob.", "Model market price",
  "Model mkt.", "Model edge", "Tissue horse", "Tissue prob.", "Tissue market price",
  "Tissue mkt.", "Tissue edge", "Agree", "Fav.", "Result", "Basis P/L", "Status",
];
const recentObservationTableMinWidth = 1446;

type FamilyTissueComparison = {
  runnerId: string | null;
  horseName: string | null;
  probability: number | null;
  agreesWithModel: boolean | null;
  capturedPrice: string | null;
  capturedDecimalOdds: number | null;
  marketProbability: number | null;
  edgePercentagePoints: number | null;
  priceCapturedAt: string | null;
  forecastPrice: string | null;
  forecastDecimalPrice: number | null;
  bookmakerQuotes: SportingLifeBookmakerQuote[];
  bestBookmakerPriceDecimal: number | null;
  bestBookmakerPriceFractional: string | null;
  bestBookmakerName: string | null;
};

type FamilyTissueSources = {
  aw?: AwTissueForwardData;
  jump?: JumpTissueForwardData;
};

export function buildFamilyTissueComparisons(
  observations: readonly ForwardValueRecord[],
  sources: FamilyTissueSources,
): ReadonlyMap<string, FamilyTissueComparison> {
  const comparisons = new Map<string, FamilyTissueComparison>();
  for (const record of observations) {
    if (record.family === "turf") {
      comparisons.set(record.raceId, turfTissueComparison(record));
      continue;
    }
    const race = record.family === "jump"
      ? sources.jump?.races.find((candidate) => candidate.raceId === record.raceId)
      : sources.aw?.races.find((candidate) => candidate.raceId === record.raceId);
    if (!race) continue;
    const clean = record.family === "jump"
      ? cleanJumpTissueRace(race as JumpTissueRace)
      : cleanAwTissueRace(race as AwTissueRace);
    if (!clean) continue;
    const comparison = record.family === "jump"
      ? trackerTissueComparison(record, race as JumpTissueRace)
      : trackerTissueComparison(record, race as AwTissueRace);
    if (comparison) comparisons.set(record.raceId, comparison);
  }
  return comparisons;
}

function turfTissueComparison(record: ForwardValueRecord): FamilyTissueComparison {
  return {
    runnerId: record.tissueRunnerId,
    horseName: record.tissueHorseName,
    probability: record.tissueProbability,
    agreesWithModel: record.tissueAgreesWithTpr,
    capturedPrice: record.tissueCapturedPrice ?? null,
    capturedDecimalOdds: record.tissueCapturedDecimalOdds ?? null,
    marketProbability: record.tissueMarketProbability ?? null,
    edgePercentagePoints: record.tissueEdgePercentagePoints ?? null,
    priceCapturedAt: record.tissuePriceCapturedAt ?? null,
    forecastPrice: record.tissueForecastPrice ?? null,
    forecastDecimalPrice: record.tissueForecastDecimalPrice ?? null,
    bookmakerQuotes: record.tissueBookmakerQuotes ?? [],
    bestBookmakerPriceDecimal: record.tissueBestBookmakerPriceDecimal ?? null,
    bestBookmakerPriceFractional: record.tissueBestBookmakerPriceFractional ?? null,
    bestBookmakerName: record.tissueBestBookmakerName ?? null,
  };
}

function trackerTissueComparison(record: ForwardValueRecord, race: AwTissueRace | JumpTissueRace): FamilyTissueComparison | null {
  const runner = race.runners.find((candidate) => candidate.runnerId === race.top1);
  if (!runner || runner.probability === null) return null;
  const priceSnapshot = race.prices.t60 ?? race.prices.t180 ?? race.prices.early;
  return {
    runnerId: runner.runnerId,
    horseName: runner.horseName,
    probability: runner.probability,
    agreesWithModel: race.top1 === null ? null : race.top1 === record.leaderRunnerId,
    capturedPrice: priceSnapshot?.price ?? null,
    capturedDecimalOdds: priceSnapshot?.marketPriceBasisVersion === FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION ? priceSnapshot.decimalPrice : null,
    marketProbability: priceSnapshot?.marketPriceBasisVersion === FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION ? priceSnapshot.impliedProbability : null,
    edgePercentagePoints: priceSnapshot?.marketPriceBasisVersion === FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION ? (runner.probability - priceSnapshot.impliedProbability) * 100 : null,
    priceCapturedAt: priceSnapshot?.marketPriceBasisVersion === FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION ? priceSnapshot.capturedAt : null,
    forecastPrice: priceSnapshot?.forecastPrice ?? null,
    forecastDecimalPrice: priceSnapshot?.forecastDecimalPrice ?? null,
    bookmakerQuotes: priceSnapshot?.bookmakerQuotes ?? [],
    bestBookmakerPriceDecimal: priceSnapshot?.bestBookmakerPriceDecimal ?? null,
    bestBookmakerPriceFractional: priceSnapshot?.bestBookmakerPriceFractional ?? null,
    bestBookmakerName: priceSnapshot?.bestBookmakerName ?? null,
  };
}

export function RecentObservations({ filters, observations, tissueComparisons, reportingStatuses, canonicalResultRaceIds = new Set() }: RecentProps) {
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
              const tissueComparison = tissueComparisons?.get(race.raceId) ?? turfTissueComparison(race);
              return (
                <tr className={exclusion ? "bg-slate-50 text-slate-600" : ""} key={`${race.raceId}:${race.recordedAt}`}>
                  <td className="whitespace-nowrap px-2 py-2 tabular-nums">{race.raceDate}</td>
                  <td className="whitespace-nowrap px-2 py-2 tabular-nums">{formatForwardValueRaceTime(race)}</td>
                  <td className="px-2 py-2" title={raceDescription}>
                    <span className="line-clamp-2 break-words font-medium leading-4">{raceDescription}</span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 font-medium" title={familyTissueHelp(race.family)}>{forwardValueFamilyLabel(race.family)}</td>
                  <td className="px-2 py-2 font-medium leading-4" title={race.leaderHorseName}>
                    <span className="line-clamp-2 break-words">{race.leaderHorseName}</span>
                    {race.family === "turf" && race.leaderTprConfidence ? (
                      <details className="mt-1 text-[11px] font-normal text-slate-600">
                        <summary className="cursor-pointer">TPR context</summary>
                        <div className="mt-1 space-y-0.5">
                          <p>{race.leaderTprConfidence.historyDepthLabel}</p>
                          {race.leaderTprConfidence.limitedHistory ? <p className="text-amber-700">Limited history</p> : null}
                          {race.leaderTprConfidence.staleTurfEvidence ? <p className="text-amber-700">Stale Turf evidence</p> : null}
                          <p>Days since usable Turf run: {race.leaderTprConfidence.daysSinceUsableTurfRun ?? "-"}</p>
                        </div>
                      </details>
                    ) : null}
                  </td>
                  <CompactCell value={pct(race.calibratedProbability)} />
                  <MarketPriceCell model="tpr" record={race} />
                  <CompactCell value={pct(race.capturedMarketProbability)} />
                  <CompactCell value={pp(race.edgePercentagePoints)} />
                  <HorseCell value={tissueComparison.horseName ?? "-"} />
                  <CompactCell value={pct(tissueComparison.probability)} />
                  <MarketPriceCell model="tissue" record={race} tissueComparison={tissueComparison} />
                  <CompactCell value={pct(tissueComparison.marketProbability)} />
                  <CompactCell value={pp(tissueComparison.edgePercentagePoints)} />
                  <AgreeCell
                    modelProbability={race.calibratedProbability}
                    tissueComparison={tissueComparison}
                  />
                  <CompactCell value={yesNo(race.leaderIsMarketFavourite ?? race.agreesWithMarketFavourite)} />
                  <CompactCell value={resultLabel(race, canonicalResultRaceIds)} />
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
  return <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{value}</td>;
}

function CompactCell({ value }: { value: number | string }) {
  return <td className="whitespace-nowrap px-2 py-2 text-center tabular-nums">{value}</td>;
}

function AgreeCell({ modelProbability, tissueComparison }: {
  modelProbability: number | null;
  tissueComparison: FamilyTissueComparison;
}) {
  const gap = sameLeaderProbabilityGapPp({
    agreesWithModel: tissueComparison.agreesWithModel,
    modelProbability,
    tissueProbability: tissueComparison.probability,
  });
  const label = gap !== null && gap >= LARGE_PROBABILITY_GAP_PP ? `${yesNo(tissueComparison.agreesWithModel)} Δ ${gap.toFixed(1)}pp` : yesNo(tissueComparison.agreesWithModel);
  const title = gap === null || tissueComparison.probability === null || modelProbability === null
    ? undefined
    : `Model ${(modelProbability * 100).toFixed(1)}% vs Tissue ${(tissueComparison.probability * 100).toFixed(1)}% - gap ${gap.toFixed(1)}pp`;
  return <td className="whitespace-nowrap px-2 py-2 text-center tabular-nums" title={title}>{label}</td>;
}

function MarketPriceCell({ model, record, tissueComparison }: {
  model: "tpr" | "tissue";
  record: RecentProps["observations"][number];
  tissueComparison?: FamilyTissueComparison;
}) {
  const isTpr = model === "tpr";
  const displayed = price(
    isTpr ? record.capturedPrice : tissueComparison?.capturedPrice ?? record.tissueCapturedPrice ?? null,
    isTpr ? record.capturedDecimalOdds : tissueComparison?.capturedDecimalOdds ?? record.tissueCapturedDecimalOdds ?? null,
  );
  const isMedianBookmaker = isTpr
    ? record.marketPriceBasisVersion === FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION
    : tissueComparison
      ? tissueComparison.capturedDecimalOdds !== null
      : record.marketPriceBasisVersion === FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION;
  if (!isMedianBookmaker) {
    return <CompactCell value={displayed} />;
  }
  const quotes = isTpr ? record.bookmakerQuotes ?? [] : tissueComparison?.bookmakerQuotes ?? record.tissueBookmakerQuotes ?? [];
  const bestDecimal = isTpr ? record.bestBookmakerPriceDecimal ?? null : tissueComparison?.bestBookmakerPriceDecimal ?? record.tissueBestBookmakerPriceDecimal ?? null;
  const bestFractional = isTpr ? record.bestBookmakerPriceFractional ?? null : tissueComparison?.bestBookmakerPriceFractional ?? record.tissueBestBookmakerPriceFractional ?? null;
  const bestName = isTpr ? record.bestBookmakerName ?? null : tissueComparison?.bestBookmakerName ?? record.tissueBestBookmakerName ?? null;
  const forecast = price(
    isTpr ? record.forecastPrice ?? null : tissueComparison?.forecastPrice ?? record.tissueForecastPrice ?? null,
    isTpr ? record.forecastDecimalPrice ?? null : tissueComparison?.forecastDecimalPrice ?? record.tissueForecastDecimalPrice ?? null,
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
function familyTissueHelp(family: ForwardValueRecord["family"]) {
  if (family === "turf") return "TPR compares with Turf Tissue";
  if (family === "jump") return "JPR-A compares with Jump Tissue";
  return "AW-D compares with AW Tissue";
}
function resultLabel(race: RecentProps["observations"][number], canonicalResultRaceIds: ReadonlySet<string>) {
  if (race.settledAt !== null) return race.leaderResultStatus === "non_runner" ? "Non-runner" : race.leaderWon ? "Won" : "Lost";
  return canonicalResultRaceIds.has(race.raceId) ? "Pending - tracker sync required" : "Pending";
}
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
function ppUnsigned(value: number | null) { return value === null ? "-" : `${value.toFixed(1)}pp`; }
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

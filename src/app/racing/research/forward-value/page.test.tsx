import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getTprConfidenceContext } from "@/lib/racing/tpr-confidence-context";
import { FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION, FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION, type ForwardValueData, type ForwardValueRecord } from "@/lib/racing/forward-value";
import {
  buildSameLeaderProbabilityGapDiagnostics,
  buildForwardValueReportingScope,
  buildTurfModelDisagreementDiagnostics,
  filterForwardValueObservations,
  LARGE_PROBABILITY_GAP_PP,
  sameLeaderProbabilityGapPp,
  summarizeForwardValue,
  summarizeForwardValuePriceDiagnostics,
  summarizeTurfModelAgreement,
  turfModelDisagreementClassification,
  turfModelDisagreementLargeDifference,
} from "@/lib/racing/forward-value-summary";
import {
  buildFamilyTissueComparisons,
  EdgeBucketTables,
  FamilySummaryTable,
  PriceSnapshotDiagnostics,
  RecentObservations,
  SameLeaderProbabilityGapDiagnostics,
  SparseSampleWarning,
  TopLevelCounts,
  TurfModelDisagreementExplainer,
  TurfModelAgreementCounts,
} from "./page";
import { AwTurfChallengerSection } from "./aw-turf-challenger";
import { DailyResearchDashboard } from "./research-dashboard";
import { emptyAwTissuePairedForward, type AwTissuePairedForwardData } from "@/lib/racing/aw-tissue-paired-forward";
import { emptyAwTissueForward, type AwTissueForwardData, type AwTissueRace } from "@/lib/racing/aw-tissue-forward";
import { emptyJumpTissueForward, type JumpTissueForwardData, type JumpTissueRace } from "@/lib/racing/jump-tissue-forward";
import {
  hasHorizontalOverflow,
  shouldShowStickyScrollbar,
  synchronizeHorizontalScroll,
} from "./recent-observations-scroll";

describe("Forward Value dashboard", () => {
  const data = fixtureData();

  test("AW challenger research is rendered as a secondary section", () => {
    const paired: AwTissuePairedForwardData = {
      ...emptyAwTissuePairedForward(),
      races: [{
        raceId: "aw-pair-race",
        sourceId: null,
        raceDate: "2026-10-09",
        course: "Kempton",
        raceName: null,
        scheduledTime: "18:30",
        scheduledOffAt: "2026-10-09T17:30:00.000Z",
        currentOffAt: "2026-10-09T17:30:00.000Z",
        firstCapturedAt: "2026-10-09T08:00:00.000Z",
        runners: [],
        awTissue: { modelVersion: "aw", modelHash: "aw-hash", probabilities: [], rankOrder: [], rank1RunnerId: "aw-runner", rank1HorseName: "AW Leader", rank1Probability: .32, valueQualified: null, selectedPriceProfitLoss: null },
        turfArch: { modelVersion: "turf", modelHash: "turf-hash", probabilities: [], rankOrder: [], rank1RunnerId: "turf-runner", rank1HorseName: "Turf Leader", rank1Probability: .28, valueQualified: null, selectedPriceProfitLoss: null },
        rank1Agreement: false,
        classification: "DISAGREE",
        valueBucket: "NEITHER_VALUE",
        prices: { firstAvailable: { awTissue: null, turfArch: null }, earlyMorning: { awTissue: null, turfArch: null }, late: { awTissue: null, turfArch: null }, finalPreRace: { awTissue: null, turfArch: null }, sp: { awTissue: null, turfArch: null } },
        winners: [],
        settledAt: null,
        excludedReason: null,
      }],
    };

    const html = renderToStaticMarkup(<AwTurfChallengerSection data={paired} date="2026-10-09" />);

    assert.match(html, /AW TURF-ARCHITECTURE CHALLENGER/);
    assert.match(html, /Tracked today/);
    assert.match(html, /Disagree/);
    assert.match(html, /AW Leader/);
    assert.match(html, /Turf Leader/);
    assert.match(html, /DIFFERS FROM AW TISSUE/);
    assert.match(html, /text-slate-500">AW Tissue #1: AW Leader/);
    assert.match(html, /Pending/);
    assert.doesNotMatch(html, /CHALLENGER VALUE<\/span>/);
    assert.match(html, /<section aria-labelledby="aw-turf-challenger-heading"/);
    assert.match(html, /text-sm font-semibold text-slate-700/);

    const record = paired.races[0]!;
    for (const valueQualified of [false, null, true]) {
      const variant = { ...paired, races: [{ ...record, rank1Agreement: true, classification: "AGREE" as const, turfArch: { ...record.turfArch, valueQualified } }] };
      const agreementHtml = renderToStaticMarkup(<AwTurfChallengerSection data={variant} date="2026-10-09" />);
      assert.match(agreementHtml, /AGREES WITH AW TISSUE/);
      assert.doesNotMatch(agreementHtml, /AW Tissue #1:/);
      assert.equal(agreementHtml.includes("CHALLENGER VALUE</span>"), valueQualified === true);
      assert.match(agreementHtml, /Turf Leader/);
    }

    const primary = <DailyResearchDashboard dashboard={{ date: "2026-10-09", emptyMessage: null, monitors: [], horses: [{ raceId: record.raceId, runnerId: "aw-runner", horseId: "aw-horse", horseName: "AW Leader", course: "Kempton", time: "18:30", sortTime: "", price: 4, priceSource: "imported_card", signals: [{ kind: "aw_tissue", reason: "VALUE", context: "Rank #1", movement: null }] }] }} />;
    const primaryHtml = renderToStaticMarkup(primary);
    const combinedHtml = renderToStaticMarkup(<DailyResearchDashboard dashboard={primary.props.dashboard}><AwTurfChallengerSection data={paired} date="2026-10-09" /></DailyResearchDashboard>);
    assert.equal(combinedHtml.slice(0, combinedHtml.indexOf('<section aria-labelledby="aw-turf-challenger-heading"')), primaryHtml.slice(0, primaryHtml.indexOf('<details')));
    assert.doesNotMatch(primaryHtml, /Turf Leader|CHALLENGER/);
    assert.equal(primaryHtml.match(/AW Leader/g)?.length, 1);
    assert.ok(combinedHtml.indexOf("tissue-value-heading") < combinedHtml.indexOf("aw-turf-challenger-heading"));
    assert.ok(combinedHtml.indexOf("aw-turf-challenger-heading") < combinedHtml.indexOf("Research shadows and disagreement signals"));
  });

  test("summary counts match tracker classifications", () => {
    const summary = summarizeForwardValue(data);
    assert.equal(summary.totalProspectiveObservations, 4);
    assert.equal(summary.cleanSettledObservations, 2);
    assert.equal(summary.unsettledObservations, 1);
    assert.equal(summary.excludedObservations, 1);
    assert.equal(summary.earliestObservationDate, "2026-09-25");
    assert.equal(summary.latestObservationDate, "2026-09-27");
  });

  test("prospective TPR context is confined to expanded details and leaves summaries unchanged", () => {
    const annotated = { ...data, races: data.races.map((race, i) => i === 0 ? {
      ...race,
      leaderTprConfidence: getTprConfidenceContext([{ raceDateTime: new Date("2025-01-01"), resultStatus: "finished", finishingPosition: 4, weightCarriedLbs: 135, turfSpeedRating: { rating: 100 } }], new Date("2026-09-27")),
    } : race) };
    assert.deepEqual(summarizeForwardValue(annotated), summarizeForwardValue(data));
    const html = renderToStaticMarkup(<RecentObservations filters={{ family: "all", state: "all", edge: "all" }} observations={annotated.races} />);
    assert.match(html, /<details[^>]*><summary[^>]*>TPR context<\/summary>/);
    assert.match(html, /Limited history/);
    assert.match(html, /Stale Turf evidence/);
    assert.match(html, /Days since usable Turf run/);
    const legacy = renderToStaticMarkup(<RecentObservations filters={{ family: "all", state: "all", edge: "all" }} observations={data.races} />);
    assert.doesNotMatch(legacy, /TPR context|Limited history|Stale Turf evidence/);
  });

  test("reconciles replacement race versions in reporting without mutating tracker records", () => {
    const pairs = [
      ["17:35", "17:39", "SIS Maiden"],
      ["17:00", "17:04", "Paddy Woods Memorial"],
      ["16:25", "16:29", "Gannon City Handicap"],
    ] as const;
    const races = pairs.flatMap(([currentTime, staleTime, raceName], index) => [
      record({
        raceId: `stale-${index}`,
        raceDate: "2026-09-30",
        raceDateTime: `2026-09-30T${String(Number(staleTime.slice(0, 2)) - 1).padStart(2, "0")}:${staleTime.slice(3)}:00Z`,
        raceTime: staleTime,
        course: "Bellewstown",
        raceName,
        leaderWon: false,
        capturedPriceProfitLoss: -1,
        ...(index === 0 ? {
          phase2ExclusionReason: "missing_price" as const,
          capturedPrice: null,
          capturedDecimalOdds: null,
          capturedMarketProbability: null,
          edgePercentagePoints: null,
        } : {}),
      }),
      record({
        raceId: `current-${index}`,
        raceDate: "2026-09-30",
        raceDateTime: `2026-09-30T${String(Number(currentTime.slice(0, 2)) - 1).padStart(2, "0")}:${currentTime.slice(3)}:00Z`,
        raceTime: currentTime,
        course: "Bellewstown",
        raceName,
      }),
    ]);
    const before = JSON.stringify(races);
    const scope = buildForwardValueReportingScope(races, {
      currentReplacementRaceIds: new Set(["current-0", "current-1", "current-2"]),
      supersededRaceIds: new Set(["stale-0", "stale-1", "stale-2"]),
    });
    const value = { ...data, races };
    const summary = summarizeForwardValue(value, scope);

    assert.equal(summary.rawObservations, 6);
    assert.equal(summary.totalProspectiveObservations, 3);
    assert.equal(summary.supersededRaceVersions, 3);
    assert.equal(summary.excludedObservations, 0);
    assert.equal(summary.families.find((family) => family.family === "turf")!.metrics.profitLoss, 12);
    assert.deepEqual(
      filterForwardValueObservations(races, { family: "all", state: "all", edge: "all" }, scope)
        .map((race) => race.raceId).sort(),
      ["current-0", "current-1", "current-2"],
    );
    const superseded = filterForwardValueObservations(
      races,
      { family: "all", state: "superseded", edge: "all" },
      scope,
    );
    assert.deepEqual(superseded.map((race) => race.raceId).sort(), ["stale-0", "stale-1", "stale-2"]);
    assert.equal(JSON.stringify(races), before);
    const analytical = filterForwardValueObservations(
      races,
      { family: "all", state: "all", edge: "all" },
      scope,
    );

    const coverage = renderToStaticMarkup(<TopLevelCounts summary={summary} />);
    assert.match(coverage, /Superseded/);
    assert.match(coverage, />3</);
    const audit = renderToStaticMarkup(
      <RecentObservations
        filters={{ family: "all", state: "superseded", edge: "all" }}
        observations={superseded}
        reportingStatuses={scope.statusByRaceId}
      />,
    );
    assert.match(audit, /Superseded race version/);
    assert.match(audit, /17:39/);
    assert.match(audit, /17:04/);
    assert.match(audit, /16:29/);
    assert.doesNotMatch(audit, /17:35/);
    const normal = renderToStaticMarkup(
      <RecentObservations
        filters={{ family: "all", state: "all", edge: "all" }}
        observations={analytical}
        reportingStatuses={scope.statusByRaceId}
      />,
    );
    assert.match(normal, /17:35/);
    assert.match(normal, /17:00/);
    assert.match(normal, /16:25/);
    assert.doesNotMatch(normal, /17:39/);
  });

  test("family filter returns only the requested rating family", () => {
    const filtered = filterForwardValueObservations(data.races, { family: "turf", state: "all", edge: "all" });
    assert.equal(filtered.length, 2);
    assert.ok(filtered.every((race) => race.family === "turf"));
  });

  test("uses frozen edge bucket assignment in family summaries", () => {
    const turf = summarizeForwardValue(data).families.find((family) => family.family === "turf")!;
    assert.equal(turf.edgeBuckets.find((bucket) => bucket.band === ">10pp")!.observations, 1);
    assert.equal(turf.edgeBuckets.find((bucket) => bucket.band === "<=0pp")!.observations, 1);
  });

  test("renders readable Edge Bucket tables with internal overflow", () => {
    const html = renderToStaticMarkup(<EdgeBucketTables summary={summarizeForwardValue(data)} />);
    assert.equal(html.match(/data-testid="edge-bucket-scroll"/g)?.length, 3);
    assert.equal(html.match(/min-w-\[820px\] table-fixed text-xs/g)?.length, 3);
    assert.equal(html.match(/overflow-x-auto/g)?.length, 3);
    assert.doesNotMatch(html, /min-w-\[420px\]/);
    assert.match(html, /sticky left-0 z-10 bg-slate-100/);
    assert.match(html, /sticky left-0 z-10 whitespace-nowrap bg-white/);
    assert.match(html, /whitespace-nowrap px-2 py-2 text-right tabular-nums/);
    assert.match(html, /Median P\/L/);
    assert.match(html, /Legacy P\/L/);
    assert.match(html, /&gt; 10pp/);
  });

  test("summarizes immutable price snapshots without counting missing stages", () => {
    const diagnostics = summarizeForwardValue(data).families.find((family) => family.family === "turf")!.priceDiagnostics;
    assert.equal(diagnostics.legacy.snapshots.early.observations, 2);
    assert.equal(diagnostics.legacy.snapshots.t60.observations, 1);
    assert.equal(diagnostics.legacy.snapshots.t15.observations, 1);
    assert.equal(diagnostics.legacy.persistence.earlyToT60.comparableObservations, 1);
    assert.equal(diagnostics.legacy.persistence.earlyToT60.stillPositive.wins, 1);
    assert.ok(Math.abs((diagnostics.legacy.movements.earlyToT60.meanMovement ?? 0) - -.2) < 1e-9);
    assert.ok(Math.abs((diagnostics.legacy.movements.t15ToFinalSp.meanMovement ?? 0) - .2) < 1e-9);
  });

  test("reports new-schedule price movement including median and unchanged rates", () => {
    const diagnostics = summarizeForwardValuePriceDiagnostics([
      newScheduleRecord("shortened", 5, 4, 3, 2),
      newScheduleRecord("unchanged", 4, 4, 4, 4),
      newScheduleRecord("drifted", 2, 3, 4, 5),
    ]).newSchedule;
    assert.equal(diagnostics.records, 3);
    assert.equal(diagnostics.snapshots.t180.observations, 3);
    assert.equal(diagnostics.movements.earlyToT180.observations, 3);
    assert.equal(diagnostics.movements.earlyToT180.medianMovement, 0);
    assert.equal(diagnostics.movements.earlyToT180.shorteningProportion, 1 / 3);
    assert.equal(diagnostics.movements.earlyToT180.driftingProportion, 1 / 3);
    assert.equal(diagnostics.movements.earlyToT180.unchangedProportion, 1 / 3);
    assert.equal(diagnostics.movements.earlyToFinalSp.observations, 3);
  });

  test("renders new and legacy snapshot schedules without relabelling T-15", () => {
    const current = newScheduleRecord("current-schedule", 5, 4, 3, 2);
    const legacy = record({
      raceId: "legacy-schedule",
      t15PriceSnapshot: {
        decimalPrice: 3,
        impliedProbability: 1 / 3,
        capturedAt: "2026-09-27T12:45:00Z",
        minutesBeforeScheduledOff: 15,
        ratingProbability: .4,
        ratingEdgePercentagePoints: 40 - 100 / 3,
      },
    });
    const scheduleData = { ...fixtureData(), races: [current, legacy] };
    const html = renderToStaticMarkup(
      <PriceSnapshotDiagnostics observations={scheduleData.races} summary={summarizeForwardValue(scheduleData)} />,
    );
    assert.match(html, /early_t180_t60_v1/);
    assert.match(html, /T-180 \(210-150 minutes\)/);
    assert.match(html, /Early \/ T-180 \/ T-60 \/ SP/);
    assert.match(html, /Legacy forecast \| Early \/ T-60 \/ T-15 \/ SP/);
    assert.match(html, /T-15/);
  });

  test("labels median-bookmaker rows and exposes quote provenance", () => {
    const current = newScheduleRecord("median-market", 5, 4, 3, 2);
    current.marketPriceBasisVersion = FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION;
    current.capturedPrice = null;
    current.bookmakerQuotes = [
      { bookmakerId: 1, bookmakerName: "Book One", fractionalOdds: "5/2", decimalOdds: 3.5 },
      { bookmakerId: 2, bookmakerName: "Book Two", fractionalOdds: "7/2", decimalOdds: 4.5 },
    ];
    current.bestBookmakerPriceDecimal = 4.5;
    current.bestBookmakerPriceFractional = "7/2";
    current.bestBookmakerName = "Book Two";
    current.forecastPrice = "10/1";
    current.forecastDecimalPrice = 11;
    current.t180PriceSnapshot = {
      ...current.t180PriceSnapshot!,
      price: null,
      marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
      medianBookmakerPriceDecimal: 4,
      medianBookmakerImpliedProbability: .25,
      bookmakerQuoteCount: 2,
      bookmakerQuotes: [
        { bookmakerId: 1, bookmakerName: "Book One", fractionalOdds: "5/2", decimalOdds: 3.5 },
        { bookmakerId: 2, bookmakerName: "Book Two", fractionalOdds: "7/2", decimalOdds: 4.5 },
      ],
      bestBookmakerPriceDecimal: 4.5,
      bestBookmakerPriceFractional: "7/2",
      bestBookmakerName: "Book Two",
      forecastPrice: "10/1",
      forecastDecimalPrice: 11,
    };
    const value = { ...fixtureData(), races: [current] };
    const html = renderToStaticMarkup(<PriceSnapshotDiagnostics observations={value.races} summary={summarizeForwardValue(value)} />);
    assert.match(html, /Median bookmaker v1/);
    assert.match(html, /Book Two/);
    assert.match(html, /Forecast 10\/1 \(11\.00\)/);
    const recent = renderToStaticMarkup(<RecentObservations filters={{ family: "all", state: "all", edge: "all" }} observations={[current]} />);
    assert.match(recent, /Median bookmaker v1 \(2 quotes\)/);
    assert.match(recent, /Forecast 10\/1 \(11\.00\)/);
  });

  test("filters clean settled, clean unsettled, and excluded observations", () => {
    assert.deepEqual(ids("settled"), ["turf-new", "turf-old"]);
    assert.deepEqual(ids("unsettled"), ["jump-pending"]);
    assert.deepEqual(ids("excluded"), ["aw-missing"]);
  });

  test("renders captured-price P/L in summary and recent observations", () => {
    const summaryHtml = renderToStaticMarkup(<FamilySummaryTable summary={summarizeForwardValue(data)} />);
    const recentHtml = renderToStaticMarkup(<RecentObservations filters={{ family: "all", state: "all", edge: "all" }} observations={data.races} />);
    assert.match(summaryHtml, /\+3\.00/);
    assert.match(recentHtml, /\+4\.00/);
    assert.match(recentHtml, />14:00</);
  });

  test("result exists + tracker pending shows sync-required diagnostic", () => {
    const pending = record({ raceId: "pending-with-result", settledAt: null, leaderWon: null, leaderResultStatus: null, leaderFinishingPosition: null });
    const html = renderToStaticMarkup(
      <RecentObservations
        filters={{ family: "all", state: "all", edge: "all" }}
        observations={[pending]}
        canonicalResultRaceIds={new Set([pending.raceId])}
      />,
    );
    assert.match(html, /Pending - tracker sync required/);
  });

  test("genuinely unsettled race shows normal Pending", () => {
    const pending = record({ raceId: "genuine-pending", settledAt: null, leaderWon: null, leaderResultStatus: null, leaderFinishingPosition: null });
    const html = renderToStaticMarkup(
      <RecentObservations
        filters={{ family: "all", state: "all", edge: "all" }}
        observations={[pending]}
        canonicalResultRaceIds={new Set()}
      />,
    );
    assert.match(html, />Pending</);
    assert.doesNotMatch(html, /tracker sync required/);
  });

  test("coverage warning appears only when pending observations have canonical results", () => {
    const summary = summarizeForwardValue(data);
    const warning = renderToStaticMarkup(<TopLevelCounts summary={summary} syncRequiredCount={2} />);
    assert.match(warning, /2 observations have results available but are awaiting tracker sync/);
    const clean = renderToStaticMarkup(<TopLevelCounts summary={summary} syncRequiredCount={0} />);
    assert.doesNotMatch(clean, /awaiting tracker sync/);
  });

  test("no tracker mutation during page diagnostic render", () => {
    const pending = record({ raceId: "mutation-check", settledAt: null, leaderWon: null, leaderResultStatus: null, leaderFinishingPosition: null });
    const before = JSON.stringify(pending);
    renderToStaticMarkup(
      <RecentObservations
        filters={{ family: "all", state: "all", edge: "all" }}
        observations={[pending]}
        canonicalResultRaceIds={new Set([pending.raceId])}
      />,
    );
    assert.equal(JSON.stringify(pending), before);
  });

  test("renders family-aware model-versus-Tissue race table columns", () => {
    const recentHtml = renderToStaticMarkup(<RecentObservations filters={{ family: "all", state: "all", edge: "all" }} observations={[
      record({
        raceId: "turf-tissue-row",
        capturedPrice: "4/1",
        capturedDecimalOdds: 5,
        tissueRunnerId: "tissue-runner",
        tissueHorseName: "Tissue Choice",
        tissueProbability: .25,
        tissueAgreesWithTpr: false,
        tissueCapturedPrice: "9/2",
        tissueCapturedDecimalOdds: 5.5,
        tissueMarketProbability: 1 / 5.5,
        tissueEdgePercentagePoints: 6.8,
      }),
    ]} />);
    assert.match(recentHtml, /Model horse/);
    assert.match(recentHtml, /Model prob/);
    assert.doesNotMatch(recentHtml, /TPR horse/);
    assert.match(recentHtml, /Tissue Choice/);
    assert.match(recentHtml, /9\/2 \(5\.50\)/);
    assert.match(recentHtml, /\+6\.8pp/);
    assert.match(recentHtml, />No</);
  });

  test("main table maps TPR, JPR-A and AW-D rows to the matching Tissue tracker", () => {
    const rows = [
      record({
        raceId: "turf-family",
        family: "turf",
        leaderRunnerId: "turf-model",
        tissueRunnerId: "turf-tissue",
        tissueHorseName: "Turf Tissue Horse",
        tissueProbability: .31,
        tissueAgreesWithTpr: false,
        tissueCapturedDecimalOdds: 4,
        tissueMarketProbability: .25,
        tissueEdgePercentagePoints: 6,
      }),
      record({ raceId: "jump-family", family: "jump", leaderRunnerId: "jump-model" }),
      record({ raceId: "aw-family", family: "aw", leaderRunnerId: "aw-model" }),
    ];
    const comparisons = buildFamilyTissueComparisons(rows, {
      jump: jumpForward([jumpTissueRace({ raceId: "jump-family", top1: "jump-tissue", horseName: "Jump Tissue Horse", probability: .22, price: 5 })]),
      aw: awForward([awTissueRace({ raceId: "aw-family", top1: "aw-tissue", horseName: "AW Tissue Horse", probability: .18, price: 8 })]),
    });
    assert.equal(comparisons.get("turf-family")?.horseName, "Turf Tissue Horse");
    assert.equal(comparisons.get("jump-family")?.horseName, "Jump Tissue Horse");
    assert.equal(comparisons.get("aw-family")?.horseName, "AW Tissue Horse");

    const html = renderToStaticMarkup(<RecentObservations filters={{ family: "all", state: "all", edge: "all" }} observations={rows} tissueComparisons={comparisons} />);
    assert.match(html, /TPR compares with Turf Tissue/);
    assert.match(html, /JPR-A compares with Jump Tissue/);
    assert.match(html, /AW-D compares with AW Tissue/);
    assert.match(html, /Turf Tissue Horse/);
    assert.match(html, /Jump Tissue Horse/);
    assert.match(html, /AW Tissue Horse/);
  });

  test("Tissue columns use the Tissue horse's own median bookmaker price and edge", () => {
    const row = record({ raceId: "jump-price", family: "jump", leaderRunnerId: "primary-runner", capturedDecimalOdds: 2, capturedMarketProbability: .5 });
    const comparisons = buildFamilyTissueComparisons([row], {
      jump: jumpForward([jumpTissueRace({
        raceId: "jump-price",
        top1: "tissue-runner",
        horseName: "Own Price Tissue",
        probability: .3,
        price: 5,
        bestPrice: 7,
      })]),
    });
    const comparison = comparisons.get("jump-price")!;
    assert.equal(comparison.capturedDecimalOdds, 5);
    assert.equal(comparison.marketProbability, .2);
    assert.ok(Math.abs((comparison.edgePercentagePoints ?? 0) - 10) < 1e-9);

    const html = renderToStaticMarkup(<RecentObservations filters={{ family: "all", state: "all", edge: "all" }} observations={[row]} tissueComparisons={comparisons} />);
    assert.match(html, /Own Price Tissue/);
    assert.match(html, />5\.00</);
    assert.match(html, /20\.0%/);
    assert.match(html, /\+10\.0pp/);
    assert.match(html, /Best 7\.00/);
  });

  test("missing or non-clean Tissue observations show placeholders and are not reconstructed", () => {
    const rows = [
      record({ raceId: "jump-missing", family: "jump", leaderRunnerId: "jump-model" }),
      record({ raceId: "aw-post-race", family: "aw", leaderRunnerId: "aw-model" }),
    ];
    const comparisons = buildFamilyTissueComparisons(rows, {
      aw: awForward([awTissueRace({ raceId: "aw-post-race", top1: "aw-tissue", horseName: "Late AW Tissue", probability: .4, price: 3, recordedPreRace: false })]),
    });
    assert.equal(comparisons.has("jump-missing"), false);
    assert.equal(comparisons.has("aw-post-race"), false);

    const html = renderToStaticMarkup(<RecentObservations filters={{ family: "all", state: "all", edge: "all" }} observations={rows} tissueComparisons={comparisons} />);
    assert.doesNotMatch(html, /Late AW Tissue/);
    assert.equal(html.match(/<td class="whitespace-nowrap px-2 py-2 text-center tabular-nums">-<\/td>/g)!.length >= 10, true);
  });

  test("agreement is Yes, No or placeholder according to primary versus family Tissue rank one", () => {
    const yes = record({ raceId: "jump-agree", family: "jump", leaderRunnerId: "same-runner" });
    const no = record({ raceId: "aw-disagree", family: "aw", leaderRunnerId: "aw-model" });
    const missing = record({ raceId: "jump-no-tissue", family: "jump", leaderRunnerId: "missing-model" });
    const comparisons = buildFamilyTissueComparisons([yes, no, missing], {
      jump: jumpForward([jumpTissueRace({ raceId: "jump-agree", top1: "same-runner", horseName: "Same Runner", probability: .36, price: 4 })]),
      aw: awForward([awTissueRace({ raceId: "aw-disagree", top1: "different-runner", horseName: "Different Runner", probability: .21, price: 6 })]),
    });
    assert.equal(comparisons.get("jump-agree")?.agreesWithModel, true);
    assert.equal(comparisons.get("aw-disagree")?.agreesWithModel, false);
    assert.equal(comparisons.has("jump-no-tissue"), false);
    const html = renderToStaticMarkup(<RecentObservations filters={{ family: "all", state: "all", edge: "all" }} observations={[yes, no, missing]} tissueComparisons={comparisons} />);
    assert.match(html, />Yes</);
    assert.match(html, />No</);
  });

  test("marks same-leader rows with a compact large probability-gap label", () => {
    const row = record({
      raceId: "large-gap-row",
      leaderRunnerId: "same-runner",
      calibratedProbability: .189,
      tissueRunnerId: "same-runner",
      tissueHorseName: "Same Runner",
      tissueProbability: .583,
      tissueAgreesWithTpr: true,
    });
    const html = renderToStaticMarkup(<RecentObservations filters={{ family: "all", state: "all", edge: "all" }} observations={[row]} />);
    assert.equal(sameLeaderProbabilityGapPp({
      agreesWithModel: true,
      modelProbability: .189,
      tissueProbability: .583,
    })?.toFixed(1), "39.4");
    assert.match(html, /Yes Δ 39\.4pp/);
    assert.match(html, /Model 18\.9% vs Tissue 58\.3% - gap 39\.4pp/);
  });

  test("summarizes same-leader large probability disagreements across families", () => {
    const turf = record({
      raceId: "turf-gap",
      leaderRunnerId: "turf-same",
      calibratedProbability: .2,
      capturedMarketProbability: .15,
      edgePercentagePoints: 5,
      tissueRunnerId: "turf-same",
      tissueHorseName: "Turf Same",
      tissueProbability: .35,
      tissueAgreesWithTpr: true,
      tissueEdgePercentagePoints: 20,
      leaderWon: false,
      capturedPriceProfitLoss: -1,
    });
    const jump = record({
      raceId: "jump-gap",
      family: "jump",
      leaderRunnerId: "jump-same",
      calibratedProbability: .189,
      capturedMarketProbability: .25,
      edgePercentagePoints: -6.1,
      leaderWon: true,
      capturedPriceProfitLoss: 3,
    });
    const aw = record({
      raceId: "aw-small-gap",
      family: "aw",
      leaderRunnerId: "aw-same",
      calibratedProbability: .24,
      capturedMarketProbability: .2,
      edgePercentagePoints: 4,
    });
    const diagnostics = buildSameLeaderProbabilityGapDiagnostics([turf, jump, aw], {
      jump: jumpForward([jumpTissueRace({ raceId: "jump-gap", top1: "jump-same", horseName: "Jump Same", probability: .583, price: 2 })]),
      aw: awForward([awTissueRace({ raceId: "aw-small-gap", top1: "aw-same", horseName: "AW Same", probability: .28, price: 5 })]),
    });

    assert.equal(LARGE_PROBABILITY_GAP_PP, 10);
    assert.equal(diagnostics.families.find((family) => family.family === "turf")!.sameLeaderComparableRaces, 1);
    assert.equal(diagnostics.families.find((family) => family.family === "jump")!.largeProbabilityDisagreements, 1);
    assert.equal(diagnostics.families.find((family) => family.family === "aw")!.largeProbabilityDisagreements, 0);
    assert.equal(diagnostics.largeGapObservations.length, 2);
    assert.equal(diagnostics.outcome.races, 2);
    assert.equal(diagnostics.outcome.winners, 1);
    assert.ok(Math.abs((diagnostics.outcome.meanAbsoluteProbabilityGapPp ?? 0) - 27.2) < 1e-9);
    assert.equal(diagnostics.direction.tissue_higher.races, 2);
    assert.equal(diagnostics.marketPosition.below_both.races, 1);
    assert.equal(diagnostics.marketPosition.between_models.races, 1);
    assert.equal(diagnostics.edgeDirection.primary_negative_tissue_positive, 1);

    const html = renderToStaticMarkup(<SameLeaderProbabilityGapDiagnostics diagnostics={diagnostics} />);
    assert.match(html, /Same Leader Probability Gaps/);
    assert.match(html, /TPR \/ Turf Tissue/);
    assert.match(html, /JPR-A \/ Jump Tissue/);
    assert.match(html, /Large-gap settled outcome/);
    assert.match(html, /Primary negative \/ Tissue positive/);
  });

  test("shows an empty state when no same-leader large probability gaps exist", () => {
    const diagnostics = buildSameLeaderProbabilityGapDiagnostics([
      record({
        raceId: "same-small",
        leaderRunnerId: "same-small-runner",
        calibratedProbability: .25,
        tissueRunnerId: "same-small-runner",
        tissueHorseName: "Same Small",
        tissueProbability: .3,
        tissueAgreesWithTpr: true,
      }),
    ]);
    const html = renderToStaticMarkup(<SameLeaderProbabilityGapDiagnostics diagnostics={diagnostics} />);
    assert.match(html, /No same-leader probability gaps &gt;=10pp yet/);
  });

  test("family-aware Tissue display leaves filters, sort order, and primary result semantics unchanged", () => {
    const jumpWonTissue = record({ raceId: "jump-result", family: "jump", leaderRunnerId: "model-lost", leaderWon: false, leaderResultStatus: "finished", settledAt: "2026-09-27T15:00:00Z", recordedAt: "2026-09-27T10:00:00Z" });
    const turfNewer = record({ raceId: "turf-newer", family: "turf", recordedAt: "2026-09-27T11:00:00Z" });
    const rows = [jumpWonTissue, turfNewer];
    const comparisons = buildFamilyTissueComparisons(rows, {
      jump: jumpForward([jumpTissueRace({ raceId: "jump-result", top1: "tissue-winner", horseName: "Tissue Winner", probability: .5, price: 2 })]),
    });
    assert.deepEqual(filterForwardValueObservations(rows, { family: "jump", state: "settled", edge: "positive" }).map((race) => race.raceId), ["jump-result"]);
    assert.deepEqual(filterForwardValueObservations(rows, { family: "all", state: "all", edge: "all" }).map((race) => race.raceId), ["turf-newer", "jump-result"]);

    const html = renderToStaticMarkup(<RecentObservations filters={{ family: "all", state: "all", edge: "all" }} observations={[jumpWonTissue]} tissueComparisons={comparisons} />);
    assert.match(html, /Tissue Winner/);
    assert.match(html, />Lost</);
    assert.doesNotMatch(html, />Won</);
  });

  test("renders the compact Recent Observations layout with constrained race text", () => {
    const recentHtml = renderToStaticMarkup(<RecentObservations filters={{ family: "all", state: "all", edge: "all" }} observations={[
      record({ raceId: "compact", course: "Long Course", raceName: "A Long Race Name That Needs To Wrap Within The Race Column" }),
    ]} />);
    assert.equal(recentHtml.match(/min-w-\[1446px\]/g)?.length, 2);
    assert.match(recentHtml, /table-fixed text-left text-xs/);
    assert.match(recentHtml, /line-clamp-2 break-words font-medium leading-4/);
    assert.match(recentHtml, /title="Long Course \/ A Long Race Name That Needs To Wrap Within The Race Column"/);
    assert.match(recentHtml, /data-testid="recent-observations-native-scrollbar"/);
  });

  test("renders section-constrained sticky filters above the sticky table header", () => {
    const html = renderToStaticMarkup(<RecentObservations filters={{ family: "turf", state: "settled", edge: "positive" }} observations={data.races} />);
    const filtersIndex = html.indexOf('data-testid="recent-observations-sticky-filters"');
    const headerIndex = html.indexOf('data-testid="recent-observations-sticky-header"');
    const tableIndex = html.indexOf('data-testid="recent-observations-native-scrollbar"');

    assert.ok(filtersIndex >= 0);
    assert.ok(headerIndex > filtersIndex);
    assert.ok(tableIndex > headerIndex);
    assert.match(html, /sticky top-0 z-30 bg-stone-50/);
    assert.match(html, /sticky z-20 h-0 overflow-visible/);
    assert.match(html, /aria-hidden="true"/);
  });

  test("keeps the Recent Observations filters as a GET submission form", () => {
    const html = renderToStaticMarkup(<RecentObservations filters={{ family: "turf", state: "settled", edge: "positive" }} observations={data.races} />);
    assert.match(html, /<form[^>]*method="get"/);
    assert.match(html, /<select[^>]*name="family"/);
    assert.match(html, /<select[^>]*name="state"/);
    assert.match(html, /<select[^>]*name="edge"/);
    assert.match(html, /<button[^>]*type="submit"[^>]*>Apply<\/button>/);
  });

  test("detects horizontal overflow and only shows the sticky scrollbar when relevant", () => {
    assert.equal(hasHorizontalOverflow({ clientWidth: 1000, scrollWidth: 1446 }), true);
    assert.equal(hasHorizontalOverflow({ clientWidth: 1446, scrollWidth: 1446 }), false);
    assert.equal(shouldShowStickyScrollbar(true, true), true);
    assert.equal(shouldShowStickyScrollbar(true, false), false);
    assert.equal(shouldShowStickyScrollbar(false, true), false);
  });

  test("synchronizes horizontal scroll positions in either direction", () => {
    const nativeScroller = { scrollLeft: 180 };
    const stickyScroller = { scrollLeft: 0 };
    synchronizeHorizontalScroll(nativeScroller, stickyScroller);
    assert.equal(stickyScroller.scrollLeft, 180);
    stickyScroller.scrollLeft = 72;
    synchronizeHorizontalScroll(stickyScroller, nativeScroller);
    assert.equal(nativeScroller.scrollLeft, 72);
  });

  test("summarizes Turf model agreement", () => {
    const summary = summarizeTurfModelAgreement([turfComparisonRecord({ raceId: "agree", tissueAgreesWithTpr: true })]);
    assert.equal(summary.comparableRaces, 1);
    assert.equal(summary.tprTissueAgree, 1);
    assert.equal(summary.disagree, 0);
  });

  test("summarizes Turf model disagreement", () => {
    const summary = summarizeTurfModelAgreement([turfComparisonRecord({ raceId: "disagree", tissueAgreesWithTpr: false })]);
    assert.equal(summary.comparableRaces, 1);
    assert.equal(summary.tprTissueAgree, 0);
    assert.equal(summary.disagree, 1);
  });

  test("summarizes TPR-only positive edge", () => {
    const summary = summarizeTurfModelAgreement([turfComparisonRecord({ raceId: "tpr-only", edgePercentagePoints: 4, tissueEdgePercentagePoints: -1 })]);
    assert.equal(summary.tprPositiveOnly, 1);
    assert.equal(summary.tissuePositiveOnly, 0);
    assert.equal(summary.bothPositiveEdge, 0);
  });

  test("summarizes Tissue-only positive edge", () => {
    const summary = summarizeTurfModelAgreement([turfComparisonRecord({ raceId: "tissue-only", edgePercentagePoints: -2, tissueEdgePercentagePoints: 3 })]);
    assert.equal(summary.tissuePositiveOnly, 1);
    assert.equal(summary.tprPositiveOnly, 0);
    assert.equal(summary.bothPositiveEdge, 0);
  });

  test("summarizes both positive edges", () => {
    const summary = summarizeTurfModelAgreement([turfComparisonRecord({ raceId: "both-positive", edgePercentagePoints: 2, tissueEdgePercentagePoints: 3 })]);
    assert.equal(summary.bothPositiveEdge, 1);
    assert.equal(summary.bothPositiveDifferentHorses, 1);
    assert.equal(summary.tprPositiveOnly, 0);
    assert.equal(summary.tissuePositiveOnly, 0);
  });

  test("classifies same-horse probability materiality", () => {
    assert.equal(
      turfModelDisagreementClassification(turfComparisonRecord({
        raceId: "same-close",
        tissueRunnerId: "same-close-runner",
        tissueAgreesWithTpr: true,
        tissueProbability: .49,
      })),
      "same_horse_similar_probability",
    );
    const wide = turfComparisonRecord({
      raceId: "same-wide",
      tissueRunnerId: "same-wide-runner",
      tissueAgreesWithTpr: true,
      tissueProbability: .55,
    });
    assert.equal(turfModelDisagreementClassification(wide), "same_horse_materially_different_probability");
    assert.equal(turfModelDisagreementLargeDifference(wide), true);
  });

  test("classifies different-horse edge signs and large edge gaps", () => {
    const tprOnly = turfComparisonRecord({ raceId: "tpr-edge-only", edgePercentagePoints: 8, tissueEdgePercentagePoints: -3 });
    const tissueOnly = turfComparisonRecord({ raceId: "tissue-edge-only", edgePercentagePoints: -1, tissueEdgePercentagePoints: 4 });
    const neither = turfComparisonRecord({ raceId: "neither-edge", edgePercentagePoints: -5, tissueEdgePercentagePoints: -1 });
    assert.equal(turfModelDisagreementClassification(tprOnly), "different_horses_tpr_positive_only");
    assert.equal(turfModelDisagreementClassification(tissueOnly), "different_horses_tissue_positive_only");
    assert.equal(turfModelDisagreementClassification(neither), "different_horses_neither_positive");
    assert.equal(turfModelDisagreementLargeDifference(tprOnly), true);
  });

  test("ignores missing Tissue observations in Turf agreement counts", () => {
    const summary = summarizeTurfModelAgreement([
      turfComparisonRecord({ raceId: "missing-tissue", tissueAgreesWithTpr: null, tissueProbability: null, tissueEdgePercentagePoints: null }),
    ]);
    assert.equal(summary.comparableRaces, 0);
    assert.equal(summary.tprTissueAgree, 0);
    assert.equal(summary.disagree, 0);
  });

  test("renders compact Turf model agreement counts", () => {
    const html = renderToStaticMarkup(<TurfModelAgreementCounts summary={{
      comparableRaces: 6,
      tprTissueAgree: 2,
      disagree: 4,
      bothPositiveEdge: 1,
      bothPositiveSameHorse: 1,
      bothPositiveDifferentHorses: 1,
      tprPositiveOnly: 2,
      tissuePositiveOnly: 3,
      neitherPositive: 0,
      largeDisagreements: 2,
    }} />);
    assert.match(html, /Comparable races/);
    assert.match(html, /Large disagreements/);
    assert.match(html, /TPR positive only/);
    assert.match(html, />6</);
  });

  test("builds and renders the frozen Turf model disagreement explainer", () => {
    const race = turfComparisonRecord({
      raceId: "explain",
      leaderRunnerId: "tpr-runner",
      leaderHorseName: "TPR Pick",
      leaderScore: 107.2,
      leaderGap: 4.5,
      calibratedProbability: .32,
      edgePercentagePoints: 12,
      tissueRunnerId: "tissue-runner",
      tissueHorseName: "Tissue Pick",
      tissueProbability: .28,
      tissueEdgePercentagePoints: -1,
      tissueCapturedPrice: "7/2",
      tissueCapturedDecimalOdds: 4.5,
      tissueMarketProbability: 1 / 4.5,
      tissueAgreesWithTpr: false,
      finalSp: 5,
      leaderWon: false,
    });
    const diagnostics = buildTurfModelDisagreementDiagnostics([race], {
      version: "tissue_forward_v2",
      tissueModelVersion: "tissue_model_v2",
      forwardStart: "2026-09-19",
      forwardStartAt: "2026-09-19T17:35:53.410Z",
      races: [{
        raceDate: race.raceDate,
        course: race.course,
        raceTime: race.raceTime,
        raceId: race.raceId,
        sourceId: null,
        raceName: race.raceName,
        tissueModelVersion: "tissue_model_v2",
        tissueModelChecksum: "checksum",
        recordedAt: race.recordedAt,
        recordedPreRace: true,
        runners: [
          tissueRunner({ runnerId: "tpr-runner", horseName: "TPR Pick", probability: .12, tissueRank: 4, commentFeatures: ["stayedOn"], finishingPosition: 2, finalSp: 5 }),
          tissueRunner({ runnerId: "tissue-runner", horseName: "Tissue Pick", probability: .28, tissueRank: 1, commentFeatures: ["led"], finishingPosition: 1, finalSp: 4 }),
        ],
        winners: ["Tissue Pick"],
        settledAt: "2026-09-27T14:00:00Z",
      }],
    });
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0]!.largeDifference, true);
    assert.equal(diagnostics[0]!.fieldSize, 2);
    assert.deepEqual(diagnostics[0]!.tissueHorse.commentFeatures, ["led"]);

    const html = renderToStaticMarkup(<TurfModelDisagreementExplainer diagnostics={diagnostics} />);
    assert.match(html, /Why models disagree/);
    assert.match(html, /C\. different horses \/ TPR positive only/);
    assert.match(html, /Large disagreement/);
    assert.match(html, /TPR Pick/);
    assert.match(html, /Tissue Pick/);
    assert.match(html, /TPR rating gap/);
    assert.match(html, /Edge<\/dt><dd[^>]*>\+12\.0pp/);
    assert.doesNotMatch(html, /TPR rating gap<\/dt><dd[^>]*>[^<]*pp/);
    assert.match(html, /Comment signals/);
    assert.match(html, /individual numeric inputs and fitted feature contributions are not persisted/);
  });

  test("keeps same-horse TPR and Tissue assessments separate", () => {
    const race = turfComparisonRecord({
      raceId: "time-turner-style",
      leaderRunnerId: "time-turner",
      leaderHorseName: "Time Turner",
      calibratedProbability: .13,
      capturedPrice: "6/4",
      capturedDecimalOdds: 2.5,
      capturedMarketProbability: .4,
      edgePercentagePoints: -27,
      tissueRunnerId: "time-turner",
      tissueHorseName: "Time Turner",
      tissueProbability: .331,
      tissueAgreesWithTpr: true,
      tissueCapturedPrice: "6/4",
      tissueCapturedDecimalOdds: 2.5,
      tissueMarketProbability: .4,
      tissueEdgePercentagePoints: -6.9,
    });
    const diagnostic = buildTurfModelDisagreementDiagnostics([race])[0]!;
    assert.equal(diagnostic.tprHorse.edgePercentagePoints, -27);
    assert.equal(diagnostic.tissueHorse.edgePercentagePoints, -6.9);
    assert.equal(diagnostic.tprHorse.tissueProbability, null);
    assert.equal(diagnostic.tissueHorse.tprProbability, null);

    const html = renderToStaticMarkup(<TurfModelDisagreementExplainer diagnostics={[diagnostic]} />);
    assert.match(html, /Horse: Time Turner/);
    assert.match(html, /Market price/);
    assert.match(html, /6\/4 \(2\.50\)/);
    assert.match(html, /13\.0%/);
    assert.match(html, /33\.1%/);
    assert.match(html, /-27\.0pp/);
    assert.match(html, /-6\.9pp/);
    assert.match(html, /\+20\.1pp Tissue vs TPR/);
  });

  test("uses each selected horse's own captured price and implied probability", () => {
    const race = turfComparisonRecord({
      raceId: "different-prices",
      calibratedProbability: .3,
      capturedPrice: "4/1",
      capturedDecimalOdds: 5,
      capturedMarketProbability: .2,
      edgePercentagePoints: 10,
      tissueProbability: .25,
      tissueCapturedPrice: "9/1",
      tissueCapturedDecimalOdds: 10,
      tissueMarketProbability: .1,
      tissueEdgePercentagePoints: 15,
    });
    const diagnostic = buildTurfModelDisagreementDiagnostics([race])[0]!;
    assert.equal(diagnostic.tprHorse.capturedDecimalOdds, 5);
    assert.equal(diagnostic.tprHorse.marketImpliedProbability, .2);
    assert.equal(diagnostic.tprHorse.edgePercentagePoints, 10);
    assert.equal(diagnostic.tissueHorse.capturedDecimalOdds, 10);
    assert.equal(diagnostic.tissueHorse.marketImpliedProbability, .1);
    assert.equal(diagnostic.tissueHorse.edgePercentagePoints, 15);

    const html = renderToStaticMarkup(<TurfModelDisagreementExplainer diagnostics={[diagnostic]} />);
    assert.match(html, /4\/1 \(5\.00\)/);
    assert.match(html, /9\/1 \(10\.00\)/);
    assert.match(html, /20\.0%/);
    assert.match(html, /10\.0%/);
  });

  test("classifies both-positive different-horse diagnostics", () => {
    const diagnostic = buildTurfModelDisagreementDiagnostics([
      turfComparisonRecord({ raceId: "both-positive-diagnostic", edgePercentagePoints: 4, tissueEdgePercentagePoints: 7 }),
    ])[0]!;
    assert.equal(diagnostic.classification, "different_horses_both_positive");
    assert.equal(diagnostic.tprPositive, true);
    assert.equal(diagnostic.tissuePositive, true);
  });

  test("classifies TPR-positive and Tissue-negative diagnostics", () => {
    const diagnostic = buildTurfModelDisagreementDiagnostics([
      turfComparisonRecord({ raceId: "tpr-positive-diagnostic", edgePercentagePoints: 4, tissueEdgePercentagePoints: -7 }),
    ])[0]!;
    assert.equal(diagnostic.classification, "different_horses_tpr_positive_only");
    assert.equal(diagnostic.tprPositive, true);
    assert.equal(diagnostic.tissuePositive, false);
  });

  test("classifies Tissue-positive and TPR-negative diagnostics", () => {
    const diagnostic = buildTurfModelDisagreementDiagnostics([
      turfComparisonRecord({ raceId: "tissue-positive-diagnostic", edgePercentagePoints: -4, tissueEdgePercentagePoints: 7 }),
    ])[0]!;
    assert.equal(diagnostic.classification, "different_horses_tissue_positive_only");
    assert.equal(diagnostic.tprPositive, false);
    assert.equal(diagnostic.tissuePositive, true);
  });

  test("does not display a Tissue edge when the Tissue price is missing", () => {
    const race = turfComparisonRecord({
      raceId: "missing-tissue-price-diagnostic",
      tissueCapturedPrice: null,
      tissueCapturedDecimalOdds: null,
      tissueMarketProbability: null,
      tissueEdgePercentagePoints: -5,
    });
    const diagnostic = buildTurfModelDisagreementDiagnostics([race])[0]!;
    assert.equal(diagnostic.tissueHorse.capturedDecimalOdds, null);
    assert.equal(diagnostic.tissueHorse.marketImpliedProbability, null);
    assert.equal(diagnostic.tissueHorse.edgePercentagePoints, null);
    assert.notEqual(diagnostic.tissueHorse.edgePercentagePoints, diagnostic.tprHorse.edgePercentagePoints);
  });

  test("sorts observations newest first", () => {
    const filtered = filterForwardValueObservations(data.races, { family: "all", state: "all", edge: "all" });
    assert.deepEqual(filtered.map((race) => race.raceId), ["turf-new", "jump-pending", "aw-missing", "turf-old"]);
  });

  test("renders the sparse-sample warning", () => {
    assert.equal(summarizeForwardValue(data).sparseSampleWarning, true);
    assert.match(renderToStaticMarkup(<SparseSampleWarning show />), /too small for meaningful profitability conclusions/);
  });

  function ids(state: "settled" | "unsettled" | "excluded") {
    return filterForwardValueObservations(data.races, { family: "all", state, edge: "all" }).map((race) => race.raceId);
  }
});

function fixtureData(): ForwardValueData {
  return {
    version: "forward_value_v1",
    races: [
      record({ raceId: "turf-old", raceDate: "2026-09-25", raceDateTime: "2026-09-25T13:00:00Z", recordedAt: "2026-09-25T11:00:00Z", calibratedProbability: .3, capturedDecimalOdds: 2, capturedMarketProbability: .5, edgePercentagePoints: -20, leaderWon: false, capturedPriceProfitLoss: -1 }),
      record({ raceId: "aw-missing", family: "aw", raceDate: "2026-09-26", raceDateTime: "2026-09-26T15:00:00Z", recordedAt: "2026-09-26T12:00:00Z", capturedPrice: null, capturedDecimalOdds: null, capturedMarketProbability: null, edgePercentagePoints: null, settledAt: null, leaderWon: null, capturedPriceProfitLoss: null, phase2ExclusionReason: "missing_price" }),
      record({ raceId: "jump-pending", family: "jump", raceDateTime: "2026-09-27T14:00:00Z", recordedAt: "2026-09-27T10:00:00Z", settledAt: null, leaderWon: null, capturedPriceProfitLoss: null }),
      record({
        raceId: "turf-new", recordedAt: "2026-09-27T11:00:00Z", leaderWon: true, capturedPriceProfitLoss: 4,
        t60PriceSnapshot: { decimalPrice: 4, impliedProbability: .25, capturedAt: "2026-09-27T12:00:00Z", minutesBeforeScheduledOff: 60, ratingProbability: .4, ratingEdgePercentagePoints: 15 },
        t15PriceSnapshot: { decimalPrice: 10 / 3, impliedProbability: .3, capturedAt: "2026-09-27T12:45:00Z", minutesBeforeScheduledOff: 15, ratingProbability: .4, ratingEdgePercentagePoints: 10 },
      }),
    ],
  };
}

function turfComparisonRecord(overrides: Partial<ForwardValueRecord> & { raceId: string }): ForwardValueRecord {
  return record({
    tissueRunnerId: "tissue-runner",
    tissueHorseName: "Tissue Choice",
    tissueProbability: .3,
    tissueAgreesWithTpr: false,
    tissueCapturedPrice: "4/1",
    tissueCapturedDecimalOdds: 5,
    tissueMarketProbability: .2,
    tissueEdgePercentagePoints: 10,
    ...overrides,
  });
}

function newScheduleRecord(raceId: string, early: number, t180: number, t60: number, finalSp: number): ForwardValueRecord {
  const base = record({
    raceId,
    priceSnapshotScheduleVersion: FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION,
    capturedDecimalOdds: early,
    capturedMarketProbability: 1 / early,
    edgePercentagePoints: (.4 - 1 / early) * 100,
    finalSp,
  });
  const snapshot = (decimalPrice: number, minutesBeforeScheduledOff: number) => ({
    price: String(decimalPrice),
    decimalPrice,
    impliedProbability: 1 / decimalPrice,
    capturedAt: "2026-09-27T09:00:00Z",
    minutesBeforeScheduledOff,
    ratingProbability: .4,
    ratingEdgePercentagePoints: (.4 - 1 / decimalPrice) * 100,
  });
  return {
    ...base,
    earlyPriceSnapshot: snapshot(early, 300),
    t180PriceSnapshot: snapshot(t180, 180),
    t60PriceSnapshot: snapshot(t60, 60),
    t15PriceSnapshot: undefined,
  };
}

function tissueRunner(overrides: {
  runnerId: string;
  horseName: string;
  probability: number;
  tissueRank: number;
  commentFeatures?: string[];
  finishingPosition?: number | null;
  finalSp?: number | null;
}) {
  return {
    runnerId: overrides.runnerId,
    horseId: `${overrides.runnerId}-horse`,
    horseName: overrides.horseName,
    probability: overrides.probability,
    fairDecimalOdds: 1 / overrides.probability,
    tissueRank: overrides.tissueRank,
    commentFeatures: overrides.commentFeatures ?? [],
    finishingPosition: overrides.finishingPosition ?? null,
    finalSp: overrides.finalSp ?? null,
    marketImpliedProbability: overrides.finalSp ? 1 / overrides.finalSp : null,
    marketRank: null,
  };
}

function record(overrides: Partial<ForwardValueRecord> & { raceId: string }): ForwardValueRecord {
  const { raceId, ...rest } = overrides;
  return {
    family: "turf",
    raceId,
    raceDate: "2026-09-27",
    raceDateTime: "2026-09-27T13:00:00Z",
    raceTime: "13:00",
    course: "Test",
    raceName: "Research Stakes",
    ratingVersion: "TPR_S2_V1",
    calibrationVersion: "TPR_CAL_V1",
    recordedAt: "2026-09-27T09:00:00Z",
    recordedPreRace: true,
    captureMode: "live_sync",
    settlementVersion: "canonical_settlement_v2",
    phase2ExclusionReason: null,
    leaderRunnerId: `${raceId}-runner`,
    leaderHorseId: `${raceId}-horse`,
    leaderHorseName: "Example Leader",
    leaderRank: 1,
    leaderScore: 1,
    leaderGap: .5,
    calibratedProbability: .4,
    capturedPrice: "4/1",
    priceSource: "sporting_life_imported_racecard",
    priceCapturedAt: overrides.priceCapturedAt ?? overrides.recordedAt ?? "2026-09-27T09:00:00Z",
    minutesBeforeScheduledOff: 240,
    capturedDecimalOdds: 5,
    capturedMarketProbability: .2,
    edgePercentagePoints: 20,
    edgeBand: ">10pp",
    marketFavouriteRunnerIds: [],
    marketFavouriteHorseNames: [],
    agreesWithMarketFavourite: false,
    leaderIsMarketFavourite: false,
    tissueRunnerId: null,
    tissueHorseName: null,
    tissueProbability: null,
    tissueAgreesWithTpr: null,
    winnerRunnerIds: [],
    leaderResultStatus: "finished",
    leaderFinishingPosition: 1,
    leaderWon: true,
    finalSp: 4,
    grossReturn: 4,
    profitLoss: 3,
    capturedPriceGrossReturn: 5,
    capturedPriceProfitLoss: 4,
    settledAt: "2026-09-27T14:00:00Z",
    ...rest,
  };
}

function jumpForward(races: JumpTissueRace[]): JumpTissueForwardData {
  return { ...emptyJumpTissueForward(), races };
}

function awForward(races: AwTissueRace[]): AwTissueForwardData {
  return { ...emptyAwTissueForward(), races };
}

function jumpTissueRace(input: {
  raceId: string;
  top1: string;
  horseName: string;
  probability: number;
  price: number | null;
  bestPrice?: number;
  recordedPreRace?: boolean;
}): JumpTissueRace {
  return baseTrackerTissueRace(input, "jump") as unknown as JumpTissueRace;
}

function awTissueRace(input: {
  raceId: string;
  top1: string;
  horseName: string;
  probability: number;
  price: number | null;
  bestPrice?: number;
  recordedPreRace?: boolean;
}): AwTissueRace {
  return baseTrackerTissueRace(input, "aw") as unknown as AwTissueRace;
}

function baseTrackerTissueRace(input: {
  raceId: string;
  top1: string;
  horseName: string;
  probability: number;
  price: number | null;
  bestPrice?: number;
  recordedPreRace?: boolean;
}, family: "jump" | "aw") {
  const priceSnapshot = input.price === null ? null : {
    price: null,
    decimalPrice: input.price,
    impliedProbability: 1 / input.price,
    capturedAt: "2026-10-03T09:00:00Z",
    minutesBeforeScheduledOff: 60,
    ratingProbability: input.probability,
    ratingEdgePercentagePoints: (input.probability - 1 / input.price) * 100,
    marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
    bookmakerQuoteCount: 2,
    bookmakerQuotes: [
      { bookmakerId: 1, bookmakerName: "Median One", fractionalOdds: null, decimalOdds: input.price - .5 },
      { bookmakerId: 2, bookmakerName: "Median Two", fractionalOdds: null, decimalOdds: input.price + .5 },
    ],
    medianBookmakerPriceDecimal: input.price,
    medianBookmakerImpliedProbability: 1 / input.price,
    bestBookmakerPriceDecimal: input.bestPrice ?? input.price + .5,
    bestBookmakerPriceFractional: null,
    bestBookmakerName: "Best Book",
    forecastPrice: "99/1",
    forecastDecimalPrice: 100,
  };
  return {
    raceId: input.raceId,
    sourceId: null,
    raceDate: "2026-10-03",
    course: family === "jump" ? "Jump Test" : "AW Test",
    raceName: "Tissue Stakes",
    scheduledTime: "14:00",
    scheduledOffAt: "2026-10-03T14:00:00Z",
    currentOffAt: "2026-10-03T14:00:00Z",
    fieldSize: 2,
    recordedAt: "2026-10-03T09:00:00Z",
    recordedPreRace: input.recordedPreRace ?? true,
    runners: [{
      runnerId: input.top1,
      horseId: `${input.top1}-horse`,
      horseName: input.horseName,
      probability: input.probability,
      rank: 1,
      outcome: null,
    }],
    top1: input.top1,
    top2: [input.top1],
    top3: [input.top1],
    winners: [],
    settledAt: null,
    excludedReason: null,
    predictedRunnerCount: 2,
    activeRunnerCount: 2,
    predictionCoverage: 1,
    marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
    priceSnapshotScheduleVersion: FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION,
    prices: { early: priceSnapshot, t180: null, t60: priceSnapshot },
    selectedPriceProfitLoss: { early: null, t180: null, t60: null, bestEarly: null, finalSp: null },
  };
}

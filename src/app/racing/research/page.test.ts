import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  FAMILY_OPTIONS,
  HANDICAP_STATUS_OPTIONS,
  RANK_METRIC_OPTIONS,
  RATING_METRIC_OPTIONS,
  RELATIVE_METRIC_OPTIONS,
  RETURN_BUCKET_OPTIONS,
  RUN_AFTER_BREAK_OPTIONS,
  defaultResearchRule,
  weightOptions,
} from "@/lib/racing/research-rule";
import { researchRuleKey, researchRulesEqual } from "@/lib/racing/research-rule-identity";
import {
  ResearchForm,
  canSaveExecutedRule,
  clearResearchRuleFilters,
  filterTrainerOptions,
  isResearchSubmitDisabled,
  researchRuleFromFormData,
  researchRunButtonLabel,
  settlementModeFromFormData,
  selectedTrainerOption,
} from "./research-form-client";
import { ResearchHorseNameLink } from "./research-horse-link";
import {
  isSaveRuleSubmitDisabled,
  saveRuleSubmitButtonLabel,
} from "./save-rule-submit-button";
import { holdoutRangeText } from "./holdout-display";
import { PriceSensitivityPanel } from "./price-sensitivity-panel";
import { RuleStabilityPanel } from "./rule-stability-panel";
import { TimeSliceStabilityPanel } from "./time-slice-stability-panel";

describe("research filters page", () => {
  test("renders racing-friendly weight, handicap and speed-rating labels", async () => {
    const text = renderToStaticMarkup(
      ResearchForm({
        familyOptions: FAMILY_OPTIONS,
        filterOptions: {
          courses: [],
          classes: [],
          distances: [],
          trainers: [{ trainerId: "trainer-1", trainerName: "A Trainer", count: 1 }],
          weights: weightOptions(),
        },
        handicapStatusOptions: HANDICAP_STATUS_OPTIONS,
        isPending: false,
        isStale: false,
        onChange: () => {},
        onClearFilters: () => {},
        onSubmit: () => {},
        rankMetricOptions: RANK_METRIC_OPTIONS,
        ratingMetricOptions: RATING_METRIC_OPTIONS,
        returnBucketOptions: RETURN_BUCKET_OPTIONS,
        ref: null,
        relativeMetricOptions: RELATIVE_METRIC_OPTIONS,
        runAfterBreakOptions: RUN_AFTER_BREAK_OPTIONS,
        rule: { ...defaultResearchRule("jump"), runner: { trainerId: "trainer-1", trainerName: "A Trainer" } },
        settlementMode: "actual",
      }),
    );

    assert.match(text, /Weight min/);
    assert.match(text, /Weight max/);
    assert.match(text, /8-11/);
    assert.match(text, /12-7/);
    assert.match(text, /Race type/);
    assert.match(text, /Race class/);
    assert.match(text, /All classes/);
    assert.match(text, /Handicap/);
    assert.match(text, /Non-handicap/);
    assert.match(text, /Speed rating metric/);
    assert.match(text, /Speed rating min/);
    assert.match(text, /Speed rating max/);
    assert.match(text, /Trainer/);
    assert.match(text, /A Trainer/);
    assert.match(text, /Return \/ layoff/);
    assert.match(text, /91-180 days/);
    assert.match(text, /Run after break/);
    assert.match(text, /1st run/);
    assert.equal(text.includes("Rating metric"), false);
    assert.equal(text.includes("Weight min (lb)"), false);
    assert.equal(text.includes("Saving/freezing rules comes after this v1 research layer."), false);
    assert.match(text, /Development settlement/);
    assert.match(text, /Actual result SP/);
    assert.match(text, /Cap winners at 20\/1/);
    assert.match(text, /development analysis only/i);
    assert.match(text, /Clear all filters/);
  });

  test("renders current-family trainer and course options from stable IDs", () => {
    const text = renderToStaticMarkup(
      ResearchForm({
        familyOptions: FAMILY_OPTIONS,
        filterOptions: {
          family: "turf_flat",
          courses: [
            { courseId: "course-ascot", courseName: "Ascot", count: 10 },
            { courseId: "course-york", courseName: "York", count: 8 },
          ],
          classes: [],
          distances: [],
          trainers: [
            { trainerId: "trainer-a", trainerName: "A Trainer", count: 2 },
            { trainerId: "trainer-b", trainerName: "B Trainer", count: 1 },
          ],
          weights: weightOptions(),
        },
        handicapStatusOptions: HANDICAP_STATUS_OPTIONS,
        isPending: false,
        isStale: false,
        onChange: () => {},
        onClearFilters: () => {},
        onSubmit: () => {},
        rankMetricOptions: RANK_METRIC_OPTIONS,
        ratingMetricOptions: RATING_METRIC_OPTIONS,
        returnBucketOptions: RETURN_BUCKET_OPTIONS,
        ref: null,
        relativeMetricOptions: RELATIVE_METRIC_OPTIONS,
        runAfterBreakOptions: RUN_AFTER_BREAK_OPTIONS,
        rule: {
          ...defaultResearchRule("turf_flat"),
          race: { courseId: "course-york", courseName: "York" },
          runner: { trainerId: "trainer-a", trainerName: "A Trainer" },
        },
        settlementMode: "actual",
      }),
    );

    assert.match(text, /All courses/);
    assert.match(text, /value="course-ascot"/);
    assert.match(text, /value="course-york" selected=""/);
    assert.match(text, /name="trainerId"/);
    assert.match(text, /value="trainer-a"/);
    assert.match(text, /A Trainer/);
  });

  test("does not render stale trainer or course options after family changes", () => {
    const text = renderToStaticMarkup(
      ResearchForm({
        familyOptions: FAMILY_OPTIONS,
        filterOptions: {
          family: "jump",
          courses: [{ courseId: "course-worcester", courseName: "Worcester", count: 10 }],
          classes: [],
          distances: [],
          trainers: [{ trainerId: "trainer-jump", trainerName: "Jump Trainer", count: 2 }],
          weights: weightOptions(),
        },
        handicapStatusOptions: HANDICAP_STATUS_OPTIONS,
        isPending: false,
        isStale: true,
        onChange: () => {},
        onClearFilters: () => {},
        onSubmit: () => {},
        rankMetricOptions: RANK_METRIC_OPTIONS,
        ratingMetricOptions: RATING_METRIC_OPTIONS,
        returnBucketOptions: RETURN_BUCKET_OPTIONS,
        ref: null,
        relativeMetricOptions: RELATIVE_METRIC_OPTIONS,
        runAfterBreakOptions: RUN_AFTER_BREAK_OPTIONS,
        rule: {
          ...defaultResearchRule("turf_flat"),
          race: { courseId: "course-worcester" },
          runner: { trainerId: "trainer-jump" },
        },
        settlementMode: "actual",
      }),
    );

    assert.match(text, /Run Research to load course options for this family/);
    assert.match(text, /Run Research to load trainer options for this family/);
    assert.doesNotMatch(text, /Worcester/);
    assert.doesNotMatch(text, /Jump Trainer/);
  });

  test("renders selected Research horses as links when IDs are available", () => {
    const linked = renderToStaticMarkup(
      ResearchHorseNameLink({ horseId: "horse-123", horseName: "Fast Example" }),
    );
    const plain = renderToStaticMarkup(
      ResearchHorseNameLink({ horseId: "", horseName: "Readable Example" }),
    );

    assert.match(linked, /href="\/horses\/horse-123"/);
    assert.match(linked, /Fast Example/);
    assert.doesNotMatch(plain, /href=/);
    assert.match(plain, /Readable Example/);
  });

  test("renders rule stability as a 2025-only collapsed panel", () => {
    const text = renderToStaticMarkup(
      RuleStabilityPanel({
        stability: {
          summaryLabel: "Mixed nearby results",
          settlementMode: "cap_20_1",
          settlementModeLabel: "Winner returns capped at 20/1",
          elapsedMs: 12,
          rows: [
            {
              id: "current",
              label: "Current",
              isCurrent: true,
              rule: defaultResearchRule("jump"),
              eligibleRunners: 10,
              summary: {
                totalEligibleRunners: 3,
                selections: 3,
                settledSelections: 3,
                wins: 1,
                winStrikeRate: 33.333,
                places: 2,
                placeStrikeRate: 66.667,
                averageOdds: 4,
                totalStakes: 3,
                grossReturn: 6,
                profitLoss: 3,
                roiPercentage: 100,
                maxConsecutiveLosers: 2,
              },
            },
          ],
        },
      }),
    );

    assert.match(text, /Rule stability/);
    assert.match(text, /Tests small one-at-a-time changes to the current 2025 rule/);
    assert.match(text, /2026 holdout data is not used/);
    assert.match(text, /Settlement: Winner returns capped at 20\/1/);
    assert.match(text, /Current/);
    assert.doesNotMatch(text, /2026 Holdout completed/);
  });

  test("renders time-slice stability as a 2025-only collapsed panel", () => {
    const text = renderToStaticMarkup(
      TimeSliceStabilityPanel({
        timeSlice: {
          summaryLabel: "Profitable in 4 of 4 periods",
          concentrationLabel: "Development profit is spread across profitable periods.",
          settlementMode: "cap_33_1",
          settlementModeLabel: "Winner returns capped at 33/1",
          elapsedMs: 9,
          rows: [
            {
              id: "2025-01-01:2025-03-31",
              label: "Jan-Mar",
              from: "2025-01-01",
              to: "2025-03-31",
              isFullPeriod: false,
              smallSample: true,
              eligibleRunners: 10,
              rule: defaultResearchRule("jump"),
              summary: {
                totalEligibleRunners: 3,
                selections: 3,
                settledSelections: 3,
                wins: 1,
                winStrikeRate: 33.333,
                places: 2,
                placeStrikeRate: 66.667,
                averageOdds: 4,
                totalStakes: 3,
                grossReturn: 6,
                profitLoss: 3,
                roiPercentage: 100,
                maxConsecutiveLosers: 2,
              },
            },
          ],
        },
      }),
    );

    assert.match(text, /Time-slice stability/);
    assert.match(text, /exact executed rule performed across separate parts of the 2025 development period/);
    assert.match(text, /2026 holdout data is not used/);
    assert.match(text, /Settlement: Winner returns capped at 33\/1/);
    assert.match(text, /Jan-Mar/);
    assert.match(text, /Small sample/);
    assert.doesNotMatch(text, /2026 Holdout completed/);
  });

  test("renders result price sensitivity as a 2025-only diagnostic panel", () => {
    const text = renderToStaticMarkup(
      PriceSensitivityPanel({
        priceSensitivity: {
          summaryLabel: "Mixed price sensitivity",
          diagnostics: {
            largestWinningDecimalSp: 41,
            largestWinnerProfit: 40,
            top1WinnerProfitShare: 52.6,
            top3WinnerProfitShare: 100,
            top5WinnerProfitShare: 100,
          },
          scenarios: [
            {
              id: "actual",
              label: "Actual result SP",
              summary: {
                totalEligibleRunners: 3,
                selections: 3,
                settledSelections: 3,
                wins: 1,
                winStrikeRate: 33.333,
                places: 1,
                placeStrikeRate: 33.333,
                averageOdds: 15,
                totalStakes: 3,
                grossReturn: 41,
                profitLoss: 38,
                roiPercentage: 1266.667,
                maxConsecutiveLosers: 2,
              },
            },
          ],
        },
      }),
    );

    assert.match(text, /Result price sensitivity/);
    assert.match(text, /Actual result SP/);
    assert.match(text, /Result SP is post-race data/);
    assert.match(text, /not part of the frozen selection rule/);
    assert.match(text, /strictly above the named result SP threshold/);
    assert.doesNotMatch(text, /2026 Holdout completed/);
  });

  test("renders disabled trainer selector message when no compatible cache options exist", () => {
    const text = renderToStaticMarkup(
      ResearchForm({
        familyOptions: FAMILY_OPTIONS,
        filterOptions: { courses: [], classes: [], distances: [], trainers: [], weights: weightOptions() },
        handicapStatusOptions: HANDICAP_STATUS_OPTIONS,
        isPending: false,
        isStale: false,
        onChange: () => {},
        onClearFilters: () => {},
        onSubmit: () => {},
        rankMetricOptions: RANK_METRIC_OPTIONS,
        ratingMetricOptions: RATING_METRIC_OPTIONS,
        returnBucketOptions: RETURN_BUCKET_OPTIONS,
        ref: null,
        relativeMetricOptions: RELATIVE_METRIC_OPTIONS,
        runAfterBreakOptions: RUN_AFTER_BREAK_OPTIONS,
        rule: defaultResearchRule("jump"),
        settlementMode: "actual",
      }),
    );

    assert.match(text, /Trainer options available after the 2025 cache is built/);
    assert.match(text, /disabled=""/);
  });

  test("renders loaded multi-class rules with all selected classes checked", () => {
    const text = renderToStaticMarkup(
      ResearchForm({
        familyOptions: FAMILY_OPTIONS,
        filterOptions: {
          courses: [],
          classes: [
            { value: 1, label: "Class 1", count: 2 },
            { value: 2, label: "Class 2", count: 3 },
            { value: 5, label: "Class 5", count: 1 },
          ],
          distances: [],
          trainers: [],
          weights: weightOptions(),
        },
        handicapStatusOptions: HANDICAP_STATUS_OPTIONS,
        isPending: false,
        isStale: false,
        onChange: () => {},
        onClearFilters: () => {},
        onSubmit: () => {},
        rankMetricOptions: RANK_METRIC_OPTIONS,
        ratingMetricOptions: RATING_METRIC_OPTIONS,
        returnBucketOptions: RETURN_BUCKET_OPTIONS,
        ref: null,
        relativeMetricOptions: RELATIVE_METRIC_OPTIONS,
        runAfterBreakOptions: RUN_AFTER_BREAK_OPTIONS,
        rule: { ...defaultResearchRule("jump"), race: { raceClasses: [5, 1, 2] } },
        settlementMode: "actual",
      }),
    );

    assert.match(text, /3 classes selected/);
    assert.equal((text.match(/checked=""/g) ?? []).length, 3);
  });
});

describe("trainer selector helpers", () => {
  const trainers = [
    { trainerId: "trainer-1", trainerName: "A Trainer", count: 3 },
    { trainerId: "trainer-2", trainerName: "B Trainer", count: 2 },
    { trainerId: "trainer-3", trainerName: "Another Yard", count: 1 },
  ];

  test("search filters trainer names", () => {
    assert.deepEqual(
      filterTrainerOptions(trainers, "trainer").map((option) => option.trainerId),
      ["trainer-1", "trainer-2"],
    );
    assert.deepEqual(
      filterTrainerOptions(trainers, "another").map((option) => option.trainerId),
      ["trainer-3"],
    );
  });

  test("selected trainer lookup uses stable trainer ID", () => {
    assert.equal(selectedTrainerOption(trainers, "trainer-2")?.trainerName, "B Trainer");
    assert.equal(selectedTrainerOption(trainers, "missing"), null);
  });

  test("form data stores trainer ID and blank clears back to all trainers", () => {
    assert.equal(researchRuleFromFormData(formData({ trainerId: "trainer-1" })).runner.trainerId, "trainer-1");
    assert.equal(researchRuleFromFormData(formData({ trainerId: "" })).runner.trainerId, undefined);
  });

  test("form data stores trainer cohort concept and single trainer takes precedence", () => {
    assert.deepEqual(researchRuleFromFormData(formData({ trainerCohort: "20" })).runner.trainerCohort, {
      top: 20,
      period: "prior_calendar_year",
      rankingMetric: "wins",
    });
    assert.equal(
      researchRuleFromFormData(formData({ trainerId: "trainer-1", trainerCohort: "20" })).runner.trainerCohort,
      undefined,
    );
  });
});

describe("research filter freshness state", () => {
  test("initial rule/result match does not produce stale state", () => {
    const rule = defaultResearchRule("jump");

    assert.equal(researchRulesEqual(rule, rule), true);
  });

  test("changing prior runs min marks results stale, changing back clears stale", () => {
    const executed = researchRuleFromFormData(formData({ family: "jump", from: "2025-01-01", to: "2025-12-31" }));
    const edited = researchRuleFromFormData(formData({
      family: "jump",
      from: "2025-01-01",
      to: "2025-12-31",
      priorRunsMin: "2",
    }));
    const reverted = researchRuleFromFormData(formData({ family: "jump", from: "2025-01-01", to: "2025-12-31" }));

    assert.notEqual(researchRuleKey(edited), researchRuleKey(executed));
    assert.equal(researchRuleKey(reverted), researchRuleKey(executed));
  });

  test("changing race family marks results stale", () => {
    const executed = researchRuleFromFormData(formData({ family: "jump", from: "2025-01-01", to: "2025-12-31" }));
    const edited = researchRuleFromFormData(formData({
      family: "all_weather_flat",
      from: "2025-01-01",
      to: "2025-12-31",
    }));

    assert.equal(researchRulesEqual(executed, edited), false);
  });

  test("changing trainer, return bucket or run-after-break marks results stale", () => {
    const executed = researchRuleFromFormData(formData({ family: "jump", from: "2025-01-01", to: "2025-12-31" }));

    assert.equal(researchRulesEqual(executed, researchRuleFromFormData(formData({
      family: "jump",
      from: "2025-01-01",
      to: "2025-12-31",
      trainerId: "trainer-1",
    }))), false);
    assert.equal(researchRulesEqual(executed, researchRuleFromFormData(formData({
      family: "jump",
      from: "2025-01-01",
      to: "2025-12-31",
      returnBucket: "days_91_180",
    }))), false);
    assert.equal(researchRulesEqual(executed, researchRuleFromFormData(formData({
      family: "jump",
      from: "2025-01-01",
      to: "2025-12-31",
      runAfterBreak: "run_1",
    }))), false);
    assert.equal(researchRulesEqual(executed, researchRuleFromFormData(formData({
      family: "jump",
      from: "2025-01-01",
      to: "2025-12-31",
      trainerCohort: "20",
    }))), false);
  });

  test("changing race classes marks results stale but equivalent ordering does not", () => {
    const executed = researchRuleFromFormData(formData({
      family: "jump",
      from: "2025-01-01",
      to: "2025-12-31",
      class: ["1", "2", "5"],
    }));
    const sameClassesDifferentOrder = researchRuleFromFormData(formData({
      family: "jump",
      from: "2025-01-01",
      to: "2025-12-31",
      class: ["5", "1", "2", "2"],
    }));
    const changed = researchRuleFromFormData(formData({
      family: "jump",
      from: "2025-01-01",
      to: "2025-12-31",
      class: ["1", "2"],
    }));

    assert.deepEqual(executed.race.raceClasses, [1, 2, 5]);
    assert.equal(researchRuleKey(executed), researchRuleKey(sameClassesDifferentOrder));
    assert.notEqual(researchRuleKey(executed), researchRuleKey(changed));
  });

  test("choosing Latest Speed alone is not a filter, but thresholds affect rule identity", () => {
    const executed = researchRuleFromFormData(formData({
      family: "jump",
      from: "2025-01-01",
      to: "2025-12-31",
    }));
    const metricOnly = researchRuleFromFormData(formData({
      family: "jump",
      from: "2025-01-01",
      to: "2025-12-31",
      ratingMetric: "latestSpeedRating",
    }));
    const minZero = researchRuleFromFormData(formData({
      family: "jump",
      from: "2025-01-01",
      to: "2025-12-31",
      ratingMetric: "latestSpeedRating",
      ratingMin: "0",
    }));
    const maxHundred = researchRuleFromFormData(formData({
      family: "jump",
      from: "2025-01-01",
      to: "2025-12-31",
      ratingMetric: "latestSpeedRating",
      ratingMax: "100",
    }));

    assert.deepEqual(metricOnly.ratings, []);
    assert.equal(researchRuleKey(metricOnly), researchRuleKey(executed));
    assert.deepEqual(minZero.ratings, [{ metric: "latestSpeedRating", range: { min: 0, max: undefined } }]);
    assert.notEqual(researchRuleKey(minZero), researchRuleKey(executed));
    assert.notEqual(researchRuleKey(maxHundred), researchRuleKey(minZero));
  });

  test("prior runs form parsing preserves zero as a threshold", () => {
    const maxZero = researchRuleFromFormData(formData({
      family: "jump",
      from: "2025-01-01",
      to: "2025-12-31",
      priorRunsMax: "0",
    }));

    assert.deepEqual(maxZero.runner.priorRuns, { min: undefined, max: 0 });
  });

  test("development settlement mode is parsed outside ResearchRuleV1 identity", () => {
    const actualRule = researchRuleFromFormData(formData({
      family: "jump",
      settlementMode: "actual",
    }));
    const cappedRule = researchRuleFromFormData(formData({
      family: "jump",
      settlementMode: "cap_20_1",
    }));

    assert.equal(settlementModeFromFormData(formData({ settlementMode: "cap_20_1" })), "cap_20_1");
    assert.equal(researchRuleKey(actualRule), researchRuleKey(cappedRule));
    assert.equal("settlementMode" in cappedRule, false);
  });

  test("newly executed rule matches edited filters and clears stale state", () => {
    const edited = researchRuleFromFormData(formData({
      family: "jump",
      from: "2025-01-01",
      to: "2025-12-31",
      priorRunsMin: "2",
    }));
    const newlyExecuted = researchRuleFromFormData(formData({
      family: "jump",
      from: "2025-01-01",
      to: "2025-12-31",
      priorRunsMin: "2",
    }));

    assert.equal(researchRulesEqual(edited, newlyExecuted), true);
  });

  test("run button labels and pending disabled state are deterministic", () => {
    assert.equal(researchRunButtonLabel({ isPending: false, isStale: false }), "Run Research");
    assert.equal(researchRunButtonLabel({ isPending: false, isStale: true }), "Update Results");
    assert.equal(researchRunButtonLabel({ isPending: true, isStale: true }), "Running Research...");
    assert.equal(isResearchSubmitDisabled(false), false);
    assert.equal(isResearchSubmitDisabled(true), true);
  });

  test("saving is available only for fresh executed results", () => {
    assert.equal(canSaveExecutedRule({ hasResults: false, isStale: false }), false);
    assert.equal(canSaveExecutedRule({ hasResults: true, isStale: true }), false);
    assert.equal(canSaveExecutedRule({ hasResults: true, isStale: false }), true);
  });

  test("clear all filters resets strategy filters while preserving development baseline", () => {
    const cleared = clearResearchRuleFilters({
      ...defaultResearchRule("turf_flat"),
      dateRange: { from: "2025-02-01", to: "2025-03-01" },
      race: {
        courseId: "course-1",
        raceClasses: [1, 2],
        handicapStatus: "non_handicap",
        distanceBucketFrom: "d_1100",
        distanceBucketTo: "d_3080",
        fieldSize: { min: 7, max: 12 },
      },
      runner: {
        trainerId: "trainer-1",
        returnBucket: "days_0_30",
        runAfterBreak: "run_2",
        officialRating: { min: 80, max: 100 },
        weightCarriedLbs: { min: 126, max: 140 },
        daysSinceRun: { min: 1, max: 30 },
        priorRuns: { min: 2, max: 8 },
        trainerCohort: { top: 20, period: "prior_calendar_year", rankingMetric: "wins" },
      },
      ratings: [{ metric: "bestSpeedLast3", range: { min: 80, max: 120 } }],
      relatives: [{ metric: "latestSpeedMinusOR", range: { min: 5, max: 20 } }],
      ranks: [{ metric: "latestPerformanceRating", range: { min: 2, max: 3 } }],
    });

    assert.deepEqual(cleared, {
      ...defaultResearchRule("turf_flat"),
      dateRange: { from: "2025-01-01", to: "2025-12-31" },
    });
  });

  test("cleared filters mark existing results stale and keep saving blocked until rerun", () => {
    const executed = {
      ...defaultResearchRule("jump"),
      runner: { trainerId: "trainer-1" },
    };
    const cleared = clearResearchRuleFilters(executed);
    const isStale = !researchRulesEqual(executed, cleared);

    assert.equal(isStale, true);
    assert.equal(canSaveExecutedRule({ hasResults: true, isStale }), false);
  });

  test("save and freeze pending state disables duplicate submission", () => {
    assert.equal(saveRuleSubmitButtonLabel(false), "Save & freeze rule");
    assert.equal(saveRuleSubmitButtonLabel(true), "Saving...");
    assert.equal(isSaveRuleSubmitDisabled(false), false);
    assert.equal(isSaveRuleSubmitDisabled(true), true);
  });

  test("holdout range display uses actual cache row coverage, not requested cache window", () => {
    assert.equal(
      holdoutRangeText({
        holdoutYear: "2026",
        holdoutFrom: "2026-01-01",
        holdoutTo: "2026-09-11",
        requestedCacheFrom: "2026-01-01",
        requestedCacheTo: "2026-12-31",
        validatedAt: "2026-09-12T10:00:00.000Z",
        ruleSchemaVersion: "research_rule_v1",
        ruleIdentity: "rule",
        cacheMetadata: {
          featureSchemaVersion: "backtest_features_v2",
          sourceFeatureVersion: "historical_target_metrics_v2",
          cacheFamily: "jump",
          cacheGeneratedAt: "2026-09-12T09:00:00.000Z",
          calculationVersions: {},
        },
        status: "completed",
        eligibleRunners: 10,
        selections: 3,
        settledSelections: 3,
        winners: 1,
        strikeRate: 33.333,
        places: 2,
        placeStrikeRate: 66.667,
        profitLoss: 1.5,
        roiPercentage: 50,
        maxConsecutiveLosers: 1,
      }),
      "2026-01-01 to 2026-09-11",
    );
  });
});

function formData(values: Record<string, string | string[]>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        form.append(key, item);
      }
    } else {
      form.set(key, value);
    }
  }
  return form;
}

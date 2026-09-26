import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CREATABLE_RELATIVE_METRIC_OPTIONS as RELATIVE_METRIC_OPTIONS,
  FAMILY_OPTIONS,
  HANDICAP_STATUS_OPTIONS,
  RANK_METRIC_OPTIONS,
  RATING_METRIC_OPTIONS,
  RETURN_BUCKET_OPTIONS,
  RUN_AFTER_BREAK_OPTIONS,
  defaultResearchRule,
  strategySummary,
  type ResearchRuleV1,
  weightOptions,
} from "@/lib/racing/research-rule";
import { researchRuleKey, researchRulesEqual } from "@/lib/racing/research-rule-identity";
import {
  ResearchForm,
  STARTING_PRICE_INFO_HEADING,
  STARTING_PRICE_INFO_HELP_TEXT,
  canSaveExecutedRule,
  clearResearchRuleFilters,
  filterMultiSelectOptions,
  filterTrainerOptions,
  isResearchSubmitDisabled,
  researchRuleFromFormData,
  researchRunButtonLabel,
  settlementModeFromFormData,
  selectedTrainerOption,
  toggleSelectedId,
  removeSelectedId,
} from "./research-form-client";
import { ResearchHorseNameLink } from "./research-horse-link";
import {
  isSaveRuleSubmitDisabled,
  saveRuleSubmitButtonLabel,
} from "./save-rule-submit-button";
import { holdoutRangeText, savedRuleTrainerCohortText } from "./holdout-display";
import { PriceSensitivityPanel } from "./price-sensitivity-panel";
import { keyedStrategySummary } from "./strategy-summary-items";
import { RuleStabilityPanel } from "./rule-stability-panel";
import { TimeSliceStabilityPanel } from "./time-slice-stability-panel";
import { TrainerCohortPanel } from "./trainer-cohort-panel";
import { trainerCohortRule, type ResolvedTrainerCohort } from "@/lib/racing/trainer-cohorts";
import { TURF_PERFORMANCE_RATING_VERSION } from "@/lib/racing/turf-performance-rating";
import { CANONICAL_SETTLEMENT_VERSION } from "@/lib/racing/research-settlement-version";
import {
  LegacySettlementWarning,
  SettlementVersionBadge,
} from "./settlement-version-display";

describe("research filters page", () => {
  test("renders paired calendar month controls and stores only complete ranges", () => {
    const text = renderResearchForm({
      ...defaultResearchRule("jump"),
      calendarPeriod: { monthFrom: 4, monthTo: 9 },
    });
    const complete = researchRuleFromFormData(formData({ monthFrom: "4", monthTo: "9" }));
    const incomplete = researchRuleFromFormData(formData({ monthFrom: "4", monthTo: "" }));

    assert.match(text, /Calendar Period/i);
    assert.match(text, /Month from/);
    assert.match(text, /Month to/);
    assert.match(text, /1 January/);
    assert.match(text, /12 December/);
    assert.deepEqual(complete.calendarPeriod, { monthFrom: 4, monthTo: 9 });
    assert.equal(incomplete.calendarPeriod, undefined);
    assert.notEqual(researchRuleKey(complete), researchRuleKey(defaultResearchRule("jump")));
  });

  test("renders canonical and legacy settlement visibility with the legacy warning", () => {
    const canonical = renderToStaticMarkup(
      SettlementVersionBadge({ version: CANONICAL_SETTLEMENT_VERSION }),
    );
    const legacy = renderToStaticMarkup(SettlementVersionBadge({}));
    const warning = renderToStaticMarkup(LegacySettlementWarning());

    assert.match(canonical, /Settlement: Canonical v2/);
    assert.match(legacy, /Settlement: Legacy/);
    assert.match(warning, /Settlement: Legacy/);
    assert.match(warning, /Historical P\/L, ROI, strike and settled counts may exclude started non-finishers/);
    assert.match(warning, /Re-run Research for current settlement results/);
  });

  test("gives generic rating and dedicated TPR rank summaries unique React keys", () => {
    const combinedRule: ResearchRuleV1 = {
      ...defaultResearchRule("turf_flat"),
      ranks: [{ metric: "latestPerformanceRating", range: { min: 2, max: 5 } }],
      turfPerformance: {
        version: TURF_PERFORMANCE_RATING_VERSION,
        rank: { min: 1, max: 1 },
      },
    };
    const combined = keyedStrategySummary(strategySummary(combinedRule));

    assert.equal(combined.filter((item) => item.label.startsWith("Latest Performance rank:")).length, 2);
    assert.equal(combined.filter((item) => item.label === "TPR rank: 1").length, 1);
    assert.equal(new Set(combined.map((item) => item.key)).size, combined.length);
  });

  test("renders racing-friendly weight, handicap and speed-rating labels", async () => {
    const text = renderToStaticMarkup(
      ResearchForm({
        familyOptions: FAMILY_OPTIONS,
        filterOptions: {
          courses: [],
          classes: [],
          distances: [],
          trainers: [{ trainerId: "trainer-1", trainerName: "A Trainer", count: 1 }],
          jockeys: [{ jockeyId: "jockey-1", jockeyName: "A Jockey", count: 1 }],
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
          ...defaultResearchRule("jump"),
          runner: { trainerIds: ["trainer-1"], trainerNames: ["A Trainer"], jockeyIds: ["jockey-1"], jockeyNames: ["A Jockey"] },
        },
        settlementMode: "actual",
      }),
    );

    assert.match(text, /Weight min/);
    assert.match(text, /Weight max/);
    assert.match(text, /8-11/);
    assert.match(text, /12-7/);
    assert.match(text, /Race type/);
    assert.match(text, /Jump subtype/);
    assert.match(text, /All jump races/);
    assert.match(text, /Hurdles/);
    assert.match(text, /Chases/);
    assert.match(text, /Race class/);
    assert.match(text, /All classes/);
    assert.match(text, /Handicap/);
    assert.match(text, /Non-handicap/);
    assert.match(text, /Speed rating metric/);
    assert.match(text, /Speed rating min/);
    assert.match(text, /Speed rating max/);
    assert.match(text, /Uncalibrated rating difference vs OR/);
    assert.match(text, /The scales are not calibrated to each other, so treat the result as exploratory only/);
    assert.match(text, /Official Rating Rank/);
    assert.match(text, /OR rank min/);
    assert.match(text, /OR rank max/);
    assert.match(text, /Missing OR is excluded/);
    assert.match(text, /Within-Race Rating Ranking/);
    assert.equal(text.includes('value="turfPerformanceRating"'), false);
    assert.equal(text.includes("OR rank</option>"), false);
    assert.equal(text.includes("Turf Performance Rating"), false);
    assert.match(text, /Trainer/);
    assert.match(text, /A Trainer/);
    assert.match(text, /Jockey/);
    assert.match(text, /A Jockey/);
    assert.match(text, /Jockey prior runs min/);
    assert.match(text, /Jockey prior win rate min %/);
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
    assert.match(text, new RegExp(STARTING_PRICE_INFO_HEADING));
    assert.match(text, new RegExp(STARTING_PRICE_INFO_HELP_TEXT.replaceAll(".", "\\.")));
    assert.doesNotMatch(text, /Historical pre-race odds/);
    assert.match(text, /Minimum price/);
    assert.match(text, /Maximum price/);
    assert.match(text, /20\/1\+/);
    assert.match(text, /development analysis only/i);
    assert.match(text, /Clear all filters/);
  });

  test("offers only uncalibrated Performance and Today's Rating differences for new rules", () => {
    assert.deepEqual(
      RELATIVE_METRIC_OPTIONS.map((option) => option.value),
      [
        "latestPerformanceMinusOR",
        "bestPerformanceL3MinusOR",
        "latestTodaysRatingMinusOR",
        "bestTodaysRatingL3MinusOR",
      ],
    );
    const text = renderResearchForm(defaultResearchRule("turf_flat"));
    assert.match(text, /Latest Performance minus OR/);
    assert.match(text, /Best L3 Performance minus OR/);
    assert.match(text, /Latest Today&#x27;s Rating minus OR/);
    assert.match(text, /Best L3 Today&#x27;s Rating minus OR/);
    assert.doesNotMatch(text, />Latest Speed minus OR</);
    assert.doesNotMatch(text, />Best L3 Speed minus OR</);
  });

  test("displays loaded legacy Speed-vs-OR rules without offering them on a clean form", () => {
    const text = renderResearchForm({
      ...defaultResearchRule("turf_flat"),
      relatives: [{ metric: "latestSpeedMinusOR", range: { min: 5 } }],
    });
    assert.match(text, /Latest Speed minus OR.*Legacy uncalibrated OR-relative metric/);
    assert.match(text, /type="hidden" name="legacyRelativeMetric" value="latestSpeedMinusOR"/);
  });

  test("rejects new legacy Speed-vs-OR form values but preserves an existing marked legacy rule", () => {
    const fresh = researchRuleFromFormData(formData({
      relativeMetric: "latestSpeedMinusOR",
      relativeMin: "5",
    }));
    const existing = researchRuleFromFormData(formData({
      relativeMetric: "latestSpeedMinusOR",
      legacyRelativeMetric: "latestSpeedMinusOR",
      relativeMin: "5",
    }));
    assert.deepEqual(fresh.relatives, []);
    assert.deepEqual(existing.relatives, [{ metric: "latestSpeedMinusOR", range: { min: 5, max: undefined } }]);
  });

  test("renders and parses Starting Price dropdown filters", () => {
    const text = renderToStaticMarkup(
      ResearchForm({
        familyOptions: FAMILY_OPTIONS,
        filterOptions: {
          courses: [],
          classes: [],
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
        rule: {
          ...defaultResearchRule("jump"),
          startingPrice: { minDecimal: 4, maxDecimalExclusive: 7 },
        },
        settlementMode: "actual",
      }),
    );
    const formData = new FormData();
    formData.set("family", "jump");
    formData.set("from", "2025-01-01");
    formData.set("to", "2025-12-31");
    formData.set("spMin", "3_1");
    formData.set("spMax", "5_1");

    assert.match(text, /name="spMin"/);
    assert.match(text, /name="spMax"/);
    assert.match(text, /<option value="3_1" selected="">3\/1<\/option>/);
    assert.match(text, /<option value="5_1" selected="">5\/1<\/option>/);
    assert.deepEqual(researchRuleFromFormData(formData).startingPrice, {
      minDecimal: 4,
      maxDecimalExclusive: 7,
    });
  });

  test("renders Turf Performance Rating diagnostic filters for Turf only", () => {
    const turfText = renderToStaticMarkup(
      ResearchForm({
        familyOptions: FAMILY_OPTIONS,
        filterOptions: {
          courses: [],
          classes: [],
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
        rule: {
          ...defaultResearchRule("turf_flat"),
          turfPerformance: {
            version: TURF_PERFORMANCE_RATING_VERSION,
            rating: { min: 110 },
            rank: { min: 1, max: 1 },
            lead: { min: 4 },
          },
        },
        settlementMode: "actual",
      }),
    );
    const jumpText = renderToStaticMarkup(
      ResearchForm({
        familyOptions: FAMILY_OPTIONS,
        filterOptions: {
          courses: [],
          classes: [],
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
        rule: defaultResearchRule("jump"),
        settlementMode: "actual",
      }),
    );

    assert.match(turfText, /Turf Performance Rating — Diagnostic/);
    assert.equal(turfText.includes("Jump subtype"), false);
    assert.match(turfText, /TPR score min/);
    assert.match(turfText, /TPR score max/);
    assert.match(turfText, /TPR rank min/);
    assert.match(turfText, /TPR rank max/);
    assert.match(turfText, /TPR lead min/);
    assert.match(turfText, /TPR lead max/);
    assert.match(turfText, new RegExp(TURF_PERFORMANCE_RATING_VERSION));
    assert.match(turfText, /TPR W50 \(diagnostic\)/);
    assert.match(turfText, /50% of the production relative-weight adjustment/);
    assert.match(turfText, /value="110"/);
    assert.match(turfText, /value="4"/);
    assert.equal(jumpText.includes("Turf Performance Rating"), false);
    assert.equal(jumpText.includes("TPR W50"), false);
  });

  test("parses W50 rank one and OR rank one as separate conjunctive filters", () => {
    const rule = researchRuleFromFormData(formData({
      family: "turf_flat",
      rankMetric: "turfPerformanceW50Rating",
      rankMin: "1",
      rankMax: "1",
      orRankMin: "1",
      orRankMax: "1",
    }));

    assert.deepEqual(rule.ranks, [
      { metric: "turfPerformanceW50Rating", range: { min: 1, max: 1 } },
      { metric: "officialRating", range: { min: 1, max: 1 } },
    ]);
  });

  test("parses Jump subtype from the form and ignores it for Turf", () => {
    assert.equal(researchRuleFromFormData(formData({ family: "jump", jumpSubtype: "hurdle" })).race.jumpSubtype, "hurdle");
    assert.equal(researchRuleFromFormData(formData({ family: "jump", jumpSubtype: "chase" })).race.jumpSubtype, "chase");
    assert.equal(researchRuleFromFormData(formData({ family: "jump", jumpSubtype: "all" })).race.jumpSubtype, "all");
    assert.equal(researchRuleFromFormData(formData({ family: "turf_flat", jumpSubtype: "hurdle" })).race.jumpSubtype, undefined);
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
          race: { courseIds: ["course-york"], courseNames: ["York"] },
          runner: { trainerIds: ["trainer-a"], trainerNames: ["A Trainer"] },
        },
        settlementMode: "actual",
      }),
    );

    assert.match(text, /aria-controls="courseId-multi-select-options"/);
    assert.match(text, /aria-expanded="false"/);
    assert.match(text, /value="course-york"/);
    assert.match(text, /Remove York/);
    assert.match(text, /name="trainerId"/);
    assert.match(text, /aria-controls="trainerId-multi-select-options"/);
    assert.match(text, /value="trainer-a"/);
    assert.match(text, /A Trainer/);
    assert.match(text, /Remove A Trainer/);
  });

  test("renders selected trainer and course chips with repeated hidden submitted IDs", () => {
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
          race: { courseIds: ["course-ascot", "course-york"], courseNames: ["Ascot", "York"] },
          runner: { trainerIds: ["trainer-a", "trainer-b"], trainerNames: ["A Trainer", "B Trainer"] },
        },
        settlementMode: "actual",
      }),
    );

    assert.match(text, /name="courseId" value="course-ascot"/);
    assert.match(text, /name="courseId" value="course-york"/);
    assert.match(text, /name="trainerId" value="trainer-a"/);
    assert.match(text, /name="trainerId" value="trainer-b"/);
    assert.match(text, /Remove Ascot/);
    assert.match(text, /Remove York/);
    assert.match(text, /Remove A Trainer/);
    assert.match(text, /Remove B Trainer/);
    assert.match(text, /Ascot/);
    assert.match(text, /York/);
    assert.match(text, /A Trainer/);
    assert.match(text, /B Trainer/);
  });

  test("renders compact chips while preserving all selected trainer and course submitted IDs", () => {
    const trainers = numberedOptions("trainer", 20);
    const courses = numberedOptions("course", 20);
    const text = renderToStaticMarkup(
      ResearchForm({
        familyOptions: FAMILY_OPTIONS,
        filterOptions: {
          family: "jump",
          courses: courses.map((option) => ({
            courseId: option.id,
            courseName: option.label,
            count: 1,
          })),
          classes: [],
          distances: [],
          trainers: trainers.map((option) => ({
            trainerId: option.id,
            trainerName: option.label,
            count: 1,
          })),
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
          ...defaultResearchRule("jump"),
          race: {
            courseIds: courses.map((option) => option.id),
            courseNames: courses.map((option) => option.label),
          },
          runner: {
            trainerIds: trainers.map((option) => option.id),
            trainerNames: trainers.map((option) => option.label),
          },
        },
        settlementMode: "actual",
      }),
    );

    assert.equal((text.match(/name="trainerId" value="trainer-/g) ?? []).length, 20);
    assert.equal((text.match(/name="courseId" value="course-/g) ?? []).length, 20);
    assert.match(text, /20 trainers selected/);
    assert.match(text, /20 courses selected/);
    assert.equal((text.match(/Remove Trainer/g) ?? []).length, 6);
    assert.equal((text.match(/Remove Course/g) ?? []).length, 6);
    assert.equal((text.match(/\+14 more selected/g) ?? []).length, 2);
  });

  test("renders twelve selected trainers like courses with six visible chips and six hidden summary", () => {
    const trainers = numberedOptions("trainer", 12);
    const text = renderToStaticMarkup(
      ResearchForm({
        familyOptions: FAMILY_OPTIONS,
        filterOptions: {
          family: "jump",
          courses: [],
          classes: [],
          distances: [],
          trainers: trainers.map((option) => ({
            trainerId: option.id,
            trainerName: option.label,
            count: 1,
          })),
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
          ...defaultResearchRule("jump"),
          runner: {
            trainerIds: trainers.map((option) => option.id),
            trainerNames: trainers.map((option) => option.label),
          },
        },
        settlementMode: "actual",
      }),
    );

    assert.equal((text.match(/name="trainerId" value="trainer-/g) ?? []).length, 12);
    assert.match(text, /12 trainers selected/);
    assert.equal((text.match(/Remove Trainer/g) ?? []).length, 6);
    assert.match(text, /\+6 more selected/);
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
          race: { courseIds: ["course-worcester"] },
          runner: { trainerIds: ["trainer-jump"] },
        },
        settlementMode: "actual",
      }),
    );

    assert.match(text, /Run Research to load course options for this family/);
    assert.match(text, /Run Research to load trainer options for this family/);
    assert.doesNotMatch(text, /value="course-worcester"/);
    assert.doesNotMatch(text, /value="trainer-jump"/);
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
    assert.match(text, /All trainers/);
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

  test("long trainer option lists are not truncated before late alphabet entries", () => {
    const longTrainerList = alphabeticTrainerOptions(120);
    const allVisible = filterTrainerOptions(longTrainerList, "");
    const lateAlphabet = filterTrainerOptions(longTrainerList, "walker");

    assert.equal(longTrainerList.length, 120);
    assert.equal(allVisible.length, 120);
    assert.equal(allVisible.at(-1)?.trainerId, "trainer-z-last");
    assert.deepEqual(lateAlphabet.map((option) => option.trainerId), ["trainer-walker"]);
  });

  test("long course option lists are not truncated and search finds late alphabet entries", () => {
    const longCourseList = alphabeticMultiSelectOptions("course", 120);
    const allVisible = filterMultiSelectOptions(longCourseList, "");
    const lateAlphabet = filterMultiSelectOptions(longCourseList, "wetherby");

    assert.equal(longCourseList.length, 120);
    assert.equal(allVisible.length, 120);
    assert.equal(allVisible.at(-1)?.id, "course-z-last");
    assert.deepEqual(lateAlphabet.map((option) => option.id), ["course-wetherby"]);
  });

  test("selected trainer lookup uses stable trainer ID", () => {
    assert.equal(selectedTrainerOption(trainers, "trainer-2")?.trainerName, "B Trainer");
    assert.equal(selectedTrainerOption(trainers, "missing"), null);
  });

  test("multi-select helper toggles, adds a second value and removes values", () => {
    assert.deepEqual(toggleSelectedId([], "trainer-2"), ["trainer-2"]);
    assert.deepEqual(toggleSelectedId(["trainer-2"], "trainer-1"), ["trainer-1", "trainer-2"]);
    assert.deepEqual(toggleSelectedId(["trainer-1", "trainer-2"], "trainer-1"), ["trainer-2"]);
    assert.deepEqual(removeSelectedId(["trainer-1", "trainer-2"], "trainer-2"), ["trainer-1"]);
  });

  test("multi-select helper keeps selections beyond six for trainers and courses", () => {
    const sevenTrainers = selectSequentialIds("trainer", 7);
    const twelveTrainers = selectSequentialIds("trainer", 12);
    const twentyTrainers = selectSequentialIds("trainer", 20);
    const twentyCourses = selectSequentialIds("course", 20);

    assert.equal(sevenTrainers.length, 7);
    assert.equal(twelveTrainers.length, 12);
    assert.equal(twentyTrainers.length, 20);
    assert.equal(twentyCourses.length, 20);
    assert.ok(twentyTrainers.includes("trainer-20"));
    assert.ok(twentyCourses.includes("course-20"));
  });

  test("form data stores trainer and course ID arrays and blanks clear back to all", () => {
    assert.deepEqual(
      researchRuleFromFormData(formData({ trainerId: ["trainer-2", "trainer-1"], courseId: ["course-b", "course-a"], jockeyId: ["jockey-b", "jockey-a"] })).runner.trainerIds,
      ["trainer-1", "trainer-2"],
    );
    assert.deepEqual(
      researchRuleFromFormData(formData({ trainerId: ["trainer-2", "trainer-1"], courseId: ["course-b", "course-a"], jockeyId: ["jockey-b", "jockey-a"] })).race.courseIds,
      ["course-a", "course-b"],
    );
    assert.deepEqual(
      researchRuleFromFormData(formData({ trainerId: ["trainer-2", "trainer-1"], courseId: ["course-b", "course-a"], jockeyId: ["jockey-b", "jockey-a"] })).runner.jockeyIds,
      ["jockey-a", "jockey-b"],
    );
    assert.deepEqual(researchRuleFromFormData(formData({ trainerId: "" })).runner.trainerIds, []);
  });

  test("form data stores jockey prior metric filters", () => {
    const rule = researchRuleFromFormData(formData({
      jockeyPriorRunsMin: "50",
      jockeyPriorWinRateMin: "15",
    }));

    assert.deepEqual(rule.runner.jockeyPriorRuns, { min: 50, max: undefined });
    assert.deepEqual(rule.runner.jockeyPriorWinRate, { min: 15, max: undefined });
  });

  test("Draw controls and form values are available only for flat families", () => {
    const renderFamily = (family: ResearchRuleV1["family"]) => renderToStaticMarkup(ResearchForm({
      familyOptions: FAMILY_OPTIONS,
      filterOptions: { courses: [], classes: [], distances: [], trainers: [], jockeys: [], weights: weightOptions() },
      handicapStatusOptions: HANDICAP_STATUS_OPTIONS,
      isPending: false, isStale: false, onChange: () => {}, onClearFilters: () => {}, onSubmit: () => {},
      rankMetricOptions: RANK_METRIC_OPTIONS, ratingMetricOptions: RATING_METRIC_OPTIONS,
      returnBucketOptions: RETURN_BUCKET_OPTIONS, ref: null, relativeMetricOptions: RELATIVE_METRIC_OPTIONS,
      runAfterBreakOptions: RUN_AFTER_BREAK_OPTIONS, rule: defaultResearchRule(family), settlementMode: "actual",
    }));
    const turf = renderFamily("turf_flat");
    const awMarkup = renderFamily("all_weather_flat");
    const jumpMarkup = renderFamily("jump");
    const aw = researchRuleFromFormData(formData({ family: "all_weather_flat", drawMin: "1", drawMax: "3" }));
    const jump = researchRuleFromFormData(formData({ family: "jump", drawMin: "1", drawMax: "3" }));

    assert.match(turf, /name="drawMin"/);
    assert.match(awMarkup, /name="drawMax"/);
    assert.doesNotMatch(jumpMarkup, /name="drawMin"/);
    assert.deepEqual(aw.runner.draw, { min: 1, max: 3 });
    assert.equal(jump.runner.draw, undefined);
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

  test("form data stores Turf Performance Rating filters with the frozen version", () => {
    const turfRule = researchRuleFromFormData(formData({
      family: "turf_flat",
      tprMin: "110",
      tprRankMin: "1",
      tprRankMax: "1",
      tprLeadMin: "4",
    }));
    const jumpRule = researchRuleFromFormData(formData({
      family: "jump",
      tprMin: "110",
      tprRankMin: "1",
    }));

    assert.deepEqual(turfRule.turfPerformance, {
      version: TURF_PERFORMANCE_RATING_VERSION,
      rating: { min: 110, max: undefined },
      rank: { min: 1, max: 1 },
      lead: { min: 4, max: undefined },
    });
    assert.equal(jumpRule.turfPerformance, undefined);
  });

  test("form data stores generic performance rank and dedicated TPR rank together", () => {
    const rule = researchRuleFromFormData(formData({
      family: "turf_flat",
      rankMetric: "latestPerformanceRating",
      rankMin: "2",
      rankMax: "5",
      tprRankMin: "1",
      tprRankMax: "1",
    }));

    assert.deepEqual(rule.ranks, [{
      metric: "latestPerformanceRating",
      range: { min: 2, max: 5 },
    }]);
    assert.deepEqual(rule.turfPerformance?.rank, { min: 1, max: 1 });
  });

  test("form data does not create new generic TPR rank criteria", () => {
    const rule = researchRuleFromFormData(formData({
      family: "turf_flat",
      rankMetric: "turfPerformanceRating",
      rankMin: "1",
      rankMax: "2",
    }));

    assert.deepEqual(rule.ranks, []);
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
        courseIds: ["course-1"],
        raceClasses: [1, 2],
        handicapStatus: "non_handicap",
        distanceBucketFrom: "d_1100",
        distanceBucketTo: "d_3080",
        fieldSize: { min: 7, max: 12 },
      },
      runner: {
        trainerIds: ["trainer-1"],
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

  test("trainer cohort panel explains empty prior-year resolution", () => {
    const html = renderToStaticMarkup(
      TrainerCohortPanel({
        diagnostics: { currentYearMatchedTrainerCount: 0, currentYearRunnerCount: 0 },
        trainerCohort: resolvedTrainerCohort([]),
      }),
    );

    assert.match(html, /Qualifying prior-year trainers/);
    assert.match(html, /No eligible prior-year trainer cohort could be resolved for this family/);
  });

  test("trainer cohort panel distinguishes resolved cohorts with no current-year cache matches", () => {
    const html = renderToStaticMarkup(
      TrainerCohortPanel({
        diagnostics: { currentYearMatchedTrainerCount: 0, currentYearRunnerCount: 0 },
        trainerCohort: resolvedTrainerCohort(["trainer-a"]),
      }),
    );

    assert.match(html, /Resolved cohort trainers/);
    assert.match(html, /none of its stable trainer IDs matched runners in the 2025 cache/);
  });

  test("cleared filters mark existing results stale and keep saving blocked until rerun", () => {
    const executed = {
      ...defaultResearchRule("jump"),
      runner: { trainerIds: ["trainer-1"] },
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

  test("saved trainer cohort display uses each evaluation period's prior year", () => {
    const rule = savedTrainerCohortRule("turf_flat");

    assert.equal(
      savedRuleTrainerCohortText(rule, rule.developmentFrom),
      "Top 30 by 2024 Turf wins",
    );
    assert.equal(
      savedRuleTrainerCohortText(rule, "2026-01-01"),
      "Top 30 by 2025 Turf wins",
    );
  });

  test("saved trainer cohort display uses the relevant family label", () => {
    assert.equal(
      savedRuleTrainerCohortText(savedTrainerCohortRule("all_weather_flat"), "2026-01-01"),
      "Top 30 by 2025 All Weather wins",
    );
    assert.equal(
      savedRuleTrainerCohortText(savedTrainerCohortRule("jump"), "2026-01-01"),
      "Top 30 by 2025 Jump wins",
    );
  });
});

function savedTrainerCohortRule(family: ResearchRuleV1["family"]) {
  const rule: ResearchRuleV1 = {
    ...defaultResearchRule(family),
    runner: { trainerCohort: trainerCohortRule(30) },
  };
  return {
    canonicalRule: rule,
    developmentFrom: "2025-01-01",
  };
}

function resolvedTrainerCohort(trainerIds: string[]): ResolvedTrainerCohort {
  return {
    definition: trainerCohortRule(20),
    cohortYear: 2025,
    referenceYear: 2024,
    family: "jump",
    qualifiedTrainerCount: trainerIds.length,
    members: trainerIds.map((trainerId, index) => ({
      cohortYear: 2025,
      referenceYear: 2024,
      family: "jump",
      rank: index + 1,
      trainerId,
      trainerName: `Trainer ${index + 1}`,
      priorYearRuns: 60,
      priorYearWins: 20 - index,
      priorYearWinRate: ((20 - index) / 60) * 100,
    })),
    trainerIds: new Set(trainerIds),
  };
}

function numberedOptions(prefix: "trainer" | "course", count: number): Array<{ id: string; label: string }> {
  return Array.from({ length: count }, (_, index) => {
    const ordinal = String(index + 1).padStart(2, "0");
    return {
      id: `${prefix}-${ordinal}`,
      label: `${prefix === "trainer" ? "Trainer" : "Course"} ${ordinal}`,
    };
  });
}

function selectSequentialIds(prefix: string, count: number): string[] {
  let selected: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    selected = toggleSelectedId(selected, `${prefix}-${index}`);
  }
  return selected;
}

function alphabeticTrainerOptions(count: number): Array<{ trainerId: string; trainerName: string; count: number }> {
  return alphabeticMultiSelectOptions("trainer", count).map((option) => ({
    trainerId: option.id,
    trainerName: option.label,
    count: option.count ?? 1,
  }));
}

function alphabeticMultiSelectOptions(prefix: string, count: number): Array<{ id: string; label: string; count: number }> {
  const earlyCount = Math.max(0, count - 2);
  return [
    ...Array.from({ length: earlyCount }, (_, index) => ({
      id: `${prefix}-a-${String(index + 1).padStart(3, "0")}`,
      label: `A ${prefix} ${String(index + 1).padStart(3, "0")}`,
      count: 1,
    })),
    { id: prefix === "course" ? `${prefix}-wetherby` : `${prefix}-walker`, label: prefix === "course" ? "Wetherby" : "Walker Yard", count: 1 },
    { id: `${prefix}-z-last`, label: `Z ${prefix} Last`, count: 1 },
  ];
}

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

function renderResearchForm(rule: ResearchRuleV1): string {
  return renderToStaticMarkup(ResearchForm({
    familyOptions: FAMILY_OPTIONS,
    filterOptions: { courses: [], classes: [], distances: [], trainers: [], jockeys: [], weights: weightOptions() },
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
    rule,
    settlementMode: "actual",
  }));
}

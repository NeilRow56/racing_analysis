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
  selectedTrainerOption,
} from "./research-form-client";
import { ResearchHorseNameLink } from "./research-horse-link";
import {
  isSaveRuleSubmitDisabled,
  saveRuleSubmitButtonLabel,
} from "./save-rule-submit-button";

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
    assert.match(text, /Run a 2025 research result before saving or freezing rules/);
    assert.match(text, /Clear all filters/);
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

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
  filterTrainerOptions,
  isResearchSubmitDisabled,
  researchRuleFromFormData,
  researchRunButtonLabel,
  selectedTrainerOption,
} from "./research-form-client";

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
});

function formData(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    form.set(key, value);
  }
  return form;
}

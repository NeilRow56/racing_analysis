"use client";

import type React from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { normalizeRaceClasses } from "@/lib/racing/research-rule-classes";
import { researchRuleKey } from "@/lib/racing/research-rule-identity";
import {
  DEVELOPMENT_SETTLEMENT_MODE_OPTIONS,
  parseDevelopmentSettlementMode,
  type DevelopmentSettlementMode,
} from "@/lib/racing/development-settlement-mode";
import { TRAINER_COHORT_TOP_OPTIONS, trainerCohortRule } from "@/lib/racing/trainer-cohort-mode";
import { TURF_PERFORMANCE_RATING_VERSION } from "@/lib/racing/turf-performance-rating";
import {
  STARTING_PRICE_MAX_OPTIONS,
  STARTING_PRICE_MIN_OPTIONS,
  isImpossibleStartingPriceCondition,
  startingPriceConditionFromValues,
  startingPriceMaxValue,
  startingPriceMinValue,
} from "@/lib/racing/starting-price-filter";
import {
  type HandicapStatusFilter,
  type RatingMetric,
  type RelativeMetric,
  type ResearchFilterOptions,
  type ResearchRuleV1,
  type ReturnBucket,
  type RunAfterBreakFilter,
} from "@/lib/racing/research-rule";
import { RANK_METRIC_OPTIONS, type RankMetric } from "@/lib/racing/research-rank-metrics";

type Option<T extends string = string> = { value: T; label: string };
type RatingOption = Option<RatingMetric> & { group: string };
type MultiSelectOption = { id: string; label: string; count?: number };
const VISIBLE_SELECTED_CHIP_LIMIT = 6;
export const STARTING_PRICE_INFO_HEADING = "Historical Starting Price";
export const STARTING_PRICE_INFO_HELP_TEXT = "Uses final result SP for historical research and holdout settlement.";

export function ResearchWorkspace({
  children,
  executedRule,
  filterOptions,
  hasResults,
  handicapStatusOptions,
  familyOptions,
  rankMetricOptions,
  ratingMetricOptions,
  returnBucketOptions,
  relativeMetricOptions,
  runAfterBreakOptions,
  saveRulePanel,
  settlementMode,
  staleSaveRulePanel,
}: {
  children: React.ReactNode;
  executedRule: ResearchRuleV1;
  filterOptions: ResearchFilterOptions;
  hasResults: boolean;
  handicapStatusOptions: Array<Option<HandicapStatusFilter>>;
  familyOptions: Array<Option<ResearchRuleV1["family"]>>;
  rankMetricOptions: Array<Option<RankMetric>>;
  ratingMetricOptions: RatingOption[];
  returnBucketOptions: Array<Option<ReturnBucket>>;
  relativeMetricOptions: Array<Option<RelativeMetric>>;
  runAfterBreakOptions: Array<Option<RunAfterBreakFilter>>;
  settlementMode: DevelopmentSettlementMode;
  saveRulePanel?: React.ReactNode;
  staleSaveRulePanel?: React.ReactNode;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const executedRuleKey = researchRuleKey(executedRule);
  const [editedRule, setEditedRule] = useState(executedRule);
  const [editedRuleKey, setEditedRuleKey] = useState(executedRuleKey);
  const [editedSettlementMode, setEditedSettlementMode] = useState(settlementMode);
  const [formVersion, setFormVersion] = useState(0);
  const [isPending, startTransition] = useTransition();
  const isStale = hasResults &&
    (editedRuleKey !== executedRuleKey || editedSettlementMode !== settlementMode);

  function updateEditedRule(form: HTMLFormElement) {
    const formData = new FormData(form);
    const nextRule = researchRuleFromFormData(formData);
    setEditedRule(nextRule);
    setEditedRuleKey(researchRuleKey(nextRule));
    setEditedSettlementMode(settlementModeFromFormData(formData));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextRule = researchRuleFromFormData(formData);
    setEditedRule(nextRule);
    setEditedRuleKey(researchRuleKey(nextRule));
    setEditedSettlementMode(settlementModeFromFormData(formData));
    startTransition(() => {
      router.push(`/racing/research?${searchParamsFromFormData(formData).toString()}`);
    });
  }

  function clearFilters() {
    const nextRule = clearResearchRuleFilters(editedRule);
    setEditedRule(nextRule);
    setEditedRuleKey(researchRuleKey(nextRule));
    setFormVersion((version) => version + 1);
  }

  return (
    <>
      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <ResearchForm
          familyOptions={familyOptions}
          filterOptions={filterOptions}
          handicapStatusOptions={handicapStatusOptions}
          isPending={isPending}
          isStale={isStale}
          key={formVersion}
          onChange={() => {
            if (formRef.current) updateEditedRule(formRef.current);
          }}
          onClearFilters={clearFilters}
          onSubmit={onSubmit}
          rankMetricOptions={rankMetricOptions}
          ratingMetricOptions={ratingMetricOptions}
          returnBucketOptions={returnBucketOptions}
          ref={formRef}
          relativeMetricOptions={relativeMetricOptions}
          runAfterBreakOptions={runAfterBreakOptions}
          rule={editedRule}
          settlementMode={editedSettlementMode}
        />
      </section>

      {isStale ? (
        <section className="mt-6 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="font-semibold">Filters have changed — the results below are from the previous research run.</div>
          <div className="mt-1 text-amber-800">Run Research to update the results.</div>
        </section>
      ) : null}

      {hasResults ? (
        isStale ? staleSaveRulePanel : saveRulePanel
      ) : null}

      {children}
    </>
  );
}

export const ResearchForm = ({
  familyOptions,
  filterOptions,
  handicapStatusOptions,
  isPending,
  isStale,
  onChange,
  onClearFilters,
  onSubmit,
  rankMetricOptions,
  ratingMetricOptions,
  returnBucketOptions,
  relativeMetricOptions,
  runAfterBreakOptions,
  rule,
  settlementMode,
  ref,
}: {
  familyOptions: Array<Option<ResearchRuleV1["family"]>>;
  filterOptions: ResearchFilterOptions;
  handicapStatusOptions: Array<Option<HandicapStatusFilter>>;
  isPending: boolean;
  isStale: boolean;
  onChange: () => void;
  onClearFilters: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  rankMetricOptions: Array<Option<RankMetric>>;
  ratingMetricOptions: RatingOption[];
  returnBucketOptions: Array<Option<ReturnBucket>>;
  relativeMetricOptions: Array<Option<RelativeMetric>>;
  runAfterBreakOptions: Array<Option<RunAfterBreakFilter>>;
  rule: ResearchRuleV1;
  settlementMode: DevelopmentSettlementMode;
  ref: React.Ref<HTMLFormElement>;
}) => {
  const rating = rule.ratings[0];
  const relative = rule.relatives[0];
  const rank = rule.ranks.find((condition) =>
    condition.metric !== "officialRating" && condition.metric !== "turfPerformanceRating"
  );
  const officialRatingRank = rule.ranks.find((condition) => condition.metric === "officialRating");
  const legacyTprRank = rule.ranks.find((condition) => condition.metric === "turfPerformanceRating")?.range;
  const turfPerformance = legacyTprRank
    ? {
        version: TURF_PERFORMANCE_RATING_VERSION,
        ...rule.turfPerformance,
        rank: intersectFormRanges(rule.turfPerformance?.rank, legacyTprRank),
      }
    : rule.turfPerformance;
  const buttonLabel = researchRunButtonLabel({ isPending, isStale });
  const optionsMatchSelectedFamily = !filterOptions.family || filterOptions.family === rule.family;
  const courseOptions = optionsMatchSelectedFamily ? filterOptions.courses : [];
  const selectedCourseIds = selectedRuleIds(rule.race.courseIds, rule.race.courseId);
  const selectedTrainerIds = selectedRuleIds(rule.runner.trainerIds, rule.runner.trainerId);
  const specificTrainerSelected = selectedTrainerIds.length > 0;
  const impossibleStartingPriceRange = isImpossibleStartingPriceCondition(rule.startingPrice);
  return (
    <form action="/racing/research" className="space-y-6" method="get" onChange={onChange} onSubmit={onSubmit} ref={ref}>
      <div className="grid gap-4 md:grid-cols-4">
        <SelectField label="Race family" name="family" value={rule.family}>
          {familyOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </SelectField>
        <InputField label="Date from" name="from" type="date" value={rule.dateRange.from} />
        <InputField label="Date to" name="to" type="date" value={rule.dateRange.to} />
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          <div className="font-semibold text-slate-700">{STARTING_PRICE_INFO_HEADING}</div>
          <div className="mt-1">{STARTING_PRICE_INFO_HELP_TEXT}</div>
        </div>
      </div>

      <FilterGroup title="Race Filters">
        <MultiSelectField
          disabled={!optionsMatchSelectedFamily || courseOptions.length === 0}
          helpText={
            !optionsMatchSelectedFamily
              ? "Run Research to load course options for this family."
              : courseOptions.length === 0
                ? "Course options available after the 2025 cache is built."
                : undefined
          }
          clearLabel="Clear courses"
          key={`course-${optionsMatchSelectedFamily}`}
          label="Course"
          name="courseId"
          onSelectionChange={onChange}
          options={courseOptions.map((option) => ({
            id: option.courseId,
            label: option.courseName,
            count: option.count,
          }))}
          placeholder="All courses"
          searchPlaceholder="Search courses"
          selectedIds={optionsMatchSelectedFamily ? selectedCourseIds : []}
          summaryLabel="courses"
        />
        <SelectField label="Distance from" name="distanceFrom" value={rule.race.distanceBucketFrom ?? ""}>
          <option value="">Any distance</option>
          {filterOptions.distances.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </SelectField>
        <SelectField label="Distance to" name="distanceTo" value={rule.race.distanceBucketTo ?? ""}>
          <option value="">Any distance</option>
          {filterOptions.distances.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </SelectField>
        <RaceClassField filterOptions={filterOptions} rule={rule} />
        <SelectField label="Race type" name="handicapStatus" value={rule.race.handicapStatus ?? "all"}>
          {handicapStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </SelectField>
        <InputField label="Field min" name="fieldMin" type="number" value={rule.race.fieldSize?.min} />
        <InputField label="Field max" name="fieldMax" type="number" value={rule.race.fieldSize?.max} />
      </FilterGroup>

      <FilterGroup title="Starting Price">
        <SelectField label="Minimum price" name="spMin" value={startingPriceMinValue(rule.startingPrice)}>
          <option value="">Any minimum</option>
          {STARTING_PRICE_MIN_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </SelectField>
        <SelectField label="Maximum price" name="spMax" value={startingPriceMaxValue(rule.startingPrice)}>
          <option value="">Any maximum</option>
          {STARTING_PRICE_MAX_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </SelectField>
        <div className="md:col-span-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Uses final SP. Max 5/1 means decimal SP below 7.0, so 5/1 is included and 6/1 is excluded.
          {impossibleStartingPriceRange ? (
            <span className="mt-1 block font-medium text-amber-800">
              Minimum price is above the selected maximum price.
            </span>
          ) : null}
        </div>
      </FilterGroup>

      <FilterGroup title="Runner Filters">
        <InputField label="OR min" name="orMin" type="number" value={rule.runner.officialRating?.min} />
        <InputField label="OR max" name="orMax" type="number" value={rule.runner.officialRating?.max} />
        <TrainerField
          disabled={!optionsMatchSelectedFamily || Boolean(rule.runner.trainerCohort)}
          disabledReason={
            rule.runner.trainerCohort
              ? "Set Trainer cohort to All trainers to select manual trainers."
              : "Run Research to load trainer options for this family."
          }
          filterOptions={filterOptions}
          onSelectionChange={onChange}
          rule={rule}
        />
        <SelectField
          disabled={specificTrainerSelected}
          helpText={
            specificTrainerSelected
              ? "Clear the specific Trainer filter to use a cohort."
              : "Top trainers are ranked by prior-year wins within the selected race family. No current-year results are used."
          }
          label="Trainer cohort"
          name="trainerCohort"
          value={rule.runner.trainerCohort ? String(rule.runner.trainerCohort.top) : ""}
        >
          <option value="">All trainers</option>
          {TRAINER_COHORT_TOP_OPTIONS.map((top) => (
            <option key={top} value={top}>Top {top}</option>
          ))}
        </SelectField>
        <SelectField label="Weight min" name="weightMin" value={String(rule.runner.weightCarriedLbs?.min ?? "")}>
          <option value="">No minimum</option>
          {filterOptions.weights.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </SelectField>
        <SelectField label="Weight max" name="weightMax" value={String(rule.runner.weightCarriedLbs?.max ?? "")}>
          <option value="">No maximum</option>
          {filterOptions.weights.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </SelectField>
        <SelectField label="Return / layoff" name="returnBucket" value={rule.runner.returnBucket ?? "all"}>
          {returnBucketOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </SelectField>
        <SelectField label="Run after break" name="runAfterBreak" value={rule.runner.runAfterBreak ?? "all"}>
          {runAfterBreakOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </SelectField>
        <InputField label="Days since run min" name="daysMin" type="number" value={rule.runner.daysSinceRun?.min} />
        <InputField label="Days since run max" name="daysMax" type="number" value={rule.runner.daysSinceRun?.max} />
        <InputField label="Career prior runs min" name="priorRunsMin" type="number" value={rule.runner.priorRuns?.min} />
        <InputField label="Career prior runs max" name="priorRunsMax" type="number" value={rule.runner.priorRuns?.max} />
        <InputField label="Trainer prior runners min" name="trainerPriorRunsMin" type="number" value={rule.runner.trainerPriorRuns?.min} />
        <InputField label="Trainer prior runners max" name="trainerPriorRunsMax" type="number" value={rule.runner.trainerPriorRuns?.max} />
        <InputField label="Trainer prior strike rate min %" name="trainerPriorWinRateMin" step="0.1" type="number" value={rule.runner.trainerPriorWinRate?.min} />
        <InputField label="Trainer prior strike rate max %" name="trainerPriorWinRateMax" step="0.1" type="number" value={rule.runner.trainerPriorWinRate?.max} />
        <div className="md:col-span-2 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Career prior runs are completed runs before this race. No future races are used.
        </div>
        <div className="md:col-span-2 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Calculated from the trainer&apos;s settled runs before each race. No future races are used.
        </div>
      </FilterGroup>

      <FilterGroup title="Jockey">
        <JockeyField
          disabled={!optionsMatchSelectedFamily}
          filterOptions={filterOptions}
          onSelectionChange={onChange}
          rule={rule}
        />
        <InputField label="Jockey prior runs min" name="jockeyPriorRunsMin" type="number" value={rule.runner.jockeyPriorRuns?.min} />
        <InputField label="Jockey prior runs max" name="jockeyPriorRunsMax" type="number" value={rule.runner.jockeyPriorRuns?.max} />
        <InputField label="Jockey prior win rate min %" name="jockeyPriorWinRateMin" step="0.1" type="number" value={rule.runner.jockeyPriorWinRate?.min} />
        <InputField label="Jockey prior win rate max %" name="jockeyPriorWinRateMax" step="0.1" type="number" value={rule.runner.jockeyPriorWinRate?.max} />
        <div className="md:col-span-6 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Jockey statistics use settled rides before this race. No future races are used.
        </div>
      </FilterGroup>

      <FilterGroup title="Speed / Performance vs OR">
        <SelectField label="Speed rating metric" name="ratingMetric" value={rating?.metric ?? ""}>
          <option value="">No speed rating filter</option>
          {groupedRatingOptions(ratingMetricOptions).map(([group, options]) => (
            <optgroup key={group} label={group}>
              {options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </optgroup>
          ))}
        </SelectField>
        <InputField label="Speed rating min" name="ratingMin" type="number" value={rating?.range.min} />
        <InputField label="Speed rating max" name="ratingMax" type="number" value={rating?.range.max} />
        <SelectField label="OR-relative metric" name="relativeMetric" value={relative?.metric ?? ""}>
          <option value="">No OR-relative filter</option>
          {relativeMetricOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </SelectField>
        <InputField label="Relative min" name="relativeMin" type="number" value={relative?.range.min} />
        <InputField label="Relative max" name="relativeMax" type="number" value={relative?.range.max} />
      </FilterGroup>

      <FilterGroup title="Official Rating Rank">
        <InputField label="OR rank min" name="orRankMin" type="number" value={officialRatingRank?.range.min} />
        <InputField label="OR rank max" name="orRankMax" type="number" value={officialRatingRank?.range.max} />
        <div className="md:col-span-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Ranks are within the race, highest Official Rating first. Equal ratings share the same competition rank. Missing OR is excluded.
        </div>
      </FilterGroup>

      <FilterGroup title="Within-Race Rating Ranking">
        <SelectField label="Rank metric" name="rankMetric" value={rank?.metric ?? ""}>
          <option value="">No rank filter</option>
          {rankMetricOptions.filter((option) => option.value !== "officialRating").map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </SelectField>
        <InputField label="Rank min" name="rankMin" type="number" value={rank?.range.min} />
        <InputField label="Rank max" name="rankMax" type="number" value={rank?.range.max} />
        <div className="md:col-span-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Ranks are per race, highest value first. Missing values and non-runners are excluded. Equal values share the same competition rank.
        </div>
      </FilterGroup>

      {rule.family === "turf_flat" ? (
        <FilterGroup title="Turf Performance Rating — Diagnostic">
          <InputField label="TPR score min" name="tprMin" step="0.1" type="number" value={turfPerformance?.rating?.min} />
          <InputField label="TPR score max" name="tprMax" step="0.1" type="number" value={turfPerformance?.rating?.max} />
          <InputField label="TPR rank min" name="tprRankMin" type="number" value={turfPerformance?.rank?.min} />
          <InputField label="TPR rank max" name="tprRankMax" type="number" value={turfPerformance?.rank?.max} />
          <InputField label="TPR lead min" name="tprLeadMin" step="0.1" type="number" value={turfPerformance?.lead?.min} />
          <InputField label="TPR lead max" name="tprLeadMax" step="0.1" type="number" value={turfPerformance?.lead?.max} />
          <div className="md:col-span-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            Uses frozen {TURF_PERFORMANCE_RATING_VERSION}. TPR rank is within race, highest TPR first. TPR lead is only defined for the rank-1 horse as its points advantage over rank 2.
          </div>
        </FilterGroup>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <SelectField label="Development settlement" name="settlementMode" value={settlementMode}>
          {DEVELOPMENT_SETTLEMENT_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </SelectField>
        <button
          className="inline-flex items-center gap-2 bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-wait disabled:bg-emerald-950/70"
          disabled={isResearchSubmitDisabled(isPending)}
          type="submit"
        >
          {isPending ? <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : null}
          {buttonLabel}
        </button>
        <button
          className="border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50"
          onClick={onClearFilters}
          type="button"
        >
          Clear all filters
        </button>
        <span className="max-w-xl text-sm text-slate-500">
          For development analysis only. This does not change which horses are selected or the frozen rule.
        </span>
      </div>
    </form>
  );
};

export function canSaveExecutedRule(input: { hasResults: boolean; isStale: boolean }): boolean {
  return input.hasResults && !input.isStale;
}

export function clearResearchRuleFilters(rule: ResearchRuleV1): ResearchRuleV1 {
  return {
    version: "research_rule_v1",
    family: rule.family,
    dateRange: { from: "2025-01-01", to: "2025-12-31" },
    race: {},
    runner: {},
    ratings: [],
    relatives: [],
    ranks: [],
  };
}

export function researchRuleFromFormData(formData: FormData): ResearchRuleV1 {
  const ratingMetric = textValue(formData.get("ratingMetric")) as RatingMetric | undefined;
  const relativeMetric = textValue(formData.get("relativeMetric")) as RelativeMetric | undefined;
  const rankMetricValue = textValue(formData.get("rankMetric"));
  const rankMetric = RANK_METRIC_OPTIONS.some((option) => option.value === rankMetricValue)
    ? rankMetricValue as RankMetric
    : undefined;
  const family = familyValue(textValue(formData.get("family")));
  const ratingRange = rangeFromFormData(formData, "ratingMin", "ratingMax");
  const relativeRange = rangeFromFormData(formData, "relativeMin", "relativeMax");
  const rankRange = rangeFromFormData(formData, "rankMin", "rankMax");
  const officialRatingRankRange = rangeFromFormData(formData, "orRankMin", "orRankMax");
  const tprRatingRange = rangeFromFormData(formData, "tprMin", "tprMax");
  const tprRankRange = rangeFromFormData(formData, "tprRankMin", "tprRankMax");
  const tprLeadRange = rangeFromFormData(formData, "tprLeadMin", "tprLeadMax");
  return {
    version: "research_rule_v1",
    family,
    dateRange: {
      from: textValue(formData.get("from")) ?? "2025-01-01",
      to: textValue(formData.get("to")) ?? "2025-12-31",
    },
    race: {
      courseIds: textValues(formData.getAll("courseId")),
      raceClasses: normalizeRaceClasses(formData.getAll("class")),
      handicapStatus: handicapStatusValue(textValue(formData.get("handicapStatus"))),
      distanceBucketFrom: textValue(formData.get("distanceFrom")),
      distanceBucketTo: textValue(formData.get("distanceTo")),
      fieldSize: rangeFromFormData(formData, "fieldMin", "fieldMax"),
    },
    runner: {
      trainerIds: textValues(formData.getAll("trainerId")),
      jockeyIds: textValues(formData.getAll("jockeyId")),
      trainerCohort: trainerCohortFromFormData(formData),
      returnBucket: returnBucketValue(textValue(formData.get("returnBucket"))),
      runAfterBreak: runAfterBreakValue(textValue(formData.get("runAfterBreak"))),
      officialRating: rangeFromFormData(formData, "orMin", "orMax"),
      weightCarriedLbs: rangeFromFormData(formData, "weightMin", "weightMax"),
      daysSinceRun: rangeFromFormData(formData, "daysMin", "daysMax"),
      priorRuns: rangeFromFormData(formData, "priorRunsMin", "priorRunsMax"),
      trainerPriorRuns: rangeFromFormData(formData, "trainerPriorRunsMin", "trainerPriorRunsMax"),
      trainerPriorWinRate: rangeFromFormData(formData, "trainerPriorWinRateMin", "trainerPriorWinRateMax"),
      jockeyPriorRuns: rangeFromFormData(formData, "jockeyPriorRunsMin", "jockeyPriorRunsMax"),
      jockeyPriorWinRate: rangeFromFormData(formData, "jockeyPriorWinRateMin", "jockeyPriorWinRateMax"),
    },
    ratings: ratingMetric && ratingRange ? [{ metric: ratingMetric, range: ratingRange }] : [],
    relatives: relativeMetric && relativeRange ? [{ metric: relativeMetric, range: relativeRange }] : [],
    ranks: [
      ...(rankMetric && rankRange ? [{ metric: rankMetric, range: rankRange }] : []),
      ...(officialRatingRankRange ? [{ metric: "officialRating" as const, range: officialRatingRankRange }] : []),
    ],
    turfPerformance: family === "turf_flat" && (tprRatingRange || tprRankRange || tprLeadRange)
      ? {
          version: TURF_PERFORMANCE_RATING_VERSION,
          rating: tprRatingRange,
          rank: tprRankRange,
          lead: tprLeadRange,
        }
      : undefined,
    startingPrice: startingPriceConditionFromValues(
      textValue(formData.get("spMin")),
      textValue(formData.get("spMax")),
    ),
  };
}

function trainerCohortFromFormData(formData: FormData) {
  if (textValues(formData.getAll("trainerId")).length > 0) {
    return undefined;
  }
  const top = Number(textValue(formData.get("trainerCohort")));
  return TRAINER_COHORT_TOP_OPTIONS.includes(top as typeof TRAINER_COHORT_TOP_OPTIONS[number])
    ? trainerCohortRule(top as typeof TRAINER_COHORT_TOP_OPTIONS[number])
    : undefined;
}

export function settlementModeFromFormData(formData: FormData): DevelopmentSettlementMode {
  return parseDevelopmentSettlementMode(textValue(formData.get("settlementMode")));
}

export function researchRunButtonLabel(input: { isPending: boolean; isStale: boolean }): string {
  if (input.isPending) {
    return "Running Research...";
  }
  return input.isStale ? "Update Results" : "Run Research";
}

export function isResearchSubmitDisabled(isPending: boolean): boolean {
  return isPending;
}

function FilterGroup({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold uppercase text-slate-500">{title}</legend>
      <div className="grid gap-4 md:grid-cols-6">{children}</div>
    </fieldset>
  );
}

function TrainerField({
  disabled = false,
  disabledReason = "Run Research to load trainer options for this family.",
  filterOptions,
  onSelectionChange,
  rule,
}: {
  disabled?: boolean;
  disabledReason?: string;
  filterOptions: ResearchFilterOptions;
  onSelectionChange: () => void;
  rule: ResearchRuleV1;
}) {
  return (
    <MultiSelectField
      clearLabel="Clear trainers"
      disabled={disabled}
      helpText={
        disabled
          ? disabledReason
          : filterOptions.trainers.length === 0
            ? "Trainer options available after the 2025 cache is built."
            : undefined
      }
      label="Trainer"
      key={`trainer-${disabled}`}
      name="trainerId"
      onSelectionChange={onSelectionChange}
      options={filterOptions.trainers.map((option) => ({
        id: option.trainerId,
        label: option.trainerName,
        count: option.count,
      }))}
      placeholder="All trainers"
      searchPlaceholder="Search trainers"
      selectedIds={disabled ? [] : selectedRuleIds(rule.runner.trainerIds, rule.runner.trainerId)}
      summaryLabel="trainers"
    />
  );
}

function JockeyField({
  disabled = false,
  filterOptions,
  onSelectionChange,
  rule,
}: {
  disabled?: boolean;
  filterOptions: ResearchFilterOptions;
  onSelectionChange: () => void;
  rule: ResearchRuleV1;
}) {
  return (
    <MultiSelectField
      clearLabel="Clear jockeys"
      disabled={disabled || (filterOptions.jockeys ?? []).length === 0}
      helpText={
        disabled
          ? "Run Research to load jockey options for this family."
          : (filterOptions.jockeys ?? []).length === 0
            ? "Jockey options available after the v4 cache is built."
            : undefined
      }
      label="Jockey"
      name="jockeyId"
      onSelectionChange={onSelectionChange}
      options={(filterOptions.jockeys ?? []).map((option) => ({
        id: option.jockeyId,
        label: option.jockeyName,
        count: option.count,
      }))}
      placeholder="Any jockey"
      searchPlaceholder="Search jockeys"
      selectedIds={disabled ? [] : selectedRuleIds(rule.runner.jockeyIds, rule.runner.jockeyId)}
      summaryLabel="jockeys"
    />
  );
}

function MultiSelectField({
  clearLabel,
  disabled = false,
  helpText,
  label,
  name,
  onSelectionChange,
  options,
  placeholder,
  searchPlaceholder,
  selectedIds,
  summaryLabel,
}: {
  clearLabel: string;
  disabled?: boolean;
  helpText?: string;
  label: string;
  name: string;
  onSelectionChange: () => void;
  options: MultiSelectOption[];
  placeholder: string;
  searchPlaceholder: string;
  selectedIds: string[];
  summaryLabel: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => selectedRuleIds(selectedIds));
  const hasMountedRef = useRef(false);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const selectedKey = selected.join("\0");
  const selectedSet = new Set(selected);
  const optionById = new Map(options.map((option) => [option.id, option]));
  const visibleOptions = filterMultiSelectOptions(options, query);
  const hasOptions = !disabled && options.length > 0;
  const summary = selectionSummary(selected, optionById, placeholder, summaryLabel);
  const visibleSelectedChips = selected.slice(0, VISIBLE_SELECTED_CHIP_LIMIT);
  const hiddenSelectedCount = selected.length - visibleSelectedChips.length;
  const listboxId = `${name}-multi-select-options`;

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    onSelectionChangeRef.current();
  }, [selectedKey]);

  function toggle(id: string) {
    setSelected((current) => toggleSelectedId(current, id));
  }

  function remove(id: string) {
    setSelected((current) => removeSelectedId(current, id));
  }

  function clear() {
    setSelected([]);
    setQuery("");
  }

  return (
    <div className="relative block text-sm">
      <div className="font-medium text-slate-700">{label}</div>
      {selected.map((id) => (
        <input disabled={disabled} key={id} name={name} type="hidden" value={id} />
      ))}
      <button
        aria-controls={listboxId}
        aria-expanded={isOpen && hasOptions}
        className="mt-1 w-full cursor-pointer border border-slate-300 bg-white px-3 py-2 text-left text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        disabled={!hasOptions}
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        {summary}
      </button>
      {selected.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visibleSelectedChips.map((id) => {
            const option = optionById.get(id);
            return (
              <span className="inline-flex max-w-full items-center gap-1 border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-950" key={id}>
                <span className="truncate">{option?.label ?? id}</span>
                <button
                  aria-label={`Remove ${option?.label ?? id}`}
                  className="font-semibold text-emerald-800 hover:text-emerald-950"
                  onClick={() => remove(id)}
                  type="button"
                >
                  ×
                </button>
              </span>
            );
          })}
          {hiddenSelectedCount > 0 ? (
            <span className="inline-flex items-center border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
              +{hiddenSelectedCount} more selected
            </span>
          ) : null}
        </div>
      ) : null}
      {isOpen && hasOptions ? (
        <div
          aria-multiselectable="true"
          className="absolute z-20 mt-1 w-full border border-slate-300 bg-white p-2 shadow-lg"
          id={listboxId}
          role="listbox"
        >
          <input
            autoComplete="off"
            className="mb-2 w-full border border-slate-300 px-2 py-1 text-sm"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setIsOpen(false);
            }}
            placeholder={searchPlaceholder}
            type="search"
            value={query}
          />
          <button
            className="mb-2 px-2 py-1 text-xs font-medium text-emerald-800 hover:underline"
            onClick={clear}
            type="button"
          >
            {clearLabel}
          </button>
          <div className="max-h-96 overflow-y-auto">
            {visibleOptions.map((option) => (
              <button
                aria-checked={selectedSet.has(option.id)}
                className={[
                  "flex w-full items-center justify-between gap-3 px-2 py-1.5 text-left outline-offset-2",
                  selectedSet.has(option.id)
                    ? "bg-emerald-50 font-medium text-emerald-950 hover:bg-emerald-100"
                    : "hover:bg-slate-50",
                ].join(" ")}
                key={option.id}
                onClick={() => toggle(option.id)}
                role="checkbox"
                type="button"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={[
                      "inline-flex h-4 w-4 shrink-0 items-center justify-center border text-[10px] leading-none",
                      selectedSet.has(option.id)
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-slate-400 bg-white text-transparent",
                    ].join(" ")}
                  >
                    ✓
                  </span>
                  <span className="min-w-0 truncate">{option.label}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {selectedSet.has(option.id) ? "Selected" : option.count?.toLocaleString() ?? ""}
                </span>
              </button>
            ))}
            {visibleOptions.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-slate-500">No matches.</div>
            ) : null}
          </div>
        </div>
      ) : null}
      {disabled ? (
        <p className="mt-1 text-xs text-amber-800">{helpText}</p>
      ) : helpText ? (
        <p className="mt-1 text-xs text-amber-800">{helpText}</p>
      ) : null}
    </div>
  );
}

function RaceClassField({
  filterOptions,
  rule,
}: {
  filterOptions: ResearchFilterOptions;
  rule: ResearchRuleV1;
}) {
  const selected = new Set(normalizeRaceClasses(rule.race.raceClasses) ?? []);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  function clearClasses() {
    const inputs = detailsRef.current?.querySelectorAll<HTMLInputElement>("input[name='class']");
    inputs?.forEach((input) => {
      input.checked = false;
    });
    detailsRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return (
    <details className="relative block text-sm" ref={detailsRef}>
      <summary className="cursor-pointer font-medium text-slate-700">
        Race class
        <span className="mt-1 block border border-slate-300 bg-white px-3 py-2 font-normal text-slate-950">
          {selected.size === 0 ? "All classes" : raceClassSelectionLabel([...selected])}
        </span>
      </summary>
      <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto border border-slate-300 bg-white p-2 shadow-lg">
        {filterOptions.classes.length === 0 ? (
          <div className="px-2 py-1 text-sm text-slate-500">Class options available after the 2025 cache is built.</div>
        ) : (
          <>
            <div className="mb-2 text-xs text-slate-500">Clear by unticking all classes.</div>
            <button
              className="mb-2 px-2 py-1 text-xs font-medium text-emerald-800 hover:underline"
              onClick={clearClasses}
              type="button"
            >
              Clear classes
            </button>
            {filterOptions.classes.map((option) => (
              <label className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50" key={option.value}>
                <input
                  defaultChecked={selected.has(option.value)}
                  name="class"
                  type="checkbox"
                  value={option.value}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </>
        )}
      </div>
    </details>
  );
}

function raceClassSelectionLabel(classes: number[]): string {
  const sorted = normalizeRaceClasses(classes) ?? [];
  if (sorted.length === 1) {
    return `Class ${sorted[0]}`;
  }
  return `${sorted.length} classes selected`;
}

function InputField({
  label,
  name,
  step,
  type = "text",
  value,
}: {
  label: string;
  name: string;
  step?: string;
  type?: string;
  value?: string | number;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input
        className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm"
        defaultValue={value ?? ""}
        name={name}
        step={step}
        type={type}
      />
    </label>
  );
}

function SelectField({
  children,
  disabled = false,
  helpText,
  label,
  name,
  value,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  helpText?: string;
  label: string;
  name: string;
  value: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <select
        className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm"
        defaultValue={value}
        disabled={disabled}
        name={name}
      >
        {children}
      </select>
      {helpText ? <p className="mt-1 text-xs text-amber-800">{helpText}</p> : null}
    </label>
  );
}

function groupedRatingOptions(options: RatingOption[]) {
  const groups = new Map<string, RatingOption[]>();
  for (const option of options) {
    groups.set(option.group, [...(groups.get(option.group) ?? []), option]);
  }
  return [...groups.entries()];
}

export function filterTrainerOptions(
  options: ResearchFilterOptions["trainers"],
  query: string,
  limit?: number,
) {
  return filterMultiSelectOptions(
    options.map((option) => ({ id: option.trainerId, label: option.trainerName, count: option.count })),
    query,
    limit,
  ).map((option) => ({
    trainerId: option.id,
    trainerName: option.label,
    count: option.count ?? 0,
  }));
}

export function selectedTrainerOption(
  options: ResearchFilterOptions["trainers"],
  trainerId: string | undefined,
) {
  return trainerId ? options.find((option) => option.trainerId === trainerId) ?? null : null;
}

export function filterMultiSelectOptions(
  options: MultiSelectOption[],
  query: string,
  limit?: number,
) {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? options.filter((option) => option.label.toLowerCase().includes(normalizedQuery))
    : options;
  return limit === undefined ? filtered : filtered.slice(0, limit);
}

function selectionSummary(
  selected: string[],
  optionById: Map<string, MultiSelectOption>,
  placeholder: string,
  summaryLabel: string,
) {
  if (selected.length === 0) {
    return placeholder;
  }
  const names = selected.map((id) => optionById.get(id)?.label ?? id);
  if (names.length <= 2) {
    return names.join("; ");
  }
  return `${names.length} ${summaryLabel} selected`;
}

export function toggleSelectedId(current: readonly string[], id: string): string[] {
  return current.includes(id)
    ? removeSelectedId(current, id)
    : selectedRuleIds([...current, id]);
}

export function removeSelectedId(current: readonly string[], id: string): string[] {
  return current.filter((value) => value !== id);
}

function rangeFromFormData(formData: FormData, minKey: string, maxKey: string) {
  const min = numberValue(formData.get(minKey));
  const max = numberValue(formData.get(maxKey));
  return min === undefined && max === undefined ? undefined : { min, max };
}

function searchParamsFromFormData(formData: FormData): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of formData.entries()) {
    if (key.endsWith("Search")) continue;
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) continue;
    if (key === "class" || key === "trainerId" || key === "courseId" || key === "jockeyId") {
      params.append(key, text);
    } else {
      params.set(key, text);
    }
  }
  return params;
}

function numberValue(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function textValue(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : undefined;
}

function intersectFormRanges(
  left: { min?: number; max?: number } | undefined,
  right: { min?: number; max?: number },
) {
  const mins = [left?.min, right.min].filter((value): value is number => value !== undefined);
  const maxes = [left?.max, right.max].filter((value): value is number => value !== undefined);
  return {
    min: mins.length > 0 ? Math.max(...mins) : undefined,
    max: maxes.length > 0 ? Math.min(...maxes) : undefined,
  };
}

function textValues(values: FormDataEntryValue[]): string[] {
  return selectedRuleIds(values.filter((value): value is string => typeof value === "string"));
}

function selectedRuleIds(values: readonly unknown[] | undefined, legacyValue?: string | undefined): string[] {
  const unique = new Set<string>();
  for (const value of [...(values ?? []), legacyValue]) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text) unique.add(text);
  }
  return [...unique].sort((left, right) => left.localeCompare(right));
}

function familyValue(value: string | undefined): ResearchRuleV1["family"] {
  if (value === "all_weather_flat" || value === "turf_flat") {
    return value;
  }
  return "jump";
}

function handicapStatusValue(value: string | undefined): HandicapStatusFilter | undefined {
  if (value === "handicap" || value === "non_handicap" || value === "unknown") {
    return value;
  }
  return value === "all" ? "all" : undefined;
}

function returnBucketValue(value: string | undefined): ReturnBucket | undefined {
  if (
    value === "days_0_30" ||
    value === "days_31_60" ||
    value === "days_61_90" ||
    value === "days_91_180" ||
    value === "days_181_365" ||
    value === "days_366_plus" ||
    value === "first_run"
  ) {
    return value;
  }
  return value === "all" ? "all" : undefined;
}

function runAfterBreakValue(value: string | undefined): RunAfterBreakFilter | undefined {
  if (value === "run_1" || value === "run_2" || value === "run_3" || value === "run_4_plus") {
    return value;
  }
  return value === "all" ? "all" : undefined;
}

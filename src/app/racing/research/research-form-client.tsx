"use client";

import type React from "react";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { normalizeRaceClasses } from "@/lib/racing/research-rule-classes";
import { researchRuleKey } from "@/lib/racing/research-rule-identity";
import type {
  HandicapStatusFilter,
  RankMetric,
  RatingMetric,
  RelativeMetric,
  ResearchFilterOptions,
  ResearchRuleV1,
  ReturnBucket,
  RunAfterBreakFilter,
} from "@/lib/racing/research-rule";

type Option<T extends string = string> = { value: T; label: string };
type RatingOption = Option<RatingMetric> & { group: string };

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
  saveRulePanel?: React.ReactNode;
  staleSaveRulePanel?: React.ReactNode;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const executedRuleKey = researchRuleKey(executedRule);
  const [editedRule, setEditedRule] = useState(executedRule);
  const [editedRuleKey, setEditedRuleKey] = useState(executedRuleKey);
  const [formVersion, setFormVersion] = useState(0);
  const [isPending, startTransition] = useTransition();
  const isStale = hasResults && editedRuleKey !== executedRuleKey;

  function updateEditedRule(form: HTMLFormElement) {
    const nextRule = researchRuleFromFormData(new FormData(form));
    setEditedRule(nextRule);
    setEditedRuleKey(researchRuleKey(nextRule));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextRule = researchRuleFromFormData(formData);
    setEditedRule(nextRule);
    setEditedRuleKey(researchRuleKey(nextRule));
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
  ref: React.Ref<HTMLFormElement>;
}) => {
  const rating = rule.ratings[0];
  const relative = rule.relatives[0];
  const rank = rule.ranks[0];
  const buttonLabel = researchRunButtonLabel({ isPending, isStale });
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
          <div className="font-semibold text-slate-700">Historical pre-race odds</div>
          <div className="mt-1">Not yet available. Result SP is used only after selection for settlement.</div>
        </div>
      </div>

      <FilterGroup title="Race Filters">
        <SelectField label="Course" name="courseId" value={rule.race.courseId ?? ""}>
          <option value="">All courses</option>
          {filterOptions.courses.map((option) => (
            <option key={option.courseId} value={option.courseId}>{option.courseName}</option>
          ))}
        </SelectField>
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

      <FilterGroup title="Runner Filters">
        <InputField label="OR min" name="orMin" type="number" value={rule.runner.officialRating?.min} />
        <InputField label="OR max" name="orMax" type="number" value={rule.runner.officialRating?.max} />
        <TrainerField filterOptions={filterOptions} onSelectionChange={onChange} rule={rule} />
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
        <InputField label="Prior runs min" name="priorRunsMin" type="number" value={rule.runner.priorRuns?.min} />
        <InputField label="Prior runs max" name="priorRunsMax" type="number" value={rule.runner.priorRuns?.max} />
        <InputField label="Trainer prior runners min" name="trainerPriorRunsMin" type="number" value={rule.runner.trainerPriorRuns?.min} />
        <InputField label="Trainer prior runners max" name="trainerPriorRunsMax" type="number" value={rule.runner.trainerPriorRuns?.max} />
        <InputField label="Trainer prior strike rate min %" name="trainerPriorWinRateMin" step="0.1" type="number" value={rule.runner.trainerPriorWinRate?.min} />
        <InputField label="Trainer prior strike rate max %" name="trainerPriorWinRateMax" step="0.1" type="number" value={rule.runner.trainerPriorWinRate?.max} />
        <div className="md:col-span-2 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Calculated from the trainer&apos;s settled runs before each race. No future races are used.
        </div>
      </FilterGroup>

      <FilterGroup title="Speed Rating And OR-Relative Filters">
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

      <FilterGroup title="Within-Race Ranking">
        <SelectField label="Rank metric" name="rankMetric" value={rank?.metric ?? ""}>
          <option value="">No rank filter</option>
          {rankMetricOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </SelectField>
        <InputField label="Rank min" name="rankMin" type="number" value={rank?.range.min} />
        <InputField label="Rank max" name="rankMax" type="number" value={rank?.range.max} />
        <div className="md:col-span-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Ranks are per race, highest value first. Missing values and non-runners are excluded. Equal values share the same competition rank.
        </div>
      </FilterGroup>

      <div className="flex flex-wrap items-center gap-3">
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
        <span className="text-sm text-slate-500">Run a 2025 research result before saving or freezing rules.</span>
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
  const rankMetric = textValue(formData.get("rankMetric")) as RankMetric | undefined;
  const ratingRange = rangeFromFormData(formData, "ratingMin", "ratingMax");
  const relativeRange = rangeFromFormData(formData, "relativeMin", "relativeMax");
  const rankRange = rangeFromFormData(formData, "rankMin", "rankMax");
  return {
    version: "research_rule_v1",
    family: familyValue(textValue(formData.get("family"))),
    dateRange: {
      from: textValue(formData.get("from")) ?? "2025-01-01",
      to: textValue(formData.get("to")) ?? "2025-12-31",
    },
    race: {
      courseId: textValue(formData.get("courseId")),
      raceClasses: normalizeRaceClasses(formData.getAll("class")),
      handicapStatus: handicapStatusValue(textValue(formData.get("handicapStatus"))),
      distanceBucketFrom: textValue(formData.get("distanceFrom")),
      distanceBucketTo: textValue(formData.get("distanceTo")),
      fieldSize: rangeFromFormData(formData, "fieldMin", "fieldMax"),
    },
    runner: {
      trainerId: textValue(formData.get("trainerId")),
      returnBucket: returnBucketValue(textValue(formData.get("returnBucket"))),
      runAfterBreak: runAfterBreakValue(textValue(formData.get("runAfterBreak"))),
      officialRating: rangeFromFormData(formData, "orMin", "orMax"),
      weightCarriedLbs: rangeFromFormData(formData, "weightMin", "weightMax"),
      daysSinceRun: rangeFromFormData(formData, "daysMin", "daysMax"),
      priorRuns: rangeFromFormData(formData, "priorRunsMin", "priorRunsMax"),
      trainerPriorRuns: rangeFromFormData(formData, "trainerPriorRunsMin", "trainerPriorRunsMax"),
      trainerPriorWinRate: rangeFromFormData(formData, "trainerPriorWinRateMin", "trainerPriorWinRateMax"),
    },
    ratings: ratingMetric && ratingRange ? [{ metric: ratingMetric, range: ratingRange }] : [],
    relatives: relativeMetric && relativeRange ? [{ metric: relativeMetric, range: relativeRange }] : [],
    ranks: rankMetric && rankRange ? [{ metric: rankMetric, range: rankRange }] : [],
  };
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
  filterOptions,
  onSelectionChange,
  rule,
}: {
  filterOptions: ResearchFilterOptions;
  onSelectionChange: () => void;
  rule: ResearchRuleV1;
}) {
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const selectedTrainer = selectedTrainerOption(filterOptions.trainers, rule.runner.trainerId);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(selectedTrainer?.trainerName ?? "");
  const [selectedId, setSelectedId] = useState(selectedTrainer?.trainerId ?? "");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTrainers = filterTrainerOptions(filterOptions.trainers, normalizedQuery);
  const hasTrainerOptions = filterOptions.trainers.length > 0;
  const listboxId = "trainer-options";

  function setTrainer(trainerId: string, trainerName: string) {
    setSelectedId(trainerId);
    setQuery(trainerName);
    setIsOpen(false);
    if (hiddenInputRef.current) {
      hiddenInputRef.current.value = trainerId;
      hiddenInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      onSelectionChange();
    }
  }

  function clearTrainer() {
    setSelectedId("");
    setQuery("");
    setIsOpen(false);
    if (hiddenInputRef.current) {
      hiddenInputRef.current.value = "";
      hiddenInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      onSelectionChange();
    }
  }

  return (
    <div className="relative block text-sm">
      <label className="font-medium text-slate-700" htmlFor="trainerCombobox">Trainer</label>
      <input name="trainerId" ref={hiddenInputRef} type="hidden" value={selectedId} />
      <input
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        autoComplete="off"
        className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
        disabled={!hasTrainerOptions}
        id="trainerCombobox"
        onBlur={() => {
          window.setTimeout(() => setIsOpen(false), 120);
        }}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setSelectedId("");
          setIsOpen(true);
          if (hiddenInputRef.current) {
            hiddenInputRef.current.value = "";
            hiddenInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }}
        onFocus={() => setIsOpen(hasTrainerOptions)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setIsOpen(false);
          if (event.key === "ArrowDown") setIsOpen(hasTrainerOptions);
        }}
        placeholder="All trainers"
        role="combobox"
        type="search"
        value={query}
      />
      {selectedId ? (
        <button
          className="mt-1 text-xs font-medium text-emerald-800 hover:underline"
          onMouseDown={(event) => event.preventDefault()}
          onClick={clearTrainer}
          type="button"
        >
          Clear trainer
        </button>
      ) : null}
      {!hasTrainerOptions ? (
        <p className="mt-1 text-xs text-amber-800">Trainer options available after the 2025 cache is built.</p>
      ) : null}
      {isOpen && hasTrainerOptions ? (
        <div
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto border border-slate-300 bg-white shadow-lg"
          id={listboxId}
          role="listbox"
        >
          <button
            className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
            onMouseDown={(event) => event.preventDefault()}
            onClick={clearTrainer}
            type="button"
          >
            All trainers
          </button>
          {visibleTrainers.map((option) => (
            <button
              aria-selected={option.trainerId === selectedId}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-emerald-50"
              key={option.trainerId}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setTrainer(option.trainerId, option.trainerName)}
              role="option"
              type="button"
            >
              {option.trainerName}
            </button>
          ))}
          {visibleTrainers.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500">No trainers match.</div>
          ) : null}
        </div>
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
  label,
  name,
  value,
}: {
  children: React.ReactNode;
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
        name={name}
      >
        {children}
      </select>
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
  limit = 80,
) {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? options.filter((option) => option.trainerName.toLowerCase().includes(normalizedQuery))
    : options;
  return filtered.slice(0, limit);
}

export function selectedTrainerOption(
  options: ResearchFilterOptions["trainers"],
  trainerId: string | undefined,
) {
  return trainerId ? options.find((option) => option.trainerId === trainerId) ?? null : null;
}

function rangeFromFormData(formData: FormData, minKey: string, maxKey: string) {
  const min = numberValue(formData.get(minKey));
  const max = numberValue(formData.get(maxKey));
  return min === undefined && max === undefined ? undefined : { min, max };
}

function searchParamsFromFormData(formData: FormData): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of formData.entries()) {
    if (key === "trainerSearch") continue;
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) continue;
    if (key === "class") {
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

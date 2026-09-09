import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mean, median } from "@/lib/racing/speed-research";

const OUTPUT_DIR = "data/research";
const REPORT_PATH = `${OUTPUT_DIR}/jump-rating-policy-refinement-2025-2026.txt`;
const SUMMARY_CSV_PATH = `${OUTPUT_DIR}/jump-rating-policy-refinement-2025-2026-summary.csv`;

type JumpSubtype = "hurdle" | "chase" | "nh_flat" | "unknown_other";
type Method = "base" | "same_day" | "hierarchy";
type SplModel = "speed_based" | "fixed_020" | "race_category";
type Policy =
  | { name: "no_cap"; kind: "none" }
  | { name: "exclude_gt_50" | "exclude_gt_75" | "exclude_gt_100"; kind: "exclude"; threshold: number }
  | { name: "cap_50" | "cap_75" | "cap_100"; kind: "cap"; threshold: number };

type RaceRow = {
  race_source_id: string;
  race_date: string;
  course: string;
  race_name: string;
  race_type: string;
  race_class: string;
  distance: string;
  distance_yards: number | null;
  segment: string;
  surface: string;
  going: string;
  actual: number;
  base_standard: number;
  base_sample: number;
  deviation_per_f: number;
  same_day_peer_count: number;
  same_day_stdev_per_f: number | null;
  conservative_same_day_adj_per_f: number | null;
};

type RunnerRow = {
  race_source_id: string;
  race_date: string;
  course: string;
  race_name: string;
  race_type: string;
  race_class: string;
  distance: string;
  distance_yards: number | null;
  segment: string;
  surface: string;
  going: string;
  actual_winning_time: number;
  equivalent_time_seconds: number;
  runner_source_id: string;
  horse: string;
  finish_position: number | null;
  official_rating: number | null;
  base_standard: number;
  same_day_peer_count: number;
  same_day_stdev_per_f: number | null;
  conservative_same_day_adj_per_f: number | null;
};

type JoinedRunner = RunnerRow & {
  race: RaceRow;
  subtype: JumpSubtype;
  cumulativeBeatenLengths: number;
};

type Dataset = {
  label: "2025" | "2026";
  startDate: string;
  endDate: string;
  races: RaceRow[];
  runners: JoinedRunner[];
};

type Calibration = {
  secPerFPoints: number;
  sampleSize: number;
};

const POLICIES: Policy[] = [
  { name: "no_cap", kind: "none" },
  { name: "exclude_gt_50", kind: "exclude", threshold: 50 },
  { name: "exclude_gt_75", kind: "exclude", threshold: 75 },
  { name: "exclude_gt_100", kind: "exclude", threshold: 100 },
  { name: "cap_50", kind: "cap", threshold: 50 },
  { name: "cap_75", kind: "cap", threshold: 75 },
  { name: "cap_100", kind: "cap", threshold: 100 },
];

async function main() {
  const datasets = [
    await loadDataset("2025", "2025-01-01", "2025-12-31"),
    await loadDataset("2026", "2026-01-01", "2026-08-31"),
  ];
  const calibration = calibrate(datasets[0].runners);

  const lines: string[] = [];
  lines.push("# Jump Rating Policy Refinement 2025-2026");
  lines.push("");
  lines.push("## Scope");
  lines.push("production_changes=false");
  lines.push("schema_changes=false");
  lines.push("ratings_persisted=false");
  lines.push("calibration=unchanged 2025 sec_per_f calibration");
  lines.push(`sec_per_f_points_per_sec_per_f=${fmt(calibration.secPerFPoints)}`);
  lines.push(`calibration_sample=${calibration.sampleSize}`);
  lines.push("");
  lines.push("## Coverage");
  lines.push(...datasets.map(coverageLine));
  lines.push("");
  lines.push("## Beaten Distance Bands");
  lines.push(...datasets.flatMap((dataset) => beatenDistanceBandLines(dataset, calibration)));
  lines.push("");
  lines.push("## Seconds Per Length Stress Test");
  lines.push(...datasets.flatMap((dataset) => splStressLines(dataset, calibration)));
  lines.push("");
  lines.push("## Cap And Exclusion Policies");
  lines.push(...datasets.flatMap((dataset) => policyLines(dataset, calibration)));
  lines.push("");
  lines.push("## Same-Day Eligibility");
  lines.push(...datasets.flatMap((dataset) => sameDayEligibilityLines(dataset, calibration)));
  lines.push("");
  lines.push("## Fallback Policy");
  lines.push(...datasets.flatMap((dataset) => fallbackPolicyLines(dataset, calibration)));
  lines.push("");
  lines.push("## Confidence Framework");
  lines.push(...datasets.flatMap((dataset) => confidenceLines(dataset, calibration)));
  lines.push("");
  lines.push("## Cross-Year Consistency");
  lines.push(...crossYearPolicyLines(datasets, calibration));
  lines.push("");
  lines.push("## Recommendation");
  lines.push(...recommendationLines(datasets, calibration));

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(REPORT_PATH, `${lines.join("\n")}\n`);
  await writeFile(SUMMARY_CSV_PATH, summaryCsv(datasets, calibration));

  console.log(lines.slice(0, 100).join("\n"));
  console.log("");
  console.log(`full_report=${REPORT_PATH}`);
  console.log(`summary_csv=${SUMMARY_CSV_PATH}`);
}

async function loadDataset(label: "2025" | "2026", startDate: string, endDate: string): Promise<Dataset> {
  const races = parseRaceRows(
    await readFile(`${OUTPUT_DIR}/going-adjustment-races-${startDate}-${endDate}.csv`, "utf8"),
  ).filter((race) => race.segment === "jumps");
  const raceById = new Map(races.map((race) => [race.race_source_id, race]));
  const runners = parseRunnerRows(
    await readFile(`${OUTPUT_DIR}/going-adjustment-runners-${startDate}-${endDate}.csv`, "utf8"),
  ).flatMap((runner) => {
    const race = raceById.get(runner.race_source_id);
    if (!race || runner.segment !== "jumps" || runner.finish_position === null) {
      return [];
    }
    const spl = secondsPerLength("speed_based", runner);
    const cumulativeBeatenLengths =
      spl <= 0 ? 0 : Math.max(0, (runner.equivalent_time_seconds - runner.actual_winning_time) / spl);
    return [{ ...runner, race, subtype: classifyJumpSubtype(race), cumulativeBeatenLengths }];
  });
  return { label, startDate, endDate, races, runners };
}

function calibrate(runners: JoinedRunner[]): Calibration {
  const paired = runners
    .filter((runner) => runner.official_rating !== null && Math.abs((runner.official_rating ?? 100) - 100) <= 60)
    .map((runner) => {
      const distanceFurlongs = furlongs(runner);
      if (distanceFurlongs === null) {
        return null;
      }
      return {
        orDelta: Math.abs((runner.official_rating ?? 100) - 100),
        secPerF: Math.abs((runner.base_standard - runner.equivalent_time_seconds) / distanceFurlongs),
      };
    })
    .filter((row): row is { orDelta: number; secPerF: number } => row !== null && row.secPerF > 0);
  const medianOrDelta = median(paired.map((row) => row.orDelta)) ?? 14;
  const medianSecPerF = median(paired.map((row) => row.secPerF)) ?? 0.37;
  return {
    secPerFPoints: medianOrDelta / medianSecPerF,
    sampleSize: paired.length,
  };
}

function coverageLine(dataset: Dataset): string {
  const dates = dataset.races.map((race) => race.race_date).sort();
  const orCount = dataset.runners.filter((runner) => runner.official_rating !== null).length;
  return [
    "coverage",
    `dataset=${dataset.label}`,
    `range=${dataset.startDate}..${dataset.endDate}`,
    `earliest=${dates[0] ?? "-"}`,
    `latest=${dates.at(-1) ?? "-"}`,
    `jump_races=${dataset.races.length}`,
    `finished_jump_runners=${dataset.runners.length}`,
    `or_count=${orCount}`,
    `or_pct=${fmtPct(orCount, dataset.runners.length)}`,
    ...subtypeOrder().map((subtype) => `${subtype}_races=${dataset.races.filter((race) => classifyJumpSubtype(race) === subtype).length}`),
  ].join(" | ");
}

function beatenDistanceBandLines(dataset: Dataset, calibration: Calibration): string[] {
  return beatenBands().map(([band, predicate]) => {
    const rows = dataset.runners.filter((runner) => predicate(runner.cumulativeBeatenLengths));
    return [
      "beaten_band",
      `dataset=${dataset.label}`,
      `band=${band}`,
      metricsFields(rows, calibration, "hierarchy", POLICIES[0]),
      splitFields(rows),
    ].join(" | ");
  });
}

function splStressLines(dataset: Dataset, calibration: Calibration): string[] {
  return beatenBands().flatMap(([band, predicate]) =>
    (["speed_based", "fixed_020", "race_category"] as SplModel[]).map((model) => {
      const rows = dataset.runners.filter((runner) => predicate(runner.cumulativeBeatenLengths));
      const values = rows
        .map((runner) => secPerFRating(runner, "hierarchy", calibration, POLICIES[0], model))
        .filter((value): value is number => value !== null);
      return [
        "spl_stress",
        `dataset=${dataset.label}`,
        `band=${band}`,
        `model=${model}`,
        `runners=${values.length}`,
        `median=${fmt(median(values))}`,
        `p10=${fmt(percentile(values, 0.10))}`,
        `p90=${fmt(percentile(values, 0.90))}`,
        `outside_0_200=${values.filter(isExtreme).length}`,
        `extreme_rate=${fmtPct(values.filter(isExtreme).length, values.length)}`,
      ].join(" | ");
    }),
  );
}

function policyLines(dataset: Dataset, calibration: Calibration): string[] {
  return POLICIES.map((policy) => {
    const affected = dataset.runners.filter((runner) => policyAffectsRunner(runner, policy)).length;
    const rows = dataset.runners.filter((runner) => secPerFRating(runner, "hierarchy", calibration, policy) !== null);
    return [
      "tail_policy",
      `dataset=${dataset.label}`,
      `policy=${policy.name}`,
      metricsFields(rows, calibration, "hierarchy", policy),
      `affected_finished_runners=${affected}`,
      `affected_pct=${fmtPct(affected, dataset.runners.length)}`,
      splitFields(rows),
    ].join(" | ");
  });
}

function sameDayEligibilityLines(dataset: Dataset, calibration: Calibration): string[] {
  const raceReasons = groupBy(dataset.races, sameDayIneligibilityReason);
  const methodRows = [
    ["base_only", dataset.runners, "base" as Method],
    ["hierarchy_same_day_else_base", dataset.runners, "hierarchy" as Method],
    [
      "same_day_only_eligible_subset",
      dataset.runners.filter((runner) => runner.conservative_same_day_adj_per_f !== null),
      "same_day" as Method,
    ],
  ] as const;
  return [
    ...[...raceReasons.entries()].map(([reason, races]) =>
      `same_day_ineligibility | dataset=${dataset.label} | reason=${reason} | races=${races.length}`,
    ),
    ...methodRows.map(([label, rows, method]) =>
      [
        "same_day_method",
        `dataset=${dataset.label}`,
        `method=${label}`,
        metricsFields(rows, calibration, method, POLICIES[0]),
      ].join(" | "),
    ),
  ];
}

function fallbackPolicyLines(dataset: Dataset, calibration: Calibration): string[] {
  const sameDayRows = dataset.runners.filter((runner) => runner.conservative_same_day_adj_per_f !== null);
  const baseRows = dataset.runners.filter((runner) => runner.conservative_same_day_adj_per_f === null);
  return [
    [
      "fallback_policy",
      `dataset=${dataset.label}`,
      "policy=same_day_else_base",
      `same_day_pct=${fmtPct(sameDayRows.length, dataset.runners.length)}`,
      `base_fallback_pct=${fmtPct(baseRows.length, dataset.runners.length)}`,
      metricsFields(dataset.runners, calibration, "hierarchy", POLICIES[0]),
    ].join(" | "),
    ...subtypeOrder().map((subtype) => {
      const rows = dataset.runners.filter((runner) => runner.subtype === subtype);
      return [
        "fallback_policy_subtype",
        `dataset=${dataset.label}`,
        `subtype=${subtype}`,
        `same_day_pct=${fmtPct(rows.filter((runner) => runner.conservative_same_day_adj_per_f !== null).length, rows.length)}`,
        metricsFields(rows, calibration, "hierarchy", POLICIES[0]),
      ].join(" | ");
    }),
  ];
}

function confidenceLines(dataset: Dataset, calibration: Calibration): string[] {
  const grouped = groupBy(dataset.runners, confidenceLabel);
  return ["HIGH", "MEDIUM", "LOW"].map((confidence) => {
    const rows = grouped.get(confidence) ?? [];
    return [
      "confidence_band",
      `dataset=${dataset.label}`,
      `confidence=${confidence}`,
      metricsFields(rows, calibration, "hierarchy", POLICIES[0]),
    ].join(" | ");
  });
}

function crossYearPolicyLines(datasets: Dataset[], calibration: Calibration): string[] {
  return POLICIES.map((policy) => {
    const [dev, holdout] = datasets.map((dataset) => ({
      dataset,
      rows: dataset.runners.filter((runner) => secPerFRating(runner, "hierarchy", calibration, policy) !== null),
    }));
    const devMetrics = compactMetrics(dev.rows, calibration, "hierarchy", policy);
    const holdoutMetrics = compactMetrics(holdout.rows, calibration, "hierarchy", policy);
    return [
      "cross_year_policy",
      `policy=${policy.name}`,
      `2025_extreme_rate=${fmtPctNumber(devMetrics.extremeRate)}`,
      `2026_extreme_rate=${fmtPctNumber(holdoutMetrics.extremeRate)}`,
      `2025_median_abs_or=${fmt(devMetrics.medianAbsOr)}`,
      `2026_median_abs_or=${fmt(holdoutMetrics.medianAbsOr)}`,
      `stable=${Math.abs((devMetrics.medianAbsOr ?? 0) - (holdoutMetrics.medianAbsOr ?? 0)) <= 3}`,
    ].join(" | ");
  });
}

function recommendationLines(datasets: Dataset[], calibration: Calibration): string[] {
  const noCap = datasets.map((dataset) => compactMetrics(dataset.runners, calibration, "hierarchy", POLICIES[0]));
  const exclude75 = datasets.map((dataset) =>
    compactMetrics(
      dataset.runners.filter((runner) => secPerFRating(runner, "hierarchy", calibration, POLICIES[2]) !== null),
      calibration,
      "hierarchy",
      POLICIES[2],
    ),
  );
  return [
    "default_rating_method=sec_per_f + conservative same-day where eligible",
    "same_day_fallback=use sec_per_f base when conservative same-day eligibility is not met; expose method",
    "large_beaten_distance_handling=do not publish runner-level speed figure above 75 cumulative beaten lengths; retain race result and expose no_rating_large_beaten_distance",
    "confidence_label=HIGH same_day eligible + base_sample>=10 + beaten<=30; MEDIUM valid base/base fallback + base_sample>=5 + beaten<=75; LOW weak sample, beaten>75, unknown subtype, or data issue",
    `no_cap_median_abs_or_2025=${fmt(noCap[0].medianAbsOr)} | no_cap_median_abs_or_2026=${fmt(noCap[1].medianAbsOr)}`,
    `exclude_gt_75_median_abs_or_2025=${fmt(exclude75[0].medianAbsOr)} | exclude_gt_75_median_abs_or_2026=${fmt(exclude75[1].medianAbsOr)}`,
    "production_readiness=ready_to_move_to_production_design_with_no_persistence_yet; design should include explicit method and confidence outputs",
  ];
}

function metricsFields(rows: JoinedRunner[], calibration: Calibration, method: Method, policy: Policy): string {
  const values = rows
    .map((runner) => secPerFRating(runner, method, calibration, policy))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  const paired = rows
    .map((runner) => {
      const rating = secPerFRating(runner, method, calibration, policy);
      return rating === null || runner.official_rating === null ? null : [rating, runner.official_rating] as const;
    })
    .filter((value): value is readonly [number, number] => value !== null);
  const absDiffs = paired.map(([rating, officialRating]) => Math.abs(rating - officialRating));
  const extremes = values.filter(isExtreme).length;
  return [
    `runners=${values.length}`,
    `median=${fmt(median(values))}`,
    `p10=${fmt(percentile(values, 0.10))}`,
    `p90=${fmt(percentile(values, 0.90))}`,
    `extremes=${extremes}`,
    `extreme_rate=${fmtPct(extremes, values.length)}`,
    `median_abs_or=${fmt(median(absDiffs))}`,
    `mean_abs_or=${fmt(mean(absDiffs))}`,
    `or_correlation=${fmt(correlation(paired))}`,
  ].join(" | ");
}

function compactMetrics(rows: JoinedRunner[], calibration: Calibration, method: Method, policy: Policy) {
  const values = rows
    .map((runner) => secPerFRating(runner, method, calibration, policy))
    .filter((value): value is number => value !== null);
  const paired = rows
    .map((runner) => {
      const rating = secPerFRating(runner, method, calibration, policy);
      return rating === null || runner.official_rating === null ? null : Math.abs(rating - runner.official_rating);
    })
    .filter((value): value is number => value !== null);
  return {
    extremeRate: values.length === 0 ? null : values.filter(isExtreme).length / values.length,
    medianAbsOr: median(paired),
  };
}

function splitFields(rows: JoinedRunner[]): string {
  return [
    ...subtypeOrder().map((subtype) => `${subtype}_runners=${rows.filter((runner) => runner.subtype === subtype).length}`),
    `short_runners=${rows.filter((runner) => distanceBand(runner) === "short").length}`,
    `middle_runners=${rows.filter((runner) => distanceBand(runner) === "middle").length}`,
    `staying_runners=${rows.filter((runner) => distanceBand(runner) === "staying").length}`,
  ].join(" | ");
}

function secPerFRating(
  runner: JoinedRunner,
  method: Method,
  calibration: Calibration,
  policy: Policy,
  splModel: SplModel = "speed_based",
): number | null {
  if (policy.kind === "exclude" && runner.cumulativeBeatenLengths > policy.threshold) {
    return null;
  }
  const standard = standardFor(runner, method);
  const distanceFurlongs = furlongs(runner);
  if (standard === null || distanceFurlongs === null) {
    return null;
  }
  const beatenLengths =
    policy.kind === "cap"
      ? Math.min(runner.cumulativeBeatenLengths, policy.threshold)
      : runner.cumulativeBeatenLengths;
  const equivalentTime =
    runner.actual_winning_time + beatenLengths * secondsPerLength(splModel, runner);
  return 100 + calibration.secPerFPoints * ((standard - equivalentTime) / distanceFurlongs);
}

function standardFor(runner: JoinedRunner, method: Method): number | null {
  if (method === "base") {
    return runner.base_standard;
  }
  if (method === "same_day" || method === "hierarchy") {
    const distanceFurlongs = furlongs(runner);
    if (distanceFurlongs !== null && runner.conservative_same_day_adj_per_f !== null) {
      return runner.base_standard + runner.conservative_same_day_adj_per_f * distanceFurlongs;
    }
  }
  return method === "hierarchy" ? runner.base_standard : null;
}

function sameDayIneligibilityReason(race: RaceRow): string {
  if (race.conservative_same_day_adj_per_f !== null) {
    return "eligible";
  }
  if (race.same_day_peer_count < 4) {
    return "too_few_qualifying_races";
  }
  if (race.same_day_stdev_per_f === null) {
    return "missing_usable_times";
  }
  if (race.same_day_stdev_per_f > 0.30) {
    return "same_day_stdev_gt_0_30";
  }
  if (race.base_sample < 2) {
    return "insufficient_standard_quality";
  }
  return "other_existing_eligibility_reason";
}

function confidenceLabel(runner: JoinedRunner): string {
  const sameDay = runner.conservative_same_day_adj_per_f !== null;
  if (sameDay && runner.race.base_sample >= 10 && runner.cumulativeBeatenLengths <= 30) {
    return "HIGH";
  }
  if (runner.race.base_sample >= 5 && runner.cumulativeBeatenLengths <= 75) {
    return "MEDIUM";
  }
  return "LOW";
}

function policyAffectsRunner(runner: JoinedRunner, policy: Policy): boolean {
  return policy.kind !== "none" && runner.cumulativeBeatenLengths > policy.threshold;
}

function beatenBands(): Array<[string, (lengths: number) => boolean]> {
  return [
    ["0_5", (lengths) => lengths <= 5],
    ["gt5_10", (lengths) => lengths > 5 && lengths <= 10],
    ["gt10_20", (lengths) => lengths > 10 && lengths <= 20],
    ["gt20_30", (lengths) => lengths > 20 && lengths <= 30],
    ["gt30_50", (lengths) => lengths > 30 && lengths <= 50],
    ["gt50_75", (lengths) => lengths > 50 && lengths <= 75],
    ["gt75_100", (lengths) => lengths > 75 && lengths <= 100],
    ["gt100", (lengths) => lengths > 100],
  ];
}

function summaryCsv(datasets: Dataset[], calibration: Calibration): string {
  const rows = [["section", "dataset", "policy", "method", "runners", "extreme_rate", "median_abs_or", "or_correlation"]];
  for (const dataset of datasets) {
    for (const policy of POLICIES) {
      const values = dataset.runners.filter((runner) => secPerFRating(runner, "hierarchy", calibration, policy) !== null);
      const metrics = compactMetrics(values, calibration, "hierarchy", policy);
      rows.push([
        "tail_policy",
        dataset.label,
        policy.name,
        "hierarchy",
        String(values.length),
        fmtPctNumber(metrics.extremeRate),
        fmt(metrics.medianAbsOr),
        fmt(correlation(values.map((runner) => {
          const rating = secPerFRating(runner, "hierarchy", calibration, policy);
          return rating === null || runner.official_rating === null ? null : [rating, runner.official_rating] as const;
        }).filter((value): value is readonly [number, number] => value !== null))),
      ]);
    }
  }
  return `${rows.map(csv).join("\n")}\n`;
}

function parseRaceRows(text: string): RaceRow[] {
  return parseCsv(text).map((row) => ({
    race_source_id: row.race_source_id,
    race_date: row.race_date,
    course: row.course,
    race_name: row.race_name,
    race_type: row.race_type,
    race_class: row.race_class,
    distance: row.distance,
    distance_yards: numberOrNull(row.distance_yards),
    segment: row.segment,
    surface: row.surface,
    going: row.going,
    actual: Number(row.actual),
    base_standard: Number(row.base_standard),
    base_sample: Number(row.base_sample),
    deviation_per_f: Number(row.deviation_per_f),
    same_day_peer_count: Number(row.same_day_peer_count),
    same_day_stdev_per_f: numberOrNull(row.same_day_stdev_per_f),
    conservative_same_day_adj_per_f: numberOrNull(row.conservative_same_day_adj_per_f),
  }));
}

function parseRunnerRows(text: string): RunnerRow[] {
  return parseCsv(text).map((row) => ({
    race_source_id: row.race_source_id,
    race_date: row.race_date,
    course: row.course,
    race_name: row.race_name,
    race_type: row.race_type,
    race_class: row.race_class,
    distance: row.distance,
    distance_yards: numberOrNull(row.distance_yards),
    segment: row.segment,
    surface: row.surface,
    going: row.going,
    actual_winning_time: Number(row.actual_winning_time),
    equivalent_time_seconds: Number(row.equivalent_time_seconds),
    runner_source_id: row.runner_source_id,
    horse: row.horse,
    finish_position: numberOrNull(row.finish_position),
    official_rating: numberOrNull(row.official_rating),
    base_standard: Number(row.base_standard),
    same_day_peer_count: Number(row.same_day_peer_count),
    same_day_stdev_per_f: numberOrNull(row.same_day_stdev_per_f),
    conservative_same_day_adj_per_f: numberOrNull(row.conservative_same_day_adj_per_f),
  }));
}

function parseCsv(text: string): Array<Record<string, string>> {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  return lines.filter(Boolean).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function secondsPerLength(model: SplModel, runner: Pick<RunnerRow, "distance_yards" | "actual_winning_time">): number {
  if (model === "fixed_020") {
    return 0.20;
  }
  if (model === "race_category") {
    return 0.25;
  }
  if (runner.distance_yards === null || runner.distance_yards <= 0 || runner.actual_winning_time <= 0) {
    return 0.20;
  }
  return (8 / 3) / (runner.distance_yards / runner.actual_winning_time);
}

function classifyJumpSubtype(race: Pick<RaceRow, "race_type" | "race_name">): JumpSubtype {
  return subtypeFromText(race.race_name) ?? subtypeFromText(race.race_type) ?? "unknown_other";
}

function subtypeFromText(value: string): Exclude<JumpSubtype, "unknown_other"> | null {
  const text = normalize(value);
  if (/\bnh flat\b/.test(text) || /\bnational hunt flat\b/.test(text) || /\bbumper\b/.test(text)) {
    return "nh_flat";
  }
  if (/\bhurdles?\b/.test(text)) {
    return "hurdle";
  }
  if (/\bchase\b/.test(text) || /\bsteeplechase\b/.test(text)) {
    return "chase";
  }
  return null;
}

function distanceBand(runner: Pick<RunnerRow, "distance_yards">): "short" | "middle" | "staying" | "unknown" {
  const distanceFurlongs = furlongs(runner);
  if (distanceFurlongs === null) {
    return "unknown";
  }
  if (distanceFurlongs < 18) {
    return "short";
  }
  if (distanceFurlongs < 24) {
    return "middle";
  }
  return "staying";
}

function furlongs(row: Pick<RunnerRow, "distance_yards">): number | null {
  return row.distance_yards === null || row.distance_yards <= 0 ? null : row.distance_yards / 220;
}

function isExtreme(value: number): boolean {
  return value < 0 || value > 200;
}

function correlation(pairs: readonly (readonly [number, number])[]): number | null {
  if (pairs.length < 2) {
    return null;
  }
  const xs = pairs.map(([x]) => x);
  const ys = pairs.map(([, y]) => y);
  const xMean = mean(xs);
  const yMean = mean(ys);
  if (xMean === null || yMean === null) {
    return null;
  }
  let numerator = 0;
  let xTotal = 0;
  let yTotal = 0;
  for (const [x, y] of pairs) {
    numerator += (x - xMean) * (y - yMean);
    xTotal += (x - xMean) ** 2;
    yTotal += (y - yMean) ** 2;
  }
  return xTotal === 0 || yTotal === 0 ? null : numerator / Math.sqrt(xTotal * yTotal);
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function groupBy<T>(rows: T[], keyForRow: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyForRow(row);
    const values = grouped.get(key) ?? [];
    values.push(row);
    grouped.set(key, values);
  }
  return grouped;
}

function subtypeOrder(): JumpSubtype[] {
  return ["hurdle", "chase", "nh_flat", "unknown_other"];
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");
}

function numberOrNull(value: string): number | null {
  return value === "" ? null : Number(value);
}

function fmt(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "-" : value.toFixed(2);
}

function fmtPct(count: number, total: number): string {
  return total === 0 ? "-" : `${((count / total) * 100).toFixed(2)}%`;
}

function fmtPctNumber(value: number | null): string {
  return value === null ? "-" : `${(value * 100).toFixed(2)}%`;
}

function csv(row: string[]): string {
  return row.map((value) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)).join(",");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

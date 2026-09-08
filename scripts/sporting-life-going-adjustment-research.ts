import { mkdir, writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import {
  absoluteTimingErrorSeconds,
  classifyRaceCategory,
  deviationPerFurlong,
  equivalentFinishingTimeSeconds,
  formatSeconds,
  goingAdjustedStandardSeconds,
  leaveOneOutStandardTime,
  mean,
  median,
  provisionalSpeedFigure,
  reconstructCumulativeBeatenLengths,
  sanityCheckWinningTime,
  standardDeviation,
  type RaceCategory,
  type StandardTimeRaceInput,
} from "@/lib/racing/speed-research";

const START_DATE = process.argv[2] ?? "2025-01-01";
const END_DATE = process.argv[3] ?? "2025-12-31";
const MINIMUM_STANDARD_SAMPLE_SIZE = 2;
const MINIMUM_SAME_DAY_SAMPLE_SIZE = 2;
const CONSERVATIVE_SAME_DAY_MINIMUM_PEERS = 4;
const CONSERVATIVE_SAME_DAY_MAX_STDEV_PER_FURLONG = 0.3;
const HISTORICAL_FALLBACK_MINIMUM_PRIOR_OBSERVATIONS = 50;
const TRIMMED_MEAN_MINIMUM_SAMPLE_SIZE = 5;
const TRIM_PROPORTION = 0.2;
const OUTPUT_DIR = "data/research";

type RacePayload = {
  props: {
    pageProps: {
      race: {
        race_summary: {
          course_surface?: { surface?: string };
        };
      };
    };
  };
};

type RaceRow = {
  race_source_id: string;
  race_date: string;
  scheduled_time: string | null;
  course_source_id: string;
  course_name: string;
  distance: string | null;
  distance_yards: number | null;
  going: string | null;
  race_class: string | null;
  race_name: string;
  race_type: string | null;
  winning_time: string | null;
  payload: RacePayload;
};

type RunnerRow = {
  race_source_id: string;
  runner_source_id: string;
  horse_name: string;
  finishing_position: number | null;
  result_status: string | null;
  beaten_distance: string | null;
  official_rating: number | null;
};

type ResearchRace = RaceRow & {
  parsedWinningSeconds: number | null;
  usableWinningSeconds: number | null;
  timingSanityReason: string;
  raceCategory: RaceCategory;
  surface: string | null;
};

type RaceDeviation = {
  race: ResearchRace;
  baseStandardSeconds: number;
  baseStandardSampleSize: number;
  deviationSeconds: number;
  deviationSecondsPerFurlong: number;
};

type SameDayEstimate = {
  key: string;
  raceDate: string;
  courseSourceId: string;
  courseName: string;
  qualifyingRaces: number;
  medianSecondsPerFurlong: number | null;
  meanSecondsPerFurlong: number | null;
  trimmedMeanSecondsPerFurlong: number | null;
  stdevSecondsPerFurlong: number | null;
  goings: Record<string, number>;
};

type HistoricalEstimate = {
  adjustmentSecondsPerFurlong: number | null;
  sampleSize: number;
};

type RaceAdjustmentResult = RaceDeviation & {
  segment: string;
  sameDayAdjustmentSecondsPerFurlong: number | null;
  sameDayPeerCount: number;
  sameDayStdevSecondsPerFurlong: number | null;
  conservativeSameDayAdjustmentSecondsPerFurlong: number | null;
  historicalAdjustmentSecondsPerFurlong: number | null;
  historicalFallbackSampleSize: number;
  conservativeHistoricalAdjustmentSecondsPerFurlong: number | null;
  baseAbsoluteError: number;
  sameDayAbsoluteError: number | null;
  conservativeSameDayAbsoluteError: number | null;
  fallbackAbsoluteError: number | null;
  conservativeHierarchyAbsoluteError: number;
  sameDayResidualSeconds: number | null;
  conservativeSameDayResidualSeconds: number | null;
  fallbackResidualSeconds: number | null;
  conservativeHierarchyMethod: "same_day" | "historical_fallback" | "base";
};

type RunnerRatingRow = {
  race: ResearchRace;
  runnerSourceId: string;
  horseName: string;
  finishingPosition: number | null;
  officialRating: number | null;
  equivalentTimeSeconds: number;
  baseStandardSeconds: number;
  sameDayAdjustmentSecondsPerFurlong: number | null;
  sameDayPeerCount: number;
  sameDayStdevSecondsPerFurlong: number | null;
  conservativeSameDayAdjustmentSecondsPerFurlong: number | null;
  historicalAdjustmentSecondsPerFurlong: number | null;
  historicalFallbackSampleSize: number;
  conservativeHistoricalAdjustmentSecondsPerFurlong: number | null;
  baseRating: number;
  sameDayRating: number | null;
  conservativeSameDayRating: number | null;
  historicalFallbackRating: number | null;
  conservativeHierarchyRating: number;
  conservativeHierarchyMethod: "same_day" | "historical_fallback" | "base";
};

type RatingDiagnostic = {
  pairedOfficialRatings: number;
  officialRatingCorrelation: number | null;
  belowZero: number;
  aboveTwoHundred: number;
  medianRating: number | null;
  ratingStdev: number | null;
  extremeOutliers: number;
};

async function main() {
  const { client } = createDbConnection();
  try {
    const rows = await client<RaceRow[]>`
      select
        r.source_id as race_source_id,
        r.race_date::text as race_date,
        r.scheduled_time::text as scheduled_time,
        c.source_id as course_source_id,
        c.display_name as course_name,
        r.distance,
        r.distance_yards,
        r.going,
        r.race_class,
        r.race_name,
        r.race_type,
        r.winning_time,
        si.payload
      from races r
      join courses c on c.id = r.course_id
      join source_imports si
        on si.source = r.source
       and si.source_id = r.source_id
       and si.source_type = 'full-result-next-data'
      where r.source = 'sporting_life'
        and r.race_date between ${START_DATE} and ${END_DATE}
      order by r.race_date, c.display_name, r.scheduled_time, r.source_id
    `;

    const runnerRows = await client<RunnerRow[]>`
      select
        r.source_id as race_source_id,
        rr.source_id as runner_source_id,
        h.display_name as horse_name,
        rr.finishing_position,
        rr.result_status,
        rr.beaten_distance,
        rr.official_rating
      from race_runners rr
      join races r on r.id = rr.race_id
      join horses h on h.id = rr.horse_id
      where r.source = 'sporting_life'
        and rr.source = 'sporting_life'
        and r.race_date between ${START_DATE} and ${END_DATE}
      order by r.race_date, r.source_id, rr.finishing_position nulls last, rr.source_id
    `;

    const races = rows.map(toResearchRace);
    const deviations = raceDeviations(races);
    const sameDayEstimates = sameDayCourseEstimates(deviations);
    const results = adjustmentResults(deviations, sameDayEstimates);
    const runnersByRace = groupRunnersByRace(runnerRows);
    const runnerRatings = runnerRatingRows(results, runnersByRace);
    const ratingDiagnostics = adjustedRatingDiagnostics(results, runnersByRace);

    await writeDiagnostics(deviations, sameDayEstimates, results, runnerRatings);

    printHeader("Going Adjustment Research");
    console.log(`date_range=${START_DATE}..${END_DATE}`);
    console.log("research_only=true");
    console.log("base_standard=course_source_id + exact distance_yards leave-one-out median");
    console.log(`minimum_base_standard_sample_size=${MINIMUM_STANDARD_SAMPLE_SIZE}`);
    console.log(`minimum_same_day_races=${MINIMUM_SAME_DAY_SAMPLE_SIZE}`);
    console.log("historical_fallback=chronological prior races only, exact segment + surface + going");
    console.log(`races_loaded=${races.length}`);
    console.log(`valid_race_deviations=${deviations.length}`);
    console.log(`invalid_or_unusable_times=${races.length - races.filter((race) => race.usableWinningSeconds !== null).length}`);

    printHeader("Overall Summary");
    console.log(formatPerformance("base", results, (row) => row.baseAbsoluteError));
    console.log(formatPerformance("same_day", results, (row) => row.sameDayAbsoluteError));
    console.log(formatPerformance("historical_fallback", results, (row) => row.fallbackAbsoluteError));

    printHeader("Segment Summary");
    for (const line of segmentPerformance(results)) {
      console.log(line);
    }

    printHeader("Going Adjustment Table");
    for (const line of goingAdjustmentTable(deviations).slice(0, 40)) {
      console.log(line);
    }

    printHeader("Same-Day Course Estimates");
    for (const line of sameDayTable(sameDayEstimates).slice(0, 30)) {
      console.log(line);
    }

    printHeader("Fallback Performance");
    for (const line of fallbackPerformanceBySegment(results)) {
      console.log(line);
    }

    printHeader("Rating Diagnostic");
    console.log(formatRatingDiagnostic("same_day", ratingDiagnostics.sameDay));
    console.log(formatRatingDiagnostic("historical_fallback", ratingDiagnostics.fallback));

    printHeader("Selected Course Examples");
    for (const line of selectedCourseExamples(deviations)) {
      console.log(line);
    }

    printHeader("Conclusion");
    for (const line of conclusionLines(results)) {
      console.log(line);
    }
    console.log(`full_output=${OUTPUT_DIR}/going-adjustment-${START_DATE}-${END_DATE}.txt`);
    console.log(`race_level_csv=${OUTPUT_DIR}/going-adjustment-races-${START_DATE}-${END_DATE}.csv`);
    console.log(`runner_level_csv=${OUTPUT_DIR}/going-adjustment-runners-${START_DATE}-${END_DATE}.csv`);
  } finally {
    await client.end();
  }
}

function toResearchRace(row: RaceRow): ResearchRace {
  const surface =
    row.payload.props.pageProps.race.race_summary.course_surface?.surface ?? null;
  const timingSanity = sanityCheckWinningTime({
    winningTime: row.winning_time,
    distanceYards: row.distance_yards,
  });
  return {
    ...row,
    parsedWinningSeconds: timingSanity.parsedSeconds,
    usableWinningSeconds: timingSanity.usableSeconds,
    timingSanityReason: timingSanity.reason,
    raceCategory: classifyRaceCategory({
      distanceYards: row.distance_yards,
      raceName: row.race_name,
      raceType: row.race_type,
      surface,
    }),
    surface,
  };
}

function raceDeviations(races: ResearchRace[]): RaceDeviation[] {
  const standardInputs = races.map((race) => ({
    raceId: race.race_source_id,
    groupKey: baseStandardKey(race),
    meetingKey: sameDayKey(race),
    winningTimeSeconds: race.usableWinningSeconds,
  })) satisfies StandardTimeRaceInput[];
  const deviations: RaceDeviation[] = [];

  for (const race of races) {
    if (race.usableWinningSeconds === null) {
      continue;
    }
    const standard = leaveOneOutStandardTime(
      race.race_source_id,
      standardInputs,
      MINIMUM_STANDARD_SAMPLE_SIZE,
    );
    const perFurlong = deviationPerFurlong({
      actualTimeSeconds: race.usableWinningSeconds,
      standardSeconds: standard.standardSeconds,
      distanceYards: race.distance_yards,
    });
    if (standard.standardSeconds === null || perFurlong === null) {
      continue;
    }
    deviations.push({
      race,
      baseStandardSeconds: standard.standardSeconds,
      baseStandardSampleSize: standard.sampleSize,
      deviationSeconds: race.usableWinningSeconds - standard.standardSeconds,
      deviationSecondsPerFurlong: perFurlong,
    });
  }
  return deviations;
}

function sameDayCourseEstimates(deviations: RaceDeviation[]): Map<string, SameDayEstimate> {
  const grouped = new Map<string, RaceDeviation[]>();
  for (const deviation of deviations) {
    const rows = grouped.get(sameDayKey(deviation.race)) ?? [];
    rows.push(deviation);
    grouped.set(sameDayKey(deviation.race), rows);
  }

  return new Map(
    [...grouped.entries()].map(([key, rows]) => {
      const values = rows.map((row) => row.deviationSecondsPerFurlong);
      const first = rows[0].race;
      return [
        key,
        {
          key,
          raceDate: first.race_date,
          courseSourceId: first.course_source_id,
          courseName: first.course_name,
          qualifyingRaces: rows.length,
          medianSecondsPerFurlong:
            rows.length >= MINIMUM_SAME_DAY_SAMPLE_SIZE ? median(values) : null,
          meanSecondsPerFurlong: mean(values),
          trimmedMeanSecondsPerFurlong: trimmedMean(values),
          stdevSecondsPerFurlong: standardDeviation(values),
          goings: counterValuesObject(rows.map((row) => row.race.going ?? "missing")),
        },
      ] as const;
    }),
  );
}

function adjustmentResults(
  deviations: RaceDeviation[],
  sameDayEstimates: Map<string, SameDayEstimate>,
): RaceAdjustmentResult[] {
  const chronological = [...deviations].sort(compareDeviationChronology);
  const sameDayDeviations = groupBy(deviations, (deviation) =>
    sameDayKey(deviation.race),
  );
  const historicalByKey = new Map<string, number[]>();
  const rows: RaceAdjustmentResult[] = [];

  for (const deviation of chronological) {
    const sameDayEstimate = sameDayEstimates.get(sameDayKey(deviation.race));
    const sameDayPeerCount = Math.max(0, (sameDayEstimate?.qualifyingRaces ?? 1) - 1);
    const sameDayAdjustment = leaveOneOutSameDayAdjustment(
      deviation,
      sameDayDeviations,
      sameDayEstimates,
    );
    const historicalEstimate = historicalAdjustment(deviation, historicalByKey);
    const sameDayExpected = goingAdjustedStandardSeconds({
      baseStandardSeconds: deviation.baseStandardSeconds,
      adjustmentSecondsPerFurlong: sameDayAdjustment,
      distanceYards: deviation.race.distance_yards,
    });
    const fallbackExpected = goingAdjustedStandardSeconds({
      baseStandardSeconds: deviation.baseStandardSeconds,
      adjustmentSecondsPerFurlong: historicalEstimate.adjustmentSecondsPerFurlong,
      distanceYards: deviation.race.distance_yards,
    });
    const conservativeSameDayAdjustment = conservativeSameDayAdjustmentSeconds(
      sameDayAdjustment,
      sameDayPeerCount,
      sameDayEstimate?.stdevSecondsPerFurlong ?? null,
    );
    const conservativeHistoricalAdjustment =
      conservativeHistoricalAdjustmentSeconds(deviation, historicalEstimate);
    const conservativeHierarchyAdjustment =
      conservativeSameDayAdjustment ?? conservativeHistoricalAdjustment;
    const conservativeHierarchyMethod =
      conservativeSameDayAdjustment !== null
        ? "same_day"
        : conservativeHistoricalAdjustment !== null
          ? "historical_fallback"
          : "base";
    const conservativeSameDayExpected = goingAdjustedStandardSeconds({
      baseStandardSeconds: deviation.baseStandardSeconds,
      adjustmentSecondsPerFurlong: conservativeSameDayAdjustment,
      distanceYards: deviation.race.distance_yards,
    });
    const conservativeHierarchyExpected =
      conservativeHierarchyAdjustment === null
        ? deviation.baseStandardSeconds
        : goingAdjustedStandardSeconds({
            baseStandardSeconds: deviation.baseStandardSeconds,
            adjustmentSecondsPerFurlong: conservativeHierarchyAdjustment,
            distanceYards: deviation.race.distance_yards,
          });
    const sameDayResidual = residualSeconds(deviation.race.usableWinningSeconds, sameDayExpected);
    const conservativeSameDayResidual = residualSeconds(
      deviation.race.usableWinningSeconds,
      conservativeSameDayExpected,
    );
    const fallbackResidual = residualSeconds(deviation.race.usableWinningSeconds, fallbackExpected);
    const baseAbsoluteError = absoluteTimingErrorSeconds(
      deviation.race.usableWinningSeconds,
      deviation.baseStandardSeconds,
    );

    if (baseAbsoluteError === null) {
      continue;
    }

    rows.push({
      ...deviation,
      segment: raceSegment(deviation.race),
      sameDayAdjustmentSecondsPerFurlong: sameDayAdjustment,
      sameDayPeerCount,
      sameDayStdevSecondsPerFurlong: sameDayEstimate?.stdevSecondsPerFurlong ?? null,
      conservativeSameDayAdjustmentSecondsPerFurlong: conservativeSameDayAdjustment,
      historicalAdjustmentSecondsPerFurlong: historicalEstimate.adjustmentSecondsPerFurlong,
      historicalFallbackSampleSize: historicalEstimate.sampleSize,
      conservativeHistoricalAdjustmentSecondsPerFurlong: conservativeHistoricalAdjustment,
      baseAbsoluteError,
      sameDayAbsoluteError: absoluteTimingErrorSeconds(
        deviation.race.usableWinningSeconds,
        sameDayExpected,
      ),
      conservativeSameDayAbsoluteError: absoluteTimingErrorSeconds(
        deviation.race.usableWinningSeconds,
        conservativeSameDayExpected,
      ),
      fallbackAbsoluteError: absoluteTimingErrorSeconds(
        deviation.race.usableWinningSeconds,
        fallbackExpected,
      ),
      conservativeHierarchyAbsoluteError:
        absoluteTimingErrorSeconds(
          deviation.race.usableWinningSeconds,
          conservativeHierarchyExpected,
        ) ?? baseAbsoluteError,
      sameDayResidualSeconds: sameDayResidual,
      conservativeSameDayResidualSeconds: conservativeSameDayResidual,
      fallbackResidualSeconds: fallbackResidual,
      conservativeHierarchyMethod,
    });

    const key = historicalGoingKey(deviation);
    if (key) {
      const values = historicalByKey.get(key) ?? [];
      values.push(deviation.deviationSecondsPerFurlong);
      historicalByKey.set(key, values);
    }
  }

  return rows;
}

function conservativeSameDayAdjustmentSeconds(
  adjustment: number | null,
  peerCount: number,
  stdev: number | null,
): number | null {
  if (
    adjustment === null ||
    stdev === null ||
    peerCount < CONSERVATIVE_SAME_DAY_MINIMUM_PEERS ||
    stdev > CONSERVATIVE_SAME_DAY_MAX_STDEV_PER_FURLONG
  ) {
    return null;
  }
  return adjustment;
}

function conservativeHistoricalAdjustmentSeconds(
  deviation: RaceDeviation,
  estimate: HistoricalEstimate,
): number | null {
  if (
    deviation.race.raceCategory === "all_weather" ||
    estimate.adjustmentSecondsPerFurlong === null ||
    estimate.sampleSize < HISTORICAL_FALLBACK_MINIMUM_PRIOR_OBSERVATIONS
  ) {
    return null;
  }
  return estimate.adjustmentSecondsPerFurlong;
}

function leaveOneOutSameDayAdjustment(
  target: RaceDeviation,
  sameDayDeviations: Map<string, RaceDeviation[]>,
  sameDayEstimates: Map<string, SameDayEstimate>,
): number | null {
  const estimate = sameDayEstimates.get(sameDayKey(target.race));
  if (!estimate || estimate.qualifyingRaces < MINIMUM_SAME_DAY_SAMPLE_SIZE) {
    return null;
  }
  const peerValues = (sameDayDeviations.get(sameDayKey(target.race)) ?? [])
    .filter((deviation) => deviation.race.race_source_id !== target.race.race_source_id)
    .map((deviation) => deviation.deviationSecondsPerFurlong);
  if (peerValues.length < MINIMUM_SAME_DAY_SAMPLE_SIZE) {
    return null;
  }
  return median(peerValues);
}

function historicalAdjustment(
  deviation: RaceDeviation,
  historicalByKey: Map<string, number[]>,
): HistoricalEstimate {
  const key = historicalGoingKey(deviation);
  if (!key) {
    return { adjustmentSecondsPerFurlong: null, sampleSize: 0 };
  }
  const values = historicalByKey.get(key) ?? [];
  if (values.length < MINIMUM_STANDARD_SAMPLE_SIZE) {
    return { adjustmentSecondsPerFurlong: null, sampleSize: values.length };
  }
  return {
    adjustmentSecondsPerFurlong: median(values),
    sampleSize: values.length,
  };
}

function historicalGoingKey(deviation: RaceDeviation): string | null {
  if (!deviation.race.surface || !deviation.race.going) {
    return null;
  }
  return [
    raceSegment(deviation.race),
    deviation.race.surface,
    deviation.race.going,
  ].join(":");
}

function adjustedRatingDiagnostics(
  results: RaceAdjustmentResult[],
  runnersByRace: Map<string, RunnerRow[]>,
): { sameDay: RatingDiagnostic; fallback: RatingDiagnostic } {
  return {
    sameDay: ratingDiagnostic(results, runnersByRace, "same_day"),
    fallback: ratingDiagnostic(results, runnersByRace, "fallback"),
  };
}

function runnerRatingRows(
  results: RaceAdjustmentResult[],
  runnersByRace: Map<string, RunnerRow[]>,
): RunnerRatingRow[] {
  const rows: RunnerRatingRow[] = [];
  for (const result of results) {
    const runners = runnersByRace.get(result.race.race_source_id) ?? [];
    const runnerById = new Map(runners.map((runner) => [runner.runner_source_id, runner]));
    const reconstructed = reconstructCumulativeBeatenLengths(
      runners.map((runner) => ({
        id: runner.runner_source_id,
        finishingPosition: runner.finishing_position,
        resultStatus: runner.result_status,
        beatenDistance: runner.beaten_distance,
      })),
    );
    for (const runner of reconstructed) {
      if (
        runner.resultStatus !== "finished" ||
        runner.cumulativeBeatenLengths === null
      ) {
        continue;
      }
      const equivalentTime = equivalentFinishingTimeSeconds(
        result.race.usableWinningSeconds,
        runner.cumulativeBeatenLengths,
        "speed_based",
        {
          distanceYards: result.race.distance_yards,
          raceCategory: result.race.raceCategory,
        },
      );
      if (equivalentTime === null) {
        continue;
      }

      const baseRating = ratingForStandard(result, equivalentTime, result.baseStandardSeconds);
      if (baseRating === null) {
        continue;
      }
      const sameDayRating = ratingForAdjustment(
        result,
        equivalentTime,
        result.sameDayAdjustmentSecondsPerFurlong,
      );
      const conservativeSameDayRating = ratingForAdjustment(
        result,
        equivalentTime,
        result.conservativeSameDayAdjustmentSecondsPerFurlong,
      );
      const historicalFallbackRating = ratingForAdjustment(
        result,
        equivalentTime,
        result.historicalAdjustmentSecondsPerFurlong,
      );
      const hierarchyAdjustment =
        result.conservativeHierarchyMethod === "same_day"
          ? result.conservativeSameDayAdjustmentSecondsPerFurlong
          : result.conservativeHierarchyMethod === "historical_fallback"
            ? result.conservativeHistoricalAdjustmentSecondsPerFurlong
            : null;
      const conservativeHierarchyRating =
        ratingForAdjustment(result, equivalentTime, hierarchyAdjustment) ?? baseRating;
      const sourceRunner = runnerById.get(runner.id);

      rows.push({
        race: result.race,
        runnerSourceId: runner.id,
        horseName: sourceRunner?.horse_name ?? runner.id,
        finishingPosition: runner.finishingPosition,
        officialRating: sourceRunner?.official_rating ?? null,
        equivalentTimeSeconds: equivalentTime,
        baseStandardSeconds: result.baseStandardSeconds,
        sameDayAdjustmentSecondsPerFurlong: result.sameDayAdjustmentSecondsPerFurlong,
        sameDayPeerCount: result.sameDayPeerCount,
        sameDayStdevSecondsPerFurlong: result.sameDayStdevSecondsPerFurlong,
        conservativeSameDayAdjustmentSecondsPerFurlong:
          result.conservativeSameDayAdjustmentSecondsPerFurlong,
        historicalAdjustmentSecondsPerFurlong: result.historicalAdjustmentSecondsPerFurlong,
        historicalFallbackSampleSize: result.historicalFallbackSampleSize,
        conservativeHistoricalAdjustmentSecondsPerFurlong:
          result.conservativeHistoricalAdjustmentSecondsPerFurlong,
        baseRating,
        sameDayRating,
        conservativeSameDayRating,
        historicalFallbackRating,
        conservativeHierarchyRating,
        conservativeHierarchyMethod: result.conservativeHierarchyMethod,
      });
    }
  }
  return rows;
}

function ratingForAdjustment(
  result: RaceAdjustmentResult,
  equivalentTimeSeconds: number,
  adjustmentSecondsPerFurlong: number | null,
): number | null {
  const standard = goingAdjustedStandardSeconds({
    baseStandardSeconds: result.baseStandardSeconds,
    adjustmentSecondsPerFurlong,
    distanceYards: result.race.distance_yards,
  });
  return ratingForStandard(result, equivalentTimeSeconds, standard);
}

function ratingForStandard(
  result: RaceAdjustmentResult,
  equivalentTimeSeconds: number,
  standardSeconds: number | null,
): number | null {
  return provisionalSpeedFigure(
    equivalentTimeSeconds,
    standardSeconds,
    "distance_aware",
    {
      distanceYards: result.race.distance_yards,
      winnerTimeSeconds: result.race.usableWinningSeconds,
      raceCategory: result.race.raceCategory,
    },
  );
}

function ratingDiagnostic(
  results: RaceAdjustmentResult[],
  runnersByRace: Map<string, RunnerRow[]>,
  method: "same_day" | "fallback",
): RatingDiagnostic {
  const ratings: Array<{ rating: number; officialRating: number | null }> = [];
  for (const result of results) {
    const adjustment =
      method === "same_day"
        ? result.sameDayAdjustmentSecondsPerFurlong
        : result.historicalAdjustmentSecondsPerFurlong;
    const adjustedStandard = goingAdjustedStandardSeconds({
      baseStandardSeconds: result.baseStandardSeconds,
      adjustmentSecondsPerFurlong: adjustment,
      distanceYards: result.race.distance_yards,
    });
    if (adjustedStandard === null) {
      continue;
    }
    const runners = runnersByRace.get(result.race.race_source_id) ?? [];
    const runnerById = new Map(runners.map((runner) => [runner.runner_source_id, runner]));
    const reconstructed = reconstructCumulativeBeatenLengths(
      runners.map((runner) => ({
        id: runner.runner_source_id,
        finishingPosition: runner.finishing_position,
        resultStatus: runner.result_status,
        beatenDistance: runner.beaten_distance,
      })),
    );
    for (const runner of reconstructed) {
      if (
        runner.resultStatus !== "finished" ||
        runner.cumulativeBeatenLengths === null
      ) {
        continue;
      }
      const equivalentTime = equivalentFinishingTimeSeconds(
        result.race.usableWinningSeconds,
        runner.cumulativeBeatenLengths,
        "speed_based",
        {
          distanceYards: result.race.distance_yards,
          raceCategory: result.race.raceCategory,
        },
      );
      const rating = provisionalSpeedFigure(
        equivalentTime,
        adjustedStandard,
        "distance_aware",
        {
          distanceYards: result.race.distance_yards,
          winnerTimeSeconds: result.race.usableWinningSeconds,
          raceCategory: result.race.raceCategory,
        },
      );
      if (rating === null) {
        continue;
      }
      ratings.push({
        rating,
        officialRating: runnerById.get(runner.id)?.official_rating ?? null,
      });
    }
  }
  const ratingValues = ratings.map((row) => row.rating);
  const paired = ratings
    .filter((row) => row.officialRating !== null)
    .map((row) => [row.rating, row.officialRating ?? 0] as const);
  return {
    pairedOfficialRatings: paired.length,
    officialRatingCorrelation: correlation(paired),
    belowZero: ratingValues.filter((value) => value < 0).length,
    aboveTwoHundred: ratingValues.filter((value) => value > 200).length,
    medianRating: median(ratingValues),
    ratingStdev: standardDeviation(ratingValues),
    extremeOutliers: ratingValues.filter((value) => value < 0 || value > 200).length,
  };
}

function formatPerformance(
  label: string,
  results: RaceAdjustmentResult[],
  selector: (row: RaceAdjustmentResult) => number | null,
): string {
  const values = results.flatMap((row) => {
    const value = selector(row);
    return value === null ? [] : [value];
  });
  const baselinePairs = results
    .map((row) => [row.baseAbsoluteError, selector(row)] as const)
    .filter(([, value]) => value !== null);
  return [
    "performance",
    `method=${label}`,
    `eligible_races=${values.length}`,
    `median_abs_error=${formatSeconds(median(values))}`,
    `mean_abs_error=${formatSeconds(mean(values))}`,
    `residual_stdev=${formatSeconds(residualStdev(label, results))}`,
    `improved_vs_baseline=${formatPercent(improvementRate(baselinePairs, "improved"))}`,
    `worsened_vs_baseline=${formatPercent(improvementRate(baselinePairs, "worsened"))}`,
  ].join(" | ");
}

function segmentPerformance(results: RaceAdjustmentResult[]): string[] {
  const grouped = groupBy(results, (row) => row.segment);
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(
    ([segment, rows]) => [
      `segment=${segment} ${formatPerformance("base", rows, (row) => row.baseAbsoluteError)}`,
      `segment=${segment} ${formatPerformance("same_day", rows, (row) => row.sameDayAbsoluteError)}`,
      `segment=${segment} ${formatPerformance("historical_fallback", rows, (row) => row.fallbackAbsoluteError)}`,
    ],
  );
}

function goingAdjustmentTable(deviations: RaceDeviation[]): string[] {
  const grouped = groupBy(
    deviations.filter((row) => row.race.surface && row.race.going),
    (row) => [raceSegment(row.race), row.race.surface, row.race.going].join(" | "),
  );
  return [...grouped.entries()]
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([key, rows]) => {
      const values = rows.map((row) => row.deviationSecondsPerFurlong).sort((a, b) => a - b);
      return [
        "going_group",
        `key="${key}"`,
        `races=${rows.length}`,
        `median_per_f=${formatSeconds(median(values))}`,
        `mean_per_f=${formatSeconds(mean(values))}`,
        `stdev=${formatSeconds(standardDeviation(values))}`,
        `p25=${formatSeconds(percentile(values, 0.25))}`,
        `p75=${formatSeconds(percentile(values, 0.75))}`,
        `confidence=${sampleConfidence(rows.length)}`,
      ].join(" | ");
    });
}

function sameDayTable(estimates: Map<string, SameDayEstimate>): string[] {
  return [...estimates.values()]
    .filter((estimate) => estimate.qualifyingRaces >= MINIMUM_SAME_DAY_SAMPLE_SIZE)
    .sort((a, b) => b.qualifyingRaces - a.qualifyingRaces || a.key.localeCompare(b.key))
    .map((estimate) =>
      [
        "same_day_course",
        `date=${estimate.raceDate}`,
        `course=${estimate.courseName}`,
        `races=${estimate.qualifyingRaces}`,
        `median_per_f=${formatSeconds(estimate.medianSecondsPerFurlong)}`,
        `mean_per_f=${formatSeconds(estimate.meanSecondsPerFurlong)}`,
        `trimmed_mean_per_f=${formatSeconds(estimate.trimmedMeanSecondsPerFurlong)}`,
        `stdev=${formatSeconds(estimate.stdevSecondsPerFurlong)}`,
        `going=${JSON.stringify(estimate.goings)}`,
      ].join(" | "),
    );
}

function fallbackPerformanceBySegment(results: RaceAdjustmentResult[]): string[] {
  const grouped = groupBy(results, (row) => row.segment);
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([segment, rows]) =>
    [
      "fallback_segment",
      `segment=${segment}`,
      `same_day_eligible=${rows.filter((row) => row.sameDayAbsoluteError !== null).length}`,
      `historical_fallback_eligible=${rows.filter((row) => row.fallbackAbsoluteError !== null).length}`,
      `fallback_median_abs_error=${formatSeconds(median(rows.flatMap((row) => row.fallbackAbsoluteError === null ? [] : [row.fallbackAbsoluteError])))}`,
      `fallback_improved=${formatPercent(improvementRate(rows.map((row) => [row.baseAbsoluteError, row.fallbackAbsoluteError] as const).filter(([, value]) => value !== null), "improved"))}`,
    ].join(" | "),
  );
}

function selectedCourseExamples(deviations: RaceDeviation[]): string[] {
  const wanted = ["Wolverhampton", "Newcastle", "Kempton", "Newmarket", "Worcester", "Uttoxeter", "Market Rasen"];
  const lines: string[] = [];
  for (const course of wanted) {
    const grouped = groupBy(
      deviations.filter((row) => row.race.course_name === course),
      (row) => `${row.race.distance ?? "missing"} (${row.race.distance_yards ?? "?"}y)`,
    );
    const examples = [...grouped.entries()]
      .filter(([, rows]) => rows.length >= 5)
      .sort(([, a], [, b]) => b.length - a.length)
      .slice(0, 3);
    if (examples.length === 0) {
      lines.push(`course_example course=${course} status=no_distance_group_with_5_races`);
      continue;
    }
    for (const [distance, rows] of examples) {
      const values = rows.map((row) => row.deviationSecondsPerFurlong);
      lines.push(
        [
          "course_example",
          `course=${course}`,
          `distance="${distance}"`,
          `races=${rows.length}`,
          `segment=${raceSegment(rows[0].race)}`,
          `surface=${counterValues(rows.map((row) => row.race.surface ?? "missing"))}`,
          `going=${counterValues(rows.map((row) => row.race.going ?? "missing"))}`,
          `median_per_f=${formatSeconds(median(values))}`,
          `stdev=${formatSeconds(standardDeviation(values))}`,
        ].join(" | "),
      );
    }
  }
  return lines;
}

function conclusionLines(results: RaceAdjustmentResult[]): string[] {
  const base = median(results.map((row) => row.baseAbsoluteError));
  const sameDay = median(results.flatMap((row) => row.sameDayAbsoluteError === null ? [] : [row.sameDayAbsoluteError]));
  const fallback = median(results.flatMap((row) => row.fallbackAbsoluteError === null ? [] : [row.fallbackAbsoluteError]));
  const sameDayEligible = results.filter((row) => row.sameDayAbsoluteError !== null).length;
  const fallbackEligible = results.filter((row) => row.fallbackAbsoluteError !== null).length;
  const supported: string[] = [];
  if (base !== null && sameDay !== null && sameDay < base) {
    supported.push("same-day track adjustment");
  }
  if (base !== null && fallback !== null && fallback < base) {
    supported.push("historical surface/going fallback");
  }
  return [
    `same_day_evidence=${sameDayEligible > 0 ? "available" : "insufficient"} median_abs_error=${formatSeconds(sameDay)} vs_base=${formatSeconds(base)}`,
    `historical_fallback_evidence=${fallbackEligible > 0 ? "available" : "insufficient"} median_abs_error=${formatSeconds(fallback)} vs_base=${formatSeconds(base)}`,
    `supports=${supported.length ? supported.join(" and ") : "neither on median absolute error in this run"}`,
  ];
}

async function writeDiagnostics(
  deviations: RaceDeviation[],
  estimates: Map<string, SameDayEstimate>,
  results: RaceAdjustmentResult[],
  runnerRatings: RunnerRatingRow[],
) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const basename = `${START_DATE}-${END_DATE}`;
  const text = [
    "race_source_id,race_date,course,distance,distance_yards,segment,surface,going,actual,base_standard,base_sample,deviation_seconds,deviation_per_f,same_day_adj_per_f,same_day_peer_count,same_day_stdev_per_f,conservative_same_day_adj_per_f,historical_adj_per_f,historical_fallback_sample_size,conservative_historical_adj_per_f,base_abs_error,same_day_abs_error,conservative_same_day_abs_error,fallback_abs_error,conservative_hierarchy_abs_error,conservative_hierarchy_method",
    ...results.map((row) =>
      csv([
        row.race.race_source_id,
        row.race.race_date,
        row.race.course_name,
        row.race.distance,
        row.race.distance_yards,
        row.segment,
        row.race.surface,
        row.race.going,
        row.race.usableWinningSeconds,
        row.baseStandardSeconds,
        row.baseStandardSampleSize,
        row.deviationSeconds,
        row.deviationSecondsPerFurlong,
        row.sameDayAdjustmentSecondsPerFurlong,
        row.sameDayPeerCount,
        row.sameDayStdevSecondsPerFurlong,
        row.conservativeSameDayAdjustmentSecondsPerFurlong,
        row.historicalAdjustmentSecondsPerFurlong,
        row.historicalFallbackSampleSize,
        row.conservativeHistoricalAdjustmentSecondsPerFurlong,
        row.baseAbsoluteError,
        row.sameDayAbsoluteError,
        row.conservativeSameDayAbsoluteError,
        row.fallbackAbsoluteError,
        row.conservativeHierarchyAbsoluteError,
        row.conservativeHierarchyMethod,
      ]),
    ),
  ].join("\n");
  await writeFile(`${OUTPUT_DIR}/going-adjustment-races-${basename}.csv`, text);

  const runnerText = [
    "race_source_id,race_date,course,distance,distance_yards,segment,surface,going,actual_winning_time,equivalent_time_seconds,runner_source_id,horse,finish_position,official_rating,base_standard,same_day_adj_per_f,same_day_peer_count,same_day_stdev_per_f,conservative_same_day_adj_per_f,historical_adj_per_f,historical_fallback_sample_size,conservative_historical_adj_per_f,base_rating,same_day_rating,conservative_same_day_rating,historical_fallback_rating,conservative_hierarchy_rating,conservative_hierarchy_method,same_day_eligible,conservative_same_day_eligible,historical_fallback_eligible,conservative_hierarchy_uses_adjustment",
    ...runnerRatings.map((row) =>
      csv([
        row.race.race_source_id,
        row.race.race_date,
        row.race.course_name,
        row.race.distance,
        row.race.distance_yards,
        raceSegment(row.race),
        row.race.surface,
        row.race.going,
        row.race.usableWinningSeconds,
        row.equivalentTimeSeconds,
        row.runnerSourceId,
        row.horseName,
        row.finishingPosition,
        row.officialRating,
        row.baseStandardSeconds,
        row.sameDayAdjustmentSecondsPerFurlong,
        row.sameDayPeerCount,
        row.sameDayStdevSecondsPerFurlong,
        row.conservativeSameDayAdjustmentSecondsPerFurlong,
        row.historicalAdjustmentSecondsPerFurlong,
        row.historicalFallbackSampleSize,
        row.conservativeHistoricalAdjustmentSecondsPerFurlong,
        row.baseRating,
        row.sameDayRating,
        row.conservativeSameDayRating,
        row.historicalFallbackRating,
        row.conservativeHierarchyRating,
        row.conservativeHierarchyMethod,
        row.sameDayRating !== null,
        row.conservativeSameDayRating !== null,
        row.historicalFallbackRating !== null,
        row.conservativeHierarchyMethod !== "base",
      ]),
    ),
  ].join("\n");
  await writeFile(`${OUTPUT_DIR}/going-adjustment-runners-${basename}.csv`, runnerText);

  const summary = [
    `date_range=${START_DATE}..${END_DATE}`,
    `valid_race_deviations=${deviations.length}`,
    `same_day_cards=${estimates.size}`,
    formatPerformance("base", results, (row) => row.baseAbsoluteError),
    formatPerformance("same_day", results, (row) => row.sameDayAbsoluteError),
    formatPerformance("historical_fallback", results, (row) => row.fallbackAbsoluteError),
    "",
    ...goingAdjustmentTable(deviations),
    "",
    ...sameDayTable(estimates),
  ].join("\n");
  await writeFile(`${OUTPUT_DIR}/going-adjustment-${basename}.txt`, summary);
}

function residualSeconds(actual: number | null, expected: number | null): number | null {
  if (actual === null || expected === null) {
    return null;
  }
  return actual - expected;
}

function residualStdev(label: string, results: RaceAdjustmentResult[]): number | null {
  if (label === "base") {
    return standardDeviation(results.map((row) => row.deviationSeconds));
  }
  if (label === "same_day") {
    return standardDeviation(results.flatMap((row) => row.sameDayResidualSeconds === null ? [] : [row.sameDayResidualSeconds]));
  }
  return standardDeviation(results.flatMap((row) => row.fallbackResidualSeconds === null ? [] : [row.fallbackResidualSeconds]));
}

function improvementRate(
  pairs: readonly (readonly [number, number | null])[],
  direction: "improved" | "worsened",
): number | null {
  if (pairs.length === 0) {
    return null;
  }
  const count = pairs.filter(([base, adjusted]) =>
    direction === "improved" ? (adjusted ?? Infinity) < base : (adjusted ?? -Infinity) > base,
  ).length;
  return (count / pairs.length) * 100;
}

function trimmedMean(values: number[]): number | null {
  if (values.length < TRIMMED_MEAN_MINIMUM_SAMPLE_SIZE) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * TRIM_PROPORTION);
  return mean(sorted.slice(trimCount, sorted.length - trimCount));
}

function sampleConfidence(sampleSize: number): string {
  if (sampleSize < 5) {
    return "very_weak";
  }
  if (sampleSize < 10) {
    return "weak";
  }
  if (sampleSize < 25) {
    return "moderate";
  }
  return "strong";
}

function raceSegment(race: ResearchRace): string {
  if (race.raceCategory === "all_weather") {
    return "all_weather_flat";
  }
  if (race.raceCategory === "jumps") {
    return "jumps";
  }
  if (race.surface === "TURF") {
    return "turf_flat";
  }
  return "unknown";
}

function baseStandardKey(race: ResearchRace): string {
  return `${race.course_source_id}:${race.distance_yards ?? "unknown"}`;
}

function sameDayKey(race: ResearchRace): string {
  return `${race.race_date}:${race.course_source_id}`;
}

function compareDeviationChronology(a: RaceDeviation, b: RaceDeviation): number {
  return (
    a.race.race_date.localeCompare(b.race.race_date) ||
    (a.race.scheduled_time ?? "").localeCompare(b.race.scheduled_time ?? "") ||
    a.race.race_source_id.localeCompare(b.race.race_source_id)
  );
}

function groupRunnersByRace(runners: RunnerRow[]): Map<string, RunnerRow[]> {
  const grouped = new Map<string, RunnerRow[]>();
  for (const runner of runners) {
    const rows = grouped.get(runner.race_source_id) ?? [];
    rows.push(runner);
    grouped.set(runner.race_source_id, rows);
  }
  return grouped;
}

function groupBy<T>(
  rows: T[],
  keyForRow: (row: T) => string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyForRow(row);
    const values = grouped.get(key) ?? [];
    values.push(row);
    grouped.set(key, values);
  }
  return grouped;
}

function percentile(sortedValues: number[], fraction: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }
  const index = (sortedValues.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sortedValues[lower];
  }
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
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
  if (xTotal === 0 || yTotal === 0) {
    return null;
  }
  return numerator / Math.sqrt(xTotal * yTotal);
}

function formatRatingDiagnostic(label: string, diagnostic: RatingDiagnostic): string {
  return [
    "rating_diagnostic",
    `method=${label}`,
    `or_pairs=${diagnostic.pairedOfficialRatings}`,
    `or_correlation=${formatNumber(diagnostic.officialRatingCorrelation)}`,
    `ratings_below_0=${diagnostic.belowZero}`,
    `ratings_above_200=${diagnostic.aboveTwoHundred}`,
    `median_rating=${formatNumber(diagnostic.medianRating)}`,
    `rating_stdev=${formatNumber(diagnostic.ratingStdev)}`,
    `extreme_outliers=${diagnostic.extremeOutliers}`,
  ].join(" | ");
}

function counterValues(values: string[]): string {
  return JSON.stringify(counterValuesObject(values));
}

function counterValuesObject(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function csv(values: unknown[]): string {
  return values
    .map((value) => {
      if (value === null || value === undefined) {
        return "";
      }
      const text = String(value);
      return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    })
    .join(",");
}

function formatNumber(value: number | null): string {
  return value === null ? "-" : value.toFixed(2);
}

function formatPercent(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(1)}%`;
}

function printHeader(value: string) {
  console.log("");
  console.log(`## ${value}`);
}

await main();

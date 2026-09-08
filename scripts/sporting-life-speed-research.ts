import { createDbConnection } from "@/db";
import {
  classifyRaceCategory,
  equivalentFinishingTimeSeconds,
  formatSeconds,
  leaveOneOutMeetingVariant,
  leaveOneOutStandardTime,
  mean,
  median,
  parseBeatenDistanceLengths,
  provisionalSpeedFigure,
  reconstructCumulativeBeatenLengths,
  sampleLabel,
  sanityCheckWinningTime,
  secondsPerLength,
  speedFigureConfidence,
  standardDeviation,
  variantAdjustedTimeSeconds,
  type RaceCategory,
  type SecondsPerLengthModel,
  type StandardTimeRaceInput,
} from "@/lib/racing/speed-research";

const START_DATE = process.argv[2] ?? "2020-08-01";
const END_DATE = process.argv[3] ?? "2020-09-13";

type RacePayload = {
  props: {
    pageProps: {
      meeting: Array<{
        meeting_summary: {
          course: {
            course_reference: { id?: number | string };
            name: string;
          };
        };
      }>;
      race: {
        race_summary: {
          race_summary_reference: { id: number | string };
          course_name: string;
          course_surface?: { surface?: string };
          date: string;
          distance: string | null;
          going: string | null;
          name: string;
          race_class: string | null;
          time: string | null;
          winning_time: string | null;
        };
        rides: Array<{
          finish_distance?: string | null;
          finish_position: number | null;
          ride_status: string | null;
        }>;
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

type ResearchRace = RaceRow & {
  parsedWinningSeconds: number | null;
  usableWinningSeconds: number | null;
  timingSanityReason: string;
  impliedAverageSpeedYardsPerSecond: number | null;
  raceCategory: RaceCategory;
  surface: string | null;
};

type StandardGroup = {
  key: string;
  courseSourceId: string;
  courseName: string;
  distance: string | null;
  distanceYards: number | null;
  races: ResearchRace[];
  validTimes: number[];
};

type VariantRow = {
  race: ResearchRace;
  standardSeconds: number;
  differenceSeconds: number;
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

const CANDIDATE_MODELS: SecondsPerLengthModel[] = [
  "fixed",
  "distance_band",
  "race_category",
  "speed_based",
];

const MINIMUM_STANDARD_SAMPLE_SIZE = 2;
const MINIMUM_VARIANT_SAMPLE_SIZE = 2;

type ResearchSpeedFigure = {
  race: ResearchRace;
  horseName: string;
  runnerSourceId: string;
  finishingPosition: number | null;
  rawMargin: string | null;
  cumulativeBeatenLengths: number;
  equivalentTimeSeconds: number;
  standardSeconds: number;
  standardSampleSize: number;
  variantSeconds: number;
  variantSampleSize: number;
  adjustedTimeSeconds: number;
  fixedPointsFigure: number;
  distanceAwareFigure: number;
  selectedFigure: number;
  confidence: string;
  officialRating: number | null;
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
    const runnersByRace = groupRunnersByRace(runnerRows);
    const standardInputs = standardTimeInputs(races);
    const speedFigures = calculateResearchSpeedFigures(
      races,
      runnersByRace,
      standardInputs,
    );
    const groups = courseDistanceGroups(races);
    const variants = meetingVariants(races, groups);
    const beaten = beatenDistanceSummary(races);
    const goingSurface = goingSurfaceSummary(races);
    const consistency = individualTimeConsistency(races, runnersByRace);
    const implausible = implausibleRecords(races);

    printHeader("Stored Sporting Life Fields");
    console.log(`date_range=${START_DATE}..${END_DATE}`);
    console.log(`races=${races.length}`);
    console.log("winning_time=races.winning_time text, parsed from source payload format");
    console.log("distance=races.distance text; distance_yards=races.distance_yards integer");
    console.log("course=courses.source_id + courses.display_name");
    console.log("race_datetime=races.race_datetime timestamp, not needed for this aggregate");
    console.log("going=races.going text");
    console.log("surface=source_imports.payload.props.pageProps.race.race_summary.course_surface.surface");
    console.log("runner beaten distance=race_runners.beaten_distance text; raw also in ride.finish_distance");
    console.log("finish status=race_runners.finishing_position/result_status; raw also in ride_status");
    console.log("finish_distance_semantics=treated as adjacent margin between consecutive finishers");
    console.log("cumulative_distance_to_winner=reconstructed in memory for research only");
    console.log("winning_time_sanity=research-only implied average speed must be 5..25 yards/second");

    printHeader("Parser Coverage");
    const parsedWinning = races.filter((race) => race.parsedWinningSeconds !== null).length;
    const usableWinning = races.filter((race) => race.usableWinningSeconds !== null).length;
    const rejectedWinning = races.filter((race) => race.timingSanityReason !== "ok");
    const beatenWithValue = beaten.total - beaten.nullCount;
    console.log(`winning_time_parsed=${parsedWinning}/${races.length}`);
    console.log(`winning_time_missing_or_unrecognized=${races.length - parsedWinning}`);
    console.log(`winning_time_usable_after_sanity=${usableWinning}/${races.length}`);
    console.log(`winning_time_rejected_by_sanity=${rejectedWinning.length}`);
    console.log(`winning_time_rejection_reasons=${counterValues(rejectedWinning.map((race) => race.timingSanityReason))}`);
    for (const race of rejectedWinning) {
      console.log(
        [
          "winning_time_rejected",
          `race_id=${race.race_source_id}`,
          `date=${race.race_date}`,
          `course=${race.course_name}`,
          `distance=${race.distance}`,
          `distance_yards=${race.distance_yards ?? "-"}`,
          `raw=${race.winning_time ?? "-"}`,
          `parsed=${formatSeconds(race.parsedWinningSeconds)}`,
          `implied_yps=${formatNumber(race.impliedAverageSpeedYardsPerSecond)}`,
          `reason=${race.timingSanityReason}`,
        ].join(" | "),
      );
    }
    console.log(`beaten_distance_parsed=${beaten.parsed}/${beatenWithValue} non_null_values`);
    console.log(`beaten_distance_null=${beaten.nullCount}`);
    console.log(`beaten_distance_unknown=${beaten.unknown}`);
    console.log(`beaten_distance_notation=${JSON.stringify(beaten.notationCounts)}`);
    console.log(`beaten_distance_distinct=${JSON.stringify(beaten.distinctValues)}`);

    printHeader("Largest Course/Distance Samples");
    for (const group of [...groups.values()]
      .sort((a, b) => b.validTimes.length - a.validTimes.length || a.courseName.localeCompare(b.courseName))
      .slice(0, 20)) {
      console.log(formatGroup(group));
    }

    printHeader("Repeated Course/Distance Groups");
    const repeated = [...groups.values()].filter((group) => group.validTimes.length > 1);
    console.log(`repeated_valid_groups=${repeated.length}`);
    console.log(courseDistanceSampleBins(groups));
    for (const line of namedCourseDistanceExamples(groups)) {
      console.log(line);
    }
    for (const group of repeated
      .sort((a, b) => b.validTimes.length - a.validTimes.length || a.courseName.localeCompare(b.courseName))
      .slice(0, 30)) {
      console.log(formatGroup(group));
    }

    printHeader("Meeting Track Variant Research");
    console.log("variant_seconds=actual winning time - provisional median standard time");
    for (const [meetingKey, rowsForMeeting] of [...variants.entries()].slice(0, 40)) {
      const differences = rowsForMeeting.map((row) => row.differenceSeconds);
      const fast = differences.filter((value) => value < 0).length;
      const slow = differences.filter((value) => value > 0).length;
      console.log(
        [
          meetingKey,
          `races=${rowsForMeeting.length}`,
          `median_variant=${formatSeconds(median(differences))}`,
          `fast=${fast}`,
          `slow=${slow}`,
          `diffs=[${differences.map((value) => value.toFixed(2)).join(", ")}]`,
        ].join(" | "),
      );
    }

    printHeader("Going/Surface Observations");
    console.log(`going=${JSON.stringify(goingSurface.going)}`);
    console.log(`surface=${JSON.stringify(goingSurface.surface)}`);
    console.log("course_distance_with_multiple_going_or_surface=");
    for (const line of goingSurface.mixedCourseDistances.slice(0, 20)) {
      console.log(line);
    }

    printHeader("Illustrative Individual Timing");
    for (const line of illustrativeRunnerTiming(races).slice(0, 12)) {
      console.log(line);
    }
    console.log("fixed_0.2_seconds_per_length is illustrative only.");
    console.log("A later method may vary seconds-per-length by distance/race type.");

    printHeader("Individual Time Consistency Checks");
    console.log(`timed_races_checked=${consistency.timedRacesChecked}`);
    console.log(`finished_runners_checked=${consistency.finishedRunnersChecked}`);
    console.log(`ambiguous_reconstructions=${consistency.ambiguousReconstructions}`);
    for (const line of consistency.ambiguousRows.slice(0, 20)) {
      console.log(line);
    }
    console.log(`non_finishers_without_synthetic_time=${consistency.nonFinishersWithoutSyntheticTime}`);
    console.log(`dead_heat_rows_checked=${consistency.deadHeatRowsChecked}`);
    console.log(`dead_heat_time_mismatches=${consistency.deadHeatTimeMismatches}`);
    console.log(`monotonic_violations=${JSON.stringify(consistency.monotonicViolations)}`);
    console.log(`implausible_time_rows=${consistency.implausibleTimeRows.length}`);
    for (const line of consistency.implausibleTimeRows.slice(0, 20)) {
      console.log(line);
    }

    printHeader("Candidate Seconds Per Length Models");
    console.log("fixed=0.20s per length for every race");
    console.log("distance_band=sprint 0.18, mile 0.19, middle 0.20, staying 0.22, jumps 0.25");
    console.log("race_category=Flat/AW 0.20, jumps 0.25");
    console.log("speed_based=one 8ft horse length divided by average race yards/second");
    for (const line of candidateModelExamples(races, runnersByRace)) {
      console.log(line);
    }

    printHeader("PROVISIONAL HORSE SPEED FIGURES");
    console.log("research_only=true");
    console.log("formula=standard_time - (winner_time + beaten_lengths_to_seconds - meeting_variant)");
    console.log("figure_fixed=100 + time_difference_seconds * 5");
    console.log("figure_distance_aware=100 + time_difference_seconds / speed_based_seconds_per_length");
    console.log("selected_research_method=distance_aware");
    console.log(`minimum_standard_sample_size=${MINIMUM_STANDARD_SAMPLE_SIZE}`);
    console.log(`minimum_variant_sample_size=${MINIMUM_VARIANT_SAMPLE_SIZE}`);
    console.log(`eligible_races=${new Set(speedFigures.map((figure) => figure.race.race_source_id)).size}`);
    console.log(`eligible_runner_figures=${speedFigures.length}`);
    console.log(
      `completed_timed_runners=${completedTimedRunners(races, runnerRows)} eligible_percentage=${eligiblePercentage(
        speedFigures,
        races,
        runnerRows,
      )}`,
    );
    console.log(`confidence_counts=${JSON.stringify(counterValuesObject(speedFigures.map((figure) => figure.confidence)))}`);
    console.log(speedFigureDistribution(speedFigures));
    console.log(orRelationship(speedFigures));
    for (const line of winnerFiguresByClass(speedFigures)) {
      console.log(line);
    }
    for (const line of selectedFigureExamples(speedFigures)) {
      console.log(line);
    }
    for (const line of speedFigureAnomalies(speedFigures)) {
      console.log(line);
    }

    printHeader("Implausible Or Problematic Records");
    for (const line of implausible) {
      console.log(line);
    }
  } finally {
    await client.end();
  }
}

function toResearchRace(row: RaceRow): ResearchRace {
  const surface =
    row.payload.props.pageProps.race.race_summary.course_surface?.surface ??
    null;
  const timingSanity = sanityCheckWinningTime({
    winningTime: row.winning_time,
    distanceYards: row.distance_yards,
  });
  return {
    ...row,
    parsedWinningSeconds: timingSanity.parsedSeconds,
    usableWinningSeconds: timingSanity.usableSeconds,
    timingSanityReason: timingSanity.reason,
    impliedAverageSpeedYardsPerSecond: timingSanity.impliedAverageSpeedYardsPerSecond,
    raceCategory: classifyRaceCategory({
      distanceYards: row.distance_yards,
      raceName: row.race_name,
      raceType: row.race_type,
      surface,
    }),
    surface,
  };
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

function standardTimeInputs(races: ResearchRace[]): StandardTimeRaceInput[] {
  return races.map((race) => ({
    raceId: race.race_source_id,
    groupKey: raceGroupKey(race),
    meetingKey: `${race.race_date} ${race.course_source_id}`,
    winningTimeSeconds: race.usableWinningSeconds,
  }));
}

function calculateResearchSpeedFigures(
  races: ResearchRace[],
  runnersByRace: Map<string, RunnerRow[]>,
  standardInputs: StandardTimeRaceInput[],
): ResearchSpeedFigure[] {
  const figures: ResearchSpeedFigure[] = [];

  for (const race of races) {
    if (race.usableWinningSeconds === null) {
      continue;
    }

    const standard = leaveOneOutStandardTime(
      race.race_source_id,
      standardInputs,
      MINIMUM_STANDARD_SAMPLE_SIZE,
    );
    const variant = leaveOneOutMeetingVariant(
      race.race_source_id,
      standardInputs,
      MINIMUM_STANDARD_SAMPLE_SIZE,
      MINIMUM_VARIANT_SAMPLE_SIZE,
    );
    if (standard.standardSeconds === null || variant.variantSeconds === null) {
      continue;
    }

    const sourceRunners = runnersByRace.get(race.race_source_id) ?? [];
    const sourceRunnerById = new Map(
      sourceRunners.map((runner) => [runner.runner_source_id, runner]),
    );
    const reconstructed = reconstructCumulativeBeatenLengths(
      sourceRunners.map((runner) => ({
        id: runner.runner_source_id,
        finishingPosition: runner.finishing_position,
        resultStatus: runner.result_status,
        beatenDistance: runner.beaten_distance,
      })),
    );

    for (const runner of reconstructed) {
      if (
        runner.cumulativeBeatenLengths === null ||
        runner.resultStatus !== "finished"
      ) {
        continue;
      }
      const equivalentTime = equivalentFinishingTimeSeconds(
        race.usableWinningSeconds,
        runner.cumulativeBeatenLengths,
        "speed_based",
        {
          distanceYards: race.distance_yards,
          raceCategory: race.raceCategory,
        },
      );
      const adjustedTime = variantAdjustedTimeSeconds(
        equivalentTime,
        variant.variantSeconds,
      );
      const fixedPointsFigure = provisionalSpeedFigure(
        adjustedTime,
        standard.standardSeconds,
        "fixed_points_per_second",
        {
          distanceYards: race.distance_yards,
          winnerTimeSeconds: race.usableWinningSeconds,
          raceCategory: race.raceCategory,
        },
      );
      const distanceAwareFigure = provisionalSpeedFigure(
        adjustedTime,
        standard.standardSeconds,
        "distance_aware",
        {
          distanceYards: race.distance_yards,
          winnerTimeSeconds: race.usableWinningSeconds,
          raceCategory: race.raceCategory,
        },
      );

      if (
        equivalentTime === null ||
        adjustedTime === null ||
        fixedPointsFigure === null ||
        distanceAwareFigure === null
      ) {
        continue;
      }

      const sourceRunner = sourceRunnerById.get(runner.id);
      figures.push({
        race,
        horseName: sourceRunner?.horse_name ?? runner.id,
        runnerSourceId: runner.id,
        finishingPosition: runner.finishingPosition,
        rawMargin: runner.beatenDistance ?? null,
        cumulativeBeatenLengths: runner.cumulativeBeatenLengths,
        equivalentTimeSeconds: equivalentTime,
        standardSeconds: standard.standardSeconds,
        standardSampleSize: standard.sampleSize,
        variantSeconds: variant.variantSeconds,
        variantSampleSize: variant.sampleSize,
        adjustedTimeSeconds: adjustedTime,
        fixedPointsFigure,
        distanceAwareFigure,
        selectedFigure: distanceAwareFigure,
        confidence: speedFigureConfidence(standard.sampleSize, variant.sampleSize, true),
        officialRating: sourceRunner?.official_rating ?? null,
      });
    }
  }

  return figures;
}

function courseDistanceGroups(races: ResearchRace[]): Map<string, StandardGroup> {
  const groups = new Map<string, StandardGroup>();
  for (const race of races) {
    const key = raceGroupKey(race);
    const group =
      groups.get(key) ??
      {
        key,
        courseSourceId: race.course_source_id,
        courseName: race.course_name,
        distance: race.distance,
        distanceYards: race.distance_yards,
        races: [],
        validTimes: [],
      };
    group.races.push(race);
    if (race.usableWinningSeconds !== null) {
      group.validTimes.push(race.usableWinningSeconds);
    }
    groups.set(key, group);
  }
  return groups;
}

function raceGroupKey(race: ResearchRace): string {
  return `${race.course_source_id}:${race.distance_yards ?? "unknown"}`;
}

function courseDistanceSampleBins(groups: Map<string, StandardGroup>): string {
  const bins = {
    "1": 0,
    "2-4": 0,
    "5-9": 0,
    "10-19": 0,
    "20-39": 0,
    "40-79": 0,
    "80+": 0,
  };
  let largest = 0;
  for (const group of groups.values()) {
    const sampleSize = group.validTimes.length;
    largest = Math.max(largest, sampleSize);
    if (sampleSize === 1) {
      bins["1"] += 1;
    } else if (sampleSize >= 2 && sampleSize <= 4) {
      bins["2-4"] += 1;
    } else if (sampleSize >= 5 && sampleSize <= 9) {
      bins["5-9"] += 1;
    } else if (sampleSize >= 10 && sampleSize <= 19) {
      bins["10-19"] += 1;
    } else if (sampleSize >= 20 && sampleSize <= 39) {
      bins["20-39"] += 1;
    } else if (sampleSize >= 40 && sampleSize <= 79) {
      bins["40-79"] += 1;
    } else if (sampleSize >= 80) {
      bins["80+"] += 1;
    }
  }
  return `course_distance_sample_bins=${JSON.stringify(bins)} largest_sample=${largest}`;
}

function namedCourseDistanceExamples(groups: Map<string, StandardGroup>): string[] {
  const targets = [
    ["Doncaster", "7f 6y"],
    ["Doncaster", "1m"],
    ["Leicester", "7f"],
    ["Lingfield", "7f 135y"],
    ["Wolverhampton", "7f 36y"],
  ];
  return targets.map(([course, distance]) => {
    const group = [...groups.values()].find(
      (candidate) => candidate.courseName === course && candidate.distance === distance,
    );
    if (!group) {
      return `tracked_example course=${course} distance=${distance} missing`;
    }
    return [
      "tracked_example",
      `course=${course}`,
      `distance=${distance}`,
      `valid_races=${group.validTimes.length}`,
      `median=${formatSeconds(median(group.validTimes))}`,
      `sample=${sampleLabel(group.validTimes.length)}`,
    ].join(" | ");
  });
}

function meetingVariants(
  races: ResearchRace[],
  groups: Map<string, StandardGroup>,
): Map<string, VariantRow[]> {
  const variants = new Map<string, VariantRow[]>();
  for (const race of races) {
    if (race.usableWinningSeconds === null) {
      continue;
    }
    const group = groups.get(`${race.course_source_id}:${race.distance_yards ?? "unknown"}`);
    if (!group || group.validTimes.length < 2) {
      continue;
    }
    const standard = median(group.validTimes);
    if (standard === null) {
      continue;
    }
    const key = `${race.race_date} ${race.course_name}`;
    const rows = variants.get(key) ?? [];
    rows.push({
      race,
      standardSeconds: standard,
      differenceSeconds: race.usableWinningSeconds - standard,
    });
    variants.set(key, rows);
  }
  return variants;
}

function beatenDistanceSummary(races: ResearchRace[]) {
  const notationCounts: Record<string, number> = {};
  const distinctValues = new Set<string>();
  let parsed = 0;
  let unknown = 0;
  let nullCount = 0;
  let total = 0;

  for (const race of races) {
    for (const ride of race.payload.props.pageProps.race.rides) {
      total += 1;
      const value = ride.finish_distance;
      if (value == null) {
        nullCount += 1;
        increment(notationCounts, "null");
        continue;
      }
      distinctValues.add(value);
      const notation = beatenDistanceNotation(value);
      increment(notationCounts, notation);
      if (parseBeatenDistanceLengths(value) === null) {
        unknown += 1;
      } else {
        parsed += 1;
      }
    }
  }

  return {
    distinctValues: [...distinctValues].sort(),
    notationCounts,
    nullCount,
    parsed,
    total,
    unknown,
  };
}

function beatenDistanceNotation(value: string): string {
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    return "numeric";
  }
  if (/^[¼½¾]$/.test(value)) {
    return "fraction";
  }
  if (/^\d+(?:\.\d+)? [¼½¾]$/.test(value)) {
    return "number+fraction";
  }
  if (["nk", "hd", "sh", "nse", "dh"].includes(value)) {
    return value;
  }
  return "unknown";
}

function goingSurfaceSummary(races: ResearchRace[]) {
  const going: Record<string, number> = {};
  const surface: Record<string, number> = {};
  const mixedCourseDistances: string[] = [];
  const groups = courseDistanceGroups(races);

  for (const race of races) {
    increment(going, race.going ?? "missing");
    increment(surface, race.surface ?? "missing");
  }

  for (const group of groups.values()) {
    const goings = new Set(group.races.map((race) => race.going ?? "missing"));
    const surfaces = new Set(group.races.map((race) => race.surface ?? "missing"));
    if (goings.size > 1 || surfaces.size > 1) {
      mixedCourseDistances.push(
        [
          `${group.courseName} ${group.distance} (${group.distanceYards}y)`,
          `races=${group.races.length}`,
          `going=${[...goings].join(", ")}`,
          `surface=${[...surfaces].join(", ")}`,
          `times=${group.validTimes.map((value) => value.toFixed(2)).join(", ")}`,
        ].join(" | "),
      );
    }
  }

  return { going, mixedCourseDistances, surface };
}

function illustrativeRunnerTiming(races: ResearchRace[]): string[] {
  const lines: string[] = [];
  const sampleRaces = races
    .filter((race) => race.usableWinningSeconds !== null)
    .slice(0, 4);
  for (const race of sampleRaces) {
    lines.push(
      `${race.race_date} ${race.course_name} ${race.distance}: winner_time=${formatSeconds(
        race.usableWinningSeconds,
      )}`,
    );
    for (const ride of race.payload.props.pageProps.race.rides
      .filter((ride) => ride.finish_position !== null && ride.finish_position <= 3)
      .slice(0, 3)) {
      const lengths = parseBeatenDistanceLengths(ride.finish_distance ?? null);
      const fixedTime =
        race.usableWinningSeconds !== null && lengths !== null
          ? race.usableWinningSeconds + lengths * 0.2
          : null;
      lines.push(
        `  pos=${ride.finish_position} beaten=${ride.finish_distance ?? "winner/null"} lengths=${
          lengths ?? "-"
        } illustrative_time=${formatSeconds(fixedTime)}`,
      );
    }
  }
  return lines;
}

function candidateModelExamples(
  races: ResearchRace[],
  runnersByRace: Map<string, RunnerRow[]>,
): string[] {
  const examples = [
    pickRace(races, (race) => race.raceCategory !== "jumps" && (race.distance_yards ?? 0) <= 1320),
    pickRace(races, (race) =>
      race.raceCategory !== "jumps" &&
      (race.distance_yards ?? 0) > 1760 &&
      (race.distance_yards ?? 0) <= 2640,
    ),
    pickRace(races, (race) => race.raceCategory !== "jumps" && (race.distance_yards ?? 0) > 2640),
    pickRace(races, (race) => race.raceCategory === "jumps"),
  ].filter((race): race is ResearchRace => race !== null);

  const lines: string[] = [];
  for (const race of examples) {
    const runners = runnersByRace.get(race.race_source_id) ?? [];
    const reconstructed = reconstructCumulativeBeatenLengths(
      runners.map((runner) => ({
        id: runner.runner_source_id,
        finishingPosition: runner.finishing_position,
        resultStatus: runner.result_status,
        beatenDistance: runner.beaten_distance,
      })),
    );
    const runnerById = new Map(runners.map((runner) => [runner.runner_source_id, runner]));
    const finished = reconstructed
      .filter((runner) => runner.cumulativeBeatenLengths !== null)
      .slice(0, 5);

    lines.push(
      [
        `${race.race_date} ${race.course_name} ${race.distance}`,
        `race_id=${race.race_source_id}`,
        `category=${race.raceCategory}`,
        `surface=${race.surface ?? "missing"}`,
        `winner_time=${formatSeconds(race.usableWinningSeconds)}`,
      ].join(" | "),
    );

    const splValues = CANDIDATE_MODELS.map(
      (model) =>
        `${model}:${secondsPerLength(model, {
          distanceYards: race.distance_yards,
          raceCategory: race.raceCategory,
          winnerTimeSeconds: race.usableWinningSeconds,
        }).toFixed(3)}`,
    ).join(", ");
    lines.push(`  seconds_per_length=${splValues}`);

    for (const runner of finished) {
      const sourceRunner = runnerById.get(runner.id);
      const modelTimes = CANDIDATE_MODELS.map(
        (model) =>
          `${model}:${formatSeconds(
            equivalentFinishingTimeSeconds(
              race.usableWinningSeconds,
              runner.cumulativeBeatenLengths,
              model,
              {
                distanceYards: race.distance_yards,
                raceCategory: race.raceCategory,
              },
            ),
          )}`,
      ).join(", ");
      lines.push(
        `  pos=${runner.finishingPosition} horse=${sourceRunner?.horse_name ?? runner.id} raw_margin=${
          runner.beatenDistance ?? "-"
        } cumulative_lengths=${runner.cumulativeBeatenLengths?.toFixed(2) ?? "-"} | ${modelTimes}`,
      );
    }
  }
  return lines;
}

function individualTimeConsistency(
  races: ResearchRace[],
  runnersByRace: Map<string, RunnerRow[]>,
) {
  const monotonicViolations = Object.fromEntries(
    CANDIDATE_MODELS.map((model) => [model, 0]),
  ) as Record<SecondsPerLengthModel, number>;
  const implausibleTimeRows: string[] = [];
  const ambiguousRows: string[] = [];
  let ambiguousReconstructions = 0;
  let deadHeatRowsChecked = 0;
  let deadHeatTimeMismatches = 0;
  let finishedRunnersChecked = 0;
  let nonFinishersWithoutSyntheticTime = 0;
  let timedRacesChecked = 0;

  for (const race of races) {
    if (race.usableWinningSeconds === null) {
      continue;
    }
    timedRacesChecked += 1;
    const runners = runnersByRace.get(race.race_source_id) ?? [];
    const reconstructed = reconstructCumulativeBeatenLengths(
      runners.map((runner) => ({
        id: runner.runner_source_id,
        finishingPosition: runner.finishing_position,
        resultStatus: runner.result_status,
        beatenDistance: runner.beaten_distance,
      })),
    );

    finishedRunnersChecked += reconstructed.filter(
      (runner) => runner.cumulativeBeatenLengths !== null,
    ).length;
    for (const runner of reconstructed.filter((row) => row.ambiguous)) {
      ambiguousReconstructions += 1;
      ambiguousRows.push(
        `${race.race_source_id} pos=${runner.finishingPosition ?? "-"} runner=${
          runner.id
        } raw_margin=${runner.beatenDistance ?? "-"}`,
      );
    }
    nonFinishersWithoutSyntheticTime += reconstructed.filter(
      (runner) =>
        runner.resultStatus !== "finished" &&
        runner.cumulativeBeatenLengths === null,
    ).length;
    deadHeatRowsChecked += reconstructed.filter(
      (runner) => runner.beatenDistance?.toLowerCase() === "dh",
    ).length;

    for (const model of CANDIDATE_MODELS) {
      let previousTime: number | null = null;
      for (const runner of reconstructed) {
        const estimated = equivalentFinishingTimeSeconds(
          race.usableWinningSeconds,
          runner.cumulativeBeatenLengths,
          model,
          {
            distanceYards: race.distance_yards,
            raceCategory: race.raceCategory,
          },
        );

        if (estimated === null) {
          continue;
        }
        if (estimated < race.usableWinningSeconds || !Number.isFinite(estimated)) {
          implausibleTimeRows.push(
            `${race.race_source_id} ${model} runner=${runner.id} estimated=${estimated}`,
          );
        }
        if (previousTime !== null && estimated < previousTime) {
          monotonicViolations[model] += 1;
        }
        if (runner.beatenDistance?.toLowerCase() === "dh" && previousTime !== null) {
          if (Math.abs(estimated - previousTime) > 0.000_001) {
            deadHeatTimeMismatches += 1;
          }
        }
        previousTime = estimated;
      }
    }
  }

  return {
    ambiguousReconstructions,
    ambiguousRows,
    deadHeatRowsChecked,
    deadHeatTimeMismatches,
    finishedRunnersChecked,
    implausibleTimeRows,
    monotonicViolations,
    nonFinishersWithoutSyntheticTime,
    timedRacesChecked,
  };
}

function pickRace(
  races: ResearchRace[],
  predicate: (race: ResearchRace) => boolean,
): ResearchRace | null {
  return (
    races.find(
      (race) =>
        race.usableWinningSeconds !== null &&
        race.distance_yards !== null &&
        predicate(race),
    ) ?? null
  );
}

function speedFigureDistribution(figures: ResearchSpeedFigure[]): string {
  const values = figures.map((figure) => figure.selectedFigure).sort((a, b) => a - b);
  return [
    "distribution",
    `count=${values.length}`,
    `mean=${formatNumber(mean(values))}`,
    `median=${formatNumber(median(values))}`,
    `min=${formatNumber(values[0] ?? null)}`,
    `p10=${formatNumber(percentile(values, 0.1))}`,
    `p90=${formatNumber(percentile(values, 0.9))}`,
    `max=${formatNumber(values.at(-1) ?? null)}`,
  ].join(" | ");
}

function orRelationship(figures: ResearchSpeedFigure[]): string {
  const paired = figures
    .filter((figure) => figure.officialRating !== null)
    .map((figure) => [figure.selectedFigure, figure.officialRating ?? 0] as const);
  return [
    "or_relationship",
    `paired=${paired.length}`,
    `correlation=${formatNumber(correlation(paired))}`,
  ].join(" | ");
}

function winnerFiguresByClass(figures: ResearchSpeedFigure[]): string[] {
  const grouped = new Map<string, number[]>();
  for (const figure of figures) {
    if (figure.finishingPosition !== 1) {
      continue;
    }
    const key = figure.race.race_class ?? "missing";
    const values = grouped.get(key) ?? [];
    values.push(figure.selectedFigure);
    grouped.set(key, values);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([raceClass, values]) =>
      [
        "winner_speed_by_class",
        `class=${raceClass}`,
        `winners=${values.length}`,
        `median=${formatNumber(median(values))}`,
        `mean=${formatNumber(mean(values))}`,
      ].join(" | "),
    );
}

function selectedFigureExamples(figures: ResearchSpeedFigure[]): string[] {
  const exampleRaces = [
    pickFigureRace(figures, (figure) => figure.race.raceCategory !== "jumps" && (figure.race.distance_yards ?? 0) <= 1320),
    pickFigureRace(figures, (figure) =>
      figure.race.raceCategory !== "jumps" &&
      (figure.race.distance_yards ?? 0) > 1320 &&
      (figure.race.distance_yards ?? 0) <= 2640,
    ),
    pickFigureRace(figures, (figure) => figure.race.raceCategory !== "jumps" && (figure.race.distance_yards ?? 0) > 2640),
    pickFigureRace(figures, (figure) => figure.race.raceCategory === "jumps"),
  ].filter((raceId): raceId is string => raceId !== null);

  const lines: string[] = [];
  for (const raceId of exampleRaces) {
    const raceFigures = figures
      .filter((figure) => figure.race.race_source_id === raceId)
      .sort((a, b) => (a.finishingPosition ?? 999) - (b.finishingPosition ?? 999))
      .slice(0, 6);
    const race = raceFigures[0]?.race;
    if (!race) {
      continue;
    }
    lines.push(
      [
        `sample_race=${race.race_date} ${race.course_name} ${race.distance}`,
        `race_id=${race.race_source_id}`,
        `category=${race.raceCategory}`,
        `standard=${formatSeconds(raceFigures[0].standardSeconds)}`,
        `variant=${formatSeconds(raceFigures[0].variantSeconds)}`,
        `standard_sample=${raceFigures[0].standardSampleSize}`,
        `variant_sample=${raceFigures[0].variantSampleSize}`,
      ].join(" | "),
    );
    for (const figure of raceFigures) {
      lines.push(
        [
          `  pos=${figure.finishingPosition}`,
          `horse=${figure.horseName}`,
          `raw_margin=${figure.rawMargin ?? "-"}`,
          `cum_lengths=${figure.cumulativeBeatenLengths.toFixed(2)}`,
          `equiv=${formatSeconds(figure.equivalentTimeSeconds)}`,
          `adjusted=${formatSeconds(figure.adjustedTimeSeconds)}`,
          `fixed_fig=${formatNumber(figure.fixedPointsFigure)}`,
          `distance_fig=${formatNumber(figure.distanceAwareFigure)}`,
          `confidence=${figure.confidence}`,
          `OR=${figure.officialRating ?? "-"}`,
        ].join(" | "),
      );
    }
  }
  return lines;
}

function completedTimedRunners(races: ResearchRace[], runners: RunnerRow[]): number {
  const timedRaceIds = new Set(
    races
      .filter((race) => race.usableWinningSeconds !== null)
      .map((race) => race.race_source_id),
  );
  return runners.filter(
    (runner) =>
      timedRaceIds.has(runner.race_source_id) &&
      runner.result_status === "finished",
  ).length;
}

function eligiblePercentage(
  figures: ResearchSpeedFigure[],
  races: ResearchRace[],
  runners: RunnerRow[],
): string {
  const denominator = completedTimedRunners(races, runners);
  if (denominator === 0) {
    return "-";
  }
  return `${((figures.length / denominator) * 100).toFixed(1)}%`;
}

function speedFigureAnomalies(figures: ResearchSpeedFigure[]): string[] {
  const grouped = new Map<string, ResearchSpeedFigure[]>();
  for (const figure of figures) {
    const rows = grouped.get(figure.race.race_source_id) ?? [];
    rows.push(figure);
    grouped.set(figure.race.race_source_id, rows);
  }

  const anomalies: string[] = [];
  for (const [raceId, raceFigures] of grouped.entries()) {
    const sorted = [...raceFigures].sort(
      (a, b) => (a.finishingPosition ?? 999) - (b.finishingPosition ?? 999),
    );
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index].selectedFigure > sorted[index - 1].selectedFigure + 0.000_001) {
        anomalies.push(
          `ordering_anomaly race=${raceId} ahead=${sorted[index - 1].horseName}:${formatNumber(
            sorted[index - 1].selectedFigure,
          )} behind=${sorted[index].horseName}:${formatNumber(sorted[index].selectedFigure)}`,
        );
      }
    }
  }

  if (anomalies.length === 0) {
    return ["ordering_anomalies=none"];
  }
  return anomalies;
}

function pickFigureRace(
  figures: ResearchSpeedFigure[],
  predicate: (figure: ResearchSpeedFigure) => boolean,
): string | null {
  return figures.find(predicate)?.race.race_source_id ?? null;
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

function formatNumber(value: number | null): string {
  return value === null ? "-" : value.toFixed(2);
}

function implausibleRecords(races: ResearchRace[]): string[] {
  const lines: string[] = [];
  for (const race of races) {
    if (race.winning_time && race.parsedWinningSeconds === null) {
      lines.push(`${race.race_source_id} unparsed_winning_time=${race.winning_time}`);
    }
    if (!race.winning_time) {
      lines.push(`${race.race_source_id} missing_winning_time`);
    }
    if (race.distance_yards === null) {
      lines.push(`${race.race_source_id} missing_distance_yards distance=${race.distance}`);
    }
  }
  return lines.length ? lines : ["none"];
}

function formatGroup(group: StandardGroup): string {
  const validTimes = group.validTimes;
  return [
    `${group.courseName} ${group.distance} (${group.distanceYards}y)`,
    `course_id=${group.courseSourceId}`,
    `valid_races=${validTimes.length}`,
    `sample=${sampleLabel(validTimes.length)}`,
    `times=[${validTimes.map((value) => value.toFixed(2)).join(", ")}]`,
    `median=${formatSeconds(median(validTimes))}`,
    `mean=${formatSeconds(mean(validTimes))}`,
    `fastest=${formatSeconds(validTimes.length ? Math.min(...validTimes) : null)}`,
    `slowest=${formatSeconds(validTimes.length ? Math.max(...validTimes) : null)}`,
    `stdev=${formatSeconds(standardDeviation(validTimes))}`,
    `going=${counterValues(group.races.map((race) => race.going ?? "missing"))}`,
    `surface=${counterValues(group.races.map((race) => race.surface ?? "missing"))}`,
    `class=${counterValues(group.races.map((race) => race.race_class ?? "missing"))}`,
  ].join(" | ");
}

function counterValues(values: string[]): string {
  return JSON.stringify(counterValuesObject(values));
}

function counterValuesObject(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    increment(counts, value);
  }
  return counts;
}

function increment(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function printHeader(value: string) {
  console.log("");
  console.log(`## ${value}`);
}

await main();

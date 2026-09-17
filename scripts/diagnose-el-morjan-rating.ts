import { readFile, writeFile } from "node:fs/promises";
import { and, eq, sql } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { sourceImports } from "@/db/schema";
import { getTargetRunnerMetricsForDate } from "@/lib/racing/horse-metrics";
import { calculateTurfPerformanceRating } from "@/lib/racing/turf-performance-rating";
import { getTurfSpeedRatingsForRunners } from "@/lib/racing/turf-speed-ratings";
import { getTodaysRacingData, isOrdinaryFlatTurfRaceForDisplay } from "@/lib/racing/todays-racing";

const RACE_DATE = "2026-09-16";
const TARGET_HORSE = "El Morjan";
const COMPARISON_HORSES = ["Kingdom Of Kush", "Hierax", "Imperial Nation"];
const REPORT_PATH = "/tmp/el-morjan-rating-diagnostic.md";
const SOURCE = "sporting_life";

type Db = ReturnType<typeof createDbConnection>["db"];

type RunnerRow = {
  runnerId: string;
  runnerSourceId: string | null;
  horseId: string;
  horseSourceId: string | null;
  horseName: string;
  raceId: string;
  raceSourceId: string | null;
  courseId: string;
  courseSourceId: string | null;
  courseName: string;
  raceDate: string;
  scheduledTime: string | null;
  raceDatetime: Date | null;
  localRaceDatetime: Date | null;
  raceName: string | null;
  raceType: string | null;
  raceTypeCode: string | null;
  raceClass: string | null;
  distance: string | null;
  distanceYards: number | null;
  going: string | null;
  declaredRunnerCount: number | null;
  actualRunnerCount: number | null;
  winningTime: string | null;
  trainerId: string | null;
  trainerSourceId: string | null;
  trainerName: string | null;
  jockeyId: string | null;
  jockeySourceId: string | null;
  jockeyName: string | null;
  officialRating: number | null;
  racingPostRating: number | null;
  topspeedRating: number | null;
  runnerComment: string | null;
  finishingPosition: number | null;
  resultStatus: string | null;
  beatenDistance: string | null;
  weight: string | null;
  weightCarriedLbs: number | null;
};

type RawFieldStatus = {
  field: string;
  classification: string;
  value: unknown;
};

async function main() {
  const { db, client } = createDbConnection();
  try {
    const lines: string[] = [];
    const targetRaceRows = await loadTargetRaceRows(db);
    const target = targetRaceRows.find((row) => row.horseName === TARGET_HORSE);
    if (!target) {
      throw new Error("Could not find El Morjan in the target Sandown race.");
    }

    const todayData = await getTodaysRacingData(db, RACE_DATE);
    const todayRace = todayData.status === "ok"
      ? todayData.meetings.flatMap((meeting) => meeting.races).find((race) => race.raceId === target.raceId)
      : null;
    const todayRunner = todayRace?.runners.find((runner) => runner.runnerId === target.runnerId) ?? null;
    const targetMetrics = todayRunner?.metrics ?? null;
    const medianWeight = median(
      targetRaceRows
        .filter((row) => row.resultStatus !== "non_runner")
        .map((row) => row.weightCarriedLbs)
        .filter(isNumber),
    );
    const targetTprInput = targetMetrics ? {
      latestPerformanceRating: targetMetrics.latestPerformanceRating,
      previousPerformanceRating: targetMetrics.previousPerformanceRating,
      averagePerformanceLast3: targetMetrics.averagePerformanceLast3,
      latestSpeedRating: targetMetrics.latestTurfSpeedRating,
      previousSpeedRating: targetMetrics.previousTurfSpeedRating,
      averageSpeedLast3: targetMetrics.averageTurfSpeedLast3,
      raceClass: target.raceClass,
      weightCarriedLbs: target.weightCarriedLbs,
      raceMedianWeightCarriedLbs: medianWeight,
    } : null;
    const targetTpr = targetTprInput ? calculateTurfPerformanceRating(targetTprInput) : null;

    const priorRuns = await loadPriorRuns(db, target.horseId, target.raceDatetime);
    const priorRunIds = priorRuns.map((run) => run.runnerId);
    const priorTurfSpeed = await getTurfSpeedRatingsForRunners(db, priorRunIds, {
      source: SOURCE,
      calculationCutoffDateTime: target.raceDatetime,
    });

    const latestPrior = priorRuns[0] ?? null;
    const rawPayload = latestPrior?.raceSourceId
      ? await loadRawPayload(db, latestPrior.raceSourceId, "full-result-next-data")
      : null;
    const rawRunner = rawPayload ? findRawRide(rawPayload, TARGET_HORSE, target.horseSourceId) : null;
    const latestPriorSurface = surfaceFromRawPayload(rawPayload);
    const rawStatuses = classifyRawFields(rawRunner);

    const comparisonRows = await comparisonMetrics(db, targetRaceRows);
    const todayCoverage = await coverageForDate(db, RACE_DATE);
    const recentCoverage = await coverageForRecentTurfCache();

    lines.push("# El Morjan Rating Diagnostic");
    lines.push("");
    lines.push("Diagnostic-only investigation. No production logic, cache logic, Research defaults, or importer behavior was changed.");
    lines.push("");
    lines.push("## Target row");
    lines.push("");
    lines.push(`- Race: ${target.courseName} ${target.scheduledTime?.slice(0, 5)} ${target.raceName}`);
    lines.push("- Note: the requested title matches source race 938599. The source/stored scheduled time is 13:20 on 2026-09-16, not 14:20.");
    lines.push(`- Race ID: ${target.raceId}`);
    lines.push(`- Race source ID: ${target.raceSourceId}`);
    lines.push(`- Runner ID: ${target.runnerId}`);
    lines.push(`- Runner source ID: ${target.runnerSourceId}`);
    lines.push(`- Horse ID: ${target.horseId}`);
    lines.push(`- Horse source ID: ${target.horseSourceId}`);
    lines.push(`- Trainer ID/source: ${target.trainerId ?? "-"} / ${target.trainerSourceId ?? "-"} (${target.trainerName ?? "-"})`);
    lines.push(`- Jockey ID/source: ${target.jockeyId ?? "-"} / ${target.jockeySourceId ?? "-"} (${target.jockeyName ?? "-"})`);
    lines.push(`- Race datetime: ${target.raceDatetime?.toISOString() ?? "-"}`);
    lines.push(`- Local race datetime stored: ${target.localRaceDatetime?.toISOString() ?? "-"}`);
    lines.push("");
    lines.push("## Today display fields");
    lines.push("");
    lines.push("| Field | Source field | Value |");
    lines.push("| --- | --- | ---: |");
    lines.push(`| Days | metrics.daysSinceLastRun | ${fmt(targetMetrics?.daysSinceLastRun)} |`);
    lines.push(`| Latest Speed | metrics.latestTurfSpeedRating | ${fmt(targetMetrics?.latestTurfSpeedRating)} |`);
    lines.push(`| Prev Speed | metrics.previousTurfSpeedRating | ${fmt(targetMetrics?.previousTurfSpeedRating)} |`);
    lines.push(`| Best L3 | metrics.bestTurfSpeedLast3 | ${fmt(targetMetrics?.bestTurfSpeedLast3)} |`);
    lines.push(`| Today's Rating | metrics.latestTurfTodaysRating | ${fmt(targetMetrics?.latestTurfTodaysRating)} |`);
    lines.push(`| TPR | runner.turfPerformanceRating | ${targetTpr ? `${round(targetTpr.rating)} (history ${targetTpr.historyDepth})` : "-"} |`);
    lines.push(`| AW Latest Speed (not displayed for Turf) | metrics.latestAwSpeedRating | ${fmt(targetMetrics?.latestAwSpeedRating)} |`);
    lines.push(`| AW Today's Rating (not displayed for Turf) | metrics.latestAwTodaysRating | ${fmt(targetMetrics?.latestAwTodaysRating)} |`);
    lines.push("");
    lines.push(`Days = 19 is present because the horse-metrics path counts completed prior runs independently from rating availability. The latest prior completed run is ${latestPrior?.raceDate ?? "-"} at ${latestPrior?.courseName ?? "-"}, and the day gap to the 2026-09-16 target is ${targetMetrics?.daysSinceLastRun ?? "-"} days.`);
    lines.push("");
    lines.push("## Historical runs before target");
    lines.push("");
    lines.push("| Date | Course | Race | Type | Distance | Going | Pos | Runners | OR | RPR | TS | Turf speed | Speed reason | Comment | Race source | Runner source |");
    lines.push("| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- |");
    for (const run of priorRuns) {
      const speed = priorTurfSpeed.get(run.runnerId);
      lines.push([
        run.raceDate,
        run.courseName,
        safe(run.raceName),
        safe(run.raceType),
        safe(run.distance),
        safe(run.going),
        fmt(run.finishingPosition),
        fmt(run.actualRunnerCount ?? run.declaredRunnerCount),
        fmt(run.officialRating),
        fmt(run.racingPostRating),
        fmt(run.topspeedRating),
        fmt(speed?.rating),
        safe(speed?.unavailableReason ?? speed?.withheldReason ?? speed?.method),
        safe(run.runnerComment),
        safe(run.raceSourceId),
        safe(run.runnerSourceId),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
    lines.push("");
    lines.push("## Raw source check for most recent prior run");
    lines.push("");
    lines.push(`Most recent prior run: ${latestPrior?.raceDate ?? "-"} ${latestPrior?.courseName ?? "-"} ${latestPrior?.raceName ?? "-"} (race source ${latestPrior?.raceSourceId ?? "-"}, source surface ${latestPriorSurface ?? "-"})`);
    lines.push("");
    lines.push("| Field | Classification | Raw value | Stored value |");
    lines.push("| --- | --- | --- | --- |");
    for (const status of rawStatuses) {
      const stored = status.field === "official_rating"
        ? latestPrior?.officialRating
        : status.field === "rpr/performance"
          ? latestPrior?.racingPostRating
          : latestPrior?.topspeedRating;
      lines.push(`| ${status.field} | ${status.classification} | ${json(status.value)} | ${fmt(stored)} |`);
    }
    lines.push("");
    lines.push("Importer note: the Sporting Life full-result importer currently stores official_rating but sets racing_post_rating and topspeed_rating to null for full-result rows. In this case the raw Sporting Life payload also does not expose an RPR/Topspeed-equivalent field on the ride.");
    lines.push("");
    lines.push("## Reconstruction path");
    lines.push("");
    lines.push("- Today page calls `getTodaysRacingData`.");
    lines.push("- That calls `getTargetRunnerMetricsForDate(..., includeNonRunnerTargets: true, completedPriorRunsOnly: true)`.");
    lines.push("- Horse metrics retain the prior run for `priorRuns`, `latestRunDate`, and `daysSinceLastRun`.");
    lines.push("- Turf speed reconstruction calls `getTurfSpeedRatingsForRunners` for prior runners but filters to ordinary flat Turf races.");
    lines.push("- El Morjan's latest prior run is Southwell on Standard/AW, so it is excluded from the Turf speed family. That makes `latestTurfSpeedRating`, `previousTurfSpeedRating`, and `bestTurfSpeedLast3` null.");
    lines.push("- Performance and Turf today's-rating values are derived from the family-specific reconstructed speed ratings, not stored RPR for this path, so `latestTurfTodaysRating` is also null.");
    lines.push("- TPR requires at least one usable performance value and one usable Turf speed value plus current and median race weights. El Morjan has weights and a prior run, but has no usable Turf-family performance/speed value, so TPR is withheld.");
    lines.push("");
    lines.push("## Same-race 1-run comparisons");
    lines.push("");
    lines.push("| Horse | Prior date/course | Prior race source | OR | Stored RPR | Stored TS | Latest Speed | Best L3 | Today's Rating | TPR | TPR history | Turf speed method/reason |");
    lines.push("| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
    for (const row of comparisonRows) {
      lines.push(`| ${row.horseName} | ${row.priorLabel} | ${row.priorRaceSourceId ?? "-"} | ${fmt(row.priorOr)} | ${fmt(row.priorRpr)} | ${fmt(row.priorTs)} | ${fmt(row.latestSpeed)} | ${fmt(row.bestL3)} | ${fmt(row.todaysRating)} | ${fmt(row.tpr)} | ${fmt(row.tprHistoryDepth)} | ${safe(row.speedReason)} |`);
    }
    lines.push("");
    lines.push("Direct comparison: Kingdom Of Kush, Hierax, and Imperial Nation each have a prior ordinary Turf run with a calculated Turf speed figure, which supplies both the speed side and the performance/today-rating side. El Morjan's prior run is known, but it has no calculated turf speed figure, so both families of derived fields disappear.");
    lines.push("");
    lines.push("## Minimum-history answer");
    lines.push("");
    lines.push("TPR does not require two or three rated runs. A one-run TPR is valid. The exact gate is: reconstructed recent performance must contain at least one number, reconstructed recent turf speed must contain at least one number, historyDepth must be non-zero, and current-vs-median weight difference must be calculable. El Morjan fails the usable performance/speed requirement, not a run-count requirement.");
    lines.push("");
    lines.push("## Coverage impact");
    lines.push("");
    lines.push(`Today Turf card: runners with prior runs but no Latest Speed = ${todayCoverage.priorNoLatestSpeed}; prior runs but no TPR = ${todayCoverage.priorNoTpr}; 1+ prior run and missing stored source RPR/TS on latest prior = ${todayCoverage.priorMissingStoredSourceRatings}.`);
    lines.push(`Recent 2026 Turf cache coverage (v4 2026): prior-run rows with no Latest Speed = ${recentCoverage.noLatestSpeed}; prior-run rows with no TPR = ${recentCoverage.noTpr}; rows with 1+ prior run and missing latest source rating = ${recentCoverage.missingSourceRating}.`);
    lines.push("");
    lines.push("## Final answers");
    lines.push("");
    lines.push("1. Exact cause: El Morjan's prior run is linked and counted, but that run was on Southwell Standard/AW. The Turf-family Today columns exclude it, so there is no usable Turf speed/performance input for Latest Speed, Best L3, Turf Today's Rating, or TPR.");
    lines.push("2. Whether source data exists: Sporting Life supplied the prior run/result and OR where applicable, but not a stored RPR/Topspeed-equivalent field in the raw ride payload inspected here; the database also stores RPR and TS as null for Sporting Life full results.");
    lines.push("3. Expected or bug/gap: expected under current logic, with a possible broader product gap if we want Today to show ratings for prior runs lacking timing-derived speed.");
    lines.push("4. Whether TPR is correctly withholding: yes. One-run TPRs are allowed, but only when one usable performance and one usable turf speed input exist.");
    lines.push("5. Whether a production fix is warranted: not for TPR withholding itself; it is correctly conservative. A production change is only warranted if the desired behavior is to use another source field/model fallback when timing speed is unavailable.");
    lines.push("6. Narrowest recommended next change if wanted: add a diagnostic/coverage view for prior-run no-speed reasons, then decide whether to add an explicit, labelled fallback metric. Do not silently treat OR as TPR input.");
    lines.push("");

    await writeFile(REPORT_PATH, lines.join("\n"), "utf8");
    console.log(`Wrote ${REPORT_PATH}`);
    console.log(`cause=${targetMetrics?.daysSinceLastRun} days present; latestTurfSpeed=${fmt(targetMetrics?.latestTurfSpeedRating)}; tpr=${targetTpr ? round(targetTpr.rating) : "null"}`);
  } finally {
    await client.end();
  }
}

async function loadTargetRaceRows(db: Db): Promise<RunnerRow[]> {
  const rows = await db.execute(sql<RunnerRow>`
    select
      rr.id as "runnerId",
      rr.source_id as "runnerSourceId",
      h.id as "horseId",
      h.source_id as "horseSourceId",
      h.display_name as "horseName",
      r.id as "raceId",
      r.source_id as "raceSourceId",
      c.id as "courseId",
      c.source_id as "courseSourceId",
      c.display_name as "courseName",
      r.race_date as "raceDate",
      r.scheduled_time as "scheduledTime",
      r.race_datetime as "raceDatetime",
      r.local_race_datetime as "localRaceDatetime",
      r.race_name as "raceName",
      r.race_type as "raceType",
      r.race_type_code as "raceTypeCode",
      r.race_class as "raceClass",
      r.distance,
      r.distance_yards as "distanceYards",
      r.going,
      r.declared_runner_count as "declaredRunnerCount",
      r.actual_runner_count as "actualRunnerCount",
      r.winning_time as "winningTime",
      rr.trainer_id as "trainerId",
      t.source_id as "trainerSourceId",
      t.display_name as "trainerName",
      rr.jockey_id as "jockeyId",
      j.source_id as "jockeySourceId",
      j.display_name as "jockeyName",
      rr.official_rating as "officialRating",
      rr.racing_post_rating as "racingPostRating",
      rr.topspeed_rating as "topspeedRating",
      rr.runner_comment as "runnerComment",
      rr.finishing_position as "finishingPosition",
      rr.result_status as "resultStatus",
      rr.beaten_distance as "beatenDistance",
      rr.weight,
      rr.weight_carried_lbs as "weightCarriedLbs"
    from race_runners rr
    join races r on r.id = rr.race_id
    join courses c on c.id = r.course_id
    join horses h on h.id = rr.horse_id
    left join trainers t on t.id = rr.trainer_id
    left join jockeys j on j.id = rr.jockey_id
    where r.race_date = ${RACE_DATE}
      and lower(c.display_name) like '%sandown%'
      and (r.scheduled_time = '14:20:00' or r.race_name ilike '%Stone & Tile%')
    order by h.display_name
  `);
  return executeRows<RunnerRow>(rows).map(normalizeRunnerRow);
}

async function loadPriorRuns(db: Db, horseId: string, before: Date | null): Promise<RunnerRow[]> {
  if (!before) return [];
  const beforeIso = before.toISOString();
  const rows = await db.execute(sql<RunnerRow>`
    select
      rr.id as "runnerId",
      rr.source_id as "runnerSourceId",
      h.id as "horseId",
      h.source_id as "horseSourceId",
      h.display_name as "horseName",
      r.id as "raceId",
      r.source_id as "raceSourceId",
      c.id as "courseId",
      c.source_id as "courseSourceId",
      c.display_name as "courseName",
      r.race_date as "raceDate",
      r.scheduled_time as "scheduledTime",
      r.race_datetime as "raceDatetime",
      r.local_race_datetime as "localRaceDatetime",
      r.race_name as "raceName",
      r.race_type as "raceType",
      r.race_type_code as "raceTypeCode",
      r.race_class as "raceClass",
      r.distance,
      r.distance_yards as "distanceYards",
      r.going,
      r.declared_runner_count as "declaredRunnerCount",
      r.actual_runner_count as "actualRunnerCount",
      r.winning_time as "winningTime",
      rr.trainer_id as "trainerId",
      t.source_id as "trainerSourceId",
      t.display_name as "trainerName",
      rr.jockey_id as "jockeyId",
      j.source_id as "jockeySourceId",
      j.display_name as "jockeyName",
      rr.official_rating as "officialRating",
      rr.racing_post_rating as "racingPostRating",
      rr.topspeed_rating as "topspeedRating",
      rr.runner_comment as "runnerComment",
      rr.finishing_position as "finishingPosition",
      rr.result_status as "resultStatus",
      rr.beaten_distance as "beatenDistance",
      rr.weight,
      rr.weight_carried_lbs as "weightCarriedLbs"
    from race_runners rr
    join races r on r.id = rr.race_id
    join courses c on c.id = r.course_id
    join horses h on h.id = rr.horse_id
    left join trainers t on t.id = rr.trainer_id
    left join jockeys j on j.id = rr.jockey_id
    where rr.horse_id = ${horseId}
      and rr.source = ${SOURCE}
      and r.source = ${SOURCE}
      and r.race_datetime < ${beforeIso}
      and coalesce(rr.result_status, '') <> 'non_runner'
    order by r.race_datetime desc
  `);
  return executeRows<RunnerRow>(rows).map(normalizeRunnerRow);
}

function executeRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: T[] }).rows;
  return rows ?? [];
}

function normalizeRunnerRow(row: RunnerRow): RunnerRow {
  return {
    ...row,
    raceDatetime: normalizeDate(row.raceDatetime),
    localRaceDatetime: normalizeDate(row.localRaceDatetime),
  };
}

function normalizeDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

async function loadRawPayload(db: Db, sourceId: string, sourceType: string) {
  const rows = await db
    .select({ payload: sourceImports.payload })
    .from(sourceImports)
    .where(and(eq(sourceImports.source, SOURCE), eq(sourceImports.sourceType, sourceType), eq(sourceImports.sourceId, sourceId)))
    .limit(1);
  return rows[0]?.payload ?? null;
}

function findRawRide(payload: unknown, horseName: string, horseSourceId: string | null): Record<string, unknown> | null {
  const rides = getPath(payload, ["props", "pageProps", "race", "rides"]);
  if (!Array.isArray(rides)) return null;
  return rides.find((ride) => {
    if (!isRecord(ride)) return false;
    const horse = ride.horse;
    if (!isRecord(horse)) return false;
    const reference = horse.horse_reference;
    const referenceId = isRecord(reference) ? reference.id : null;
    return horse.name === horseName || String(referenceId ?? "") === String(horseSourceId ?? "");
  }) ?? null;
}

function surfaceFromRawPayload(payload: unknown): string | null {
  const value = getPath(payload, ["props", "pageProps", "race", "race_summary", "course_surface", "surface"]);
  return typeof value === "string" ? value : null;
}

function getPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return current;
}

function classifyRawFields(rawRunner: Record<string, unknown> | null): RawFieldStatus[] {
  if (!rawRunner) {
    return [
      { field: "official_rating", classification: "raw runner not found", value: null },
      { field: "rpr/performance", classification: "raw runner not found", value: null },
      { field: "topspeed", classification: "raw runner not found", value: null },
    ];
  }
  const entries = Object.entries(rawRunner);
  const keys = entries.map(([key]) => key);
  const ratingKeys = keys.filter((key) => /rating|rpr|speed|performance|official/i.test(key));
  const status = (field: string, wanted: string[], storedName: string): RawFieldStatus => {
    const match = wanted.map((key) => [key, rawRunner[key]] as const).find(([, value]) => value !== null && value !== undefined && value !== "");
    if (match) {
      return { field, classification: `present in source under ${match[0]} and stored correctly if importer maps ${storedName}`, value: match[1] };
    }
    const related = ratingKeys.map((key) => `${key}=${json(rawRunner[key])}`).join(", ");
    return {
      field,
      classification: related ? "absent from source; related rating keys only" : "absent from source",
      value: related || null,
    };
  };
  return [
    status("official_rating", ["official_rating", "officialRating"], "official_rating"),
    status("rpr/performance", ["rpRating", "racing_post_rating", "performance_rating", "performanceRating", "rpr"], "racing_post_rating"),
    status("topspeed", ["topspeed", "topSpeed", "topspeed_rating", "speed_rating", "speedRating"], "topspeed_rating"),
  ];
}

async function comparisonMetrics(db: Db, targetRaceRows: RunnerRow[]) {
  const targetRows = targetRaceRows.filter((row) => [TARGET_HORSE, ...COMPARISON_HORSES].includes(row.horseName));
  const metricRows = await getTargetRunnerMetricsForDate(db, RACE_DATE, SOURCE, {
    includeNonRunnerTargets: true,
    completedPriorRunsOnly: true,
  });
  const metricsByRunner = new Map(metricRows.map((row) => [row.target.runnerId, row.metrics]));
  const medianWeight = median(targetRaceRows.map((row) => row.weightCarriedLbs).filter(isNumber));
  return Promise.all(targetRows.map(async (row) => {
    const priors = await loadPriorRuns(db, row.horseId, row.raceDatetime);
    const latestPrior = priors[0] ?? null;
    const speeds = await getTurfSpeedRatingsForRunners(db, latestPrior ? [latestPrior.runnerId] : [], {
      source: SOURCE,
      calculationCutoffDateTime: row.raceDatetime,
    });
    const speed = latestPrior ? speeds.get(latestPrior.runnerId) : null;
    const metrics = metricsByRunner.get(row.runnerId) ?? null;
    const tpr = metrics ? calculateTurfPerformanceRating({
      latestPerformanceRating: metrics.latestPerformanceRating,
      previousPerformanceRating: metrics.previousPerformanceRating,
      averagePerformanceLast3: metrics.averagePerformanceLast3,
      latestSpeedRating: metrics.latestTurfSpeedRating,
      previousSpeedRating: metrics.previousTurfSpeedRating,
      averageSpeedLast3: metrics.averageTurfSpeedLast3,
      raceClass: row.raceClass,
      weightCarriedLbs: row.weightCarriedLbs,
      raceMedianWeightCarriedLbs: medianWeight,
    }) : null;
    return {
      horseName: row.horseName,
      priorLabel: latestPrior ? `${latestPrior.raceDate} ${latestPrior.courseName}` : "-",
      priorRaceSourceId: latestPrior?.raceSourceId ?? null,
      priorOr: latestPrior?.officialRating ?? null,
      priorRpr: latestPrior?.racingPostRating ?? null,
      priorTs: latestPrior?.topspeedRating ?? null,
      latestSpeed: metrics?.latestTurfSpeedRating ?? null,
      bestL3: metrics?.bestTurfSpeedLast3 ?? null,
      todaysRating: metrics?.latestTurfTodaysRating ?? null,
      tpr: tpr?.rating ?? null,
      tprHistoryDepth: tpr?.historyDepth ?? null,
      speedReason: speed?.unavailableReason ?? speed?.withheldReason ?? speed?.method ??
        (latestPrior?.going === "Standard" ? "AW/Standard prior excluded from Turf speed" : null),
    };
  }));
}

async function coverageForDate(db: Db, raceDate: string) {
  const data = await getTodaysRacingData(db, raceDate);
  if (data.status !== "ok") {
    return { priorNoLatestSpeed: 0, priorNoTpr: 0, priorMissingStoredSourceRatings: 0 };
  }
  let priorNoLatestSpeed = 0;
  let priorNoTpr = 0;
  let priorMissingStoredSourceRatings = 0;
  for (const race of data.meetings.flatMap((meeting) => meeting.races)) {
    if (!isOrdinaryFlatTurfRaceForDisplay(race)) continue;
    for (const runner of race.runners) {
      if ((runner.metrics?.priorRuns ?? 0) <= 0) continue;
      if (runner.metrics?.latestTurfSpeedRating === null) priorNoLatestSpeed += 1;
      if (!runner.turfPerformanceRating) priorNoTpr += 1;
      const prior = await loadPriorRuns(db, runner.horseId, race.raceDateTime);
      const latest = prior[0];
      if (latest && latest.racingPostRating === null && latest.topspeedRating === null) {
        priorMissingStoredSourceRatings += 1;
      }
    }
  }
  return { priorNoLatestSpeed, priorNoTpr, priorMissingStoredSourceRatings };
}

async function coverageForRecentTurfCache() {
  const path = "data/research/backtest-cache/backtest_features_v4-sporting_life-turf_flat-2026-01-01-2026-12-31/features.ndjson";
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return { noLatestSpeed: "not run", noTpr: "not available", missingSourceRating: "not available" };
  }
  let noLatestSpeed = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const f = row.features ?? row;
    if ((f.priorRuns ?? 0) <= 0) continue;
    if (f.latestSpeedRating === null || f.latestTurfSpeedRating === null) noLatestSpeed += 1;
  }
  return {
    noLatestSpeed,
    noTpr: "not stored in v4 feature cache",
    missingSourceRating: "not stored in v4 feature cache",
  };
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function isNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function fmt(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return String(value);
}

function round(value: number) {
  return Math.round(value).toString();
}

function safe(value: unknown) {
  const text = fmt(value).replaceAll("|", "\\|").replaceAll("\n", " ");
  return text || "-";
}

function json(value: unknown) {
  return value === undefined ? "-" : JSON.stringify(value);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

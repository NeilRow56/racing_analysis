import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { raceRunners, races } from "@/db/schema";
import { currentDayProspectiveCapture } from "@/lib/racing/current-day-sync";
import { getJumpSpeedRatingsForRunners } from "@/lib/racing/jump-speed-ratings";
import {
  appendJumpG4Observations,
  buildJumpG4Observations,
  JUMP_G4_FORWARD_PATH,
  loadJumpG4Forward,
  mutateJumpG4Forward,
  pendingJumpG4RaceIds,
  renderJumpG4Summary,
  renderJumpG4Today,
  updateJumpG4Settlements,
} from "@/lib/racing/jump-g4-forward";
import { loadJumpTissueForward, type JumpTissueForwardData } from "@/lib/racing/jump-tissue-forward";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";
import {
  getLocalRacingDate,
  getRacecardRowsForRaceIds,
  getTodaysRacingData,
  groupTodaysRacingRows,
  isJumpRaceForDisplay,
  type TodayMeeting,
  type TodayRace,
} from "@/lib/racing/todays-racing";

const command = process.argv[2] ?? "summary";
const raceDate = process.argv[3] ?? getLocalRacingDate();

if (command === "sync") await sync(raceDate);
else if (command === "today") console.log(renderJumpG4Today(await loadJumpG4Forward(), raceDate));
else if (command === "summary") console.log(renderJumpG4Summary(await loadJumpG4Forward()));
else throw new Error("Usage: track-jump-g4-forward.ts <sync|today|summary> [YYYY-MM-DD]");

async function sync(date: string) {
  const startedAt = performance.now();
  const progress = (message: string) => console.log(`[Jump G4 +${((performance.now() - startedAt) / 1000).toFixed(1)}s] ${message}`);
  let stage = "opening tracker";
  const heartbeat = setInterval(() => progress(`Still working: ${stage}`), 15_000);
  heartbeat.unref();
  progress(`Starting prospective sync for ${date}`);
  const now = new Date();
  const connection = createDbConnection();
  try {
    const before = await loadJumpG4Forward();
    const pendingBefore = pendingJumpG4RaceIds(before);
    stage = "loading pending results";
    progress(`Loading results for ${pendingBefore.length} pending races`);
    const priorResults = await loadRacesByIds(connection.db, pendingBefore);
    progress("Loading current Jump racecards and batched runner metrics");
    stage = "loading current racecards / batched runner metrics";
    const today = await getTodaysRacingData(connection.db, date, { raceFilter: isJumpRaceForDisplay, onTiming: (name, ms) => progress(`${name}: ${Math.round(ms)}ms`) });
    const capture = currentDayProspectiveCapture(today);
    const tissue = await loadJumpTissueForward().catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    });
    const currentRaces = capture.meetings.flatMap((meeting) => meeting.races);
    progress(`Evaluating ${currentRaces.length} Jump races / ${currentRaces.reduce((sum, race) => sum + race.runners.length, 0)} runners`);
    stage = "batched prior class / speed-count context";
    const priorContext = capture.skipped ? null : await loadPriorContextByRunner(connection, capture.meetings);
    progress("Saving qualifiers and settling pending observations (tracker lock)");
    stage = "saving tracker";
    const updated = await mutateJumpG4Forward(async (latest) => {
      let next = updateJumpG4Settlements(latest, priorResults, now).data;
      if (capture.skipped || !priorContext) return next;
      const candidates = buildJumpG4Observations({
        meetings: capture.meetings,
        raceDate: date,
        previousClassByRunner: priorContext.previousClassByRunner,
        priorUsableJumpSpeedCountByRunner: priorContext.priorUsableJumpSpeedCountByRunner,
        tissueContextByRunner: tissue ? tissueContextByRunner(tissue) : new Map(),
        recordedAt: now,
      });
      progress(`Saving ${candidates.filter((candidate) => !next.observations.some((row) => row.raceId === candidate.raceId && row.runnerId === candidate.runnerId)).length} new qualifiers`);
      next = appendJumpG4Observations(next, candidates);
      const todayRaces = new Map(capture.meetings.flatMap((meeting) => meeting.races.map((race) => [race.raceId, race] as const)));
      return updateJumpG4Settlements(next, todayRaces, now).data;
    });
    const created = updated.observations.length - before.observations.length;
    const settledNow = updated.observations.filter((row) => row.settledAt !== null).length - before.observations.filter((row) => row.settledAt !== null).length;
    console.log([
      `JUMP_G4_SYNC date=${date}`,
      `created=${created}`,
      `tracked=${updated.observations.length}`,
      `pending_before=${pendingBefore.length}`,
      `settled=${settledNow}`,
      `elapsed_ms=${Math.round(performance.now() - startedAt)}`,
      `data=${JUMP_G4_FORWARD_PATH}`,
    ].join(" "));
    if (capture.skipped) console.log(capture.message);
    console.log(renderJumpG4Today(updated, date));
  } finally {
    clearInterval(heartbeat);
    await connection.client.end();
  }
}

async function loadRacesByIds(
  db: ReturnType<typeof createDbConnection>["db"],
  raceIds: string[],
): Promise<Map<string, TodayRace>> {
  if (raceIds.length === 0) return new Map();
  const rows = await getRacecardRowsForRaceIds(db, raceIds);
  return new Map(groupTodaysRacingRows(rows).flatMap((meeting) => meeting.races.map((race) => [race.raceId, race] as const)));
}

async function loadPriorContextByRunner(
  connection: ReturnType<typeof createDbConnection>,
  meetings: TodayMeeting[],
): Promise<{
  previousClassByRunner: Map<string, number | null>;
  priorUsableJumpSpeedCountByRunner: Map<string, number>;
}> {
  const targets = meetings.flatMap((meeting) => meeting.races.flatMap((race) =>
    race.raceDateTime
      ? race.runners.map((runner) => ({
        runnerId: runner.runnerId,
        horseId: runner.horseId,
        cutoff: race.raceDateTime!,
      }))
      : []
  ));
  const previousClassByRunner = new Map(targets.map((target) => [target.runnerId, null as number | null]));
  const priorUsableJumpSpeedCountByRunner = new Map(targets.map((target) => [target.runnerId, 0]));
  const horseIds = [...new Set(targets.map((target) => target.horseId))];
  if (horseIds.length === 0) return { previousClassByRunner, priorUsableJumpSpeedCountByRunner };
  for (const chunk of chunks(horseIds, 2_000)) {
    const history = await connection.db
      .select({
        runnerId: raceRunners.id,
        horseId: raceRunners.horseId,
        raceDateTime: races.raceDatetime,
        raceClass: races.raceClass,
      })
      .from(raceRunners)
      .innerJoin(races, eq(raceRunners.raceId, races.id))
      .where(and(
        eq(raceRunners.source, "sporting_life"),
        eq(races.source, "sporting_life"),
        inArray(raceRunners.horseId, chunk),
        lt(races.raceDatetime, new Date(Math.max(...targets.filter((target) => chunk.includes(target.horseId)).map((target) => target.cutoff.getTime())))),
      ))
      .orderBy(asc(raceRunners.horseId), asc(races.raceDatetime), asc(raceRunners.id));
    const byHorse = group(history, (row) => row.horseId);
    const ratings = await getJumpSpeedRatingsForRunners(connection.db, history.map((row) => row.runnerId));
    for (const target of targets.filter((item) => chunk.includes(item.horseId))) {
      const priors = (byHorse.get(target.horseId) ?? [])
        .filter((row) => row.runnerId !== target.runnerId)
        .filter((row) => row.raceDateTime && row.raceDateTime < target.cutoff);
      const prior = priors.at(-1);
      previousClassByRunner.set(target.runnerId, raceClassNumber(prior?.raceClass ?? null));
      priorUsableJumpSpeedCountByRunner.set(target.runnerId, priors.filter((row) => ratings.get(row.runnerId)?.rating != null).length);
    }
  }
  return { previousClassByRunner, priorUsableJumpSpeedCountByRunner };
}

function tissueContextByRunner(data: JumpTissueForwardData): Map<string, { rank: number | null; probability: number | null }> {
  return new Map(data.races.flatMap((race) => race.runners.map((runner) => [runner.runnerId, { rank: runner.rank, probability: runner.probability }] as const)));
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function group<T, K>(values: T[], keyFor: (value: T) => K): Map<K, T[]> {
  const result = new Map<K, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    result.set(key, [...(result.get(key) ?? []), value]);
  }
  return result;
}

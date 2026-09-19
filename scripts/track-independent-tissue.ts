import { createDbConnection } from "@/db";
import {
  getLocalRacingDate,
  getTodaysRacingData,
  isOrdinaryFlatTurfRaceForDisplay,
  type TodayRace,
} from "@/lib/racing/todays-racing";
import {
  TISSUE_FORWARD_PATH,
  buildTissueForwardRace,
  compareTissueWithTimewise,
  enrichTissueForwardRace,
  loadFrozenTissueModel,
  loadTissueForward,
  saveTissueForward,
  summarizeTissueForward,
  upsertTissueRaces,
} from "@/lib/racing/tissue-forward";
import type { HistoricalComment } from "./diagnose-independent-tissue-feasibility";
import { loadTrackerData } from "./diagnose-tpr-vs-timewise-forward";

const timings = new Map<string, number>();

const command = process.argv[2] ?? "summary";
if (command === "summary") await summary();
else if (command === "sync") await sync(process.argv[3] ?? getLocalRacingDate());
else throw new Error("Usage: bun run tissue:summary | bun run tissue:sync [YYYY-MM-DD]");

async function sync(raceDate: string) {
  const connection = createDbConnection();
  const syncTimer = startTimer();
  try {
    const [today, model, existing] = await Promise.all([
      timed("today_metrics_load", () => getTodaysRacingData(connection.db, raceDate, {
        onTiming: recordTiming,
        raceFilter: isOrdinaryFlatTurfRaceForDisplay,
      })),
      loadFrozenTissueModel(),
      loadTissueForward(),
    ]);
    if (today.status !== "ok") throw new Error(today.message);
    const declared = await timed("declared_horse_lookup", async () => declaredTurfTargets(today.meetings));
    const { commentsByHorse, rowCount: historicalCommentRows } = await timed("historical_comment_query", () =>
      loadCommentsForDeclaredHorses(connection.client, declared.horseTargets),
    );
    const now = new Date();
    const candidates = await timed("tissue_scoring", async () => declared.races.flatMap(({ course, race }) =>
      buildTissueForwardRace({ raceDate, course, race, model, commentsByHorse, recordedAt: now }),
    ).filter((race): race is NonNullable<typeof race> => race !== null));
    let updated = upsertTissueRaces(existing, candidates);
    const racesById = new Map(today.meetings.flatMap((meeting) => meeting.races).map((race) => [race.raceId, race]));
    updated = await timed("result_enrichment", async () => ({
      ...updated,
      races: updated.races.map((record) => {
        const race = racesById.get(record.raceId);
        return race ? enrichTissueForwardRace(record, race, now) : record;
      }),
    }));
    await timed("persistence", async () => {
      if (JSON.stringify(updated) !== JSON.stringify(existing)) await saveTissueForward(updated);
    });
    const existingRaceIds = new Set(existing.races.map((race) => race.raceId));
    const created = updated.races.filter((race) => !existingRaceIds.has(race.raceId));
    const cleanPreRaceCreated = created.filter((race) => race.recordedPreRace === true).length;
    const postRaceBackfilledCreated = created.filter((race) => race.recordedPreRace !== true).length;
    const pendingRecords = summarizeTissueForward(updated).pending;
    console.log([
      `TISSUE_SYNC date=${raceDate}`,
      `turf_races=${declared.races.length}`,
      `declared_runners=${declared.declaredRunnerCount}`,
      `unique_horses=${declared.horseTargets.length}`,
      `historical_comment_rows=${historicalCommentRows}`,
      `comment_query_ms=${Math.round(timing("historical_comment_query") ?? 0)}`,
      `total_sync_ms=${Math.round(syncTimer.elapsedMs())}`,
      `clean_pre_race_created=${cleanPreRaceCreated}`,
      `post_race_backfilled_created=${postRaceBackfilledCreated}`,
      `pending_records=${pendingRecords}`,
      `tracked=${updated.races.length}`,
    ].join(" "));
  } finally {
    await connection.client.end();
  }
}

type DeclaredHorseTarget = { horseId: string; targetRaceDateTime: Date };

function declaredTurfTargets(meetings: Array<{ courseName: string; races: TodayRace[] }>) {
  const races = meetings.flatMap((meeting) => meeting.races
    .filter((race) => isOrdinaryFlatTurfRaceForDisplay(race) && race.raceDateTime !== null && race.scheduledTime !== null)
    .map((race) => ({ course: meeting.courseName, race })));
  const byHorse = new Map<string, DeclaredHorseTarget>();
  let declaredRunnerCount = 0;
  for (const { race } of races) {
    for (const runner of race.runners) {
      declaredRunnerCount += 1;
      const existing = byHorse.get(runner.horseId);
      if (!existing || race.raceDateTime! < existing.targetRaceDateTime) {
        byHorse.set(runner.horseId, { horseId: runner.horseId, targetRaceDateTime: race.raceDateTime! });
      }
    }
  }
  return { races, declaredRunnerCount, horseTargets: [...byHorse.values()] };
}

async function loadCommentsForDeclaredHorses(client: ReturnType<typeof createDbConnection>["client"], targets: DeclaredHorseTarget[]) {
  if (targets.length === 0) return { commentsByHorse: new Map<string, HistoricalComment[]>(), rowCount: 0 };
  const declaredTargets = JSON.stringify(targets.map((target) => ({
    horse_id: target.horseId,
    target_race_datetime: target.targetRaceDateTime.toISOString(),
  })));
  const rows = await client<Array<{ horseId: string; raceId: string; raceDate: string; raceDateTime: Date; comment: string }>>`
    with declared as (
      select horse_id, target_race_datetime
      from jsonb_to_recordset(${declaredTargets}::jsonb) as target(horse_id uuid, target_race_datetime timestamptz)
    )
    select rr.horse_id as "horseId", r.id as "raceId", r.race_date::text as "raceDate",
           r.race_datetime as "raceDateTime", rr.runner_comment as comment
    from declared
    join race_runners rr on rr.horse_id = declared.horse_id
    join races r on r.id = rr.race_id and r.race_datetime < declared.target_race_datetime
    where r.source = 'sporting_life' and rr.runner_comment is not null
      and btrim(rr.runner_comment) <> '' and coalesce(rr.result_status, '') <> 'non_runner'
    order by rr.horse_id, r.race_datetime
  `;
  const grouped = new Map<string, HistoricalComment[]>();
  for (const row of rows) grouped.set(row.horseId, [...(grouped.get(row.horseId) ?? []), { ...row, raceDateTime: new Date(row.raceDateTime) }]);
  return { commentsByHorse: grouped, rowCount: rows.length };
}

async function summary() {
  const [data, timewise] = await Promise.all([loadTissueForward(), loadTrackerData()]);
  const value = summarizeTissueForward(data);
  console.log(`# Independent Tissue Forward Summary\n`);
  console.log(`Model: ${data.tissueModelVersion}`);
  console.log(`Forward start: ${data.forwardStart}`);
  console.log(`Data: ${TISSUE_FORWARD_PATH}\n`);
  console.log(`Races tracked: ${value.racesTracked}`);
  console.log(`Clean pre-race races: ${value.cleanPreRaceRaces}`);
  console.log(`Pending: ${value.pending}`);
  console.log(`Settled: ${value.settled}`);
  console.log(`Post-race/backfilled excluded: ${value.postRaceBackfilledExcluded}`);
  console.log(`Top-1 strike: ${pct(value.top1)}`);
  console.log(`Top-2 capture: ${pct(value.top2)}`);
  console.log(`Top-3 capture: ${pct(value.top3)}`);
  console.log(`Log loss: ${number(value.logLoss)}`);
  console.log(`Brier score: ${number(value.brier)}\n`);
  printCalibration("Tissue calibration", value.calibration);
  printCalibration("Final-market calibration", value.marketCalibration);
  const comparison = compareTissueWithTimewise(data, timewise.races);
  console.log(`\nTimewise comparison: comparable=${comparison.comparable} agreement=${comparison.agreement} disagreement=${comparison.disagreement} tissue_only=${comparison.tissueOnly} timewise_only=${comparison.timewiseOnly} neither=${comparison.neither}`);
  console.log("Descriptive forward comparison only; small samples do not establish superiority.");
}

function printCalibration(title: string, rows: Array<{ band: string; runners: number; meanPredicted: number; actualStrike: number }>) {
  console.log(`## ${title}`);
  console.log("Band | Runners | Mean predicted | Actual strike");
  console.log("---|---:|---:|---:");
  for (const row of rows) console.log(`${row.band} | ${row.runners} | ${pct(row.meanPredicted)} | ${pct(row.actualStrike)}`);
}
function pct(value: number) { return `${(value * 100).toFixed(1)}%`; }
function number(value: number) { return Number.isFinite(value) ? value.toFixed(4) : "-"; }

function startTimer() {
  const startedAt = performance.now();
  return { elapsedMs: () => performance.now() - startedAt };
}

async function timed<T>(name: string, operation: () => Promise<T>) {
  const timer = startTimer();
  const result = await operation();
  recordTiming(name, timer.elapsedMs());
  return result;
}

function recordTiming(name: string, elapsedMs: number) {
  timings.set(name, elapsedMs);
  console.log(`TISSUE_TIMING ${name}_ms=${Math.round(elapsedMs)}`);
}

function timing(name: string) {
  return timings.get(name);
}

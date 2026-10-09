import { createDbConnection } from "@/db";
import { currentDayProspectiveCapture } from "@/lib/racing/current-day-sync";
import {
  buildModelDisagreementObservations,
  loadModelDisagreementForward,
  MODEL_DISAGREEMENT_FORWARD_PATH,
  mutateModelDisagreementForward,
  pendingModelDisagreementRaceIds,
  refreshModelDisagreementSnapshots,
  renderModelDisagreementSummary,
  renderModelDisagreementToday,
  settleModelDisagreementObservations,
  upsertModelDisagreementObservations,
  type MarketCapturePoint,
} from "@/lib/racing/model-disagreement-forward";
import { loadAwTissueForward } from "@/lib/racing/aw-tissue-forward";
import { syncAwTissueMeetings } from "@/lib/racing/aw-tissue-sync";
import { loadJumpTissueForward } from "@/lib/racing/jump-tissue-forward";
import { syncJumpTissueMeetings } from "@/lib/racing/jump-tissue-sync";
import {
  getLocalRacingDate,
  getRacecardRowsForRaceIds,
  getTodaysRacingData,
  groupTodaysRacingRows,
  isAllWeatherRaceForDisplay,
  isJumpRaceForDisplay,
  type TodayMeeting,
  type TodayRace,
} from "@/lib/racing/todays-racing";

const command = process.argv[2] ?? "summary";
const raceDate = process.argv[3] ?? getLocalRacingDate();

if (command === "night") await sync(raceDate, "NIGHT_BEFORE", { settlePending: false, ensureTissueContext: true });
else if (command === "morning") await sync(raceDate, "EARLY_MORNING", { settlePending: true, ensureTissueContext: false });
else if (command === "late") await sync(raceDate, "LATE_MORNING", { settlePending: true, ensureTissueContext: false });
else if (command === "sync") await sync(raceDate, "FINAL_PRE_RACE", { settlePending: true, ensureTissueContext: false });
else if (command === "today") console.log(renderModelDisagreementToday(await loadModelDisagreementForward(), raceDate));
else if (command === "summary") console.log(renderModelDisagreementSummary(await loadModelDisagreementForward()));
else throw new Error("Usage: track-model-disagreement.ts <night|morning|late|sync|today|summary> [YYYY-MM-DD]");

async function sync(date: string, capturePoint: MarketCapturePoint, options: { settlePending: boolean; ensureTissueContext: boolean }) {
  const now = new Date();
  const connection = createDbConnection();
  try {
    const before = await loadModelDisagreementForward();
    const pending = options.settlePending ? pendingModelDisagreementRaceIds(before) : [];
    const pendingRaces = await loadRacesByIds(connection.db, pending);
    const today = await getTodaysRacingData(connection.db, date, {
      raceFilter: (race) => isJumpRaceForDisplay(race) || isAllWeatherRaceForDisplay(race),
    });
    const capture = currentDayProspectiveCapture(today);
    let meetings = capture.meetings;
    if (!capture.skipped) {
      if (options.ensureTissueContext) {
        await Promise.all([
          syncJumpTissueMeetings(connection, meetings.filter((meeting) => meeting.races.some(isJumpRaceForDisplay)), date),
          syncAwTissueMeetings(connection, meetings.filter((meeting) => meeting.races.some(isAllWeatherRaceForDisplay)), date),
        ]);
      }
      meetings = attachTissueContext(meetings, await loadJumpTissueForward(), await loadAwTissueForward());
    }
    const currentRaces = new Map(meetings.flatMap((meeting) => meeting.races.map((race) => [race.raceId, race] as const)));
    const updated = await mutateModelDisagreementForward((latest) => {
      let next = options.settlePending ? settleModelDisagreementObservations(latest, pendingRaces, now).data : latest;
      if (!capture.skipped) {
        next = upsertModelDisagreementObservations(next, buildModelDisagreementObservations({ meetings, raceDate: date, capturePoint, recordedAt: now }));
        next = refreshModelDisagreementSnapshots(next, currentRaces, capturePoint, now);
        next = refreshModelDisagreementSnapshots(next, currentRaces, "FINAL_PRE_RACE", now);
        next = options.settlePending ? settleModelDisagreementObservations(next, currentRaces, now).data : next;
      }
      return next;
    });
    console.log([
      `MODEL_DISAGREEMENT_SYNC date=${date}`,
      `capture=${capturePoint}`,
      `created=${updated.observations.length - before.observations.length}`,
      `tracked=${updated.observations.length}`,
      `settled=${updated.observations.filter((row) => row.settledAt !== null).length}`,
      `data=${MODEL_DISAGREEMENT_FORWARD_PATH}`,
    ].join(" "));
    if (capture.skipped) console.log(capture.message);
    console.log(renderModelDisagreementToday(updated, date));
  } finally {
    await connection.client.end();
  }
}

async function loadRacesByIds(db: ReturnType<typeof createDbConnection>["db"], raceIds: string[]) {
  if (!raceIds.length) return new Map<string, TodayRace>();
  return new Map(groupTodaysRacingRows(await getRacecardRowsForRaceIds(db, raceIds)).flatMap((meeting) =>
    meeting.races.map((race) => [race.raceId, race] as const)
  ));
}

function attachTissueContext(
  meetings: TodayMeeting[],
  jump: Awaited<ReturnType<typeof loadJumpTissueForward>>,
  aw: Awaited<ReturnType<typeof loadAwTissueForward>>,
): TodayMeeting[] {
  const jumpByRunner = new Map(jump.races.flatMap((race) => race.runners.map((runner) => [runner.runnerId, runner] as const)));
  const awByRunner = new Map(aw.races.flatMap((race) => race.runners.map((runner) => [runner.runnerId, runner] as const)));
  return meetings.map((meeting) => ({
    ...meeting,
    races: meeting.races.map((race) => ({
      ...race,
      runners: race.runners.map((runner) => ({
        ...runner,
        jumpTissue: jumpByRunner.get(runner.runnerId),
        awTissue: awByRunner.get(runner.runnerId),
      })),
    })),
  }));
}

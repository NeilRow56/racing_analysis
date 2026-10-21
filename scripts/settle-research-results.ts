import { loadOrSpeed, mutateOrSpeed, pendingOrSpeedRaceIds, settleOrSpeed } from "@/lib/racing/or-speed-forward";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createDbConnection } from "@/db";
import { pendingTprForwardRaceIds, settlePendingTprForwardRaces } from "@/lib/racing/tpr-forward-workflow";
import { pendingForwardValueRaceIds, settleForwardValueRecords, mutateForwardValueData } from "@/lib/racing/forward-value";
import { loadTissueForward, pendingCleanPreRaceTissueRaceIds, saveTissueForward, settlePendingTissueForwardRaces, ACTIVE_TURF_TISSUE_CONFIG } from "@/lib/racing/tissue-forward";
import { mutateJumpTissueForward, updateJumpTissueForward } from "@/lib/racing/jump-tissue-forward";
import { mutateAwTissueForward, updateAwTissueForward } from "@/lib/racing/aw-tissue-forward";
import { AW_TISSUE_V2_ACTIVE } from "@/lib/racing/aw-tissue-v2-activation";
import { AW_TISSUE_V2_FORWARD_PATH, emptyAwV2Forward } from "@/lib/racing/aw-tissue-v2";
import { mutateAwTissuePairedForward, updateAwTissuePairedForward } from "@/lib/racing/aw-tissue-paired-forward";
import { loadHurdlePair, mutateHurdlePair, updateHurdlePairs } from "@/lib/racing/hurdle-tissue-challenger-forward";
import { loadChasePair, mutateChasePair, updateChasePairs } from "@/lib/racing/chase-tissue-challenger-forward";
import { mutateJumpG4Forward, pendingJumpG4RaceIds, updateJumpG4Settlements } from "@/lib/racing/jump-g4-forward";
import { mutateTodaysRatingWeightForward, pendingTodaysRatingWeightRaceIds, updateTodaysRatingWeightSettlements } from "@/lib/racing/todays-rating-weight-forward";
import { mutateModelDisagreementForward, pendingModelDisagreementRaceIds, settleModelDisagreementObservations } from "@/lib/racing/model-disagreement-forward";
import { getLocalRacingDate, getRacecardRowsForRaceIds, groupTodaysRacingRows, type TodayRace } from "@/lib/racing/todays-racing";
import { loadTrackerData, mutateTrackerData } from "./diagnose-tpr-vs-timewise-forward";

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) await main(process.argv.slice(2));

export async function main(args: string[]) {
  const date = args[0] ?? getLocalRacingDate();
  const now = new Date();
  const connection = createDbConnection();
  try {
    const [tpr, tissue] = await Promise.all([
      loadTrackerData(),
      loadTissueForward(ACTIVE_TURF_TISSUE_CONFIG.forwardPath, ACTIVE_TURF_TISSUE_CONFIG),
    ]);
    const raceIds = [...new Set([
      ...pendingTprForwardRaceIds(tpr),
      ...pendingOrSpeedRaceIds(await loadOrSpeed()),
      ...pendingForwardValueRaceIds(await importForwardValueSnapshot()),
      ...pendingCleanPreRaceTissueRaceIds(tissue),
      ...await pendingFromMutationSources(),
    ])];
    const races = await loadRacesByIds(connection.db, raceIds);
    let settledOrSpeed = 0;
    await mutateOrSpeed(latest => {
      const next = settleOrSpeed(latest, races, now);
      settledOrSpeed = next.observations.filter(r => r.outcome).length - latest.observations.filter(r => r.outcome).length;
      return next;
    });
    let settledTpr = 0;
    let settledValue = 0;
    let settledTurfTissue = 0;
    let settledJumpTissue = 0;
    let settledAwTissue = 0;
    let settledAwPaired = 0;
    let settledHurdlePaired = 0;
    let settledChasePaired = 0;
    let settledG4 = 0;
    let settledWeight = 0;
    let settledDisagreement = 0;

    await mutateTrackerData((latest) => {
      const result = settlePendingTprForwardRaces(latest, races);
      settledTpr = result.settled;
      return result.data;
    });
    await mutateForwardValueData((latest) => {
      const result = settleForwardValueRecords(latest, races, now);
      settledValue = result.settled;
      return result.data;
    });
    const tissueResult = settlePendingTissueForwardRaces(tissue, races, now);
    settledTurfTissue = tissueResult.settled;
    if (settledTurfTissue > 0) await saveTissueForward(tissueResult.data, ACTIVE_TURF_TISSUE_CONFIG.forwardPath);
    await mutateJumpTissueForward((latest) => {
      const before = latest.races.filter((race) => race.settledAt !== null).length;
      const next = updateJumpTissueForward(latest, races, now);
      settledJumpTissue = next.races.filter((race) => race.settledAt !== null).length - before;
      return next;
    });
    await mutateAwTissueForward((latest) => {
      const before = latest.races.filter((race) => race.settledAt !== null).length;
      const next = updateAwTissueForward(latest, races, now);
      settledAwTissue = next.races.filter((race) => race.settledAt !== null).length - before;
      return next;
    }, AW_TISSUE_V2_ACTIVE ? AW_TISSUE_V2_FORWARD_PATH : undefined, AW_TISSUE_V2_ACTIVE ? emptyAwV2Forward() : undefined);
    await mutateAwTissuePairedForward((latest) => {
      const before = latest.races.filter((race) => race.settledAt !== null).length;
      const next = updateAwTissuePairedForward(latest, races, now);
      settledAwPaired = next.races.filter((race) => race.settledAt !== null).length - before;
      return next;
    });
    await mutateHurdlePair((latest) => {
      const before = latest.races.filter((race) => race.settledAt !== null).length;
      const next = updateHurdlePairs(latest, races, now, true);
      settledHurdlePaired = next.races.filter((race) => race.settledAt !== null).length - before;
      return next;
    });
    await mutateChasePair((latest) => {
      const before = latest.races.filter((race) => race.settledAt !== null).length;
      const next = updateChasePairs(latest, races, now, true);
      settledChasePaired = next.races.filter((race) => race.settledAt !== null).length - before;
      return next;
    });
    await mutateJumpG4Forward((latest) => {
      const result = updateJumpG4Settlements(latest, races, now);
      settledG4 = result.settled;
      return result.data;
    });
    await mutateTodaysRatingWeightForward((latest) => {
      const result = updateTodaysRatingWeightSettlements(latest, races, now);
      settledWeight = result.settled;
      return result.data;
    });
    await mutateModelDisagreementForward((latest) => {
      const result = settleModelDisagreementObservations(latest, races, now);
      settledDisagreement = result.settled;
      return result.data;
    });

    console.log([
      `RESEARCH_SETTLE date=${date}`,
      `tpr=${settledTpr}`,
      `or_speed=${settledOrSpeed}`,
      `value=${settledValue}`,
      `turf_tissue=${settledTurfTissue}`,
      `jump_tissue=${settledJumpTissue}`,
      `aw_tissue=${settledAwTissue}`,
      `aw_paired=${settledAwPaired}`,
      `hurdle_paired=${settledHurdlePaired}`,
      `chase_paired=${settledChasePaired}`,
      `jump_g4=${settledG4}`,
      `todays_rating_weight=${settledWeight}`,
      `model_disagreement=${settledDisagreement}`,
    ].join(" "));
  } finally {
    await connection.client.end();
  }
}

async function importForwardValueSnapshot() {
  const { loadForwardValueData } = await import("@/lib/racing/forward-value");
  return loadForwardValueData();
}

async function pendingFromMutationSources() {
  const [
    { loadJumpTissueForward },
    { loadAwTissueForward },
    { loadAwTissuePairedForward },
    { loadJumpG4Forward },
    { loadTodaysRatingWeightForward },
    { loadModelDisagreementForward },
  ] = await Promise.all([
    import("@/lib/racing/jump-tissue-forward"),
    import("@/lib/racing/aw-tissue-forward"),
    import("@/lib/racing/aw-tissue-paired-forward"),
    import("@/lib/racing/jump-g4-forward"),
    import("@/lib/racing/todays-rating-weight-forward"),
    import("@/lib/racing/model-disagreement-forward"),
  ]);
  const [jump, aw, paired, g4, weight, disagreement] = await Promise.all([
    loadJumpTissueForward(),
    AW_TISSUE_V2_ACTIVE ? (await import("@/lib/racing/aw-tissue-v2")).loadAwV2Forward() : loadAwTissueForward(),
    loadAwTissuePairedForward(),
    loadJumpG4Forward(),
    loadTodaysRatingWeightForward(),
    loadModelDisagreementForward(),
  ]);
  return [
    ...(await loadHurdlePair()).races.filter((race) => race.settledAt === null).map((race) => race.raceId),
    ...(await loadChasePair()).races.filter((race) => race.settledAt === null).map((race) => race.raceId),
    ...jump.races.filter((race) => race.settledAt === null).map((race) => race.raceId),
    ...aw.races.filter((race) => race.settledAt === null).map((race) => race.raceId),
    ...paired.races.filter((race) => race.settledAt === null).map((race) => race.raceId),
    ...pendingJumpG4RaceIds(g4),
    ...pendingTodaysRatingWeightRaceIds(weight),
    ...pendingModelDisagreementRaceIds(disagreement),
  ];
}

async function loadRacesByIds(db: ReturnType<typeof createDbConnection>["db"], raceIds: string[]): Promise<Map<string, TodayRace>> {
  if (raceIds.length === 0) return new Map();
  return new Map(groupTodaysRacingRows(await getRacecardRowsForRaceIds(db, raceIds)).flatMap((meeting) =>
    meeting.races.map((race) => [race.raceId, race] as const)
  ));
}

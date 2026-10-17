import { mkdir, writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { currentDayProspectiveCapture, hasCompleteProspectiveField } from "@/lib/racing/current-day-sync";
import { getLocalRacingDate, getTodaysRacingData, formatRaceTimeForDisplay } from "@/lib/racing/todays-racing";
import { buildRankOneObservations, currentRankOne, loadRankOne, rankOneFamily, RANK_ONE_EPOCH } from "@/lib/racing/rank-one-forward";
import { buildHurdleRecencyObservations, loadHurdleRecency, HURDLE_RECENCY_EPOCH, type HurdlePriorRun } from "@/lib/racing/hurdle-recency-forward";
import { buildTissueForwardRace, loadFrozenTissueModel, TISSUE_V2_CONFIG } from "@/lib/racing/tissue-forward";
import { loadJumpTissueModel, predictJumpTissue } from "@/lib/racing/jump-tissue-model";
import { loadAwTissueModel, predictAwTissue } from "@/lib/racing/aw-tissue-model";
import { loadAwTissuePriorStarts } from "@/lib/racing/aw-tissue-forward";
import { loadJumpTissueCommentsForRaces } from "@/lib/racing/jump-tissue-sync";
import { summarizeBookmakerMarket } from "@/lib/racing/forward-value";

// Read-only audit: never writes observations, and never substitutes historical capture times.
const date = process.argv[2] ?? getLocalRacingDate();
const connection = createDbConnection();
try {
  const today = await getTodaysRacingData(connection.db, date, { onTiming: (stage, ms) => console.error(`${stage}: ${ms}ms`) });
  const capture = currentDayProspectiveCapture(today);
  if (capture.skipped) throw new Error(capture.message);
  const meetings = capture.meetings;
  const races = meetings.flatMap(meeting => meeting.races);
  const [turf, jump, aw, comments, awStarts, rankData, hurdleData] = await Promise.all([
    loadFrozenTissueModel(TISSUE_V2_CONFIG.modelPath, TISSUE_V2_CONFIG.modelVersion), loadJumpTissueModel(), loadAwTissueModel(),
    loadJumpTissueCommentsForRaces(connection.client, races), loadAwTissuePriorStarts(connection.client, races.filter(race => rankOneFamily(race) === "AW")),
    loadRankOne(), loadHurdleRecency(),
  ]);
  const horseIds = [...new Set(races.filter(race => rankOneFamily(race) === "HURDLE").flatMap(race => race.runners.map(runner => runner.horseId)))];
  const history = horseIds.length ? await connection.client<HurdlePriorRun[]>`
    select rr.id as "runnerId", r.id as "raceId", rr.horse_id as "horseId", r.race_datetime as "raceDateTime",
      rr.finishing_position as "finishingPosition", rr.result_status as "resultStatus"
    from race_runners rr join races r on r.id = rr.race_id
    where r.source = 'sporting_life' and rr.horse_id in ${connection.client(horseIds)}
      and r.race_datetime < now() and (rr.result_status is not null or rr.finishing_position is not null)
  ` : [];
  const historyByHorse = new Map<string, HurdlePriorRun[]>(horseIds.map(id => [id, []]));
  for (const run of history) historyByHorse.get(run.horseId)!.push(run);
  const models = { turf, jump, aw, comments, awStarts };
  const now = new Date();
  const details = meetings.flatMap(meeting => meeting.races.map(race => {
    const family = rankOneFamily(race);
    const active = race.runners.filter(runner => runner.resultStatus !== "non_runner");
    const prices = active.map(runner => ({ runner, market: summarizeBookmakerMarket(runner.bookmakerQuotes) }));
    const leader = currentRankOne(race, meeting.courseName, date, models, now);
    const book = family === "TURF" ? buildTissueForwardRace({ race, course: meeting.courseName, raceDate: date, model: turf, commentsByHorse: comments, recordedAt: now, config: TISSUE_V2_CONFIG })?.runners
      : family === "AW" ? predictAwTissue(race, awStarts, aw).runners : family ? predictJumpTissue(race, comments, jump).runners : [];
    const selected = prices.find(price => price.runner.runnerId === leader?.runnerId);
    const completeMarket = prices.length > 0 && prices.every(price => price.market.decimalPrice !== null);
    const total = completeMarket ? prices.reduce((sum, price) => sum + 1 / price.market.decimalPrice!, 0) : null;
    const oneMeeting = [{ ...meeting, races: [race] }];
    const rankRows = buildRankOneObservations({ meetings: oneMeeting, raceDate: date, capturedAt: now, models });
    const hurdleRows = buildHurdleRecencyObservations({ meetings: oneMeeting, raceDate: date, capturedAt: now, historyByHorse });
    const legacyField = race.actualRunnerCount === active.length || race.actualRunnerCount === race.runners.length;
    const preRace = !!race.raceDateTime && now < race.raceDateTime && !race.winningTime &&
      !race.runners.some(runner => runner.finishingPosition !== null || (runner.resultStatus !== null && runner.resultStatus !== "non_runner"));
    const epoch = now.toISOString() >= RANK_ONE_EPOCH && date === getLocalRacingDate(now) && !!race.raceDateTime && getLocalRacingDate(race.raceDateTime) === date;
    const rejection = !family ? "unsupported family (NH flat)" : !preRace ? "not pre-race" : !epoch ? "capture epoch/date guard" :
      !hasCompleteProspectiveField(race) ? "incomplete declared/actual field" : !completeMarket ? "incomplete active bookmaker market" : !leader ? "no Tissue rank 1" : rankRows.length ? null : "rank 1 unavailable in active market";
    return { raceId: race.raceId, sourceId: race.sourceId, course: meeting.courseName, scheduledUtc: race.raceDateTime?.toISOString(),
      localTime: formatRaceTimeForDisplay(race), family, runners: race.runners.length, activeRunners: active.length,
      actualRunnerCount: race.actualRunnerCount, declaredRunnerCount: race.declaredRunnerCount, legacyField, completeField: hasCompleteProspectiveField(race),
      tissueRankingAvailable: !!leader, rankOneHorse: selected?.runner.horseName ?? null,
      tissueProbability: book?.find(row => row.runnerId === leader?.runnerId)?.probability ?? null,
      anyBookmakerQuote: active.some(runner => (runner.bookmakerQuotes?.length ?? 0) > 0),
      anyValidMedian: prices.some(price => price.market.decimalPrice !== null),
      leaderBookmakerQuotes: (selected?.market.quoteCount ?? 0) > 0, medianBookmakerPrice: selected?.market.decimalPrice ?? null,
      normalizedMarketProbability: total && selected?.market.decimalPrice ? (1 / selected.market.decimalPrice) / total : null,
      marketRank: completeMarket && selected?.market.decimalPrice ? 1 + prices.filter(price => price.market.decimalPrice! < selected.market.decimalPrice!).length : null,
      completeMarket, unpricedHorses: prices.filter(price => price.market.decimalPrice === null).map(price => price.runner.horseName),
      preRace, epoch, alreadyCaptured: rankData.observations.some(row => row.raceId === race.raceId),
      eligible: rankRows.length > 0, legacyRejection: family && !legacyField ? "actualRunnerCount is null; result-only count required before capture" : rejection,
      rejection, hurdleObservations: hurdleRows.length,
      hurdleRunners: family !== "HURDLE" ? [] : active.map(runner => {
        const metrics = runner.metrics;
        const hasHistory = historyByHorse.has(runner.horseId) && !!metrics && (metrics.daysSinceLastRun === null || (Number.isFinite(metrics.daysSinceLastRun) && metrics.daysSinceLastRun >= 0)) && (!metrics.latestRunDate || metrics.latestRunDate <= getLocalRacingDate(now));
        return { runnerId: runner.runnerId, horse: runner.horseName, priorRuns: historyByHorse.get(runner.horseId)?.length, hasHistory,
          legacyRejection: !legacyField ? "actualRunnerCount is null; result-only count required before capture" : null,
          rejection: hurdleRows.some(row => row.runnerId === runner.runnerId) ? null : rejection ?? (hasHistory ? "capture rejected" : "missing/invalid history or metrics lookup"),
          alreadyCaptured: hurdleData.observations.some(row => row.runnerId === runner.runnerId && row.raceId === race.raceId) };
      }) };
  }));
  const supported = details.filter(row => row.family);
  const ranked = supported.filter(row => row.tissueRankingAvailable);
  const marketed = ranked.filter(row => row.completeMarket);
  const passed = marketed.filter(row => row.epoch && row.preRace && row.completeField);
  const hurdleRaces = details.filter(row => row.family === "HURDLE");
  const hurdleRunners = hurdleRaces.flatMap(row => row.hurdleRunners);
  const summary = {
    queriedDate: date, resolvedToday: getLocalRacingDate(now), timezone: "Europe/London", auditedAt: now.toISOString(), rankEpoch: RANK_ONE_EPOCH, hurdleEpoch: HURDLE_RECENCY_EPOCH,
    todaysRaces: details.length, runners: details.reduce((sum, row) => sum + row.runners, 0),
    families: Object.fromEntries(["TURF", "AW", "HURDLE", "CHASE", null].map(family => [family ?? "NH_FLAT", { races: details.filter(row => row.family === family).length, runners: details.filter(row => row.family === family).reduce((sum, row) => sum + row.runners, 0) }])),
    rankOne: { supported: supported.length, hasTissueRank: ranked.length, hasRankOneRunner: ranked.length, hasValidMarket: marketed.length, passedEpochAndPreRace: passed.length,
      legacyFieldPassed: supported.filter(row => row.legacyField).length, alreadyCaptured: passed.filter(row => row.alreadyCaptured).length,
      finalNewCaptures: passed.filter(row => row.eligible && !row.alreadyCaptured).length, eligible: details.filter(row => row.eligible).length },
    market: { anyQuote: details.filter(row => row.anyBookmakerQuote).length, anyValidMedian: details.filter(row => row.anyValidMedian).length,
      complete: details.filter(row => row.completeMarket).length, incomplete: details.filter(row => !row.completeMarket).length },
    hurdle: { races: hurdleRaces.length, runners: hurdleRunners.length, hasHistory: hurdleRunners.filter(row => row.hasHistory).length,
      hasValidMarket: hurdleRaces.filter(row => row.completeMarket).reduce((sum, row) => sum + row.activeRunners, 0),
      passedEpoch: hurdleRaces.filter(row => row.epoch && row.preRace && row.completeField).reduce((sum, row) => sum + row.activeRunners, 0),
      alreadyCaptured: hurdleRunners.filter(row => row.alreadyCaptured).length, eligible: hurdleRaces.reduce((sum, row) => sum + row.hurdleObservations, 0),
      finalNewCaptures: hurdleRunners.filter(row => row.rejection === null && !row.alreadyCaptured).length },
  };
  const path = `data/research/prospective-capture-diagnostic-${date}.json`;
  await mkdir("data/research", { recursive: true });
  await writeFile(path, JSON.stringify({ summary, races: details }, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
  console.table(details.map(row => ({ raceId: row.raceId, course: row.course, localTime: row.localTime, family: row.family, rankOne: row.rankOneHorse, price: row.medianBookmakerPrice, legacyField: row.legacyField, eligible: row.eligible, rejection: row.rejection })));
  console.log(`Full race and runner diagnostics: ${path}`);
} finally {
  await connection.client.end();
}

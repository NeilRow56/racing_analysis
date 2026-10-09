import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isVoidBetResultStatus, settleSelection } from "./backtest";
import { summarizeBookmakerMarket } from "./forward-value";
import { JUMP_RATING_A_VERSION, JUMP_RATING_B_VERSION } from "./jump-performance-rating";
import { classifyJumpRaceSubtype, isJumpRace, type JumpRaceSubtype } from "./jump-speed-rating";
import { classifyHandicapStatus } from "./research-rule";
import { raceClassNumber } from "./research-rule-classes";
import { formatRaceTimeForDisplay, type TodayMeeting, type TodayRace, type TodayRunner } from "./todays-racing";

export const JUMP_G4_FORWARD_VERSION = "jump_g4_forward_v1" as const;
export const JUMP_G4_FORWARD_PATH = "data/research/jump-g4-forward-v1.json" as const;
export const JUMP_G4_FORWARD_EPOCH = "2026-10-09T00:00:00.000Z" as const;
export const JUMP_G4_MARKET_PRICE_SOURCE = "sporting_life_median_bookmaker_at_capture_v1" as const;

export type JumpG4Subtype = "Hurdle" | "Chase" | "NH Flat" | "Other Jump";
export type JumpG4Outcome = {
  finishingPosition: number | null;
  resultStatus: string | null;
  won: boolean | null;
  deadHeatDivisor: number;
  finalSp: number | null;
  profitLoss: number | null;
};
export type JumpG4Observation = {
  raceId: string;
  sourceId: string | null;
  raceDate: string;
  scheduledOff: string;
  scheduledTime: string;
  course: string;
  raceName: string | null;
  subtype: JumpG4Subtype;
  subtypeCode: JumpRaceSubtype;
  handicapStatus: "handicap" | "non_handicap" | "unknown";
  fieldSize: number;
  runnerId: string;
  horseId: string;
  horseName: string;
  recordedAt: string;
  recordedPreRace: boolean;
  components: {
    averageL3JumpSpeed: number;
    averageL3JumpSpeedRank: number;
    latestJumpSpeed: number;
    previousJumpSpeed: number;
    latestMinusPrevious: number;
    previousClass: number;
    currentClass: number;
    classDropAmount: number;
  };
  context: {
    officialRating: number | null;
    officialRatingRank: number | null;
    officialRatingTop3: boolean | null;
    officialRatingGapToBest: number | null;
    officialRatingRelativeToFieldMean: number | null;
    trainerPriorRate: number | null;
    jockeyPriorRate: number | null;
    daysSinceRun: number | null;
    priorUsableJumpSpeedCount: number;
    jprARank: number | null;
    jprBRank: number | null;
    jumpTissueRank: number | null;
    jumpTissueProbability: number | null;
  };
  market: {
    medianBookmakerDecimal: number | null;
    impliedProbability: number | null;
    marketRank: number | null;
    priceCapturedAt: string | null;
    priceVersionSource: typeof JUMP_G4_MARKET_PRICE_SOURCE;
    bookmakerQuoteCount: number;
  };
  outcome: JumpG4Outcome | null;
  settledAt: string | null;
};

export type JumpG4ForwardData = {
  version: typeof JUMP_G4_FORWARD_VERSION;
  epoch: typeof JUMP_G4_FORWARD_EPOCH;
  rule: {
    family: "Jump";
    averageL3JumpSpeedRankMax: 3;
    requiresClassDrop: true;
    requiresLatestJumpSpeedImprovement: true;
  };
  historicalContext: {
    runners: 1524;
    winners: 343;
    ae: 1.022;
    roi: 0.0426;
    note: "Historical context only; no historical observations are backfilled into this prospective tracker.";
  };
  observations: JumpG4Observation[];
};

type PreviousClassByRunner = ReadonlyMap<string, number | null>;
type PriorUsableJumpSpeedCountByRunner = ReadonlyMap<string, number>;
type TissueContextByRunner = ReadonlyMap<string, { rank: number | null; probability: number | null }>;

export function emptyJumpG4ForwardData(): JumpG4ForwardData {
  return {
    version: JUMP_G4_FORWARD_VERSION,
    epoch: JUMP_G4_FORWARD_EPOCH,
    rule: {
      family: "Jump",
      averageL3JumpSpeedRankMax: 3,
      requiresClassDrop: true,
      requiresLatestJumpSpeedImprovement: true,
    },
    historicalContext: {
      runners: 1524,
      winners: 343,
      ae: 1.022,
      roi: 0.0426,
      note: "Historical context only; no historical observations are backfilled into this prospective tracker.",
    },
    observations: [],
  };
}

export async function loadJumpG4Forward(path = JUMP_G4_FORWARD_PATH): Promise<JumpG4ForwardData> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as JumpG4ForwardData;
    if (parsed.version !== JUMP_G4_FORWARD_VERSION || parsed.epoch !== JUMP_G4_FORWARD_EPOCH || !Array.isArray(parsed.observations)) {
      throw new Error(`Unsupported Jump G4 forward data at ${path}`);
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyJumpG4ForwardData();
    throw error;
  }
}

export async function mutateJumpG4Forward(
  mutation: (data: JumpG4ForwardData) => JumpG4ForwardData | Promise<JumpG4ForwardData>,
  path = JUMP_G4_FORWARD_PATH,
) {
  const lock = `${resolve(path)}.lock`;
  await mkdir(dirname(lock), { recursive: true });
  const deadline = Date.now() + 30_000;
  while (true) {
    try {
      await mkdir(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() >= deadline) throw error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
  }
  try {
    const before = await loadJumpG4Forward(path);
    const after = await mutation(before);
    if (JSON.stringify(after) !== JSON.stringify(before)) await saveJumpG4Forward(after, path);
    return after;
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

export async function saveJumpG4Forward(data: JumpG4ForwardData, path = JUMP_G4_FORWARD_PATH) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

export function buildJumpG4Observations(input: {
  meetings: TodayMeeting[];
  raceDate: string;
  previousClassByRunner: PreviousClassByRunner;
  priorUsableJumpSpeedCountByRunner?: PriorUsableJumpSpeedCountByRunner;
  tissueContextByRunner?: TissueContextByRunner;
  recordedAt?: Date;
}): JumpG4Observation[] {
  const recordedAt = input.recordedAt ?? new Date();
  return input.meetings.flatMap((meeting) => meeting.races.flatMap((race) =>
    buildJumpG4RaceObservations({
      race,
      course: meeting.courseName,
      raceDate: input.raceDate,
      previousClassByRunner: input.previousClassByRunner,
      priorUsableJumpSpeedCountByRunner: input.priorUsableJumpSpeedCountByRunner ?? new Map(),
      tissueContextByRunner: input.tissueContextByRunner ?? new Map(),
      recordedAt,
    })
  ));
}

export function buildJumpG4RaceObservations(input: {
  race: TodayRace;
  course: string;
  raceDate: string;
  previousClassByRunner: PreviousClassByRunner;
  priorUsableJumpSpeedCountByRunner: PriorUsableJumpSpeedCountByRunner;
  tissueContextByRunner: TissueContextByRunner;
  recordedAt: Date;
}): JumpG4Observation[] {
  const { race, recordedAt } = input;
  if (!isJumpRace(race) || !race.raceDateTime || !race.scheduledTime || recordedAt < new Date(JUMP_G4_FORWARD_EPOCH) || recordedAt >= race.raceDateTime) return [];
  const raceDateTime = race.raceDateTime;
  const scheduledTime = race.scheduledTime;
  if (race.winningTime || race.runners.some((runner) => runner.finishingPosition !== null)) return [];
  const active = race.runners.filter((runner) => runner.resultStatus !== "non_runner");
  if (active.length < 2) return [];
  const speedRanks = descendingCompetitionRanks(active, (runner) => runner.metrics?.averageJumpSpeedLast3 ?? null);
  const orRanks = descendingCompetitionRanks(active, (runner) => runner.officialRating);
  const officialRatings = active.map((runner) => runner.officialRating).filter(finite);
  const bestOr = officialRatings.length ? Math.max(...officialRatings) : null;
  const meanOr = officialRatings.length ? officialRatings.reduce((sum, value) => sum + value, 0) / officialRatings.length : null;
  const currentClass = raceClassNumber(race.raceClass);
  if (currentClass === null) return [];
  const marketRanks = marketRanksForRace(active);
  return active.flatMap((runner) => {
    const averageL3JumpSpeed = runner.metrics?.averageJumpSpeedLast3 ?? null;
    const averageL3JumpSpeedRank = speedRanks.get(runner.runnerId) ?? null;
    const latestJumpSpeed = runner.metrics?.latestJumpSpeedRating ?? null;
    const previousJumpSpeed = runner.metrics?.previousJumpSpeedRating ?? null;
    const previousClass = input.previousClassByRunner.get(runner.runnerId) ?? null;
    if (!finite(averageL3JumpSpeed) || averageL3JumpSpeedRank === null || averageL3JumpSpeedRank > 3) return [];
    if (!finite(latestJumpSpeed) || !finite(previousJumpSpeed) || latestJumpSpeed <= previousJumpSpeed) return [];
    if (previousClass === null || currentClass <= previousClass) return [];
    const market = summarizeBookmakerMarket(runner.bookmakerQuotes);
    const tissue = input.tissueContextByRunner.get(runner.runnerId);
    const officialRatingRank = orRanks.get(runner.runnerId) ?? null;
    return [{
      raceId: race.raceId,
      sourceId: race.sourceId,
      raceDate: input.raceDate,
      scheduledOff: raceDateTime.toISOString(),
      scheduledTime: scheduledTime.slice(0, 5),
      course: input.course,
      raceName: race.raceName,
      subtype: displaySubtype(race),
      subtypeCode: classifyJumpRaceSubtype(race),
      handicapStatus: classifyHandicapStatus(race),
      fieldSize: active.length,
      runnerId: runner.runnerId,
      horseId: runner.horseId,
      horseName: runner.horseName,
      recordedAt: recordedAt.toISOString(),
      recordedPreRace: true,
      components: {
        averageL3JumpSpeed,
        averageL3JumpSpeedRank,
        latestJumpSpeed,
        previousJumpSpeed,
        latestMinusPrevious: latestJumpSpeed - previousJumpSpeed,
        previousClass,
        currentClass,
        classDropAmount: currentClass - previousClass,
      },
      context: {
        officialRating: runner.officialRating,
        officialRatingRank,
        officialRatingTop3: officialRatingRank === null ? null : officialRatingRank <= 3,
        officialRatingGapToBest: runner.officialRating === null || bestOr === null ? null : bestOr - runner.officialRating,
        officialRatingRelativeToFieldMean: runner.officialRating === null || meanOr === null ? null : runner.officialRating - meanOr,
        trainerPriorRate: runner.trainerMetrics?.trainerPriorWinRate ?? null,
        jockeyPriorRate: runner.jockeyMetrics?.jockeyPriorWinRate ?? null,
        daysSinceRun: runner.metrics?.daysSinceLastRun ?? null,
        priorUsableJumpSpeedCount: input.priorUsableJumpSpeedCountByRunner.get(runner.runnerId) ?? priorUsableJumpSpeedCount(runner),
        jprARank: runner.jumpRating?.jprA?.rank ?? null,
        jprBRank: runner.jumpRating?.jprB?.rank ?? null,
        jumpTissueRank: tissue?.rank ?? null,
        jumpTissueProbability: tissue?.probability ?? null,
      },
      market: {
        medianBookmakerDecimal: market.decimalPrice,
        impliedProbability: market.impliedProbability,
        marketRank: marketRanks.get(runner.runnerId) ?? null,
        priceCapturedAt: market.decimalPrice === null ? null : recordedAt.toISOString(),
        priceVersionSource: JUMP_G4_MARKET_PRICE_SOURCE,
        bookmakerQuoteCount: market.quoteCount,
      },
      outcome: null,
      settledAt: null,
    }];
  });
}

export function appendJumpG4Observations(data: JumpG4ForwardData, observations: JumpG4Observation[]): JumpG4ForwardData {
  const existing = new Set(data.observations.map(observationKey));
  const additions = observations.filter((observation) => {
    const key = observationKey(observation);
    if (existing.has(key) || observation.recordedAt < JUMP_G4_FORWARD_EPOCH || observation.recordedAt >= observation.scheduledOff || observation.settledAt !== null) return false;
    existing.add(key);
    return true;
  });
  return additions.length ? { ...data, observations: [...data.observations, ...additions] } : data;
}

export function pendingJumpG4RaceIds(data: JumpG4ForwardData): string[] {
  return [...new Set(data.observations.filter((observation) => observation.settledAt === null).map((observation) => observation.raceId))];
}

export function updateJumpG4Settlements(
  data: JumpG4ForwardData,
  racesById: ReadonlyMap<string, TodayRace>,
  settledAt = new Date(),
): { data: JumpG4ForwardData; settled: number } {
  let settled = 0;
  const observations = data.observations.map((observation) => {
    if (observation.settledAt !== null) return observation;
    const race = racesById.get(observation.raceId);
    if (!race) return observation;
    const updated = settleJumpG4Observation(observation, race, settledAt);
    if (updated !== observation) settled += 1;
    return updated;
  });
  return settled ? { data: { ...data, observations }, settled } : { data, settled };
}

export function settleJumpG4Observation(observation: JumpG4Observation, race: TodayRace, settledAt = new Date()): JumpG4Observation {
  if (observation.settledAt !== null) return observation;
  const runner = race.runners.find((candidate) => candidate.runnerId === observation.runnerId);
  if (!runner) return observation;
  const started = race.runners.filter((candidate) => !isVoidBetResultStatus(candidate.resultStatus));
  const winners = started.filter((candidate) => candidate.finishingPosition === 1);
  if (!winners.length) return observation;
  if (started.some((candidate) => settleSelection({
    targetRaceId: race.raceId,
    targetRunnerId: candidate.runnerId,
    finishingPosition: candidate.finishingPosition,
    resultStatus: candidate.resultStatus,
    won: candidate.finishingPosition === 1 ? true : null,
    placed: null,
    startingPrice: null,
    startingPriceDecimal: "2",
  }) === null)) return observation;
  const voided = isVoidBetResultStatus(runner.resultStatus);
  const won = voided ? null : runner.finishingPosition === 1;
  const settlement = settleSelection({
    targetRaceId: race.raceId,
    targetRunnerId: observation.runnerId,
    finishingPosition: runner.finishingPosition,
    resultStatus: runner.resultStatus,
    won,
    placed: null,
    startingPrice: runner.odds,
    startingPriceDecimal: runner.oddsDecimal,
    deadHeatDivisor: won ? winners.length : 1,
  });
  return {
    ...observation,
    outcome: {
      finishingPosition: runner.finishingPosition,
      resultStatus: runner.resultStatus,
      won,
      deadHeatDivisor: won ? winners.length : 1,
      finalSp: settlement?.settlementOddsDecimal ?? null,
      profitLoss: settlement?.profitLoss ?? null,
    },
    settledAt: settledAt.toISOString(),
  };
}

export function renderJumpG4Today(data: JumpG4ForwardData, raceDate: string): string {
  const rows = data.observations
    .filter((observation) => observation.raceDate === raceDate)
    .sort((left, right) => left.scheduledOff.localeCompare(right.scheduledOff) || left.course.localeCompare(right.course) || left.horseName.localeCompare(right.horseName));
  const lines = [`Jump G4 Prospective Shadow - ${raceDate}`, "Research shadow only", ""];
  if (rows.length === 0) return `${lines.join("\n")}No G4 qualifiers recorded for this date.`;
  lines.push("Time | Course | Horse | Subtype | Avg L3 rank | Latest | Previous | Improve | Class drop | OR rank | JPR-A | Jump Tissue | Stored market");
  lines.push("---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:");
  for (const row of rows) {
    lines.push([
      formatRaceTimeForDisplay({ raceDateTime: new Date(row.scheduledOff), scheduledTime: row.scheduledTime }),
      row.course,
      row.horseName,
      row.subtype,
      row.components.averageL3JumpSpeedRank,
      number(row.components.latestJumpSpeed),
      number(row.components.previousJumpSpeed),
      signed(row.components.latestMinusPrevious),
      row.components.classDropAmount,
      value(row.context.officialRatingRank),
      value(row.context.jprARank),
      value(row.context.jumpTissueRank),
      row.market.medianBookmakerDecimal === null ? "-" : row.market.medianBookmakerDecimal.toFixed(2),
    ].join(" | "));
  }
  return lines.join("\n");
}

export function renderJumpG4Summary(data: JumpG4ForwardData): string {
  const overall = summarizeObservations(data.observations);
  const lines = [
    "Jump G4 Prospective Shadow Summary",
    `Data: ${JUMP_G4_FORWARD_PATH}`,
    `Fresh prospective epoch: ${data.epoch}`,
    "Rule: Jump; Avg L3 Jump speed rank <= 3; class drop; latest Jump speed > previous Jump speed.",
    "Research shadow only. This is not a betting system.",
    "",
    "Overall",
    summaryLine(overall),
    "",
    "Subtype | Tracked | Settled | Winners | Strike | P/L | ROI | Exp wins | A/E",
    "---|---:|---:|---:|---:|---:|---:|---:|---:",
    ...(["Hurdle", "Chase", "NH Flat"] as JumpG4Subtype[]).map((subtype) => summaryTableRow(subtype, summarizeObservations(data.observations.filter((row) => row.subtype === subtype)))),
    "",
    "Calendar Period | Tracked | Settled | Winners | Strike | P/L | ROI | Exp wins | A/E",
    "---|---:|---:|---:|---:|---:|---:|---:|---:",
    ...calendarPeriodRows(data.observations).map(([label, rows]) => summaryTableRow(label, summarizeObservations(rows))),
    "",
    "OR support",
    ...bandRows(data.observations, (row) => orBand(row.context.officialRatingRank), ["OR rank 1", "OR rank 2-3", "OR rank 4+", "OR missing"]),
    "",
    "Market rank",
    ...bandRows(data.observations, (row) => marketBand(row.market.marketRank), ["favourite", "rank 2-3", "rank 4+", "missing"]),
    "",
    "Existing model context",
    "JPR-A",
    ...bandRows(data.observations, (row) => rankBand(row.context.jprARank), ["rank 1", "rank 2-3", "rank 4+", "missing"]),
    "Jump Tissue",
    ...bandRows(data.observations, (row) => rankBand(row.context.jumpTissueRank), ["rank 1", "rank 2-3", "rank 4+", "missing"]),
    "",
    `JPR-A version: ${JUMP_RATING_A_VERSION}; JPR-B version: ${JUMP_RATING_B_VERSION}; market: ${JUMP_G4_MARKET_PRICE_SOURCE}`,
  ];
  return lines.join("\n");
}

export function summarizeJumpG4Forward(data: JumpG4ForwardData) {
  return summarizeObservations(data.observations);
}

function summarizeObservations(rows: JumpG4Observation[]) {
  const settled = rows.filter((row) => row.outcome?.won !== null && row.outcome?.won !== undefined);
  const winners = settled.filter((row) => row.outcome?.won === true);
  const profitLoss = settled.reduce((sum, row) => sum + (row.outcome?.profitLoss ?? 0), 0);
  const expectedWinners = settled.reduce((sum, row) => sum + (row.market.impliedProbability ?? 0), 0);
  return {
    tracked: rows.length,
    settled: settled.length,
    winners: winners.length,
    strike: ratio(winners.length, settled.length),
    profitLoss,
    roi: ratio(profitLoss, settled.length),
    expectedWinners,
    ae: expectedWinners > 0 ? winners.length / expectedWinners : null,
  };
}

function calendarPeriodRows(rows: JumpG4Observation[]): Array<[string, JumpG4Observation[]]> {
  const periods = [...new Set(rows.map((row) => row.raceDate.slice(0, 4)).filter((year) => Number(year) >= 2026))].sort();
  return periods.length ? periods.map((period) => [period, rows.filter((row) => row.raceDate.startsWith(period))]) : [["2026+", []]];
}

function bandRows(rows: JumpG4Observation[], bandFor: (row: JumpG4Observation) => string, bands: string[]): string[] {
  return bands.map((band) => summaryTableRow(band, summarizeObservations(rows.filter((row) => bandFor(row) === band))));
}

function summaryLine(summary: ReturnType<typeof summarizeObservations>) {
  return `Tracked: ${summary.tracked} | settled: ${summary.settled} | winners: ${summary.winners} | strike: ${pct(summary.strike)} | level-stake P/L: ${money(summary.profitLoss)} | ROI: ${pct(summary.roi)} | market expected winners: ${number(summary.expectedWinners)} | A/E: ${number(summary.ae)}`;
}

function summaryTableRow(label: string, summary: ReturnType<typeof summarizeObservations>) {
  return `${label} | ${summary.tracked} | ${summary.settled} | ${summary.winners} | ${pct(summary.strike)} | ${money(summary.profitLoss)} | ${pct(summary.roi)} | ${number(summary.expectedWinners)} | ${number(summary.ae)}`;
}

function displaySubtype(race: TodayRace): JumpG4Subtype {
  const subtype = classifyJumpRaceSubtype(race);
  if (subtype === "hurdle") return "Hurdle";
  if (subtype === "chase") return "Chase";
  if (subtype === "nh_flat") return "NH Flat";
  return "Other Jump";
}

function priorUsableJumpSpeedCount(runner: TodayRunner) {
  return [
    runner.metrics?.latestJumpSpeedRating,
    runner.metrics?.previousJumpSpeedRating,
    runner.metrics?.bestJumpSpeedLast3,
  ].filter(finite).length;
}

function marketRanksForRace(runners: TodayRunner[]): Map<string, number> {
  const priced = runners.flatMap((runner) => {
    const market = summarizeBookmakerMarket(runner.bookmakerQuotes);
    return market.decimalPrice === null ? [] : [{ runner, price: market.decimalPrice }];
  }).sort((left, right) => left.price - right.price || left.runner.runnerId.localeCompare(right.runner.runnerId));
  return competitionRanks(priced, (entry) => entry.price, (entry) => entry.runner.runnerId);
}

function descendingCompetitionRanks(items: TodayRunner[], valueFor: (item: TodayRunner) => number | null): Map<string, number> {
  const ranked = items
    .map((item) => ({ item, value: valueFor(item) }))
    .filter((entry): entry is { item: TodayRunner; value: number } => finite(entry.value))
    .sort((left, right) => right.value - left.value || left.item.runnerId.localeCompare(right.item.runnerId));
  return competitionRanks(ranked, (entry) => entry.value, (entry) => entry.item.runnerId);
}

function competitionRanks<T>(sorted: T[], valueFor: (entry: T) => number, idFor: (entry: T) => string): Map<string, number> {
  const ranks = new Map<string, number>();
  let previousValue: number | null = null;
  let previousRank = 0;
  sorted.forEach((entry, index) => {
    const value = valueFor(entry);
    const rank = value === previousValue ? previousRank : index + 1;
    ranks.set(idFor(entry), rank);
    previousValue = value;
    previousRank = rank;
  });
  return ranks;
}

function observationKey(observation: Pick<JumpG4Observation, "raceId" | "runnerId">) {
  return `${observation.raceId}|${observation.runnerId}`;
}

function finite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function rankBand(rank: number | null) {
  return rank === null ? "missing" : rank === 1 ? "rank 1" : rank <= 3 ? "rank 2-3" : "rank 4+";
}

function orBand(rank: number | null) {
  return rank === null ? "OR missing" : rank === 1 ? "OR rank 1" : rank <= 3 ? "OR rank 2-3" : "OR rank 4+";
}

function marketBand(rank: number | null) {
  return rank === null ? "missing" : rank === 1 ? "favourite" : rank <= 3 ? "rank 2-3" : "rank 4+";
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

function pct(value: number | null) {
  return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(1)}%`;
}

function number(value: number | null) {
  return value === null || !Number.isFinite(value) ? "-" : value.toFixed(3);
}

function money(value: number | null) {
  return value === null || !Number.isFinite(value) ? "-" : value.toFixed(2);
}

function value(input: number | null) {
  return input === null ? "-" : String(input);
}

function signed(input: number) {
  return input > 0 ? `+${number(input)}` : number(input);
}

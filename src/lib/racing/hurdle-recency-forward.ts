import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isVoidBetResultStatus, settleSelection } from "./backtest";
import { summarizeBookmakerMarket } from "./forward-value";
import { hasCompleteProspectiveField } from "./current-day-sync";
import { classifyJumpRaceSubtype } from "./jump-speed-rating";
import { classifyHandicapStatus } from "./research-rule";
import { getLocalRacingDate, type TodayMeeting, type TodayRace } from "./todays-racing";

export const HURDLE_RECENCY_VERSION = "HURDLE_RECENCY_COMPLETION_FORWARD_V1" as const;
export const HURDLE_RECENCY_EPOCH = "2026-10-16T12:59:12.000Z" as const;
export const HURDLE_RECENCY_PATH = "data/research/hurdle-recency-completion-forward-v1.json";
export const HURDLE_RECENCY_MARKET_SOURCE = "sporting_life_median_bookmaker_at_capture_v1" as const;
export const HURDLE_RECENCY_HELPER = "Prospective research only. Tracks whether recent non-completion, especially pulled-up runs, continues to predict finishing performance below market expectation. Not a betting signal.";

export type CompletionStatus = "completed" | "pulled_up" | "fell" | "unseated" | "brought_down" | "other_noncompletion" | "no_history";
export type HurdlePriorRun = {
  runnerId: string;
  raceId: string;
  horseId: string;
  raceDateTime: Date;
  finishingPosition: number | null;
  resultStatus: string | null;
};
export type HurdleRecencyFlags = {
  RECENT_COMPLETER: boolean;
  RECENT_NON_COMPLETER: boolean;
  LATEST_RUN_PU: boolean;
  ANY_RECENT_PU: boolean;
  NO_RECENT_COMPLETION: boolean;
};
export type HurdleRecencyFeatures = {
  daysSinceLastRun: number | null;
  latestRunDate: string | null;
  usableRecentRuns: number;
  recentCompletedRuns: number;
  recentRunCount: number;
  latestRunCompleted: boolean | null;
  latestCompletionStatus: CompletionStatus;
  anyRecentPU: boolean;
  anyRecentF: boolean;
  anyRecentUR: boolean;
  anyRecentBD: boolean;
  anyRecentOtherNonCompletion: boolean;
  recentNonCompletionCount: number;
  recentRuns: { runnerId: string; raceId: string; raceDateTime: string; finishingPosition: number | null; resultStatus: string | null; completionStatus: CompletionStatus }[];
};
export type HurdleRecencyOutcome = {
  status: "settled" | "NR" | "void";
  resultStatus: string | null;
  finishPosition: number | null;
  finishRank: number | null;
  normalizedFinish: number | null;
  top3: boolean | null;
  topHalf: boolean | null;
  winner: boolean | null;
  winnerCredit: number | null;
  nonFinisherCategory: Exclude<CompletionStatus, "completed" | "no_history"> | null;
  rankImprovement: number | null;
  settledFieldSize: number | null;
  settledAt: string;
};
export type HurdleRecencyObservation = {
  version: typeof HURDLE_RECENCY_VERSION;
  raceId: string;
  runnerId: string;
  horseId: string;
  horseName: string;
  raceDate: string;
  scheduledOff: string;
  course: string;
  raceName: string | null;
  firstCapturedAt: string;
  fieldSize: number;
  capturedFieldRunnerIds: string[];
  handicapStatus: ReturnType<typeof classifyHandicapStatus>;
  raceClass: string | null;
  features: HurdleRecencyFeatures;
  flags: HurdleRecencyFlags;
  market: {
    source: typeof HURDLE_RECENCY_MARKET_SOURCE;
    capturedAt: string;
    medianBookmakerDecimal: number;
    normalizedProbability: number;
    marketRank: number;
    quoteCount: number;
    quotes: ReturnType<typeof summarizeBookmakerMarket>["quotes"];
    fieldPrices: { runnerId: string; decimalPrice: number }[];
  };
  outcome: HurdleRecencyOutcome | null;
};
export type HurdleRecencyData = {
  version: typeof HURDLE_RECENCY_VERSION;
  epoch: typeof HURDLE_RECENCY_EPOCH;
  observations: HurdleRecencyObservation[];
};
export function emptyHurdleRecency(): HurdleRecencyData {
  return { version: HURDLE_RECENCY_VERSION, epoch: HURDLE_RECENCY_EPOCH, observations: [] };
}
export async function loadHurdleRecency(path = HURDLE_RECENCY_PATH): Promise<HurdleRecencyData> {
  try {
    const data = JSON.parse(await readFile(path, "utf8")) as HurdleRecencyData;
    if (data.version !== HURDLE_RECENCY_VERSION || data.epoch !== HURDLE_RECENCY_EPOCH || !Array.isArray(data.observations)) {
      throw new Error("Unsupported Hurdle recency tracker version/epoch");
    }
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyHurdleRecency();
    throw error;
  }
}
// The same directory-lock + atomic rename pattern as the existing independent trackers.
export async function mutateHurdleRecency(
  mutate: (data: HurdleRecencyData) => HurdleRecencyData | Promise<HurdleRecencyData>,
  path = HURDLE_RECENCY_PATH,
) {
  const lock = `${resolve(path)}.lock`;
  await mkdir(dirname(lock), { recursive: true });
  const deadline = Date.now() + 30_000;
  while (true) {
    try { await mkdir(lock); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() >= deadline) throw error;
      await new Promise((wait) => setTimeout(wait, 10));
    }
  }
  try {
    const before = await loadHurdleRecency(path);
    const after = await mutate(before);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
      await writeFile(temporary, `${JSON.stringify(after, null, 2)}\n`, "utf8");
      await rename(temporary, path);
    }
    return after;
  } finally { await rm(lock, { recursive: true, force: true }); }
}

export function completionStatus(run: Pick<HurdlePriorRun, "finishingPosition" | "resultStatus"> | undefined): CompletionStatus {
  if (!run) return "no_history";
  // Exact follow-up proxy: a numeric position defines a completion, without a rating requirement.
  if (finite(run.finishingPosition)) return "completed";
  if (run.resultStatus === "pulled_up") return "pulled_up";
  if (run.resultStatus === "fell") return "fell";
  if (run.resultStatus === "unseated" || run.resultStatus === "unseated_rider") return "unseated";
  if (run.resultStatus === "brought_down") return "brought_down";
  return "other_noncompletion";
}
export function recentCompletionFeatures(input: {
  history: readonly HurdlePriorRun[];
  raceId: string;
  horseId: string;
  targetTime: Date;
  capturedAt: Date;
  daysSinceLastRun: number | null;
  latestRunDate: string | null;
}): { features: HurdleRecencyFeatures; flags: HurdleRecencyFlags } {
  // Same exclusions, ordering and last-three slice as the validated raw-history reconstruction.
  const recent = input.history.filter((run) => run.horseId === input.horseId && run.raceId !== input.raceId &&
    run.raceDateTime < input.targetTime && run.raceDateTime < input.capturedAt &&
    !["non_runner", "withdrawn", "void", "void_race", "abandoned"].includes(run.resultStatus ?? ""))
    .slice().sort((a, b) => a.raceDateTime.getTime() - b.raceDateTime.getTime()).slice(-3);
  const statuses = recent.map(completionStatus);
  const latest = statuses.at(-1) ?? "no_history";
  const completed = statuses.filter((status) => status === "completed").length;
  const isRecent = input.daysSinceLastRun !== null && input.daysSinceLastRun <= 30;
  const latestCompleted = latest === "no_history" ? null : latest === "completed";
  const anyRecentPU = statuses.includes("pulled_up");
  return {
    features: {
      daysSinceLastRun: input.daysSinceLastRun, latestRunDate: input.latestRunDate,
      usableRecentRuns: completed, recentCompletedRuns: completed, recentRunCount: recent.length,
      latestRunCompleted: latestCompleted, latestCompletionStatus: latest,
      anyRecentPU, anyRecentF: statuses.includes("fell"), anyRecentUR: statuses.includes("unseated"),
      anyRecentBD: statuses.includes("brought_down"), anyRecentOtherNonCompletion: statuses.includes("other_noncompletion"),
      recentNonCompletionCount: recent.length - completed,
      recentRuns: recent.map((run) => ({ runnerId: run.runnerId, raceId: run.raceId, raceDateTime: run.raceDateTime.toISOString(),
        finishingPosition: run.finishingPosition, resultStatus: run.resultStatus, completionStatus: completionStatus(run) })),
    },
    flags: { RECENT_COMPLETER: isRecent && latestCompleted === true, RECENT_NON_COMPLETER: isRecent && latestCompleted === false,
      LATEST_RUN_PU: latest === "pulled_up", ANY_RECENT_PU: anyRecentPU, NO_RECENT_COMPLETION: completed === 0 },
  };
}
export function buildHurdleRecencyObservations(input: {
  meetings: TodayMeeting[];
  raceDate: string;
  historyByHorse: ReadonlyMap<string, readonly HurdlePriorRun[]>;
  capturedAt: Date;
}): HurdleRecencyObservation[] {
  const { capturedAt } = input;
  if (!Number.isFinite(capturedAt.getTime()) || capturedAt.toISOString() < HURDLE_RECENCY_EPOCH || input.raceDate !== getLocalRacingDate(capturedAt)) return [];
  return input.meetings.flatMap((meeting) => meeting.races.flatMap((race) => {
    if (classifyJumpRaceSubtype(race) !== "hurdle" || !race.raceDateTime || capturedAt >= race.raceDateTime ||
        getLocalRacingDate(race.raceDateTime) !== input.raceDate || race.winningTime ||
        race.runners.some((r) => r.finishingPosition !== null || (r.resultStatus !== null && r.resultStatus !== "non_runner"))) return [];
    const active = race.runners.filter((r) => r.resultStatus !== "non_runner");
    if (!hasCompleteProspectiveField(race)) return [];
    const markets = active.map((runner) => ({ runner, market: summarizeBookmakerMarket(runner.bookmakerQuotes) }));
    // Normalize over the entire active field, never an incomplete priced subset or a forecast price.
    if (markets.some(({ market }) => market.decimalPrice === null)) return [];
    const fieldPrices = markets.map(({ runner, market }) => ({ runnerId: runner.runnerId, decimalPrice: market.decimalPrice! }));
    const total = fieldPrices.reduce((sum, row) => sum + 1 / row.decimalPrice, 0);
    return markets.flatMap(({ runner, market }) => {
      const history = input.historyByHorse.get(runner.horseId);
      const metrics = runner.metrics;
      // A successful empty history is evaluable; an absent history/metrics lookup is not.
      if (!history || !metrics || (metrics.daysSinceLastRun !== null && (!finite(metrics.daysSinceLastRun) || metrics.daysSinceLastRun < 0)) ||
          (metrics.latestRunDate && metrics.latestRunDate > getLocalRacingDate(capturedAt))) return [];
      const snapshot = recentCompletionFeatures({ history, raceId: race.raceId, horseId: runner.horseId,
        targetTime: race.raceDateTime!, capturedAt, daysSinceLastRun: metrics.daysSinceLastRun, latestRunDate: metrics.latestRunDate });
      return [{ version: HURDLE_RECENCY_VERSION, raceId: race.raceId, runnerId: runner.runnerId, horseId: runner.horseId, horseName: runner.horseName,
        raceDate: input.raceDate, scheduledOff: race.raceDateTime!.toISOString(), course: meeting.courseName, raceName: race.raceName,
        firstCapturedAt: capturedAt.toISOString(), fieldSize: active.length, capturedFieldRunnerIds: active.map((r) => r.runnerId),
        handicapStatus: classifyHandicapStatus(race), raceClass: race.raceClass, ...snapshot,
        market: { source: HURDLE_RECENCY_MARKET_SOURCE, capturedAt: capturedAt.toISOString(), medianBookmakerDecimal: market.decimalPrice!,
          normalizedProbability: (1 / market.decimalPrice!) / total,
          marketRank: 1 + fieldPrices.filter((row) => row.decimalPrice < market.decimalPrice!).length,
          quoteCount: market.quoteCount, quotes: market.quotes, fieldPrices }, outcome: null }];
    });
  }));
}
export function appendHurdleRecency(data: HurdleRecencyData, additions: HurdleRecencyObservation[]): HurdleRecencyData {
  const key = (row: HurdleRecencyObservation) => `${row.version}|${row.raceId}|${row.runnerId}`;
  const known = new Set(data.observations.map(key));
  const fresh = additions.filter((row) => {
    if (known.has(key(row)) || row.version !== data.version || row.firstCapturedAt < data.epoch ||
        row.firstCapturedAt >= row.scheduledOff || row.raceDate !== getLocalRacingDate(new Date(row.firstCapturedAt)) || row.outcome) return false;
    known.add(key(row)); return true;
  });
  return fresh.length ? { ...data, observations: [...data.observations, ...fresh] } : data;
}
export function pendingHurdleRecencyRaceIds(data: HurdleRecencyData) {
  return [...new Set(data.observations.filter((row) => row.outcome === null).map((row) => row.raceId))];
}
export function settleHurdleRecency(data: HurdleRecencyData, races: ReadonlyMap<string, TodayRace>, now = new Date()): HurdleRecencyData {
  const observations = data.observations.map((row) => {
    if (row.outcome) return row;
    const race = races.get(row.raceId);
    const runner = race?.runners.find((r) => r.runnerId === row.runnerId);
    if (!race || !runner) return row;
    const base = { resultStatus: runner.resultStatus, finishPosition: runner.finishingPosition, settledAt: now.toISOString() };
    if (isVoidBetResultStatus(runner.resultStatus)) {
      return { ...row, outcome: { ...base, status: runner.resultStatus?.trim().toLowerCase() === "non_runner" ? "NR" : "void", finishRank: null,
        normalizedFinish: null, top3: null, topHalf: null, winner: null, winnerCredit: null, nonFinisherCategory: null,
        rankImprovement: null, settledFieldSize: null } satisfies HurdleRecencyOutcome };
    }
    if (now < new Date(row.scheduledOff) || !row.capturedFieldRunnerIds.every((id) => race.runners.some((r) => r.runnerId === id))) return row;
    const started = race.runners.filter((r) => !isVoidBetResultStatus(r.resultStatus));
    const n = started.length;
    const winners = started.filter((r) => r.finishingPosition === 1);
    if (!winners.length || new Set(race.runners.map((r) => r.runnerId)).size !== race.runners.length ||
        (race.actualRunnerCount !== n && race.actualRunnerCount !== race.runners.length) ||
        started.some((r) => (r.finishingPosition !== null && (!Number.isInteger(r.finishingPosition) || r.finishingPosition < 1 || r.finishingPosition > n)) ||
          settleSelection({ targetRaceId: race.raceId, targetRunnerId: r.runnerId, finishingPosition: r.finishingPosition,
            resultStatus: r.resultStatus, won: null, placed: null, startingPrice: null, startingPriceDecimal: "2" }) === null)) return row;
    const finishRank = runner.finishingPosition ?? n;
    const winner = runner.finishingPosition === 1;
    const category = completionStatus(runner);
    return { ...row, outcome: { ...base, status: "settled", finishRank, normalizedFinish: n > 1 ? (finishRank - 1) / (n - 1) : 0,
      top3: runner.finishingPosition !== null && runner.finishingPosition <= 3,
      topHalf: runner.finishingPosition !== null && runner.finishingPosition <= Math.floor(n / 2), winner,
      winnerCredit: winner ? 1 / winners.length : 0,
      nonFinisherCategory: category === "completed" || category === "no_history" ? null : category,
      rankImprovement: row.market.marketRank - finishRank, settledFieldSize: n } satisfies HurdleRecencyOutcome };
  });
  return observations.every((row, i) => row === data.observations[i]) ? data : { ...data, observations };
}

export function hurdleRecencySampleStatus(settled: number) {
  return settled < 50 ? "TOO EARLY" : settled < 150 ? "EARLY" : settled < 300 ? "DEVELOPING" : "MEANINGFUL PROSPECTIVE SAMPLE";
}
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const ratio = (a: number, b: number) => b ? a / b : null;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export function hurdleRecencyGroupMetrics(rows: HurdleRecencyObservation[]) {
  const settled = rows.filter((r) => r.outcome?.status === "settled");
  const outcomes = settled.map((r) => r.outcome!);
  const eligibleTop3 = outcomes.filter((r) => r.settledFieldSize! >= 6);
  const expected = settled.reduce((sum, r) => sum + r.market.normalizedProbability, 0);
  const actual = outcomes.reduce((sum, r) => sum + r.winnerCredit!, 0);
  return {
    observations: rows.length, settled: settled.length, pending: rows.filter((r) => !r.outcome).length,
    nonRunners: rows.filter((r) => r.outcome?.status === "NR").length, voids: rows.filter((r) => r.outcome?.status === "void").length,
    sampleStatus: hurdleRecencySampleStatus(settled.length),
    meanMarketProbability: mean(settled.map((r) => r.market.normalizedProbability)), meanMarketRank: mean(settled.map((r) => r.market.marketRank)),
    meanFinishRank: mean(outcomes.map((r) => r.finishRank!)), meanNormalizedFinish: mean(outcomes.map((r) => r.normalizedFinish!)),
    meanRankImprovement: mean(outcomes.map((r) => r.rankImprovement!)), outperformingMarketRank: ratio(outcomes.filter((r) => r.rankImprovement! > 0).length, settled.length),
    top3Eligible: eligibleTop3.length, top3Rate: ratio(eligibleTop3.filter((r) => r.top3).length, eligibleTop3.length),
    topHalfRate: ratio(outcomes.filter((r) => r.topHalf).length, settled.length), winnerRate: ratio(outcomes.filter((r) => r.winner).length, settled.length),
    winners: outcomes.filter((r) => r.winner).length, actualWinnerCredit: actual, marketExpectedWinners: expected, actualOverExpected: ratio(actual, expected),
  };
}
export const HURDLE_RECENCY_GROUPS = ["RECENT_COMPLETER", "RECENT_NON_COMPLETER", "LATEST_RUN_PU", "NOT_LATEST_RUN_PU", "ANY_RECENT_PU", "NO_RECENT_PU", "NO_RECENT_COMPLETION"] as const;
export type HurdleRecencyGroup = typeof HURDLE_RECENCY_GROUPS[number];
function inGroup(row: HurdleRecencyObservation, group: HurdleRecencyGroup) {
  if (group === "NOT_LATEST_RUN_PU") return !row.flags.LATEST_RUN_PU;
  if (group === "NO_RECENT_PU") return !row.flags.ANY_RECENT_PU;
  return row.flags[group];
}
export function summarizeHurdleRecency(data: HurdleRecencyData) {
  const groups = (rows: HurdleRecencyObservation[]) => HURDLE_RECENCY_GROUPS.map((group) => ({ group, ...hurdleRecencyGroupMetrics(rows.filter((r) => inGroup(r, group))) }));
  // Fixed, non-optimized bands from the follow-up. No prospective model fitting.
  const probabilityBands = [0.025, 0.05, 0.1, 0.2, 0.4, 1].map((upper, i, edges) => {
    const lower = i ? edges[i - 1]! : 0;
    return { band: `${lower < 0.01 ? "0" : lower}–${upper}`, lower, upper,
      groups: groups(data.observations.filter((r) => r.market.normalizedProbability > lower && r.market.normalizedProbability <= upper)) };
  });
  const rankBands = ["1", "2", "3", "4-6", "7+"] .map((band) => ({ band, groups: groups(data.observations.filter((r) => {
    const rank = r.market.marketRank;
    return band === "4-6" ? rank >= 4 && rank <= 6 : band === "7+" ? rank >= 7 : rank === Number(band);
  })) }));
  return { version: data.version, epoch: data.epoch, overall: hurdleRecencyGroupMetrics(data.observations), groups: groups(data.observations), probabilityBands, rankBands };
}
const displayNumber = (value: number | null) => value === null ? "—" : value.toFixed(4);
export function renderHurdleRecencySummary(data: HurdleRecencyData) {
  const summary = summarizeHurdleRecency(data);
  const header = "group | observations | settled | sample | mean market p | market rank | finish rank | norm finish | rank improvement | outperform rate | top3 rate | top-half rate | winner rate | expected winners | Actual/Expected";
  const line = (label: string, group: ReturnType<typeof hurdleRecencyGroupMetrics>) => [label, group.observations, group.settled, group.sampleStatus,
    ...[group.meanMarketProbability, group.meanMarketRank, group.meanFinishRank, group.meanNormalizedFinish, group.meanRankImprovement,
      group.outperformingMarketRank, group.top3Rate, group.topHalfRate, group.winnerRate, group.marketExpectedWinners, group.actualOverExpected].map(displayNumber)].join(" | ");
  return [HURDLE_RECENCY_VERSION, `Epoch: ${data.epoch}`, HURDLE_RECENCY_HELPER,
    `Pending=${summary.overall.pending} NR=${summary.overall.nonRunners} Void=${summary.overall.voids}`,
    "Means/rates use settled runners; top3 fields >=6. Rates are fractions. A/E uses dead-heat winner credit. Groups overlap.",
    "Recent flags: <=30 days + latest status. Last-three history: any code, no calendar window; zero includes sparse/no history.",
    header, line("ALL", summary.overall), ...summary.groups.map((group) => line(group.group, group)),
    "Fixed market-probability bands (descriptive; no model fit):", header,
    ...summary.probabilityBands.flatMap((band) => band.groups.map((group) => line(`${band.band} ${group.group}`, group))),
    "Fixed market-rank bands (descriptive; no model fit):", header,
    ...summary.rankBands.flatMap((band) => band.groups.map((group) => line(`${band.band} ${group.group}`, group))),
  ].join("\n");
}
export function renderHurdleRecencyRows(data: HurdleRecencyData, date?: string) {
  const rows = data.observations.filter((r) => !date || r.raceDate === date);
  return [`${HURDLE_RECENCY_VERSION} | frozen observations=${rows.length}`,
    "date | course | race | horse | first price | market rank | market p | days since run | latest status | recent non-completions | latest PU | finish | rank improvement",
    ...rows.map((r) => [r.raceDate, r.course, r.raceName ?? "—", r.horseName, displayNumber(r.market.medianBookmakerDecimal), r.market.marketRank,
      displayNumber(r.market.normalizedProbability), r.features.daysSinceLastRun ?? "—", r.features.latestCompletionStatus, r.features.recentNonCompletionCount,
      r.flags.LATEST_RUN_PU ? "yes" : "no", !r.outcome ? "pending" : r.outcome.status !== "settled" ? r.outcome.status : r.outcome.finishPosition ?? r.outcome.resultStatus,
      displayNumber(r.outcome?.rankImprovement ?? null)].join(" | ")),
  ].join("\n");
}

export type HurdleRecencyCommand = "sync" | "today" | "summary" | "results";
export async function runHurdleRecencyCycle(input: {
  command: "sync" | "results";
  raceDate: string;
  data: HurdleRecencyData;
  loadCapture: () => Promise<{ meetings: TodayMeeting[]; historyByHorse: ReadonlyMap<string, readonly HurdlePriorRun[]> }>;
  loadResults: (raceIds: string[]) => Promise<ReadonlyMap<string, TodayRace>>;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  let data = input.data;
  // Both date checks are intentional: long-running loads must still be today's pre-race capture.
  if (input.command === "sync" && input.raceDate === getLocalRacingDate(now())) {
    const capture = await input.loadCapture();
    data = appendHurdleRecency(data, buildHurdleRecencyObservations({ ...capture, raceDate: input.raceDate, capturedAt: now() }));
  }
  const raceIds = pendingHurdleRecencyRaceIds(data);
  return raceIds.length ? settleHurdleRecency(data, await input.loadResults(raceIds), now()) : data;
}

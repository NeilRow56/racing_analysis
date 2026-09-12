import { classifyCurrentRaceFamily } from "./current-race-classification";
import { settleSelection, type BacktestSettlement } from "./backtest";
import type {
  HistoricalPostRaceOutcome,
  HistoricalPreRaceFeatureRow,
  HistoricalTargetRunnerMetricsRow,
} from "./historical-target-metrics";
import {
  matchesRaceConditions,
  matchesRankConditions,
  matchesRatingConditions,
  matchesRelativeConditions,
  matchesRunnerConditions,
  parseResearchRule,
  rankRows,
  type RankedResearchRow,
  type ResearchRuleV1,
} from "./research-rule";
import type { SavedResearchRule } from "./saved-research-rules";
import type {
  TodayMeeting,
  TodayRace,
  TodayRunner,
  TodaySavedRuleMatch,
} from "./todays-racing";

export type TodayRuleSelectionRow = {
  raceId: string;
  runnerId: string;
  horseId: string;
  horseName: string;
  courseName: string;
  raceName: string | null;
  scheduledTime: string | null;
  raceDateTime: Date | null;
  ruleNames: string[];
  odds: string | null;
  result: string;
  settlement: BacktestSettlement | null;
};

export type TodayRuleSelections = {
  rows: TodayRuleSelectionRow[];
  summary: {
    selections: number;
    settled: number;
    profitLoss: number;
  };
};

export function attachFrozenRuleMatchesToToday(
  meetings: TodayMeeting[],
  savedRules: SavedResearchRule[],
  raceDate: string,
): TodayMeeting[] {
  const frozenRules = savedRules.filter((rule) => rule.status === "frozen");
  if (frozenRules.length === 0) {
    return meetings;
  }

  return meetings.map((meeting) => ({
    ...meeting,
    races: meeting.races.map((race) =>
      raceWithFrozenRuleMatches(meeting, race, frozenRules, raceDate),
    ),
  }));
}

export type TodayFrozenRuleMatchSummary = {
  frozenRulesChecked: number;
  matchingRunners: number;
  ruleMatches: number;
};

export function summarizeTodayFrozenRuleMatches(
  meetings: TodayMeeting[],
  frozenRulesChecked: number,
): TodayFrozenRuleMatchSummary {
  let matchingRunners = 0;
  let ruleMatches = 0;
  for (const meeting of meetings) {
    for (const race of meeting.races) {
      for (const runner of race.runners) {
        const matches = runner.savedRuleMatches ?? [];
        if (matches.length > 0) {
          matchingRunners += 1;
          ruleMatches += matches.length;
        }
      }
    }
  }
  return { frozenRulesChecked, matchingRunners, ruleMatches };
}

export function buildTodayRuleSelections(meetings: TodayMeeting[]): TodayRuleSelections {
  const rows: TodayRuleSelectionRow[] = [];

  for (const meeting of meetings) {
    for (const race of meeting.races) {
      for (const runner of race.runners) {
        const matches = runner.savedRuleMatches ?? [];
        if (matches.length === 0) {
          continue;
        }
        rows.push({
          raceId: race.raceId,
          runnerId: runner.runnerId,
          horseId: runner.horseId,
          horseName: runner.horseName,
          courseName: meeting.courseName,
          raceName: race.raceName,
          scheduledTime: race.scheduledTime,
          raceDateTime: race.raceDateTime,
          ruleNames: matches.map((match) => match.ruleName),
          odds: runner.odds,
          result: resultLabelForTodayRunner(runner),
          settlement: settleSelection(todayRunnerSettlementOutcome(race, runner)),
        });
      }
    }
  }

  rows.sort(compareTodayRuleSelectionRows);

  const settledRows = rows.filter((row) => row.settlement !== null);
  return {
    rows,
    summary: {
      selections: rows.length,
      settled: settledRows.length,
      profitLoss: settledRows.reduce(
        (total, row) => total + (row.settlement?.profitLoss ?? 0),
        0,
      ),
    },
  };
}

function raceWithFrozenRuleMatches(
  meeting: TodayMeeting,
  race: TodayRace,
  rules: SavedResearchRule[],
  raceDate: string,
): TodayRace {
  const rows = rankRows(
    race.runners.map((runner) => todayRunnerResearchRow(meeting, race, runner, raceDate)),
  );
  const rowsByRunnerId = new Map(rows.map((row) => [row.features.targetRunnerId, row]));

  return {
    ...race,
    runners: race.runners.map((runner) => {
      const row = rowsByRunnerId.get(runner.runnerId);
      const savedRuleMatches = row
        ? matchingRulesForRow(row, runner, rules)
        : [];
      return { ...runner, savedRuleMatches };
    }),
  };
}

function matchingRulesForRow(
  row: RankedResearchRow,
  runner: TodayRunner,
  rules: SavedResearchRule[],
): TodaySavedRuleMatch[] {
  return rules
    .filter((rule) => frozenRuleMatchesTodayRow(row, runner, rule))
    .map(savedRuleMatch);
}

export function frozenRuleMatchesTodayRow(
  row: RankedResearchRow,
  runner: TodayRunner,
  savedRule: SavedResearchRule,
): boolean {
  const rule = parseResearchRule(JSON.stringify(savedRule.canonicalRule));
  if (!rule) {
    return false;
  }
  return canEvaluateRuleForTodayRunner(rule, runner) &&
    row.features.raceCode !== "unsupported" &&
    familyMatches(row.features.raceCode, rule.family) &&
    matchesRaceConditions(row.features, rule) &&
    matchesRunnerConditions(row.features, rule) &&
    matchesRatingConditions(row.features, rule) &&
    matchesRelativeConditions(row.features, rule) &&
    matchesRankConditions(row, rule);
}

function canEvaluateRuleForTodayRunner(rule: ResearchRuleV1, runner: TodayRunner): boolean {
  if (runner.resultStatus === "non_runner") {
    return false;
  }
  if (runner.metrics !== null) {
    return true;
  }

  return !hasMetricDependentConditions(rule);
}

function hasMetricDependentConditions(rule: ResearchRuleV1): boolean {
  return rule.ratings.length > 0 ||
    rule.relatives.length > 0 ||
    rule.ranks.length > 0 ||
    Boolean(rule.runner.returnBucket && rule.runner.returnBucket !== "all") ||
    Boolean(rule.runner.runAfterBreak && rule.runner.runAfterBreak !== "all") ||
    Boolean(rule.runner.daysSinceRun) ||
    Boolean(rule.runner.priorRuns);
}

function todayRunnerResearchRow(
  meeting: TodayMeeting,
  race: TodayRace,
  runner: TodayRunner,
  raceDate: string,
): HistoricalTargetRunnerMetricsRow {
  return {
    features: todayRunnerFeatures(meeting, race, runner, raceDate),
    outcome: todayRunnerOutcome(race, runner),
  };
}

function todayRunnerFeatures(
  meeting: TodayMeeting,
  race: TodayRace,
  runner: TodayRunner,
  raceDate: string,
): HistoricalPreRaceFeatureRow {
  const family = classifyCurrentRaceFamily({
    raceName: race.raceName,
    raceType: race.raceType,
    raceTypeCode: race.raceTypeCode,
    courseName: meeting.courseName,
    courseSourceId: meeting.courseSourceId,
    going: race.going,
    surface: race.surface,
  });
  const raceCode = family === "all_weather_flat"
    ? "aw"
    : family === "turf_flat"
      ? "turf"
      : family === "jump"
        ? "jump"
        : "unsupported";
  const speed = speedFieldsForFamily(family, runner.metrics);
  const todays = todaysRatingFieldsForFamily(family, runner.metrics);

  return {
    targetRaceId: race.raceId,
    targetRunnerId: runner.runnerId,
    source: "sporting_life",
    horseId: runner.horseId,
    horseName: runner.horseName,
    trainerId: runner.trainerId,
    trainerName: runner.trainerName,
    trainerPriorRuns: runner.trainerMetrics?.trainerPriorRuns ?? 0,
    trainerPriorWins: runner.trainerMetrics?.trainerPriorWins ?? 0,
    trainerPriorWinRate: runner.trainerMetrics?.trainerPriorWinRate ?? null,
    raceDateTime: race.raceDateTime ?? new Date(`${raceDate}T12:00:00.000Z`),
    raceDate,
    courseId: meeting.courseId,
    courseName: meeting.courseName,
    raceName: race.raceName,
    raceClass: race.raceClass,
    raceType: race.raceType,
    raceTypeCode: race.raceTypeCode,
    distanceYards: race.distanceYards,
    going: race.going,
    declaredRunnerCount: race.declaredRunnerCount,
    actualRunnerCount: race.actualRunnerCount,
    surface: race.surface,
    raceCode,
    horseAge: runner.horseAge,
    officialRating: runner.officialRating,
    weight: runner.weight,
    weightCarriedLbs: runner.weightCarriedLbs,
    draw: runner.draw,
    odds: null,
    oddsDecimal: null,
    priorRuns: runner.metrics?.priorRuns ?? 0,
    priorWins: runner.metrics?.priorWins ?? 0,
    priorPlaces: runner.metrics?.priorPlaces ?? 0,
    winPercentage: runner.metrics?.winPercentage ?? null,
    placePercentage: runner.metrics?.placePercentage ?? null,
    latestRunDate: runner.metrics?.latestRunDate ?? null,
    daysSinceLastRun: runner.metrics?.daysSinceLastRun ?? null,
    breakLengthDays: runner.metrics?.breakLengthDays ?? null,
    runAfterBreakNumber: runner.metrics?.runAfterBreakNumber ?? null,
    latestOr: runner.metrics?.latestOr ?? null,
    previousOr: null,
    latestSpeedRating: speed.latest,
    previousSpeedRating: speed.previous,
    bestSpeedLast3: speed.bestLast3,
    bestSpeedLast5: speed.bestLast5,
    averageSpeedLast3: speed.averageLast3,
    averageSpeedLast5: speed.averageLast5,
    latestPerformanceRating: runner.metrics?.latestPerformanceRating ?? null,
    previousPerformanceRating: runner.metrics?.previousPerformanceRating ?? null,
    bestPerformanceLast3: runner.metrics?.bestPerformanceLast3 ?? null,
    bestPerformanceLast5: runner.metrics?.bestPerformanceLast5 ?? null,
    averagePerformanceLast3: runner.metrics?.averagePerformanceLast3 ?? null,
    averagePerformanceLast5: runner.metrics?.averagePerformanceLast5 ?? null,
    latestPerformanceCalculationVersion: null,
    currentWeightCarriedLb: runner.weightCarriedLbs,
    latestTodaysRating: todays.latest,
    previousTodaysRating: runner.metrics?.previousTodaysRating ?? null,
    bestTodaysRatingLast3: runner.metrics?.bestTodaysRatingLast3 ?? null,
    bestTodaysRatingLast5: runner.metrics?.bestTodaysRatingLast5 ?? null,
    averageTodaysRatingLast3: runner.metrics?.averageTodaysRatingLast3 ?? null,
    averageTodaysRatingLast5: runner.metrics?.averageTodaysRatingLast5 ?? null,
    todaysRatingCalculationVersion: runner.metrics?.todaysRatingCalculationVersion ?? null,
    latestJumpSpeedRating: runner.metrics?.latestJumpSpeedRating ?? null,
    previousJumpSpeedRating: runner.metrics?.previousJumpSpeedRating ?? null,
    bestJumpSpeedLast3: runner.metrics?.bestJumpSpeedLast3 ?? null,
    bestJumpSpeedLast5: runner.metrics?.bestJumpSpeedLast5 ?? null,
    averageJumpSpeedLast3: runner.metrics?.averageJumpSpeedLast3 ?? null,
    averageJumpSpeedLast5: runner.metrics?.averageJumpSpeedLast5 ?? null,
    latestAwSpeedRating: runner.metrics?.latestAwSpeedRating ?? null,
    previousAwSpeedRating: runner.metrics?.previousAwSpeedRating ?? null,
    bestAwSpeedLast3: runner.metrics?.bestAwSpeedLast3 ?? null,
    bestAwSpeedLast5: runner.metrics?.bestAwSpeedLast5 ?? null,
    averageAwSpeedLast3: runner.metrics?.averageAwSpeedLast3 ?? null,
    averageAwSpeedLast5: runner.metrics?.averageAwSpeedLast5 ?? null,
    latestTurfSpeedRating: runner.metrics?.latestTurfSpeedRating ?? null,
    previousTurfSpeedRating: runner.metrics?.previousTurfSpeedRating ?? null,
    bestTurfSpeedLast3: runner.metrics?.bestTurfSpeedLast3 ?? null,
    bestTurfSpeedLast5: runner.metrics?.bestTurfSpeedLast5 ?? null,
    averageTurfSpeedLast3: runner.metrics?.averageTurfSpeedLast3 ?? null,
    averageTurfSpeedLast5: runner.metrics?.averageTurfSpeedLast5 ?? null,
    latestSpeedMethod: null,
    latestSpeedConfidence: null,
    speedCalculationVersion: null,
  };
}

function todayRunnerOutcome(
  race: TodayRace,
  runner: TodayRunner,
): HistoricalPostRaceOutcome {
  return {
    targetRaceId: race.raceId,
    targetRunnerId: runner.runnerId,
    finishingPosition: null,
    resultStatus: runner.resultStatus,
    won: null,
    placed: null,
    startingPrice: null,
    startingPriceDecimal: null,
  };
}

function todayRunnerSettlementOutcome(
  race: TodayRace,
  runner: TodayRunner,
): HistoricalPostRaceOutcome {
  return {
    targetRaceId: race.raceId,
    targetRunnerId: runner.runnerId,
    finishingPosition: runner.finishingPosition,
    resultStatus: runner.resultStatus,
    won: runner.finishingPosition === null ? null : runner.finishingPosition === 1,
    placed: runner.finishingPosition === null
      ? null
      : runner.finishingPosition >= 1 && runner.finishingPosition <= 3,
    startingPrice: runner.odds,
    startingPriceDecimal: runner.oddsDecimal,
  };
}

function resultLabelForTodayRunner(runner: TodayRunner): string {
  if (runner.resultStatus === "non_runner") {
    return "NR";
  }
  if (runner.finishingPosition !== null) {
    return String(runner.finishingPosition);
  }
  if (!runner.resultStatus) {
    return "—";
  }
  return resultStatusLabel(runner.resultStatus);
}

function resultStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    fell: "F",
    pulled_up: "PU",
    refused: "REF",
    unseated_rider: "UR",
  };
  return labels[value] ?? value.replaceAll("_", " ").toUpperCase();
}

function compareTodayRuleSelectionRows(
  left: TodayRuleSelectionRow,
  right: TodayRuleSelectionRow,
): number {
  return compareNullableStrings(selectionTimeSortKey(left), selectionTimeSortKey(right)) ||
    left.courseName.localeCompare(right.courseName) ||
    (left.raceName ?? "").localeCompare(right.raceName ?? "") ||
    left.horseName.localeCompare(right.horseName);
}

function selectionTimeSortKey(row: Pick<TodayRuleSelectionRow, "raceDateTime" | "scheduledTime">): string | null {
  return row.raceDateTime?.toISOString() ?? row.scheduledTime ?? null;
}

function compareNullableStrings(left: string | null, right: string | null): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left.localeCompare(right);
}

function speedFieldsForFamily(
  family: ReturnType<typeof classifyCurrentRaceFamily>,
  metrics: TodayRunner["metrics"],
) {
  if (family === "jump") {
    return {
      latest: metrics?.latestJumpSpeedRating ?? null,
      previous: metrics?.previousJumpSpeedRating ?? null,
      bestLast3: metrics?.bestJumpSpeedLast3 ?? null,
      bestLast5: metrics?.bestJumpSpeedLast5 ?? null,
      averageLast3: metrics?.averageJumpSpeedLast3 ?? null,
      averageLast5: metrics?.averageJumpSpeedLast5 ?? null,
    };
  }
  if (family === "all_weather_flat") {
    return {
      latest: metrics?.latestAwSpeedRating ?? null,
      previous: metrics?.previousAwSpeedRating ?? null,
      bestLast3: metrics?.bestAwSpeedLast3 ?? null,
      bestLast5: metrics?.bestAwSpeedLast5 ?? null,
      averageLast3: metrics?.averageAwSpeedLast3 ?? null,
      averageLast5: metrics?.averageAwSpeedLast5 ?? null,
    };
  }
  if (family === "turf_flat") {
    return {
      latest: metrics?.latestTurfSpeedRating ?? null,
      previous: metrics?.previousTurfSpeedRating ?? null,
      bestLast3: metrics?.bestTurfSpeedLast3 ?? null,
      bestLast5: metrics?.bestTurfSpeedLast5 ?? null,
      averageLast3: metrics?.averageTurfSpeedLast3 ?? null,
      averageLast5: metrics?.averageTurfSpeedLast5 ?? null,
    };
  }
  return emptyRatingFields();
}

function todaysRatingFieldsForFamily(
  family: ReturnType<typeof classifyCurrentRaceFamily>,
  metrics: TodayRunner["metrics"],
) {
  if (family === "jump") {
    return { latest: metrics?.latestJumpTodaysRating ?? null };
  }
  if (family === "all_weather_flat") {
    return { latest: metrics?.latestAwTodaysRating ?? null };
  }
  if (family === "turf_flat") {
    return { latest: metrics?.latestTurfTodaysRating ?? null };
  }
  return { latest: metrics?.latestTodaysRating ?? null };
}

function emptyRatingFields() {
  return {
    latest: null,
    previous: null,
    bestLast3: null,
    bestLast5: null,
    averageLast3: null,
    averageLast5: null,
  };
}

function familyMatches(
  raceCode: HistoricalPreRaceFeatureRow["raceCode"],
  family: ResearchRuleV1["family"],
): boolean {
  return (raceCode === "jump" && family === "jump") ||
    (raceCode === "aw" && family === "all_weather_flat") ||
    (raceCode === "turf" && family === "turf_flat");
}

function savedRuleMatch(rule: SavedResearchRule): TodaySavedRuleMatch {
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    development: {
      selections: rule.developmentSnapshot.selections,
      winners: rule.developmentSnapshot.winners,
      strikeRate: rule.developmentSnapshot.strikeRate,
      roiPercentage: rule.developmentSnapshot.roiPercentage,
      profitLoss: rule.developmentSnapshot.profitLoss,
      maxConsecutiveLosers: rule.developmentSnapshot.maxConsecutiveLosers,
    },
  };
}

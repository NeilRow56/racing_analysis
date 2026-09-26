import { normalizeRaceClasses } from "./research-rule-classes";
import type {
  NumericCondition,
  RankCondition,
  RatingCondition,
  RelativeCondition,
  ResearchRuleV1,
  StartingPriceCondition,
} from "./research-rule";

export function researchRulesEqual(left: ResearchRuleV1, right: ResearchRuleV1): boolean {
  return researchRuleKey(left) === researchRuleKey(right);
}

export function researchRuleKey(rule: ResearchRuleV1): string {
  return JSON.stringify(canonicalResearchRule(rule));
}

export function canonicalResearchRule(rule: ResearchRuleV1) {
  const courseIds = sortedTextValues([
    ...(Array.isArray(rule.race.courseIds) ? rule.race.courseIds : []),
    rule.race.courseId,
  ]);
  const courseNames = sortedTextValues([
    ...(Array.isArray(rule.race.courseNames) ? rule.race.courseNames : []),
    rule.race.courseName,
  ]);
  const trainerIds = sortedTextValues([
    ...(Array.isArray(rule.runner.trainerIds) ? rule.runner.trainerIds : []),
    rule.runner.trainerId,
  ]);
  const jockeyIds = sortedTextValues([
    ...(Array.isArray(rule.runner.jockeyIds) ? rule.runner.jockeyIds : []),
    rule.runner.jockeyId,
  ]);
  return compactObject({
    version: rule.version,
    family: rule.family,
    dateRange: {
      from: rule.dateRange.from,
      to: rule.dateRange.to,
    },
    calendarPeriod: rule.calendarPeriod
      ? {
          monthFrom: rule.calendarPeriod.monthFrom,
          monthTo: rule.calendarPeriod.monthTo,
        }
      : undefined,
    race: compactObject({
      courseIds,
      courseName: courseIds.length > 0 ? undefined : courseNames[0],
      raceClasses: normalizeRaceClasses(rule.race.raceClasses),
      handicapStatus: !rule.race.handicapStatus || rule.race.handicapStatus === "all"
        ? undefined
        : rule.race.handicapStatus,
      jumpSubtype: rule.family === "jump" && rule.race.jumpSubtype !== "all"
        ? rule.race.jumpSubtype
        : undefined,
      distanceBucketFrom: textValue(rule.race.distanceBucketFrom),
      distanceBucketTo: textValue(rule.race.distanceBucketTo),
      distanceYards: canonicalRange(rule.race.distanceYards),
      fieldSize: canonicalRange(rule.race.fieldSize),
    }),
    runner: compactObject({
      trainerIds,
      jockeyIds,
      trainerCohort: trainerIds.length === 0 && rule.runner.trainerCohort
        ? {
            top: rule.runner.trainerCohort.top,
            period: rule.runner.trainerCohort.period,
            rankingMetric: rule.runner.trainerCohort.rankingMetric,
          }
        : undefined,
      returnBucket: !rule.runner.returnBucket || rule.runner.returnBucket === "all"
        ? undefined
        : rule.runner.returnBucket,
      runAfterBreak: !rule.runner.runAfterBreak || rule.runner.runAfterBreak === "all"
        ? undefined
        : rule.runner.runAfterBreak,
      officialRating: canonicalRange(rule.runner.officialRating),
      draw: rule.family === "jump" ? undefined : canonicalRange(rule.runner.draw),
      weightCarriedLbs: canonicalRange(rule.runner.weightCarriedLbs),
      daysSinceRun: canonicalRange(rule.runner.daysSinceRun),
      priorRuns: canonicalRange(rule.runner.priorRuns),
      trainerPriorRuns: canonicalRange(rule.runner.trainerPriorRuns),
      trainerPriorWinRate: canonicalRange(rule.runner.trainerPriorWinRate),
      jockeyPriorRuns: canonicalRange(rule.runner.jockeyPriorRuns),
      jockeyPriorWinRate: canonicalRange(rule.runner.jockeyPriorWinRate),
    }),
    ratings: rule.ratings.map(canonicalRatingCondition),
    relatives: rule.relatives.map(canonicalRelativeCondition),
    ranks: rule.ranks.map(canonicalRankCondition),
    turfPerformance: rule.turfPerformance
      ? compactObject({
          version: rule.turfPerformance.version,
          rating: canonicalRange(rule.turfPerformance.rating),
          rank: canonicalRange(rule.turfPerformance.rank),
          lead: canonicalRange(rule.turfPerformance.lead),
        })
      : undefined,
    startingPrice: canonicalStartingPriceCondition(rule.startingPrice),
  });
}

function canonicalRatingCondition(condition: RatingCondition) {
  return { metric: condition.metric, range: canonicalRange(condition.range) };
}

function canonicalRelativeCondition(condition: RelativeCondition) {
  return { metric: condition.metric, range: canonicalRange(condition.range) };
}

function canonicalRankCondition(condition: RankCondition) {
  return { metric: condition.metric, range: canonicalRange(condition.range) };
}

function canonicalRange(range: NumericCondition | undefined) {
  if (!range || (range.min === undefined && range.max === undefined)) {
    return undefined;
  }
  return compactObject({
    min: numericValue(range.min),
    max: numericValue(range.max),
  });
}

function canonicalStartingPriceCondition(condition: StartingPriceCondition | undefined) {
  if (
    !condition ||
    (condition.minDecimal === undefined && condition.maxDecimalExclusive === undefined)
  ) {
    return undefined;
  }
  return compactObject({
    minDecimal: numericValue(condition.minDecimal),
    maxDecimalExclusive: numericValue(condition.maxDecimalExclusive),
  });
}

function numericValue(value: number | undefined): number | undefined {
  return value === undefined || !Number.isFinite(value) ? undefined : value;
}

function textValue(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

function sortedTextValues(values: unknown[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text) unique.add(text);
  }
  return [...unique].sort((left, right) => left.localeCompare(right));
}

function compactObject<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (value === undefined) return false;
      if (Array.isArray(value)) return value.length > 0;
      if (value && typeof value === "object") return Object.keys(value).length > 0;
      return true;
    }),
  );
}

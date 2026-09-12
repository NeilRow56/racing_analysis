import { normalizeRaceClasses } from "./research-rule-classes";
import type {
  NumericCondition,
  RankCondition,
  RatingCondition,
  RelativeCondition,
  ResearchRuleV1,
} from "./research-rule";

export function researchRulesEqual(left: ResearchRuleV1, right: ResearchRuleV1): boolean {
  return researchRuleKey(left) === researchRuleKey(right);
}

export function researchRuleKey(rule: ResearchRuleV1): string {
  return JSON.stringify(canonicalResearchRule(rule));
}

export function canonicalResearchRule(rule: ResearchRuleV1) {
  return compactObject({
    version: rule.version,
    family: rule.family,
    dateRange: {
      from: rule.dateRange.from,
      to: rule.dateRange.to,
    },
    race: compactObject({
      courseId: textValue(rule.race.courseId),
      courseName: rule.race.courseId ? undefined : textValue(rule.race.courseName),
      raceClasses: normalizeRaceClasses(rule.race.raceClasses),
      handicapStatus: !rule.race.handicapStatus || rule.race.handicapStatus === "all"
        ? undefined
        : rule.race.handicapStatus,
      distanceBucketFrom: textValue(rule.race.distanceBucketFrom),
      distanceBucketTo: textValue(rule.race.distanceBucketTo),
      distanceYards: canonicalRange(rule.race.distanceYards),
      fieldSize: canonicalRange(rule.race.fieldSize),
    }),
    runner: compactObject({
      trainerId: textValue(rule.runner.trainerId),
      returnBucket: !rule.runner.returnBucket || rule.runner.returnBucket === "all"
        ? undefined
        : rule.runner.returnBucket,
      runAfterBreak: !rule.runner.runAfterBreak || rule.runner.runAfterBreak === "all"
        ? undefined
        : rule.runner.runAfterBreak,
      officialRating: canonicalRange(rule.runner.officialRating),
      weightCarriedLbs: canonicalRange(rule.runner.weightCarriedLbs),
      daysSinceRun: canonicalRange(rule.runner.daysSinceRun),
      priorRuns: canonicalRange(rule.runner.priorRuns),
    }),
    ratings: rule.ratings.map(canonicalRatingCondition),
    relatives: rule.relatives.map(canonicalRelativeCondition),
    ranks: rule.ranks.map(canonicalRankCondition),
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

function numericValue(value: number | undefined): number | undefined {
  return value === undefined || !Number.isFinite(value) ? undefined : value;
}

function textValue(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
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

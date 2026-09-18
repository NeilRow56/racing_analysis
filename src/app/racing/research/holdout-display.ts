import type { SavedResearchRule } from "@/lib/racing/saved-research-rules";
import { parseResearchRule } from "@/lib/racing/research-rule";
import {
  trainerCohortLabel,
  trainerCohortReferenceYearFromDate,
} from "@/lib/racing/trainer-cohorts";

export function holdoutRangeText(snapshot: NonNullable<SavedResearchRule["holdoutSnapshot"]>): string {
  return `${snapshot.holdoutFrom} to ${snapshot.holdoutTo}`;
}

export function savedRuleTrainerCohortText(
  rule: Pick<SavedResearchRule, "canonicalRule">,
  evaluationFrom: string,
): string | null {
  const parsedRule = parseResearchRule(JSON.stringify(rule.canonicalRule));
  const definition = parsedRule?.runner.trainerCohort;
  if (!parsedRule || !definition || definition.period !== "prior_calendar_year") {
    return null;
  }

  return trainerCohortLabel({
    top: definition.top,
    referenceYear: trainerCohortReferenceYearFromDate(evaluationFrom),
    family: parsedRule.family,
  });
}

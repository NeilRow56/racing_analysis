import {
  loadLatestBacktestFeatureCacheForYear,
} from "./backtest-cache";
import {
  RESEARCH_RULE_VERSION,
  evaluateResearchRule,
  parseResearchRule,
  type ResearchResult,
  type ResearchRuleV1,
} from "./research-rule";
import { researchRuleKey } from "./research-rule-identity";
import type {
  HoldoutResultSnapshot,
  HoldoutResultStatus,
  ResearchRuleCacheMetadata,
  SavedResearchRule,
} from "./saved-research-rules";

export const HOLDOUT_YEAR = "2026";
export const MIN_SETTLED_HOLDOUT_SAMPLE = 30;
export const HOLDOUT_CACHE_MISSING_MESSAGE =
  "2026 holdout cache is missing or incompatible. Build the holdout cache before validating this rule.";

export async function evaluateHoldoutForSavedRule(
  savedRule: Pick<SavedResearchRule, "canonicalRule" | "family" | "ruleIdentity" | "ruleSchemaVersion">,
  input: { validatedAt?: Date; outputDir?: string } = {},
): Promise<HoldoutResultSnapshot> {
  const cached = await loadLatestBacktestFeatureCacheForYear({
    year: HOLDOUT_YEAR,
    family: savedRule.family,
    outputDir: input.outputDir,
  });
  if (!cached) {
    throw new Error(HOLDOUT_CACHE_MISSING_MESSAGE);
  }
  if (!cached.actualCoverage) {
    throw new Error("2026 holdout cache contains no dated race rows.");
  }

  const canonicalRule = parseResearchRule(JSON.stringify(savedRule.canonicalRule));
  if (!canonicalRule) {
    throw new Error("Frozen research rule is invalid");
  }
  const rule: ResearchRuleV1 = {
    ...canonicalRule,
    dateRange: {
      from: cached.actualCoverage.actualFrom,
      to: cached.actualCoverage.actualTo,
    },
  };
  const result = evaluateResearchRule({
    rows: cached.rows,
    rule,
    cache: { manifest: cached.manifest, directory: cached.directory },
  });

  return holdoutSnapshotFromResult(result, {
    ruleIdentity: savedRule.ruleIdentity,
    requestedCacheFrom: cached.manifest.from,
    requestedCacheTo: cached.manifest.to,
    validatedAt: input.validatedAt ?? new Date(),
  });
}

export function holdoutSnapshotFromResult(
  result: ResearchResult,
  input: {
    ruleIdentity?: string;
    requestedCacheFrom?: string;
    requestedCacheTo?: string;
    validatedAt: Date;
  },
): HoldoutResultSnapshot {
  const cacheMetadata = cacheMetadataFromHoldoutResult(result);
  const cache = result.cache;
  if (!cacheMetadata || !cache) {
    throw new Error(HOLDOUT_CACHE_MISSING_MESSAGE);
  }

  return {
    holdoutYear: HOLDOUT_YEAR,
    holdoutFrom: result.rule.dateRange.from,
    holdoutTo: result.rule.dateRange.to,
    requestedCacheFrom: input.requestedCacheFrom ?? cache.manifest.from,
    requestedCacheTo: input.requestedCacheTo ?? cache.manifest.to,
    validatedAt: input.validatedAt.toISOString(),
    ruleSchemaVersion: RESEARCH_RULE_VERSION,
    ruleIdentity: input.ruleIdentity ?? researchRuleKey(result.rule),
    cacheMetadata,
    status: holdoutStatus(result.summary.settledSelections),
    eligibleRunners: result.baselineRows,
    selections: result.summary.selections,
    settledSelections: result.summary.settledSelections,
    winners: result.summary.wins,
    strikeRate: result.summary.winStrikeRate,
    places: result.summary.places,
    placeStrikeRate: result.summary.placeStrikeRate,
    profitLoss: result.summary.profitLoss,
    roiPercentage: result.summary.roiPercentage,
    maxConsecutiveLosers: result.summary.maxConsecutiveLosers,
  };
}

function holdoutStatus(settledSelections: number): HoldoutResultStatus {
  if (settledSelections === 0) {
    return "no_settled_holdout_selections";
  }
  if (settledSelections < MIN_SETTLED_HOLDOUT_SAMPLE) {
    return "insufficient_holdout_sample";
  }
  return "completed";
}

function cacheMetadataFromHoldoutResult(result: ResearchResult): ResearchRuleCacheMetadata | null {
  const manifest = result.cache?.manifest;
  if (!manifest) {
    return null;
  }
  return {
    featureSchemaVersion: manifest.featureSchemaVersion,
    sourceFeatureVersion: manifest.sourceFeatureVersion,
    cacheFamily: manifest.family,
    cacheGeneratedAt: manifest.generatedAt,
    calculationVersions: manifest.calculationVersions,
  };
}

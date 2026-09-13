import { loadBacktestFeatureCache, loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import { deriveBacktestFeatureValues, settleSelection, type BacktestSelection, type BacktestSummary } from "@/lib/racing/backtest";
import { developmentSettlementModeDescription } from "@/lib/racing/development-settlement-mode";
import type { HistoricalPreRaceFeatureRow, HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import {
  classifyHandicapStatus,
  defaultResearchRule,
  evaluateResearchRule,
  parseResearchRule,
  type ResearchRuleV1,
} from "@/lib/racing/research-rule";
import { listSavedResearchRules, type SavedResearchRule } from "@/lib/racing/saved-research-rules";

type Family = ResearchRuleV1["family"];

const FAMILIES: Family[] = ["turf_flat", "jump", "all_weather_flat"];

async function main() {
  const savedRules = await loadFrozenRulesForAudit();
  console.log("# 2025 Development vs 2026 Holdout Parity Audit");
  console.log(`frozen_rules=${savedRules.length}`);
  console.log("");

  console.log("## Evaluator parity");
  console.log([
    "development_path=loadBacktestFeatureCache(2025 full) -> hydrate/parse ResearchRuleV1 -> evaluateResearchRule",
    "holdout_path=loadLatestBacktestFeatureCacheForYear(2026) -> parse canonical ResearchRuleV1 -> replace dateRange with actual 2026 cache coverage -> evaluateResearchRule",
    "shared_evaluator=evaluateResearchRule applies raceCode family filter, rankRows, race filters, runner filters, rating filters, relative filters, rank filters, researchSelection, summarizeSelections",
    "intentional_difference=development UI may display analysis-only capped winner returns; this audit uses actual result SP for 2025 and 2026",
  ].join("\n"));
  console.log("");

  const caches = new Map<Family, {
    development: NonNullable<Awaited<ReturnType<typeof loadBacktestFeatureCache>>>;
    holdout: NonNullable<Awaited<ReturnType<typeof loadLatestBacktestFeatureCacheForYear>>>;
  }>();
  for (const family of FAMILIES) {
    const development = await loadBacktestFeatureCache({
      from: "2025-01-01",
      to: "2025-12-31",
      family,
    });
    const holdout = await loadLatestBacktestFeatureCacheForYear({
      year: "2026",
      family,
    });
    if (development && holdout) {
      caches.set(family, { development, holdout });
    }
  }

  console.log("## Cache/schema parity");
  for (const [family, { development, holdout }] of caches) {
    console.log([
      `family=${family}`,
      `2025=${development.manifest.featureSchemaVersion}/${development.manifest.sourceFeatureVersion} rows=${development.rows.length} coverage=${coverageText(development)}`,
      `2026=${holdout.manifest.featureSchemaVersion}/${holdout.manifest.sourceFeatureVersion} rows=${holdout.rows.length} coverage=${coverageText(holdout)}`,
      `calc_versions_equal=${JSON.stringify(development.manifest.calculationVersions) === JSON.stringify(holdout.manifest.calculationVersions)}`,
      `calc_versions=${JSON.stringify(development.manifest.calculationVersions)}`,
    ].join(" | "));
  }
  console.log("");

  console.log("## Matched-period frozen-rule comparison");
  for (const rule of savedRules) {
    const cache = caches.get(rule.family);
    const canonical = parseResearchRule(JSON.stringify(rule.canonicalRule));
    if (!cache || !canonical || !cache.holdout.actualCoverage) continue;
    const matched2025 = equivalentYearRange(cache.holdout.actualCoverage.actualFrom, cache.holdout.actualCoverage.actualTo, "2025");
    const holdoutRange = {
      from: cache.holdout.actualCoverage.actualFrom,
      to: cache.holdout.actualCoverage.actualTo,
    };
    const rows = [
      evaluateRuleSample("2025_full", cache.development.rows, canonical, canonical.dateRange),
      evaluateRuleSample("2025_matched", cache.development.rows, canonical, matched2025),
      evaluateRuleSample("2026_holdout", cache.holdout.rows, canonical, holdoutRange),
    ];
    console.log(`rule=${rule.name} | family=${rule.family} | saved_dev_settlement=${developmentSettlementModeDescription(rule.developmentSnapshot.developmentSettlementMode ?? "actual")}`);
    for (const row of rows) {
      console.log(`  ${sampleLine(row)}`);
    }
    console.log("");
  }

  console.log("## Matched-period population comparison");
  for (const [family, cache] of caches) {
    if (!cache.holdout.actualCoverage) continue;
    const matched2025 = equivalentYearRange(cache.holdout.actualCoverage.actualFrom, cache.holdout.actualCoverage.actualTo, "2025");
    const holdoutRange = {
      from: cache.holdout.actualCoverage.actualFrom,
      to: cache.holdout.actualCoverage.actualTo,
    };
    console.log(`family=${family}`);
    console.log(`  2025_matched ${populationLine(populationAudit(cache.development.rows, matched2025))}`);
    console.log(`  2026_holdout ${populationLine(populationAudit(cache.holdout.rows, holdoutRange))}`);
    console.log("");
  }

  console.log("## Settlement audit");
  for (const [family, cache] of caches) {
    if (!cache.holdout.actualCoverage) continue;
    const matched2025 = equivalentYearRange(cache.holdout.actualCoverage.actualFrom, cache.holdout.actualCoverage.actualTo, "2025");
    const holdoutRange = {
      from: cache.holdout.actualCoverage.actualFrom,
      to: cache.holdout.actualCoverage.actualTo,
    };
    console.log(`family=${family}`);
    console.log(`  2025_matched ${settlementLine(settlementAudit(cache.development.rows, matched2025))}`);
    console.log(`  2026_holdout ${settlementLine(settlementAudit(cache.holdout.rows, holdoutRange))}`);
    console.log("");
  }

  console.log("## Race-code classification audit");
  for (const [family, cache] of caches) {
    if (family !== "turf_flat" || !cache.holdout.actualCoverage) continue;
    const matched2025 = equivalentYearRange(cache.holdout.actualCoverage.actualFrom, cache.holdout.actualCoverage.actualTo, "2025");
    const holdoutRange = {
      from: cache.holdout.actualCoverage.actualFrom,
      to: cache.holdout.actualCoverage.actualTo,
    };
    console.log(`family=${family}`);
    console.log(`  2025_matched ${classificationLine(classificationAudit(cache.development.rows, matched2025))}`);
    console.log(`  2026_holdout ${classificationLine(classificationAudit(cache.holdout.rows, holdoutRange))}`);
    console.log("");
  }

  console.log("## Historical lookback examples");
  for (const [family, cache] of caches) {
    const examples = cache.holdout.rows
      .filter((row) => row.features.latestRunDate !== null && row.features.latestRunDate < "2026-01-01")
      .slice(0, 5);
    const trainerExamples = cache.holdout.rows
      .filter((row) => row.features.raceDate <= "2026-03-15" && row.features.trainerPriorRuns > 0)
      .slice(0, 5);
    console.log(`family=${family}`);
    console.log(`  horse_prior_cross_year_examples=${examples.map((row) => `${row.features.raceDate}:${row.features.horseName}:latest=${row.features.latestRunDate}:priorRuns=${row.features.priorRuns}`).join(" || ") || "none"}`);
    console.log(`  trainer_prior_early_2026_examples=${trainerExamples.map((row) => `${row.features.raceDate}:${row.features.trainerName}:runs=${row.features.trainerPriorRuns}:wins=${row.features.trainerPriorWins}:rate=${fmt(row.features.trainerPriorWinRate)}`).join(" || ") || "none"}`);
  }
  console.log("");

  console.log("## Broad benchmark rules");
  for (const [family, cache] of caches) {
    if (!cache.holdout.actualCoverage) continue;
    const matched2025 = equivalentYearRange(cache.holdout.actualCoverage.actualFrom, cache.holdout.actualCoverage.actualTo, "2025");
    const holdoutRange = {
      from: cache.holdout.actualCoverage.actualFrom,
      to: cache.holdout.actualCoverage.actualTo,
    };
    console.log(`family=${family}`);
    for (const benchmark of benchmarkRules(family)) {
      const dev = evaluateRuleSample("2025_matched", cache.development.rows, benchmark.rule, matched2025);
      const holdout = evaluateRuleSample("2026_holdout", cache.holdout.rows, benchmark.rule, holdoutRange);
      console.log(`  ${benchmark.label} | 2025_roi=${fmt(dev.summary.roiPercentage)} selections=${dev.summary.selections} settled=${dev.summary.settledSelections} | 2026_roi=${fmt(holdout.summary.roiPercentage)} selections=${holdout.summary.selections} settled=${holdout.summary.settledSelections}`);
    }
    console.log("");
  }

  console.log("## Ranking examples");
  for (const [family, cache] of caches) {
    const metric: ResearchRuleV1["ranks"][number]["metric"] = family === "turf_flat" ? "latestPerformanceRating" : "latestSpeedRating";
    const rankedRule: ResearchRuleV1 = {
      ...defaultResearchRule(family),
      dateRange: cache.holdout.actualCoverage ? {
        from: cache.holdout.actualCoverage.actualFrom,
        to: cache.holdout.actualCoverage.actualTo,
      } : { from: "2026-01-01", to: "2026-12-31" },
      ranks: [{ metric, range: { min: 1, max: 2 } }],
    };
    const result = evaluateResearchRule({ rows: cache.holdout.rows, rule: rankedRule });
    const raceId = result.selectedRunners[0]?.features.targetRaceId;
    if (!raceId) {
      console.log(`family=${family} no_ranked_examples`);
      continue;
    }
    const raceRows = result.selectedRunners
      .filter((selection) => selection.features.targetRaceId === raceId)
      .slice(0, 8)
      .map((selection) => `${selection.features.horseName}:metric=${fmt(selection.features[metric])}:rank=${selection.ranks[metric] ?? "-"}`);
    console.log(`family=${family} metric=${metric} race=${raceId} examples=${raceRows.join(" | ")}`);
  }
}

async function loadFrozenRulesForAudit(): Promise<SavedResearchRule[]> {
  try {
    return (await listSavedResearchRules()).filter((rule) => rule.status === "frozen");
  } catch (error) {
    console.log("frozen_rules_warning=unable_to_load_saved_rules");
    console.log(`frozen_rules_error=${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    return [];
  }
}

function evaluateRuleSample(
  label: string,
  rows: HistoricalTargetRunnerMetricsRow[],
  canonicalRule: ResearchRuleV1,
  dateRange: { from: string; to: string },
) {
  const rule = { ...canonicalRule, dateRange };
  const result = evaluateResearchRule({ rows, rule });
  return {
    label,
    range: dateRange,
    eligibleRunners: result.baselineRows,
    summary: result.summary,
    winnerSp: winnerSpStats(result.selectedRunners),
  };
}

function sampleLine(sample: ReturnType<typeof evaluateRuleSample>) {
  return [
    `sample=${sample.label}`,
    `range=${sample.range.from}..${sample.range.to}`,
    `eligible=${sample.eligibleRunners}`,
    summaryText(sample.summary),
    `avg_winner_sp=${fmt(sample.winnerSp.average)}`,
    `median_winner_sp=${fmt(sample.winnerSp.median)}`,
  ].join(" | ");
}

function summaryText(summary: BacktestSummary) {
  return [
    `selections=${summary.selections}`,
    `settled=${summary.settledSelections}`,
    `winners=${summary.wins}`,
    `strike=${fmt(summary.winStrikeRate)}%`,
    `pl=${fmt(summary.profitLoss)}`,
    `roi=${fmt(summary.roiPercentage)}%`,
    `max_losing_run=${summary.maxConsecutiveLosers}`,
  ].join(" ");
}

function winnerSpStats(selections: BacktestSelection[]) {
  const values = selections
    .filter((selection) => selection.outcome.won && selection.settlement !== null)
    .map((selection) => selection.settlement!.settlementOddsDecimal);
  return { average: average(values), median: median(values) };
}

function populationAudit(rows: HistoricalTargetRunnerMetricsRow[], range: { from: string; to: string }) {
  const scoped = rowsInRange(rows, range);
  const settled = scoped.filter((row) => settleSelection(row.outcome) !== null);
  const winners = settled.filter((row) => row.outcome.won);
  return {
    races: new Set(scoped.map((row) => row.features.targetRaceId)).size,
    runners: scoped.length,
    settled: settled.length,
    winners: winners.length,
    winStrikeRate: pct(winners.length, settled.length),
    spAvailability: pct(scoped.filter((row) => row.outcome.startingPrice !== null).length, scoped.length),
    decimalSpAvailability: pct(scoped.filter((row) => row.outcome.startingPriceDecimal !== null).length, scoped.length),
    winnerSp: winnerSpStats(settled.map(selectionFromRow)),
    raceClass: topCounts(scoped.map((row) => row.features.raceClass ?? "missing"), 6),
    handicap: topCounts(scoped.map((row) => classifyHandicapStatus(row.features)), 4),
    distance: topCounts(scoped.map((row) => distanceBucket(row.features.distanceYards)), 8),
    fieldSize: numericDistribution(scoped.map((row) => row.features.actualRunnerCount ?? row.features.declaredRunnerCount)),
    features: featureAvailability(scoped),
  };
}

function populationLine(input: ReturnType<typeof populationAudit>) {
  return [
    `races=${input.races}`,
    `runners=${input.runners}`,
    `settled=${input.settled}`,
    `winners=${input.winners}`,
    `strike=${fmt(input.winStrikeRate)}%`,
    `sp=${fmt(input.spAvailability)}%`,
    `decimal_sp=${fmt(input.decimalSpAvailability)}%`,
    `avg_win_sp=${fmt(input.winnerSp.average)}`,
    `median_win_sp=${fmt(input.winnerSp.median)}`,
    `classes=${JSON.stringify(input.raceClass)}`,
    `handicap=${JSON.stringify(input.handicap)}`,
    `distance=${JSON.stringify(input.distance)}`,
    `field_size=${JSON.stringify(input.fieldSize)}`,
    `features=${JSON.stringify(input.features)}`,
  ].join(" | ");
}

function settlementAudit(rows: HistoricalTargetRunnerMetricsRow[], range: { from: string; to: string }) {
  const scoped = rowsInRange(rows, range);
  const settled = scoped.filter((row) => settleSelection(row.outcome) !== null);
  const winners = scoped.filter((row) => row.outcome.won === true);
  const losers = scoped.filter((row) => row.outcome.won === false);
  return {
    rows: scoped.length,
    settled: settled.length,
    nonRunners: scoped.filter((row) => row.outcome.resultStatus === "non_runner").length,
    missingSp: scoped.filter((row) => row.outcome.startingPrice === null).length,
    missingDecimalSp: scoped.filter((row) => row.outcome.startingPriceDecimal === null).length,
    winnersWithoutSettleableSp: winners.filter((row) => settleSelection(row.outcome) === null).length,
    losersWithoutSettleableSp: losers.filter((row) => settleSelection(row.outcome) === null).length,
    statuses: topCounts(scoped.map((row) => row.outcome.resultStatus ?? "null"), 8),
    examples: scoped
      .filter((row) => row.outcome.won === true || row.outcome.won === false)
      .slice(0, 4)
      .map((row) => `${row.features.raceDate}:${row.features.horseName}:won=${row.outcome.won}:sp=${row.outcome.startingPrice}:dec=${row.outcome.startingPriceDecimal}:pl=${settleSelection(row.outcome)?.profitLoss ?? "unsettled"}`),
  };
}

function settlementLine(input: ReturnType<typeof settlementAudit>) {
  return [
    `rows=${input.rows}`,
    `settled=${input.settled}`,
    `non_runners=${input.nonRunners}`,
    `missing_sp=${input.missingSp}`,
    `missing_decimal_sp=${input.missingDecimalSp}`,
    `winners_without_settleable_sp=${input.winnersWithoutSettleableSp}`,
    `losers_without_settleable_sp=${input.losersWithoutSettleableSp}`,
    `statuses=${JSON.stringify(input.statuses)}`,
    `examples=${input.examples.join(" || ")}`,
  ].join(" | ");
}

function classificationAudit(rows: HistoricalTargetRunnerMetricsRow[], range: { from: string; to: string }) {
  const scoped = rowsInRange(rows, range);
  const jumpKeywordPattern = /\b(chase|hurdle|hunters|hunter|national|mares chase|stayers hurdle|champion hurdle|handicap hurdle|handicap chase)\b/i;
  const gradePattern = /\bgrade [123]\b/i;
  const keywordRows = scoped.filter((row) => jumpKeywordPattern.test([
    row.features.raceName,
    row.features.raceType,
    row.features.raceTypeCode,
  ].filter(Boolean).join(" ")));
  const longTurfWithoutTypeRows = scoped.filter((row) =>
    row.features.raceCode === "turf" &&
    row.features.surface === "TURF" &&
    row.features.raceType === null &&
    row.features.raceTypeCode === null &&
    (row.features.distanceYards ?? 0) >= 3520
  );
  const gradeWithoutTypeRows = scoped.filter((row) =>
    row.features.raceCode === "turf" &&
    row.features.raceType === null &&
    row.features.raceTypeCode === null &&
    gradePattern.test(row.features.raceName ?? "")
  );
  return {
    rows: scoped.length,
    keywordRows: keywordRows.length,
    keywordRaces: new Set(keywordRows.map((row) => row.features.targetRaceId)).size,
    longTurfWithoutTypeRows: longTurfWithoutTypeRows.length,
    longTurfWithoutTypeRaces: new Set(longTurfWithoutTypeRows.map((row) => row.features.targetRaceId)).size,
    gradeWithoutTypeRows: gradeWithoutTypeRows.length,
    gradeWithoutTypeRaces: new Set(gradeWithoutTypeRows.map((row) => row.features.targetRaceId)).size,
    examples: uniqueRaceExamples([...keywordRows, ...longTurfWithoutTypeRows, ...gradeWithoutTypeRows], 6),
  };
}

function classificationLine(input: ReturnType<typeof classificationAudit>) {
  return [
    `rows=${input.rows}`,
    `jump_keyword_rows=${input.keywordRows}`,
    `jump_keyword_races=${input.keywordRaces}`,
    `long_turf_missing_type_rows=${input.longTurfWithoutTypeRows}`,
    `long_turf_missing_type_races=${input.longTurfWithoutTypeRaces}`,
    `grade_missing_type_rows=${input.gradeWithoutTypeRows}`,
    `grade_missing_type_races=${input.gradeWithoutTypeRaces}`,
    `examples=${input.examples.join(" || ") || "none"}`,
  ].join(" | ");
}

function uniqueRaceExamples(rows: HistoricalTargetRunnerMetricsRow[], limit: number) {
  const examples = new Map<string, string>();
  for (const row of rows) {
    if (examples.has(row.features.targetRaceId)) continue;
    examples.set(
      row.features.targetRaceId,
      `${row.features.raceDate}:${row.features.courseName}:${row.features.raceName}:type=${row.features.raceType ?? "-"}:code=${row.features.raceTypeCode ?? "-"}:distance=${row.features.distanceYards ?? "-"}`,
    );
    if (examples.size >= limit) break;
  }
  return [...examples.values()];
}

function benchmarkRules(family: Family): Array<{ label: string; rule: ResearchRuleV1 }> {
  const base = defaultResearchRule(family);
  return [
    { label: "all_settled_population", rule: base },
    { label: "handicaps", rule: { ...base, race: { handicapStatus: "handicap" } } },
    { label: "non_handicaps", rule: { ...base, race: { handicapStatus: "non_handicap" } } },
    { label: "trainer_prior_runs_gte_50", rule: { ...base, runner: { trainerPriorRuns: { min: 50 } } } },
    { label: "latest_performance_rank_1", rule: { ...base, ranks: [{ metric: "latestPerformanceRating", range: { min: 1, max: 1 } }] } },
    { label: "latest_speed_rank_1", rule: { ...base, ranks: [{ metric: "latestSpeedRating", range: { min: 1, max: 1 } }] } },
  ];
}

function selectionFromRow(row: HistoricalTargetRunnerMetricsRow): BacktestSelection {
  return {
    id: row.features.targetRunnerId,
    definitionId: "population",
    selectedReason: "population",
    features: row.features,
    derived: deriveBacktestFeatureValues(row.features),
    outcome: row.outcome,
    settlement: settleSelection(row.outcome),
  };
}

function featureAvailability(rows: HistoricalTargetRunnerMetricsRow[]) {
  const has = (selector: (features: HistoricalPreRaceFeatureRow) => unknown | null | undefined) =>
    pct(rows.filter((row) => selector(row.features) !== null && selector(row.features) !== undefined).length, rows.length);
  const distribution = (selector: (features: HistoricalPreRaceFeatureRow) => number | null) =>
    numericDistribution(rows.map((row) => selector(row.features)));
  return {
    trainerPriorRuns: distribution((features) => features.trainerPriorRuns),
    trainerPriorWinRateAvailability: has((features) => features.trainerPriorWinRate),
    trainerPriorWinRate: distribution((features) => features.trainerPriorWinRate),
    latestSpeed: has((features) => features.latestSpeedRating),
    previousSpeed: has((features) => features.previousSpeedRating),
    bestL3Speed: has((features) => features.bestSpeedLast3),
    latestPerformance: has((features) => features.latestPerformanceRating),
    latestTodays: has((features) => features.latestTodaysRating),
    officialRating: has((features) => features.officialRating),
  };
}

function rowsInRange(rows: HistoricalTargetRunnerMetricsRow[], range: { from: string; to: string }) {
  return rows.filter((row) => row.features.raceDate >= range.from && row.features.raceDate <= range.to);
}

function equivalentYearRange(from: string, to: string, year: string) {
  return {
    from: `${year}${from.slice(4)}`,
    to: `${year}${to.slice(4)}`,
  };
}

function coverageText(cache: { actualCoverage: { actualFrom: string; actualTo: string } | null }) {
  return cache.actualCoverage ? `${cache.actualCoverage.actualFrom}..${cache.actualCoverage.actualTo}` : "none";
}

function distanceBucket(yards: number | null) {
  if (yards === null) return "missing";
  const furlongs = yards / 220;
  if (furlongs < 7) return "<7f";
  if (furlongs < 9) return "7-8f";
  if (furlongs < 12) return "9-11f";
  if (furlongs < 16) return "12-15f";
  if (furlongs < 20) return "16-19f";
  if (furlongs < 24) return "20-23f";
  return "24f+";
}

function topCounts(values: string[], limit: number) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit);
}

function numericDistribution(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => value !== null && value !== undefined);
  return {
    availability: pct(present.length, values.length),
    average: average(present),
    median: median(present),
    p25: percentile(present, 0.25),
    p75: percentile(present, 0.75),
  };
}

function average(values: number[]) {
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]) {
  return percentile(values, 0.5);
}

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function pct(count: number, total: number) {
  return total === 0 ? null : (count / total) * 100;
}

function fmt(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : value.toFixed(2);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

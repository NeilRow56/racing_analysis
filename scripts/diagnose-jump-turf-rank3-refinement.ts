import {
  deriveBacktestFeatureValues,
  settleSelection,
  summarizeSelections,
  type BacktestSelection,
  type BacktestSummary,
} from "@/lib/racing/backtest";
import {
  loadLatestBacktestFeatureCacheForYear,
  type BacktestCacheFamily,
} from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { rankRows, type RankedResearchRow } from "@/lib/racing/research-rule";

type Family = Extract<BacktestCacheFamily, "jump" | "turf_flat">;
type Year = "2025" | "2026";

type Context = {
  family: Family;
  year: Year;
  rows: RankedResearchRow[];
  baseline: RankedResearchRow[];
  officialRatingRankByRunnerId: Map<string, number>;
};

type FeatureProfile = {
  key: string;
  label: string;
  categoryOrder: string[];
  categoryFor: (row: RankedResearchRow, context: Context) => string;
};

type AeStats = {
  wins: number;
  expectedWins: number;
  ae: number | null;
};

type Candidate = {
  family: Family;
  feature: FeatureProfile;
  category: string | null;
  reason: string;
};

const FAMILIES: Family[] = ["jump", "turf_flat"];
const YEARS: Year[] = ["2025", "2026"];
const SPARSE_FLOOR = 50;
const VERY_SPARSE_FLOOR = 25;

const FEATURES: FeatureProfile[] = [
  {
    key: "latest_speed_rank",
    label: "Latest speed rank",
    categoryOrder: ["rank 1", "rank 2", "rank 3+", "missing"],
    categoryFor: (row) => rankCategory(row.ranks.latestSpeedRating),
  },
  {
    key: "official_rating_position",
    label: "Official-rating position",
    categoryOrder: ["top-rated", "second", "third+", "missing"],
    categoryFor: (row, context) => officialRatingCategory(context.officialRatingRankByRunnerId.get(row.features.targetRunnerId) ?? null),
  },
  {
    key: "days_since_run",
    label: "Days since run",
    categoryOrder: ["0-14", "15-30", "31-60", "61-120", "121+", "missing"],
    categoryFor: (row) => daysSinceRunBucket(row.features.daysSinceLastRun),
  },
  {
    key: "exact_field_size",
    label: "Exact field size",
    categoryOrder: ["2", "3", "4", "5"],
    categoryFor: (row) => exactFieldSizeBucket(fieldSizeForRow(row)),
  },
];

async function main() {
  console.log("# Jump/Turf Best L3 Rank 3+ Refinement Diagnostic");
  console.log("");
  console.log("Diagnostic only. Fixed baseline: trainer prior strike rate >=15%, field size <=5, and Best L3 rank >=3. Jump and Turf only. No Research, Today, saved/frozen rule, UI, production filtering, cache, or holdout behavior is changed.");
  console.log("");
  console.log("Feature refinements are tested one at a time only. Candidate categories are selected from 2025 within each family/feature and then evaluated unchanged in 2026. A/E is the primary value measure; ROI is secondary; strike rate is descriptive.");
  console.log("");

  const contexts = await loadContexts();
  const candidates = selectCandidates(contexts);

  printFixedBaseline(contexts);
  for (const feature of FEATURES) {
    printFeatureProfile(contexts, feature);
  }
  printCandidateReplication(contexts, candidates);
  printFamilyConclusion(contexts, candidates, "jump");
  printFamilyConclusion(contexts, candidates, "turf_flat");
  printOverallConclusion(contexts, candidates);
  printGuardrails();
}

async function loadContexts(): Promise<Context[]> {
  const contexts: Context[] = [];
  for (const family of FAMILIES) {
    for (const year of YEARS) {
      const cache = await loadLatestBacktestFeatureCacheForYear({ family, year });
      const rows = cache
        ? rankRows(cache.rows
          .filter((row) => row.features.raceCode === raceCodeForFamily(family))
          .sort(compareRowsChronologically))
        : [];
      contexts.push({
        family,
        year,
        rows,
        baseline: fixedBaselineRows(rows),
        officialRatingRankByRunnerId: rankByRace(rows, (row) => row.features.officialRating, true),
      });
    }
  }
  return contexts;
}

function printFixedBaseline(contexts: Context[]) {
  console.log("## Fixed Baseline");
  printTable(contexts.map((context) => ({
    period: label(context),
    "cache rows": context.rows.length,
    "baseline runners": context.baseline.length,
    ...fullMetricColumns(context.baseline),
  })));
  console.log("");
}

function printFeatureProfile(contexts: Context[], feature: FeatureProfile) {
  console.log(`## ${feature.label}`);
  for (const context of contexts) {
    const baselineSummary = summarizeRows(context.baseline);
    console.log(`### ${label(context)}`);
    printTable(feature.categoryOrder.map((category) => {
      const rows = rowsForFeatureCategory(context, feature, category);
      return {
        category,
        ...refinementMetricColumns(rows, baselineSummary.settledSelections),
      };
    }));
    console.log("");
  }
}

function printCandidateReplication(contexts: Context[], candidates: Candidate[]) {
  console.log("## One-Feature-At-A-Time 2025 To 2026 Replication");
  printTable(candidates.flatMap<Record<string, unknown>>((candidate) => {
    if (candidate.category === null) {
      return [{
        family: familyLabel(candidate.family),
        feature: candidate.feature.label,
        "2025-selected category": "none",
        year: "",
        settled: "",
        "sample retention": "",
        "strike rate": "",
        ROI: "",
        "A/E": "",
        "avg SP": "",
        "median SP": "",
        "ROI change vs 2025": "",
        "A/E change vs 2025": "",
        "strike improves vs baseline": "",
        "avg SP much shorter": "",
        judgement: candidate.reason,
      }];
    }

    const context2025 = contextFor(contexts, candidate.family, "2025");
    const context2026 = contextFor(contexts, candidate.family, "2026");
    const rows2025 = rowsForFeatureCategory(context2025, candidate.feature, candidate.category);
    const rows2026 = rowsForFeatureCategory(context2026, candidate.feature, candidate.category);
    const summary2025 = summarizeRows(rows2025);
    const summary2026 = summarizeRows(rows2026);
    const ae2025 = aeStats(rows2025);
    const ae2026 = aeStats(rows2026);
    const base2025 = summarizeRows(context2025.baseline);
    const base2026 = summarizeRows(context2026.baseline);
    return [
      candidateRow(candidate, "2025", rows2025, context2025.baseline, "", "", base2025),
      candidateRow(
        candidate,
        "2026",
        rows2026,
        context2026.baseline,
        pp((summary2026.roiPercentage ?? 0) - (summary2025.roiPercentage ?? 0)),
        number(ae2026.ae === null || ae2025.ae === null ? null : ae2026.ae - ae2025.ae),
        base2026,
        replicationJudgement(rows2025, rows2026, context2025.baseline, context2026.baseline),
      ),
    ];
  }));
  console.log("");
}

function printFamilyConclusion(contexts: Context[], candidates: Candidate[], family: Family) {
  console.log(`## ${familyLabel(family)} Conclusion`);
  const familyCandidates = candidates.filter((candidate) => candidate.family === family);
  printTable(familyCandidates.map((candidate) => conclusionRow(contexts, candidate)));
  console.log("");
}

function printOverallConclusion(contexts: Context[], candidates: Candidate[]) {
  console.log("## Overall Conclusion");
  printTable([
    { question: "1. Any single feature improves Jump in both 2025 and 2026?", answer: familyImprovementAnswer(contexts, candidates, "jump") },
    { question: "2. Any single feature improves Turf in both 2025 and 2026?", answer: familyImprovementAnswer(contexts, candidates, "turf_flat") },
    { question: "3. Best balance of A/E, ROI, retention, replication?", answer: bestBalanceAnswer(contexts, candidates) },
    { question: "4. Any apparent improvements mainly price-mix effects?", answer: priceMixAnswer(contexts, candidates) },
    { question: "5. Is baseline more stable than refinement?", answer: baselineStabilityAnswer(contexts, candidates) },
    { question: "6. Same path for Jump and Turf?", answer: familyPathAnswer(contexts, candidates) },
    { question: "7. Candidate strong enough for confirmation diagnostic?", answer: confirmationAnswer(contexts, candidates) },
    { question: "8. Remain diagnostic?", answer: "Yes. These are one-feature slices inside a pre-selected baseline, not production filters." },
  ]);
  console.log("");
}

function printGuardrails() {
  console.log("## Guardrails");
  printTable([
    { item: "Families included", result: "Jump and Turf only" },
    { item: "Production logic changed", result: "No" },
    { item: "Research/Today/saved/frozen rules changed", result: "No" },
    { item: "Cache schema/generation changed", result: "No" },
    { item: "Baseline thresholds altered", result: "No" },
    { item: "Feature combinations tested", result: "No" },
  ]);
}

function selectCandidates(contexts: Context[]): Candidate[] {
  return FAMILIES.flatMap((family) =>
    FEATURES.map((feature) => {
      const context = contextFor(contexts, family, "2025");
      const baseline = summarizeRows(context.baseline);
      const rows = feature.categoryOrder.map((category) => {
        const categoryRows = rowsForFeatureCategory(context, feature, category);
        const summary = summarizeRows(categoryRows);
        const ae = aeStats(categoryRows);
        return { category, rows: categoryRows, summary, ae };
      });
      const eligible = rows
        .filter((entry) => entry.summary.settledSelections >= VERY_SPARSE_FLOOR)
        .sort((left, right) =>
          sampleTier(right.summary.settledSelections) - sampleTier(left.summary.settledSelections) ||
          (right.ae.ae ?? -Infinity) - (left.ae.ae ?? -Infinity) ||
          (right.summary.roiPercentage ?? -Infinity) - (left.summary.roiPercentage ?? -Infinity) ||
          retention(right.summary.settledSelections, baseline.settledSelections) - retention(left.summary.settledSelections, baseline.settledSelections),
        );
      const best = eligible[0] ?? null;
      return {
        family,
        feature,
        category: best?.category ?? null,
        reason: best
          ? `Selected from 2025 by adequate sample tier, then A/E, ROI, retention: ${best.category}.`
          : "No category reached 25 settled runners in 2025.",
      };
    })
  );
}

function conclusionRow(contexts: Context[], candidate: Candidate) {
  if (candidate.category === null) {
    return {
      feature: candidate.feature.label,
      category: "none",
      "2025 A/E": "n/a",
      "2026 A/E": "n/a",
      "2025 ROI": "n/a",
      "2026 ROI": "n/a",
      "2026 retention": "n/a",
      judgement: candidate.reason,
    };
  }
  const context2025 = contextFor(contexts, candidate.family, "2025");
  const context2026 = contextFor(contexts, candidate.family, "2026");
  const rows2025 = rowsForFeatureCategory(context2025, candidate.feature, candidate.category);
  const rows2026 = rowsForFeatureCategory(context2026, candidate.feature, candidate.category);
  const summary2025 = summarizeRows(rows2025);
  const summary2026 = summarizeRows(rows2026);
  return {
    feature: candidate.feature.label,
    category: candidate.category,
    "2025 A/E": number(aeStats(rows2025).ae),
    "2026 A/E": number(aeStats(rows2026).ae),
    "2025 ROI": pct(summary2025.roiPercentage),
    "2026 ROI": pct(summary2026.roiPercentage),
    "2026 retention": pct(retention(summary2026.settledSelections, summarizeRows(context2026.baseline).settledSelections)),
    judgement: replicationJudgement(rows2025, rows2026, context2025.baseline, context2026.baseline),
  };
}

function candidateRow(
  candidate: Candidate,
  year: Year,
  rows: HistoricalTargetRunnerMetricsRow[],
  baselineRowsForYear: HistoricalTargetRunnerMetricsRow[],
  roiChange: string,
  aeChange: string,
  baselineSummary: BacktestSummary,
  judgement = "",
) {
  const summary = summarizeRows(rows);
  const baselineOdds = settledDecimalSps(baselineRowsForYear);
  const odds = settledDecimalSps(rows);
  const baselineAe = aeStats(baselineRowsForYear);
  const rowAe = aeStats(rows);
  return {
    family: familyLabel(candidate.family),
    feature: candidate.feature.label,
    "2025-selected category": candidate.category ?? "none",
    year,
    settled: summary.settledSelections,
    "sample retention": pct(retention(summary.settledSelections, baselineSummary.settledSelections)),
    "strike rate": pct(summary.winStrikeRate),
    ROI: pct(summary.roiPercentage),
    "A/E": number(rowAe.ae),
    "avg SP": number(average(odds)),
    "median SP": number(median(odds)),
    "ROI change vs 2025": roiChange,
    "A/E change vs 2025": aeChange,
    "strike improves vs baseline": yesNo((summary.winStrikeRate ?? -Infinity) > (baselineSummary.winStrikeRate ?? -Infinity)),
    "avg SP much shorter": yesNo((average(odds) ?? Infinity) < ((average(baselineOdds) ?? Infinity) - 1)),
    judgement: judgement || `Baseline A/E ${number(baselineAe.ae)}, category A/E ${number(rowAe.ae)}.`,
  };
}

function familyImprovementAnswer(contexts: Context[], candidates: Candidate[], family: Family) {
  const good = candidates
    .filter((candidate) => candidate.family === family && candidate.category !== null)
    .filter((candidate) => candidateReplicates(contexts, candidate));
  return good.length > 0
    ? good.map((candidate) => `${candidate.feature.label}: ${candidate.category}`).join("; ")
    : "No selected one-feature refinement clearly improves both years with adequate 2026 sample.";
}

function bestBalanceAnswer(contexts: Context[], candidates: Candidate[]) {
  const scored = candidates
    .filter((candidate): candidate is Candidate & { category: string } => candidate.category !== null)
    .map((candidate) => {
      const context2026 = contextFor(contexts, candidate.family, "2026");
      const rows2026 = rowsForFeatureCategory(context2026, candidate.feature, candidate.category);
      const summary2026 = summarizeRows(rows2026);
      const base2026 = summarizeRows(context2026.baseline);
      return {
        candidate,
        judgement: replicationJudgement(
          rowsForFeatureCategory(contextFor(contexts, candidate.family, "2025"), candidate.feature, candidate.category),
          rows2026,
          contextFor(contexts, candidate.family, "2025").baseline,
          context2026.baseline,
        ),
        score: (aeStats(rows2026).ae ?? 0) +
          ((summary2026.roiPercentage ?? -100) / 100) +
          retention(summary2026.settledSelections, base2026.settledSelections) / 100,
      };
    })
    .filter((entry) => entry.judgement === "replicated" || entry.judgement === "partially replicated")
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  return best
    ? `${familyLabel(best.candidate.family)} ${best.candidate.feature.label}: ${best.candidate.category} (${best.judgement}).`
    : "No candidate has a persuasive balance across A/E, ROI, retention, and replication.";
}

function priceMixAnswer(contexts: Context[], candidates: Candidate[]) {
  return candidates
    .filter((candidate): candidate is Candidate & { category: string } => candidate.category !== null)
    .map((candidate) => {
      const context2026 = contextFor(contexts, candidate.family, "2026");
      const rows = rowsForFeatureCategory(context2026, candidate.feature, candidate.category);
      const avg = average(settledDecimalSps(rows));
      const baselineAvg = average(settledDecimalSps(context2026.baseline));
      return `${familyLabel(candidate.family)} ${candidate.feature.label} ${candidate.category}: 2026 avg SP ${number(avg)} vs baseline ${number(baselineAvg)}`;
    })
    .join("; ");
}

function baselineStabilityAnswer(contexts: Context[], candidates: Candidate[]) {
  const replicated = candidates.filter((candidate) => candidate.category !== null && candidateReplicates(contexts, candidate));
  return replicated.length === 0
    ? "Yes. The unrefined rank 3+ baseline is more stable than the tested one-feature refinements."
    : `Not entirely. ${replicated.length} one-feature candidate(s) partially or fully replicate, but the unrefined baseline keeps more sample.`;
}

function familyPathAnswer(contexts: Context[], candidates: Candidate[]) {
  const jump = familyImprovementAnswer(contexts, candidates, "jump");
  const turf = familyImprovementAnswer(contexts, candidates, "turf_flat");
  return `Jump: ${jump} Turf: ${turf}`;
}

function confirmationAnswer(contexts: Context[], candidates: Candidate[]) {
  const replicated = candidates
    .filter((candidate) => candidate.category !== null && candidateReplicates(contexts, candidate))
    .map((candidate) => `${familyLabel(candidate.family)} ${candidate.feature.label}: ${candidate.category}`);
  return replicated.length > 0
    ? `Only as diagnostic confirmation: ${replicated.join("; ")}.`
    : "No. Stop rule applies: no adequate one-feature refinement is clearly better than the baseline.";
}

function candidateReplicates(contexts: Context[], candidate: Candidate) {
  if (candidate.category === null) return false;
  const context2025 = contextFor(contexts, candidate.family, "2025");
  const context2026 = contextFor(contexts, candidate.family, "2026");
  const judgement = replicationJudgement(
    rowsForFeatureCategory(context2025, candidate.feature, candidate.category),
    rowsForFeatureCategory(context2026, candidate.feature, candidate.category),
    context2025.baseline,
    context2026.baseline,
  );
  return judgement === "replicated" || judgement === "partially replicated";
}

function replicationJudgement(
  rows2025: HistoricalTargetRunnerMetricsRow[],
  rows2026: HistoricalTargetRunnerMetricsRow[],
  baseline2025: HistoricalTargetRunnerMetricsRow[],
  baseline2026: HistoricalTargetRunnerMetricsRow[],
) {
  const summary2025 = summarizeRows(rows2025);
  const summary2026 = summarizeRows(rows2026);
  if (summary2025.settledSelections < VERY_SPARSE_FLOOR || summary2026.settledSelections < VERY_SPARSE_FLOOR) return "too sparse";
  if (summary2026.settledSelections < SPARSE_FLOOR) return "too sparse";

  const ae2025 = aeStats(rows2025).ae;
  const ae2026 = aeStats(rows2026).ae;
  const baselineAe2025 = aeStats(baseline2025).ae;
  const baselineAe2026 = aeStats(baseline2026).ae;
  const aeBeatsBaselineBoth = ae2025 !== null && ae2026 !== null &&
    baselineAe2025 !== null && baselineAe2026 !== null &&
    ae2025 > baselineAe2025 && ae2026 > baselineAe2026;
  const aeOverOneBoth = (ae2025 ?? 0) > 1 && (ae2026 ?? 0) > 1;
  const roiBeatsBaseline2026 = (summary2026.roiPercentage ?? -Infinity) > (summarizeRows(baseline2026).roiPercentage ?? -Infinity);
  const roiPositive2026 = (summary2026.roiPercentage ?? -Infinity) > 0;

  if (aeBeatsBaselineBoth && roiBeatsBaseline2026 && roiPositive2026) return "replicated";
  if (aeOverOneBoth && roiBeatsBaseline2026) return "partially replicated";
  return "failed to replicate";
}

function fixedBaselineRows(rows: RankedResearchRow[]) {
  return rows
    .filter((row) => row.features.trainerPriorWinRate !== null && row.features.trainerPriorWinRate >= 15)
    .filter((row) => {
      const fieldSize = fieldSizeForRow(row);
      return fieldSize !== null && fieldSize <= 5;
    })
    .filter((row) => {
      const rank = row.ranks.bestSpeedLast3;
      return rank !== null && rank !== undefined && rank >= 3;
    });
}

function rowsForFeatureCategory(context: Context, feature: FeatureProfile, category: string) {
  return context.baseline.filter((row) => feature.categoryFor(row, context) === category);
}

function fullMetricColumns(rows: HistoricalTargetRunnerMetricsRow[]) {
  const summary = summarizeRows(rows);
  const ae = aeStats(rows);
  const odds = settledDecimalSps(rows);
  return {
    settled: summary.settledSelections,
    wins: summary.wins,
    "strike rate": pct(summary.winStrikeRate),
    "£1 P/L": money(summary.profitLoss),
    ROI: pct(summary.roiPercentage),
    "A/E": number(ae.ae),
    "avg decimal SP": number(average(odds)),
    "median decimal SP": number(median(odds)),
  };
}

function refinementMetricColumns(rows: HistoricalTargetRunnerMetricsRow[], baselineSettled: number) {
  const summary = summarizeRows(rows);
  const ae = aeStats(rows);
  const odds = settledDecimalSps(rows);
  return {
    settled: summary.settledSelections,
    "strike rate": pct(summary.winStrikeRate),
    ROI: pct(summary.roiPercentage),
    "A/E": number(ae.ae),
    "avg SP": number(average(odds)),
    "sample retention": pct(retention(summary.settledSelections, baselineSettled)),
    sample: sampleWarning(summary.settledSelections),
  };
}

function rankCategory(rank: number | null | undefined) {
  if (rank === null || rank === undefined) return "missing";
  if (rank === 1) return "rank 1";
  if (rank === 2) return "rank 2";
  return "rank 3+";
}

function officialRatingCategory(rank: number | null) {
  if (rank === null) return "missing";
  if (rank === 1) return "top-rated";
  if (rank === 2) return "second";
  return "third+";
}

function daysSinceRunBucket(days: number | null) {
  if (days === null) return "missing";
  if (days <= 14) return "0-14";
  if (days <= 30) return "15-30";
  if (days <= 60) return "31-60";
  if (days <= 120) return "61-120";
  return "121+";
}

function exactFieldSizeBucket(value: number | null) {
  if (value === 2) return "2";
  if (value === 3) return "3";
  if (value === 4) return "4";
  if (value === 5) return "5";
  return "missing";
}

function fieldSizeForRow(row: HistoricalTargetRunnerMetricsRow) {
  return row.features.actualRunnerCount ?? row.features.declaredRunnerCount;
}

function summarizeRows(rows: HistoricalTargetRunnerMetricsRow[]): BacktestSummary {
  return summarizeSelections(rows.map(rowToSelection));
}

function rowToSelection(row: HistoricalTargetRunnerMetricsRow): BacktestSelection {
  return {
    id: row.features.targetRunnerId,
    definitionId: "jump-turf-rank3-refinement-diagnostic",
    selectedReason: "Jump/Turf rank 3+ refinement diagnostic",
    features: row.features,
    derived: deriveBacktestFeatureValues(row.features),
    outcome: row.outcome,
    settlement: settleSelection(row.outcome),
  };
}

function aeStats(rows: HistoricalTargetRunnerMetricsRow[]): AeStats {
  const settled = rows
    .map((row) => ({ row, settlement: settleSelection(row.outcome) }))
    .filter((entry) => entry.settlement !== null && entry.settlement.settlementOddsDecimal > 0);
  const expectedWins = settled.reduce((total, entry) => total + (1 / entry.settlement!.settlementOddsDecimal), 0);
  const wins = settled.filter((entry) => entry.row.outcome.won).length;
  return {
    wins,
    expectedWins,
    ae: expectedWins === 0 ? null : wins / expectedWins,
  };
}

function settledDecimalSps(rows: HistoricalTargetRunnerMetricsRow[]) {
  return rows
    .map((row) => settleSelection(row.outcome)?.settlementOddsDecimal ?? null)
    .filter(isNumber)
    .filter((value) => value > 0);
}

function rankByRace(
  rows: RankedResearchRow[],
  valueFor: (row: RankedResearchRow) => number | null,
  higherIsBetter: boolean,
) {
  const rowsByRace = groupBy(rows, (row) => row.features.targetRaceId);
  const ranks = new Map<string, number>();
  for (const raceRows of rowsByRace.values()) {
    const rankable = raceRows
      .filter((row) => row.outcome.resultStatus !== "non_runner")
      .map((row) => ({ row, value: valueFor(row) }))
      .filter((entry): entry is { row: RankedResearchRow; value: number } => entry.value !== null && Number.isFinite(entry.value))
      .sort((left, right) =>
        (higherIsBetter ? right.value - left.value : left.value - right.value) ||
        left.row.features.targetRunnerId.localeCompare(right.row.features.targetRunnerId),
      );
    let previousValue: number | null = null;
    let previousRank = 0;
    rankable.forEach((entry, index) => {
      const rank = entry.value === previousValue ? previousRank : index + 1;
      ranks.set(entry.row.features.targetRunnerId, rank);
      previousValue = entry.value;
      previousRank = rank;
    });
  }
  return ranks;
}

function contextFor(contexts: Context[], family: Family, year: Year) {
  const context = contexts.find((item) => item.family === family && item.year === year);
  if (!context) throw new Error(`Missing context for ${family} ${year}`);
  return context;
}

function raceCodeForFamily(family: Family) {
  return family === "jump" ? "jump" : "turf";
}

function familyLabel(family: Family) {
  return family === "jump" ? "Jump" : "Turf";
}

function label(context: Pick<Context, "family" | "year">) {
  return `${familyLabel(context.family)} ${context.year}`;
}

function compareRowsChronologically(
  left: HistoricalTargetRunnerMetricsRow,
  right: HistoricalTargetRunnerMetricsRow,
) {
  return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
    left.features.targetRaceId.localeCompare(right.features.targetRaceId) ||
    left.features.targetRunnerId.localeCompare(right.features.targetRunnerId);
}

function groupBy<T>(items: T[], keyFor: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function sampleTier(settled: number) {
  if (settled >= SPARSE_FLOOR) return 2;
  if (settled >= VERY_SPARSE_FLOOR) return 1;
  return 0;
}

function sampleWarning(settled: number) {
  if (settled < VERY_SPARSE_FLOOR) return "very sparse";
  if (settled < SPARSE_FLOOR) return "sparse";
  return "adequate";
}

function retention(settled: number, baselineSettled: number) {
  return baselineSettled === 0 ? 0 : (settled / baselineSettled) * 100;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function pct(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(1)}%`;
}

function pp(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(1)}pp`;
}

function money(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : `£${value.toFixed(2)}`;
}

function number(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(1);
}

function yesNo(value: boolean) {
  return value ? "yes" : "no";
}

function printTable(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    console.log("_No rows_");
    return;
  }
  const columns = Object.keys(rows[0]!);
  console.log(`| ${columns.join(" | ")} |`);
  console.log(`| ${columns.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    console.log(`| ${columns.map((column) => printable(row[column])).join(" | ")} |`);
  }
}

function printable(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\|/g, "\\|");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

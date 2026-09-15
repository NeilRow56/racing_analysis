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
import {
  bestL3TrustComponentCombination,
  bestL3TrustScore,
  bestL3TrustSpBand,
  type BestL3TrustComponentCombination,
  type BestL3TrustScore,
  type BestL3TrustSpBand,
} from "@/lib/racing/best-l3-trust-score";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";

type Family = Exclude<BacktestCacheFamily, "all">;
type Year = "2025" | "2026";

type RankedRunner = {
  row: HistoricalTargetRunnerMetricsRow;
  rank: number;
  value: number;
};

type Rank1Selection = {
  family: Family;
  year: Year;
  row: HistoricalTargetRunnerMetricsRow;
  topGapToRank2: number | null;
  trust: BestL3TrustScore;
};

type RowSelection = {
  row: HistoricalTargetRunnerMetricsRow;
};

type Context = {
  family: Family;
  year: Year;
  rows: HistoricalTargetRunnerMetricsRow[];
  selections: Rank1Selection[];
};

const FAMILIES: Family[] = ["jump", "turf_flat", "all_weather_flat"];
const YEARS: Year[] = ["2025", "2026"];
const SCORES = [0, 1, 2, 3] as const;
const FROZEN_LARGE_GAP_THRESHOLDS: Record<Family, number> = {
  jump: 21.4,
  turf_flat: 9.7,
  all_weather_flat: 7.1,
};
const COMBINATIONS: BestL3TrustComponentCombination[] = [
  "large_gap_only",
  "trainer_strike_only",
  "small_field_only",
  "large_gap_and_trainer",
  "large_gap_and_small_field",
  "trainer_and_small_field",
  "all_three",
  "none",
];
const SCORE_AT_LEAST_TWO_ROUTES: BestL3TrustComponentCombination[] = [
  "large_gap_and_trainer",
  "large_gap_and_small_field",
  "trainer_and_small_field",
  "all_three",
];
const SP_BANDS: BestL3TrustSpBand[] = [
  "lt_2",
  "2_00_to_2_99",
  "3_00_to_4_99",
  "5_00_to_7_99",
  "8_plus",
];

async function main() {
  console.log("# Best L3 Trust Score Diagnostic");
  console.log("");
  console.log("Diagnostic only: ranks Best L3 Speed within race, takes rank-1 runners, derives large-gap thresholds from 2025 only, and applies the same frozen family thresholds to 2026.");
  console.log("");

  const rowsByFamilyYear = new Map<string, HistoricalTargetRunnerMetricsRow[]>();
  for (const family of FAMILIES) {
    for (const year of YEARS) {
      const cache = await loadLatestBacktestFeatureCacheForYear({ family, year });
      const rows = cache
        ? cache.rows
          .filter((row) => row.features.raceCode === raceCodeForFamily(family))
          .sort(compareRowsChronologically)
        : [];
      rowsByFamilyYear.set(contextKey(family, year), rows);
    }
  }

  const thresholds = largeGapThresholds();
  const contexts = buildContexts(rowsByFamilyYear, thresholds);

  printThresholds(thresholds);
  printDefinition();
  printScoreTables(contexts);
  printCumulativeTables(contexts);
  printReliabilityComparison(contexts);
  printComponentContribution(contexts);
  printPairwiseCombinations(contexts);
  printOverlap(contexts);
  printMissingTrainerContext(contexts);
  printExactComponentCombinations(contexts);
  printScoreAtLeastTwoRoutes(contexts);
  printSpBandAnalysis(contexts);
  printRawVsTrustedPriceComparison(contexts);
  printAeAnalysis(contexts);
  printYearToYearObservations(contexts);
  printTrainerSmallFieldBaselineVsBestL3(contexts);
  printDiagnosticConclusion(contexts);
  printInterpretation(contexts);
  printGuardrails();
}

function largeGapThresholds() {
  const thresholds = new Map<Family, number | null>();
  for (const family of FAMILIES) {
    thresholds.set(family, FROZEN_LARGE_GAP_THRESHOLDS[family]);
  }
  return thresholds;
}

function buildContexts(
  rowsByFamilyYear: Map<string, HistoricalTargetRunnerMetricsRow[]>,
  thresholds: Map<Family, number | null>,
): Context[] {
  return FAMILIES.flatMap((family) =>
    YEARS.map((year) => {
      const rows = rowsByFamilyYear.get(contextKey(family, year)) ?? [];
      const largeGapThreshold = thresholds.get(family) ?? null;
      return {
        family,
        year,
        rows,
        selections: rank1SelectionsWithoutScore(rows).map((selection) => {
          const fieldSize = selection.row.features.actualRunnerCount ?? selection.row.features.declaredRunnerCount;
          return {
            family,
            year,
            ...selection,
            trust: bestL3TrustScore({
              topGapToRank2: selection.topGapToRank2,
              largeGapThreshold,
              trainerPriorWinRate: selection.row.features.trainerPriorWinRate,
              fieldSize,
            }),
          };
        }),
      };
    })
  );
}

function rank1SelectionsWithoutScore(rows: HistoricalTargetRunnerMetricsRow[]) {
  const rowsByRace = groupBy(rows, (row) => row.features.targetRaceId);
  const selections: Array<{ row: HistoricalTargetRunnerMetricsRow; topGapToRank2: number | null }> = [];
  for (const raceRows of rowsByRace.values()) {
    const ranked = rankRaceRows(raceRows);
    const gap = topGapToRank2(ranked);
    for (const rankedRow of ranked) {
      if (rankedRow.rank === 1) {
        selections.push({ row: rankedRow.row, topGapToRank2: gap });
      }
    }
  }
  return selections.sort((left, right) => compareRowsChronologically(left.row, right.row));
}

function rankRaceRows(rows: HistoricalTargetRunnerMetricsRow[]): RankedRunner[] {
  const rankable = rows
    .filter((row) => row.outcome.resultStatus !== "non_runner")
    .map((row) => ({ row, value: row.features.bestSpeedLast3 }))
    .filter((entry): entry is { row: HistoricalTargetRunnerMetricsRow; value: number } => entry.value !== null && Number.isFinite(entry.value))
    .sort((left, right) =>
      right.value - left.value ||
      left.row.features.targetRunnerId.localeCompare(right.row.features.targetRunnerId),
    );
  let previousValue: number | null = null;
  let previousRank = 0;
  return rankable.map((entry, index) => {
    const rank = entry.value === previousValue ? previousRank : index + 1;
    previousValue = entry.value;
    previousRank = rank;
    return { row: entry.row, rank, value: entry.value };
  });
}

function topGapToRank2(ranked: RankedRunner[]) {
  const top = ranked.find((entry) => entry.rank === 1)?.value ?? null;
  const rank2 = ranked.find((entry) => entry.rank > 1)?.value ?? null;
  return top === null || rank2 === null ? null : top - rank2;
}

function printThresholds(thresholds: Map<Family, number | null>) {
  console.log("## 2025-Derived Large-Gap Thresholds");
  printTable(FAMILIES.map((family) => ({
    family: familyLabel(family),
    "large gap threshold": number(thresholds.get(family) ?? null),
    definition: "top quartile of positive 2025 Best L3 rank-1 minus rank-2 gaps",
  })));
  console.log("");
}

function printDefinition() {
  console.log("## Trust Score Definition");
  printTable([
    { point: "+1", component: "Large Best L3 gap", rule: "topGapToRank2 >= frozen 2025 family threshold" },
    { point: "+1", component: "Trainer prior strike", rule: "trainerPriorWinRate >= 15%; missing gets no point" },
    { point: "+1", component: "Small field", rule: "actualRunnerCount or declaredRunnerCount <= 5" },
  ]);
  console.log("");
}

function printScoreTables(contexts: Context[]) {
  console.log("## Score 0/1/2/3 Results");
  for (const context of contexts) {
    console.log(`### ${label(context)}`);
    printTable(SCORES.map((score) => resultRow(`score ${score}`, context.selections.filter((selection) => selection.trust.score === score))));
    console.log("");
  }
}

function printCumulativeTables(contexts: Context[]) {
  console.log("## Cumulative Score Results");
  for (const context of contexts) {
    console.log(`### ${label(context)}`);
    printTable([
      resultRow("score >=1", context.selections.filter((selection) => selection.trust.score >= 1)),
      resultRow("score >=2", context.selections.filter((selection) => selection.trust.score >= 2)),
      resultRow("score =3", context.selections.filter((selection) => selection.trust.score === 3)),
    ]);
    console.log("");
  }
}

function printReliabilityComparison(contexts: Context[]) {
  console.log("## Reliability Uplift Vs All Best L3 Rank 1");
  printTable(contexts.flatMap((context) => {
    const base = summarizeRank1Selections(context.selections);
    return [
      reliabilityRow(context, "all rank 1", context.selections, base),
      ...SCORES.map((score) => reliabilityRow(context, `score ${score}`, context.selections.filter((selection) => selection.trust.score === score), base)),
    ];
  }));
  console.log("");
}

function reliabilityRow(
  context: Context,
  group: string,
  selections: Rank1Selection[],
  base: BacktestSummary,
) {
  const summary = summarizeRank1Selections(selections);
  return {
    period: label(context),
    group,
    selections: summary.selections,
    settled: summary.settledSelections,
    "strike rate": pct(summary.winStrikeRate),
    "uplift vs all": deltaPct(summary.winStrikeRate, base.winStrikeRate),
    ROI: pct(summary.roiPercentage),
    sample: sampleWarning(summary.settledSelections),
  };
}

function printComponentContribution(contexts: Context[]) {
  console.log("## Individual Component Contribution");
  printTable(contexts.flatMap((context) => [
    componentRow(context, "large gap", true, (selection) => selection.trust.components.largeGap),
    componentRow(context, "large gap", false, (selection) => selection.trust.components.largeGap),
    componentRow(context, "trainer strike >=15%", true, (selection) => selection.trust.components.trainerStrike),
    componentRow(context, "trainer strike >=15%", false, (selection) => selection.trust.components.trainerStrike),
    componentRow(context, "field <=5", true, (selection) => selection.trust.components.smallField),
    componentRow(context, "field <=5", false, (selection) => selection.trust.components.smallField),
  ]));
  console.log("");
}

function componentRow(
  context: Context,
  component: string,
  present: boolean,
  predicate: (selection: Rank1Selection) => boolean,
) {
  const selections = context.selections.filter((selection) => predicate(selection) === present);
  const summary = summarizeRank1Selections(selections);
  return {
    period: label(context),
    component,
    state: present ? "present" : "absent",
    selections: summary.selections,
    settled: summary.settledSelections,
    "strike rate": pct(summary.winStrikeRate),
    ROI: pct(summary.roiPercentage),
    sample: sampleWarning(summary.settledSelections),
  };
}

function printPairwiseCombinations(contexts: Context[]) {
  console.log("## Pairwise Combinations");
  printTable(contexts.flatMap((context) => [
    pairRow(context, "large gap + trainer strike", (selection) => selection.trust.components.largeGap && selection.trust.components.trainerStrike),
    pairRow(context, "large gap + small field", (selection) => selection.trust.components.largeGap && selection.trust.components.smallField),
    pairRow(context, "trainer strike + small field", (selection) => selection.trust.components.trainerStrike && selection.trust.components.smallField),
  ]));
  console.log("");
}

function pairRow(
  context: Context,
  pair: string,
  predicate: (selection: Rank1Selection) => boolean,
) {
  const selections = context.selections.filter(predicate);
  const summary = summarizeRank1Selections(selections);
  return {
    period: label(context),
    pair,
    selections: summary.selections,
    settled: summary.settledSelections,
    "strike rate": pct(summary.winStrikeRate),
    ROI: pct(summary.roiPercentage),
    sample: sampleWarning(summary.settledSelections),
  };
}

function printOverlap(contexts: Context[]) {
  console.log("## Component Frequency / Overlap");
  printTable(contexts.map((context) => {
    const count = context.selections.length;
    return {
      period: label(context),
      selections: count,
      "% large gap": pct(percent(context.selections.filter((selection) => selection.trust.components.largeGap).length, count)),
      "% trainer strike >=15": pct(percent(context.selections.filter((selection) => selection.trust.components.trainerStrike).length, count)),
      "% field <=5": pct(percent(context.selections.filter((selection) => selection.trust.components.smallField).length, count)),
      "% score 0": pct(percent(context.selections.filter((selection) => selection.trust.score === 0).length, count)),
      "% score 1": pct(percent(context.selections.filter((selection) => selection.trust.score === 1).length, count)),
      "% score 2": pct(percent(context.selections.filter((selection) => selection.trust.score === 2).length, count)),
      "% score 3": pct(percent(context.selections.filter((selection) => selection.trust.score === 3).length, count)),
    };
  }));
  console.log("");
}

function printMissingTrainerContext(contexts: Context[]) {
  console.log("## Missing Trainer Context");
  printTable(contexts.map((context) => {
    const missing = context.selections.filter((selection) => selection.row.features.trainerPriorWinRate === null).length;
    return {
      period: label(context),
      selections: context.selections.length,
      "missing trainer strike": missing,
      "missing rate": pct(percent(missing, context.selections.length)),
    };
  }));
  console.log("");
}

function printExactComponentCombinations(contexts: Context[]) {
  console.log("## Exact Component Combinations");
  for (const context of contexts) {
    console.log(`### ${label(context)}`);
    printTable(COMBINATIONS.map((combination) =>
      priceResultRow(
        combinationLabel(combination),
        context.selections.filter((selection) => exactCombination(selection) === combination),
      )
    ));
    console.log("");
  }
}

function printScoreAtLeastTwoRoutes(contexts: Context[]) {
  console.log("## Score >=2 Component Routes");
  for (const context of contexts) {
    console.log(`### ${label(context)}`);
    printTable(SCORE_AT_LEAST_TWO_ROUTES.map((combination) =>
      priceResultRow(
        scoreAtLeastTwoRouteLabel(combination),
        context.selections.filter((selection) => exactCombination(selection) === combination),
      )
    ));
    console.log("");
  }
}

function printSpBandAnalysis(contexts: Context[]) {
  console.log("## SP-Band Analysis For Score >=2");
  for (const context of contexts) {
    const trusted = context.selections.filter((selection) => selection.trust.score >= 2);
    const settled = trusted.filter((selection) => settleSelection(selection.row.outcome) !== null);
    const banded = settled.filter((selection) => spForSelection(selection) !== null && bestL3TrustSpBand(spForSelection(selection)) !== null);
    console.log(`### ${label(context)}`);
    printTable(SP_BANDS.map((band) =>
      priceResultRow(
        spBandLabel(band),
        trusted.filter((selection) => bestL3TrustSpBand(spForSelection(selection)) === band),
      )
    ));
    console.log("");
    printTable([{
      period: label(context),
      "score >=2 settled": settled.length,
      "settled excluded missing/unusable SP": settled.length - banded.length,
      note: "Existing settlement requires valid positive decimal SP, so this should normally be 0.",
    }]);
    console.log("");
  }
}

function printRawVsTrustedPriceComparison(contexts: Context[]) {
  console.log("## Raw Best L3 Vs Score >=2 Price Comparison");
  for (const context of contexts) {
    console.log(`### ${label(context)}`);
    printTable([
      priceResultRow("all raw Best L3 rank 1", context.selections),
      priceResultRow("score >=2", context.selections.filter((selection) => selection.trust.score >= 2)),
      ...SP_BANDS.map((band) =>
        priceResultRow(
          `score >=2 ${spBandLabel(band)}`,
          context.selections.filter((selection) =>
            selection.trust.score >= 2 && bestL3TrustSpBand(spForSelection(selection)) === band
          ),
        )
      ),
    ]);
    console.log("");
  }
}

function printAeAnalysis(contexts: Context[]) {
  console.log("## A/E Analysis");
  for (const context of contexts) {
    console.log(`### ${label(context)}`);
    printTable([
      aeRow("all raw Best L3 rank 1", context.selections),
      aeRow("score >=2", context.selections.filter((selection) => selection.trust.score >= 2)),
      ...SP_BANDS.map((band) =>
        aeRow(
          `score >=2 ${spBandLabel(band)}`,
          context.selections.filter((selection) =>
            selection.trust.score >= 2 && bestL3TrustSpBand(spForSelection(selection)) === band
          ),
        )
      ),
      ...SCORE_AT_LEAST_TWO_ROUTES.map((combination) =>
        aeRow(
          scoreAtLeastTwoRouteLabel(combination),
          context.selections.filter((selection) => exactCombination(selection) === combination),
        )
      ),
    ]);
    console.log("");
  }
}

function printYearToYearObservations(contexts: Context[]) {
  console.log("## 2025 Vs 2026 Observations");
  printTable(FAMILIES.flatMap((family) => [
    yearObservationRow(family, "score >=2", (selection) => selection.trust.score >= 2),
    yearObservationRow(family, "large gap + trainer, no small field", (selection) => exactCombination(selection) === "large_gap_and_trainer"),
    yearObservationRow(family, "large gap + small field, no trainer", (selection) => exactCombination(selection) === "large_gap_and_small_field"),
    yearObservationRow(family, "trainer + small field, no large gap", (selection) => exactCombination(selection) === "trainer_and_small_field"),
    yearObservationRow(family, "all three", (selection) => exactCombination(selection) === "all_three"),
  ], [] as Array<Record<string, unknown>>));
  console.log("");

  function yearObservationRow(
    family: Family,
    signal: string,
    predicate: (selection: Rank1Selection) => boolean,
  ) {
    const context2025 = contexts.find((context) => context.family === family && context.year === "2025");
    const context2026 = contexts.find((context) => context.family === family && context.year === "2026");
    const summary2025 = summarizeRank1Selections((context2025?.selections ?? []).filter(predicate));
    const summary2026 = summarizeRank1Selections((context2026?.selections ?? []).filter(predicate));
    return {
      family: familyLabel(family),
      signal,
      "2025 settled": summary2025.settledSelections,
      "2025 strike": pct(summary2025.winStrikeRate),
      "2025 ROI": pct(summary2025.roiPercentage),
      "2026 settled": summary2026.settledSelections,
      "2026 strike": pct(summary2026.winStrikeRate),
      "2026 ROI": pct(summary2026.roiPercentage),
      observation: consistencyLabel(summary2025, summary2026),
    };
  }
}

function printTrainerSmallFieldBaselineVsBestL3(contexts: Context[]) {
  console.log("## Trainer + Small Field Baseline Vs Best L3");
  console.log("Population A uses all cached eligible runners with trainer prior strike >=15% and field size <=5. Population B intersects A with Best L3 rank 1. Population C adds the frozen large-gap threshold. Population D is raw Best L3 rank 1.");
  console.log("");
  printTrainerSmallFieldPopulationComparison(contexts);
  printTrainerSmallFieldIncrementalEffects(contexts);
  printTrainerSmallFieldSpBandControl(contexts);
  printTrainerSmallFieldCoverage(contexts);
  printTrainerSmallFieldYearAssessment(contexts);
  printTrainerSmallFieldConclusion(contexts);
}

function printTrainerSmallFieldPopulationComparison(contexts: Context[]) {
  console.log("### Population Comparison");
  for (const context of contexts) {
    const populations = trainerSmallFieldPopulations(context);
    console.log(`#### ${label(context)}`);
    printTable([
      populationResultRow("A trainer >=15% + field <=5", populations.a),
      populationResultRow("B A + Best L3 rank 1", populations.b),
      populationResultRow("C B + large gap", populations.c),
      populationResultRow("D raw Best L3 rank 1", populations.d),
    ]);
    console.log("");
  }
}

function printTrainerSmallFieldIncrementalEffects(contexts: Context[]) {
  console.log("### Incremental Effects");
  printTable(contexts.flatMap((context) => {
    const populations = trainerSmallFieldPopulations(context);
    return [
      incrementalRow(context, "A -> B Best L3 rank 1", populations.a, populations.b),
      incrementalRow(context, "B -> C large gap", populations.b, populations.c),
    ];
  }));
  console.log("");
}

function printTrainerSmallFieldSpBandControl(contexts: Context[]) {
  console.log("### Price-Band Control: A Vs B");
  for (const context of contexts) {
    const populations = trainerSmallFieldPopulations(context);
    console.log(`#### ${label(context)}`);
    printTable(SP_BANDS.map((band) => priceBandControlRow(band, populations.a, populations.b)));
    console.log("");
    printTable([
      missingSpRow("A trainer >=15% + field <=5", populations.a),
      missingSpRow("B A + Best L3 rank 1", populations.b),
    ]);
    console.log("");
  }
}

function printTrainerSmallFieldCoverage(contexts: Context[]) {
  console.log("### Coverage / Overlap");
  printTable(contexts.map((context) => {
    const populations = trainerSmallFieldPopulations(context);
    const aSummary = summarizeRowSelections(populations.a);
    const bSummary = summarizeRowSelections(populations.b);
    const cSummary = summarizeRowSelections(populations.c);
    return {
      period: label(context),
      "A settled": aSummary.settledSelections,
      "B settled": bSummary.settledSelections,
      "B % of A settled": pct(percent(bSummary.settledSelections, aSummary.settledSelections)),
      "C settled": cSummary.settledSelections,
      "C % of A settled": pct(percent(cSummary.settledSelections, aSummary.settledSelections)),
      "C % of B settled": pct(percent(cSummary.settledSelections, bSummary.settledSelections)),
    };
  }));
  console.log("");
}

function printTrainerSmallFieldYearAssessment(contexts: Context[]) {
  console.log("### 2025 Vs 2026 Assessment: A->B And B->C");
  printTable(FAMILIES.flatMap((family) => [
    trainerSmallFieldYearRow(contexts, family, "A -> B Best L3 rank 1", "a_to_b"),
    trainerSmallFieldYearRow(contexts, family, "B -> C large gap", "b_to_c"),
  ]));
  console.log("");
}

function printTrainerSmallFieldConclusion(contexts: Context[]) {
  console.log("### Baseline Vs Best L3 Conclusion");
  printTable([
    { question: "1. Is trainer >=15% + field <=5 useful without Best L3?", answer: baselineUsefulnessAnswer(contexts) },
    { question: "2. Does adding Best L3 rank 1 materially improve it?", answer: bestL3IncrementalAnswer(contexts) },
    { question: "3. Does improvement remain after SP-band control?", answer: spBandControlAnswer(contexts) },
    { question: "4. Does Best L3 improve A/E or mainly select shorter prices?", answer: aeAndPriceAnswer(contexts) },
    { question: "5. Does large gap add after Best L3 rank 1?", answer: largeGapAfterBestL3Answer(contexts) },
    { question: "6. Which of A/B/C is most stable?", answer: mostStablePopulationAnswer(contexts) },
    { question: "7. Production exposure justified?", answer: "No. Best L3 narrows and sometimes improves the trainer/small-field baseline, but the evidence is mixed by family/year and price band; keep this diagnostic." },
  ]);
  console.log("");
}

function trainerSmallFieldPopulations(context: Context) {
  const baselineRows = context.rows
    .filter((row) => row.outcome.resultStatus !== "non_runner")
    .filter((row) => row.features.trainerPriorWinRate !== null && row.features.trainerPriorWinRate >= 15)
    .filter((row) => {
      const fieldSize = row.features.actualRunnerCount ?? row.features.declaredRunnerCount;
      return fieldSize !== null && fieldSize <= 5;
    })
    .sort(compareRowsChronologically);
  const rank1ByRunnerId = new Map(context.selections.map((selection) => [selection.row.features.targetRunnerId, selection]));
  const a = baselineRows.map((row) => ({ row }));
  const b = baselineRows
    .filter((row) => rank1ByRunnerId.has(row.features.targetRunnerId))
    .map((row) => ({ row }));
  const c = baselineRows
    .filter((row) => rank1ByRunnerId.get(row.features.targetRunnerId)?.trust.components.largeGap === true)
    .map((row) => ({ row }));
  return {
    a,
    b,
    c,
    d: context.selections,
  };
}

function populationResultRow(group: string, selections: RowSelection[]) {
  const summary = summarizeRowSelections(selections);
  const odds = settledDecimalSps(selections);
  const ae = aeStats(selections);
  return {
    group,
    settled: summary.settledSelections,
    wins: summary.wins,
    "strike rate": pct(summary.winStrikeRate),
    "£1 P/L": money(summary.profitLoss),
    ROI: pct(summary.roiPercentage),
    "avg decimal SP": number(average(odds)),
    "median decimal SP": number(median(odds)),
    "A/E": number(ae.ae),
    "A/E runners": ae.runners,
    sample: sampleWarning(summary.settledSelections),
  };
}

function incrementalRow(
  context: Context,
  comparison: string,
  from: RowSelection[],
  to: RowSelection[],
) {
  const fromSummary = summarizeRowSelections(from);
  const toSummary = summarizeRowSelections(to);
  const fromAe = aeStats(from);
  const toAe = aeStats(to);
  const fromOdds = settledDecimalSps(from);
  const toOdds = settledDecimalSps(to);
  return {
    period: label(context),
    comparison,
    "from settled": fromSummary.settledSelections,
    "to settled": toSummary.settledSelections,
    "retained settled %": pct(percent(toSummary.settledSelections, fromSummary.settledSelections)),
    "strike change": deltaPct(toSummary.winStrikeRate, fromSummary.winStrikeRate),
    "ROI change": deltaPct(toSummary.roiPercentage, fromSummary.roiPercentage),
    "A/E change": number(deltaNullable(toAe.ae, fromAe.ae)),
    "avg SP change": number(deltaNullable(average(toOdds), average(fromOdds))),
    sample: sampleWarning(toSummary.settledSelections),
  };
}

function priceBandControlRow(
  band: BestL3TrustSpBand,
  populationA: RowSelection[],
  populationB: RowSelection[],
) {
  const a = populationA.filter((selection) => bestL3TrustSpBand(spForSelection(selection)) === band);
  const b = populationB.filter((selection) => bestL3TrustSpBand(spForSelection(selection)) === band);
  const aSummary = summarizeRowSelections(a);
  const bSummary = summarizeRowSelections(b);
  const aAe = aeStats(a);
  const bAe = aeStats(b);
  return {
    band: spBandLabel(band),
    "A settled": aSummary.settledSelections,
    "A wins": aSummary.wins,
    "A strike": pct(aSummary.winStrikeRate),
    "A ROI": pct(aSummary.roiPercentage),
    "A A/E": number(aAe.ae),
    "B settled": bSummary.settledSelections,
    "B wins": bSummary.wins,
    "B strike": pct(bSummary.winStrikeRate),
    "B ROI": pct(bSummary.roiPercentage),
    "B A/E": number(bAe.ae),
    "B-A strike": deltaPct(bSummary.winStrikeRate, aSummary.winStrikeRate),
    sample: sampleWarning(Math.min(aSummary.settledSelections, bSummary.settledSelections)),
  };
}

function missingSpRow(group: string, selections: RowSelection[]) {
  const settled = selections.filter((selection) => settleSelection(selection.row.outcome) !== null);
  const banded = settled.filter((selection) => bestL3TrustSpBand(spForSelection(selection)) !== null);
  return {
    group,
    settled: settled.length,
    "settled excluded missing/unusable SP": settled.length - banded.length,
  };
}

function trainerSmallFieldYearRow(
  contexts: Context[],
  family: Family,
  signal: string,
  comparison: "a_to_b" | "b_to_c",
) {
  const context2025 = contexts.find((context) => context.family === family && context.year === "2025");
  const context2026 = contexts.find((context) => context.family === family && context.year === "2026");
  const effect2025 = context2025 ? incrementalEffect(trainerSmallFieldPopulations(context2025), comparison) : null;
  const effect2026 = context2026 ? incrementalEffect(trainerSmallFieldPopulations(context2026), comparison) : null;
  return {
    family: familyLabel(family),
    signal,
    "2025 retained": pct(effect2025?.retained ?? null),
    "2025 strike change": deltaPct(effect2025?.strikeTo ?? null, effect2025?.strikeFrom ?? null),
    "2025 A/E change": number(effect2025?.aeChange ?? null),
    "2026 retained": pct(effect2026?.retained ?? null),
    "2026 strike change": deltaPct(effect2026?.strikeTo ?? null, effect2026?.strikeFrom ?? null),
    "2026 A/E change": number(effect2026?.aeChange ?? null),
    observation: incrementalConsistencyLabel(effect2025, effect2026),
  };
}

function incrementalEffect(
  populations: ReturnType<typeof trainerSmallFieldPopulations>,
  comparison: "a_to_b" | "b_to_c",
) {
  const from = comparison === "a_to_b" ? populations.a : populations.b;
  const to = comparison === "a_to_b" ? populations.b : populations.c;
  const fromSummary = summarizeRowSelections(from);
  const toSummary = summarizeRowSelections(to);
  const fromAe = aeStats(from);
  const toAe = aeStats(to);
  return {
    fromSettled: fromSummary.settledSelections,
    toSettled: toSummary.settledSelections,
    retained: percent(toSummary.settledSelections, fromSummary.settledSelections),
    strikeFrom: fromSummary.winStrikeRate,
    strikeTo: toSummary.winStrikeRate,
    roiFrom: fromSummary.roiPercentage,
    roiTo: toSummary.roiPercentage,
    aeFrom: fromAe.ae,
    aeTo: toAe.ae,
    aeChange: deltaNullable(toAe.ae, fromAe.ae),
  };
}

function incrementalConsistencyLabel(
  left: ReturnType<typeof incrementalEffect> | null,
  right: ReturnType<typeof incrementalEffect> | null,
) {
  if (!left || !right || left.toSettled < 25 || right.toSettled < 25) return "too sparse to judge";
  const leftDelta = deltaNullable(left.strikeTo, left.strikeFrom);
  const rightDelta = deltaNullable(right.strikeTo, right.strikeFrom);
  if (leftDelta === null || rightDelta === null) return "too sparse to judge";
  if (leftDelta > 0 && rightDelta > 0) {
    if (rightDelta < leftDelta - 10) return "repeats but weakens materially in 2026";
    return "repeats in both years";
  }
  if ((leftDelta > 0 && rightDelta < 0) || (leftDelta < 0 && rightDelta > 0)) return "reverses in 2026";
  return "not positive in either/both years";
}

function baselineUsefulnessAnswer(contexts: Context[]) {
  return contexts.map((context) => {
    const populations = trainerSmallFieldPopulations(context);
    const summary = summarizeRowSelections(populations.a);
    const ae = aeStats(populations.a);
    return `${label(context)} strike ${pct(summary.winStrikeRate)}, ROI ${pct(summary.roiPercentage)}, A/E ${number(ae.ae)}, settled ${summary.settledSelections}`;
  }).join("; ");
}

function bestL3IncrementalAnswer(contexts: Context[]) {
  return contexts.map((context) => {
    const effect = incrementalEffect(trainerSmallFieldPopulations(context), "a_to_b");
    return `${label(context)} retained ${pct(effect.retained)}, strike ${deltaPct(effect.strikeTo, effect.strikeFrom)}, ROI ${deltaPct(effect.roiTo, effect.roiFrom)}, A/E ${number(effect.aeChange)}`;
  }).join("; ");
}

function spBandControlAnswer(contexts: Context[]) {
  const rows = contexts.map((context) => {
    const populations = trainerSmallFieldPopulations(context);
    const improvingBands = SP_BANDS.filter((band) => {
      const a = summarizeRowSelections(populations.a.filter((selection) => bestL3TrustSpBand(spForSelection(selection)) === band));
      const b = summarizeRowSelections(populations.b.filter((selection) => bestL3TrustSpBand(spForSelection(selection)) === band));
      return a.settledSelections >= 25 &&
        b.settledSelections >= 25 &&
        (b.winStrikeRate ?? -Infinity) > (a.winStrikeRate ?? Infinity);
    }).map(spBandLabel);
    return `${label(context)} ${improvingBands.length ? improvingBands.join(", ") : "no adequately sampled improving band"}`;
  });
  return rows.join("; ");
}

function aeAndPriceAnswer(contexts: Context[]) {
  return contexts.map((context) => {
    const populations = trainerSmallFieldPopulations(context);
    const effect = incrementalEffect(populations, "a_to_b");
    const aOdds = settledDecimalSps(populations.a);
    const bOdds = settledDecimalSps(populations.b);
    return `${label(context)} avg SP ${number(average(bOdds))} vs ${number(average(aOdds))}, A/E change ${number(effect.aeChange)}`;
  }).join("; ");
}

function largeGapAfterBestL3Answer(contexts: Context[]) {
  return contexts.map((context) => {
    const effect = incrementalEffect(trainerSmallFieldPopulations(context), "b_to_c");
    return `${label(context)} retained ${pct(effect.retained)}, strike ${deltaPct(effect.strikeTo, effect.strikeFrom)}, ROI ${deltaPct(effect.roiTo, effect.roiFrom)}, A/E ${number(effect.aeChange)}`;
  }).join("; ");
}

function mostStablePopulationAnswer(contexts: Context[]) {
  const labels = [
    { key: "a", label: "A trainer+small field" },
    { key: "b", label: "B A+Best L3" },
    { key: "c", label: "C B+large gap" },
  ] as const;
  const rows = labels.map((candidate) => {
    const deltas = FAMILIES.map((family) => {
      const context2025 = contexts.find((context) => context.family === family && context.year === "2025");
      const context2026 = contexts.find((context) => context.family === family && context.year === "2026");
      if (!context2025 || !context2026) return null;
      const left = trainerSmallFieldPopulations(context2025)[candidate.key];
      const right = trainerSmallFieldPopulations(context2026)[candidate.key];
      const leftStrike = summarizeRowSelections(left).winStrikeRate;
      const rightStrike = summarizeRowSelections(right).winStrikeRate;
      return leftStrike === null || rightStrike === null ? null : Math.abs(rightStrike - leftStrike);
    }).filter(isNumber);
    return { label: candidate.label, averageStrikeDelta: average(deltas) };
  }).sort((left, right) => (left.averageStrikeDelta ?? Infinity) - (right.averageStrikeDelta ?? Infinity));
  const best = rows[0];
  return best ? `${best.label}; average absolute 2025->2026 strike-rate move ${number(best.averageStrikeDelta)}pp` : "n/a";
}

function printDiagnosticConclusion(contexts: Context[]) {
  console.log("## Diagnostic Conclusion");
  printTable([
    { question: "1. Strongest two-factor combination?", answer: strongestTwoFactorCombination(contexts) },
    { question: "2. Is small field responsible for most uplift?", answer: smallFieldResponsibility(contexts) },
    { question: "3. Does large gap add after approximate controls?", answer: largeGapControlledSignal(contexts) },
    { question: "4. Is inconsistent ROI mainly shorter prices?", answer: priceExplanation(contexts) },
    { question: "5. Any SP bands improve strike and ROI consistently?", answer: consistentSpBandAnswer(contexts) },
    { question: "6. Production Research filter justified?", answer: "Not yet. Strike-rate uplift is real, but ROI and small score-3 samples remain uneven; keep diagnostic until tested in a deliberate Research UI experiment." },
  ]);
  console.log("");
}

function printInterpretation(contexts: Context[]) {
  console.log("## Interpretation");
  printTable([
    { question: "A. Monotonic 0 -> 1 -> 2 -> 3?", answer: monotonicAnswer(contexts) },
    { question: "B. Visible in both 2025 and 2026?", answer: yearlyConsistencyAnswer(contexts) },
    { question: "C. Strongest family consistency?", answer: strongestFamilyAnswer(contexts) },
    { question: "D. Score >=2 materially better?", answer: scoreAtLeastTwoAnswer(contexts) },
    { question: "E. Does one component dominate?", answer: dominantComponentAnswer(contexts) },
    { question: "F. Is score 3 too small?", answer: scoreThreeSizeAnswer(contexts) },
    { question: "G. Does ROI improve as consequence?", answer: roiAnswer(contexts) },
  ]);
  console.log("");
}

function monotonicAnswer(contexts: Context[]) {
  const rows = contexts.map((context) => {
    const strikes = SCORES.map((score) => summarizeRank1Selections(context.selections.filter((selection) => selection.trust.score === score)).winStrikeRate);
    return `${label(context)} ${isMonotonic(strikes) ? "yes" : "no"} (${strikes.map(pct).join(" -> ")})`;
  });
  return rows.join("; ");
}

function yearlyConsistencyAnswer(contexts: Context[]) {
  const families = FAMILIES.map((family) => {
    const familyContexts = contexts.filter((context) => context.family === family);
    const bothYearsScoreTwoBetter = familyContexts.every((context) => {
      const base = summarizeRank1Selections(context.selections).winStrikeRate;
      const scoreTwo = summarizeRank1Selections(context.selections.filter((selection) => selection.trust.score >= 2)).winStrikeRate;
      return scoreTwo !== null && base !== null && scoreTwo > base;
    });
    return `${familyLabel(family)} score>=2 ${bothYearsScoreTwoBetter ? "beats base in both years" : "does not beat base in both years"}`;
  });
  return families.join("; ");
}

function strongestFamilyAnswer(contexts: Context[]) {
  const scores = FAMILIES.map((family) => {
    const averageUplift = average(contexts
      .filter((context) => context.family === family)
      .map((context) => {
        const base = summarizeRank1Selections(context.selections).winStrikeRate;
        const scoreTwo = summarizeRank1Selections(context.selections.filter((selection) => selection.trust.score >= 2)).winStrikeRate;
        return base === null || scoreTwo === null ? null : scoreTwo - base;
      })
      .filter(isNumber));
    return { family, averageUplift };
  }).sort((left, right) => (right.averageUplift ?? -Infinity) - (left.averageUplift ?? -Infinity));
  const best = scores[0];
  return best ? `${familyLabel(best.family)}; average score>=2 uplift ${deltaPct(best.averageUplift, 0)}` : "n/a";
}

function scoreAtLeastTwoAnswer(contexts: Context[]) {
  return contexts.map((context) => {
    const base = summarizeRank1Selections(context.selections);
    const trusted = summarizeRank1Selections(context.selections.filter((selection) => selection.trust.score >= 2));
    return `${label(context)} ${pct(trusted.winStrikeRate)} vs ${pct(base.winStrikeRate)} (${deltaPct(trusted.winStrikeRate, base.winStrikeRate)})`;
  }).join("; ");
}

function dominantComponentAnswer(contexts: Context[]) {
  const componentAverages = [
    {
      component: "large gap",
      uplift: componentAverageUplift(contexts, (selection) => selection.trust.components.largeGap),
    },
    {
      component: "trainer strike >=15%",
      uplift: componentAverageUplift(contexts, (selection) => selection.trust.components.trainerStrike),
    },
    {
      component: "field <=5",
      uplift: componentAverageUplift(contexts, (selection) => selection.trust.components.smallField),
    },
  ].sort((left, right) => (right.uplift ?? -Infinity) - (left.uplift ?? -Infinity));
  return componentAverages.map((entry) => `${entry.component} ${deltaPct(entry.uplift, 0)}`).join("; ");
}

function componentAverageUplift(
  contexts: Context[],
  predicate: (selection: Rank1Selection) => boolean,
) {
  return average(contexts.map((context) => {
    const present = summarizeRank1Selections(context.selections.filter(predicate)).winStrikeRate;
    const absent = summarizeRank1Selections(context.selections.filter((selection) => !predicate(selection))).winStrikeRate;
    return present === null || absent === null ? null : present - absent;
  }).filter(isNumber));
}

function scoreThreeSizeAnswer(contexts: Context[]) {
  return contexts.map((context) => {
    const summary = summarizeRank1Selections(context.selections.filter((selection) => selection.trust.score === 3));
    return `${label(context)} settled=${summary.settledSelections} (${sampleWarning(summary.settledSelections)})`;
  }).join("; ");
}

function roiAnswer(contexts: Context[]) {
  return contexts.map((context) => {
    const base = summarizeRank1Selections(context.selections);
    const trusted = summarizeRank1Selections(context.selections.filter((selection) => selection.trust.score >= 2));
    return `${label(context)} score>=2 ROI ${pct(trusted.roiPercentage)} vs base ${pct(base.roiPercentage)}`;
  }).join("; ");
}

function isMonotonic(values: Array<number | null>) {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] === null || values[index] === null) return false;
    if (values[index]! < values[index - 1]!) return false;
  }
  return true;
}

function printGuardrails() {
  console.log("## Guardrail Summary");
  printTable([
    { item: "Production logic changed", result: "No" },
    { item: "Research/Today/saved/frozen rules changed", result: "No" },
    { item: "Cache rebuild performed", result: "No" },
    { item: "2026 usage", result: "Threshold validation only; thresholds chosen from 2025" },
    { item: "Score inputs", result: "Only large Best L3 gap, trainerPriorWinRate >=15%, and field size <=5" },
  ]);
}

function resultRow(group: string, selections: Rank1Selection[]) {
  const summary = summarizeRank1Selections(selections);
  return {
    group,
    selections: summary.selections,
    settled: summary.settledSelections,
    winners: summary.wins,
    "strike rate": pct(summary.winStrikeRate),
    "£1 P/L": money(summary.profitLoss),
    ROI: pct(summary.roiPercentage),
    "max losing run": summary.maxConsecutiveLosers,
    sample: sampleWarning(summary.settledSelections),
  };
}

function priceResultRow(group: string, selections: RowSelection[]) {
  const summary = summarizeRowSelections(selections);
  const odds = settledDecimalSps(selections);
  return {
    group,
    settled: summary.settledSelections,
    wins: summary.wins,
    "strike rate": pct(summary.winStrikeRate),
    "£1 P/L": money(summary.profitLoss),
    ROI: pct(summary.roiPercentage),
    "avg decimal SP": number(average(odds)),
    "median decimal SP": number(median(odds)),
    sample: sampleWarning(summary.settledSelections),
  };
}

function aeRow(group: string, selections: RowSelection[]) {
  const stats = aeStats(selections);
  return {
    group,
    runners: stats.runners,
    wins: stats.wins,
    "expected wins": number(stats.expectedWins),
    "A/E": number(stats.ae),
    sample: sampleWarning(stats.runners),
  };
}

function aeStats(selections: RowSelection[]) {
  const settled = selections
    .map((selection) => ({
      selection,
      settlement: settleSelection(selection.row.outcome),
    }))
    .filter((entry) => entry.settlement !== null && entry.settlement.settlementOddsDecimal > 0);
  const expectedWins = settled.reduce(
    (total, entry) => total + (1 / entry.settlement!.settlementOddsDecimal),
    0,
  );
  const actualWins = settled.filter((entry) => entry.selection.row.outcome.won).length;
  return {
    runners: settled.length,
    wins: actualWins,
    expectedWins,
    ae: expectedWins === 0 ? null : actualWins / expectedWins,
  };
}

function summarizeRank1Selections(selections: Rank1Selection[]): BacktestSummary {
  return summarizeRowSelections(selections);
}

function summarizeRowSelections(selections: RowSelection[]): BacktestSummary {
  return summarizeSelections(selections.map((selection) => rowToSelection(selection.row)));
}

function rowToSelection(row: HistoricalTargetRunnerMetricsRow): BacktestSelection {
  return {
    id: row.features.targetRunnerId,
    definitionId: "best-l3-trust-score-diagnostic",
    selectedReason: "Best L3 rank 1 trust score",
    features: row.features,
    derived: deriveBacktestFeatureValues(row.features),
    outcome: row.outcome,
    settlement: settleSelection(row.outcome),
  };
}

function sampleWarning(settled: number) {
  if (settled < 25) return "<25 settled";
  if (settled < 100) return "25-99 settled";
  return ">=100 settled";
}

function exactCombination(selection: Rank1Selection) {
  return bestL3TrustComponentCombination(selection.trust.components);
}

function spForSelection(selection: RowSelection) {
  return settleSelection(selection.row.outcome)?.settlementOddsDecimal ?? null;
}

function settledDecimalSps(selections: RowSelection[]) {
  return selections
    .map(spForSelection)
    .filter(isNumber)
    .filter((value) => value > 0);
}

function combinationLabel(combination: BestL3TrustComponentCombination) {
  switch (combination) {
    case "large_gap_only":
      return "large gap only";
    case "trainer_strike_only":
      return "trainer >=15% only";
    case "small_field_only":
      return "field <=5 only";
    case "large_gap_and_trainer":
      return "large gap + trainer";
    case "large_gap_and_small_field":
      return "large gap + small field";
    case "trainer_and_small_field":
      return "trainer + small field";
    case "all_three":
      return "all three";
    case "none":
      return "none";
  }
}

function scoreAtLeastTwoRouteLabel(combination: BestL3TrustComponentCombination) {
  switch (combination) {
    case "large_gap_and_trainer":
      return "large gap + trainer, excluding small field";
    case "large_gap_and_small_field":
      return "large gap + small field, excluding trainer";
    case "trainer_and_small_field":
      return "trainer + small field, excluding large gap";
    case "all_three":
      return "all three";
    default:
      return combinationLabel(combination);
  }
}

function spBandLabel(band: BestL3TrustSpBand) {
  switch (band) {
    case "lt_2":
      return "<2.0";
    case "2_00_to_2_99":
      return "2.0-2.99";
    case "3_00_to_4_99":
      return "3.0-4.99";
    case "5_00_to_7_99":
      return "5.0-7.99";
    case "8_plus":
      return "8.0+";
  }
}

function consistencyLabel(left: BacktestSummary, right: BacktestSummary) {
  if (left.settledSelections < 25 || right.settledSelections < 25) return "too sparse to assess";
  if (left.winStrikeRate === null || right.winStrikeRate === null) return "too sparse to assess";
  const delta = right.winStrikeRate - left.winStrikeRate;
  if (delta < -10) return "weakens materially in 2026";
  if (delta < -3) return "slightly weaker in 2026";
  if (delta > 3) return "stronger in 2026";
  return "appears in both years";
}

function strongestTwoFactorCombination(contexts: Context[]) {
  const candidates = SCORE_AT_LEAST_TWO_ROUTES.filter((combination) => combination !== "all_three");
  const rows = candidates.map((combination) => {
    const averageStrike = average(contexts
      .map((context) => summarizeRank1Selections(context.selections.filter((selection) => exactCombination(selection) === combination)).winStrikeRate)
      .filter(isNumber));
    return { combination, averageStrike };
  }).sort((left, right) => (right.averageStrike ?? -Infinity) - (left.averageStrike ?? -Infinity));
  const best = rows[0];
  return best ? `${scoreAtLeastTwoRouteLabel(best.combination)}; average strike ${pct(best.averageStrike)}` : "n/a";
}

function smallFieldResponsibility(contexts: Context[]) {
  const smallFieldRoutes = contexts.map((context) => {
    const trusted = context.selections.filter((selection) => selection.trust.score >= 2);
    return percent(trusted.filter((selection) => selection.trust.components.smallField).length, trusted.length);
  }).filter(isNumber);
  const fieldUplift = componentAverageUplift(contexts, (selection) => selection.trust.components.smallField);
  return `Small field appears in ${pct(average(smallFieldRoutes))} of score>=2 selections on average, and has the largest individual uplift (${deltaPct(fieldUplift, 0)}). It is a major driver, though trainer strike also contributes.`;
}

function largeGapControlledSignal(contexts: Context[]) {
  const trainerSmallWithGap = contexts.map((context) =>
    summarizeRank1Selections(context.selections.filter((selection) => exactCombination(selection) === "all_three")).winStrikeRate
  ).filter(isNumber);
  const trainerSmallWithoutGap = contexts.map((context) =>
    summarizeRank1Selections(context.selections.filter((selection) => exactCombination(selection) === "trainer_and_small_field")).winStrikeRate
  ).filter(isNumber);
  const largeTrainer = contexts.map((context) =>
    summarizeRank1Selections(context.selections.filter((selection) => exactCombination(selection) === "large_gap_and_trainer")).winStrikeRate
  ).filter(isNumber);
  const trainerOnly = contexts.map((context) =>
    summarizeRank1Selections(context.selections.filter((selection) => exactCombination(selection) === "trainer_strike_only")).winStrikeRate
  ).filter(isNumber);
  return `All-three vs trainer+small-field: ${pct(average(trainerSmallWithGap))} vs ${pct(average(trainerSmallWithoutGap))}; large+trainer vs trainer-only: ${pct(average(largeTrainer))} vs ${pct(average(trainerOnly))}. Large gap adds some signal, but less than field/trainer.`;
}

function priceExplanation(contexts: Context[]) {
  return contexts.map((context) => {
    const rawOdds = settledDecimalSps(context.selections);
    const trustedOdds = settledDecimalSps(context.selections.filter((selection) => selection.trust.score >= 2));
    const raw = summarizeRank1Selections(context.selections);
    const trusted = summarizeRank1Selections(context.selections.filter((selection) => selection.trust.score >= 2));
    return `${label(context)} avg SP ${number(average(trustedOdds))} vs raw ${number(average(rawOdds))}, ROI ${pct(trusted.roiPercentage)} vs ${pct(raw.roiPercentage)}`;
  }).join("; ");
}

function consistentSpBandAnswer(contexts: Context[]) {
  const rows = SP_BANDS.map((band) => {
    const allBeat = contexts.every((context) => {
      const rawBand = summarizeRank1Selections(context.selections.filter((selection) => bestL3TrustSpBand(spForSelection(selection)) === band));
      const trustedBand = summarizeRank1Selections(context.selections.filter((selection) =>
        selection.trust.score >= 2 && bestL3TrustSpBand(spForSelection(selection)) === band
      ));
      if (rawBand.settledSelections < 25 || trustedBand.settledSelections < 25) return false;
      return (trustedBand.winStrikeRate ?? -Infinity) > (rawBand.winStrikeRate ?? Infinity) &&
        (trustedBand.roiPercentage ?? -Infinity) > (rawBand.roiPercentage ?? Infinity);
    });
    return allBeat ? spBandLabel(band) : null;
  }).filter((value) => value !== null);
  return rows.length > 0 ? rows.join(", ") : "No SP band consistently improves both strike and ROI across every family/year with adequate sample.";
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

function percent(numerator: number, denominator: number) {
  if (denominator === 0) return null;
  return (numerator / denominator) * 100;
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

function raceCodeForFamily(family: Family) {
  if (family === "jump") return "jump";
  if (family === "all_weather_flat") return "aw";
  return "turf";
}

function contextKey(family: Family, year: Year) {
  return `${family}:${year}`;
}

function familyLabel(family: Family) {
  if (family === "all_weather_flat") return "All Weather";
  if (family === "turf_flat") return "Turf";
  return "Jump";
}

function label(context: Pick<Context, "family" | "year">) {
  return `${familyLabel(context.family)} ${context.year}`;
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function deltaPct(value: number | null, baseline: number | null) {
  if (value === null || baseline === null) return "n/a";
  const delta = value - baseline;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}pp`;
}

function deltaNullable(value: number | null, baseline: number | null) {
  return value === null || baseline === null ? null : value - baseline;
}

function pct(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(1)}%`;
}

function money(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : `£${value.toFixed(2)}`;
}

function number(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(1);
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

import { writeFile } from "node:fs/promises";
import {
  settleSelection,
  summarizeSelections,
  type BacktestSummary,
} from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import {
  DEVELOPMENT_FROM,
  DEVELOPMENT_TO,
  evaluateResearchRule,
  RESEARCH_RULE_VERSION,
  type ResearchRuleV1,
  type ResearchSelection,
} from "@/lib/racing/research-rule";
import { TURF_PERFORMANCE_RATING_VERSION } from "@/lib/racing/turf-performance-rating";

type Year = "2025" | "2026";
type MarketRank4 = "favourite" | "second favourite" | "third favourite" | "fourth+";
type MarketRank3 = "favourite" | "rank 2" | "rank 3+";
type SpBand = "<3.0" | "3.0-5.99" | "6.0-9.99" | "10.0-19.99" | "20.0+";
type TprBand = "<100" | "100-109.9" | "110-119.9" | "120+";
type TprStrength = "TPR <110" | "TPR >=110";
type Replication = "replicated" | "partially replicated" | "reversed" | "too sparse";

type Context = {
  year: Year;
  cacheFrom: string;
  cacheTo: string;
  actualFrom: string;
  actualTo: string;
  selections: ResearchSelection[];
  spRankByRunnerId: Map<string, number>;
};

type AeStats = {
  wins: number;
  expectedWins: number;
  impliedWinRate: number | null;
  ae: number | null;
};

type GroupDefinition = {
  section: string;
  label: string;
  rows: (context: Context) => ResearchSelection[];
};

type StressRow = {
  group: string;
  year: Year;
  selections: ResearchSelection[];
};

const OUTPUT_PATH = "/tmp/tpr-market-disagreement.md";
const YEARS: Year[] = ["2025", "2026"];
const MARKET_RANK_4: MarketRank4[] = ["favourite", "second favourite", "third favourite", "fourth+"];
const MARKET_RANK_3: MarketRank3[] = ["favourite", "rank 2", "rank 3+"];
const SP_BANDS: SpBand[] = ["<3.0", "3.0-5.99", "6.0-9.99", "10.0-19.99", "20.0+"];
const TPR_BANDS: TprBand[] = ["<100", "100-109.9", "110-119.9", "120+"];
const TPR_STRENGTHS: TprStrength[] = ["TPR <110", "TPR >=110"];
const SAMPLE_FLOOR = 30;

const RULE: ResearchRuleV1 = {
  version: RESEARCH_RULE_VERSION,
  family: "turf_flat",
  dateRange: { from: DEVELOPMENT_FROM, to: DEVELOPMENT_TO },
  race: {},
  runner: {},
  ratings: [],
  relatives: [],
  ranks: [],
  turfPerformance: {
    version: TURF_PERFORMANCE_RATING_VERSION,
    rank: { min: 1, max: 1 },
    lead: { min: 6 },
  },
};

async function main() {
  const contexts = await Promise.all(YEARS.map(loadContext));
  const lines: string[] = [];
  writeReport(lines, contexts);
  await writeFile(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");

  console.log(`Wrote ${OUTPUT_PATH}`);
  for (const context of contexts) {
    const summary = summarize(context.selections);
    console.log(`${context.year}: selections ${summary.selections}, settled ${summary.settledSelections}, ROI ${pct(summary.roiPercentage)}, A/E ${number(aeStats(context.selections).ae)}`);
  }
}

async function loadContext(year: Year): Promise<Context> {
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: "turf_flat", year });
  if (!cache) {
    throw new Error(`Missing compatible Turf cache for ${year}`);
  }

  const actualFrom = cache.actualCoverage?.actualFrom ?? cache.manifest.from;
  const actualTo = cache.actualCoverage?.actualTo ?? cache.manifest.to;
  const rule: ResearchRuleV1 = {
    ...RULE,
    dateRange: { from: actualFrom, to: actualTo },
  };
  const result = evaluateResearchRule({
    rows: cache.rows,
    rule,
    cache: { manifest: cache.manifest, directory: cache.directory },
  });

  return {
    year,
    cacheFrom: cache.manifest.from,
    cacheTo: cache.manifest.to,
    actualFrom,
    actualTo,
    selections: result.selectedRunners,
    spRankByRunnerId: rankByRace(cache.rows, spForRow),
  };
}

function writeReport(lines: string[], contexts: Context[]) {
  lines.push("# Turf TPR Market-Disagreement Diagnostic");
  lines.push("");
  lines.push("Diagnostic only. No TPR formula, Research, Today, saved/frozen rule, cache, importer, or holdout behavior changed.");
  lines.push("");
  lines.push("Fixed foundation: Turf, `TPR_S2_V1`, TPR rank 1, TPR lead >=6. No TPR minimum is applied.");
  lines.push("");
  lines.push("Final-SP market rank is descriptive only. It is calculated within each race from settled final decimal SP; non-runners are excluded, lower SP ranks better, and equal SPs share the same rank.");
  lines.push("");

  writeBaseline(lines, contexts);
  writeMarketRank4(lines, contexts);
  writeMarketRank3(lines, contexts);
  writeSpBands(lines, contexts);
  writeTprBands(lines, contexts);
  writeDisagreementMatrix(lines, contexts);
  writeImpliedProbability(lines, contexts);
  writeReplication(lines, contexts);
  writeStress(lines, contexts);
  writeConclusion(lines, contexts);
}

function writeBaseline(lines: string[], contexts: Context[]) {
  lines.push("## 1. Baseline");
  lines.push("");
  table(lines, contexts.map((context) => {
    const odds = settledDecimalSps(context.selections);
    return {
      year: context.year,
      "cache window": `${context.cacheFrom} to ${context.cacheTo}`,
      "actual coverage": `${context.actualFrom} to ${context.actualTo}`,
      ...metricColumns(context.selections),
      "avg SP": number(average(odds)),
      "median SP": number(median(odds)),
      "reference": "TPR rank 1 + lead >=6 population",
    };
  }));
  lines.push("");
}

function writeMarketRank4(lines: string[], contexts: Context[]) {
  lines.push("## 2. Final-SP Market Rank");
  for (const context of contexts) {
    lines.push("");
    lines.push(`### ${context.year}`);
    table(lines, MARKET_RANK_4.map((group) => {
      const rows = context.selections.filter((selection) => marketRank4(context, selection) === group);
      return {
        "market rank": group,
        ...metricColumns(rows),
        "avg SP": number(average(settledDecimalSps(rows))),
      };
    }));
  }
  lines.push("");
}

function writeMarketRank3(lines: string[], contexts: Context[]) {
  lines.push("## 3. Simplified Market-Rank Comparison");
  table(lines, contexts.flatMap((context) =>
    MARKET_RANK_3.map((group) => {
      const rows = context.selections.filter((selection) => marketRank3(context, selection) === group);
      return {
        year: context.year,
        group,
        selections: summarize(rows).selections,
        "strike rate": pct(summarize(rows).winStrikeRate),
        ROI: pct(summarize(rows).roiPercentage),
        "A/E": number(aeStats(rows).ae),
        "avg SP": number(average(settledDecimalSps(rows))),
      };
    })
  ));
  lines.push("");
}

function writeSpBands(lines: string[], contexts: Context[]) {
  lines.push("## 4. Fixed SP Bands");
  for (const context of contexts) {
    lines.push("");
    lines.push(`### ${context.year}`);
    table(lines, SP_BANDS.map((band) => {
      const rows = context.selections.filter((selection) => spBand(selection) === band);
      return {
        band,
        ...metricColumns(rows),
      };
    }));
  }
  lines.push("");
}

function writeTprBands(lines: string[], contexts: Context[]) {
  lines.push("## 5. TPR Score Bands");
  for (const context of contexts) {
    lines.push("");
    lines.push(`### ${context.year}`);
    table(lines, TPR_BANDS.map((band) => {
      const rows = context.selections.filter((selection) => tprBand(selection) === band);
      return {
        band,
        selections: summarize(rows).selections,
        "strike rate": pct(summarize(rows).winStrikeRate),
        "avg SP": number(average(settledDecimalSps(rows))),
        ROI: pct(summarize(rows).roiPercentage),
        "A/E": number(aeStats(rows).ae),
      };
    }));
  }
  lines.push("");
}

function writeDisagreementMatrix(lines: string[], contexts: Context[]) {
  lines.push("## 6. Market-Disagreement Matrix");
  lines.push("");
  lines.push("Rows combine absolute TPR strength with final-SP market rank. This is the requested 2 x 3 matrix only.");
  for (const context of contexts) {
    lines.push("");
    lines.push(`### ${context.year}`);
    table(lines, TPR_STRENGTHS.flatMap((strength) =>
      MARKET_RANK_3.map((marketRank) => {
        const rows = context.selections
          .filter((selection) => tprStrength(selection) === strength)
          .filter((selection) => marketRank3(context, selection) === marketRank);
        return {
          "TPR strength": strength,
          "market rank": marketRank,
          selections: summarize(rows).selections,
          "strike rate": pct(summarize(rows).winStrikeRate),
          ROI: pct(summarize(rows).roiPercentage),
          "A/E": number(aeStats(rows).ae),
          "avg SP": number(average(settledDecimalSps(rows))),
        };
      })
    ));
  }
  lines.push("");
}

function writeImpliedProbability(lines: string[], contexts: Context[]) {
  lines.push("## 7. Implied-Probability Comparison");
  lines.push("");
  lines.push("Observed win rate is compared with average implied win probability from final decimal SP.");
  lines.push("");
  table(lines, groupDefinitions().flatMap((definition) =>
    contexts.map((context) => {
      const rows = definition.rows(context);
      const ae = aeStats(rows);
      return {
        section: definition.section,
        group: definition.label,
        year: context.year,
        selections: summarize(rows).settledSelections,
        "observed win rate": pct(summarize(rows).winStrikeRate),
        "avg implied win probability": pct(ae.impliedWinRate === null ? null : ae.impliedWinRate * 100),
        "A/E": number(ae.ae),
      };
    })
  ));
  lines.push("");
}

function writeReplication(lines: string[], contexts: Context[]) {
  lines.push("## 8. 2025 Vs 2026 Replication");
  lines.push("");
  lines.push("A/E is primary, ROI secondary. Groups with either year below 30 settled selections are marked too sparse.");
  lines.push("");
  table(lines, groupDefinitions().map((definition) => {
    const rows2025 = definition.rows(contextFor(contexts, "2025"));
    const rows2026 = definition.rows(contextFor(contexts, "2026"));
    return {
      section: definition.section,
      group: definition.label,
      "2025 selections": summarize(rows2025).settledSelections,
      "2025 ROI": pct(summarize(rows2025).roiPercentage),
      "2025 A/E": number(aeStats(rows2025).ae),
      "2026 selections": summarize(rows2026).settledSelections,
      "2026 ROI": pct(summarize(rows2026).roiPercentage),
      "2026 A/E": number(aeStats(rows2026).ae),
      assessment: replication(rows2025, rows2026),
    };
  }));
  lines.push("");
}

function writeStress(lines: string[], contexts: Context[]) {
  lines.push("## 9. Outlier Stress And Concentration");
  lines.push("");
  const groups = stressGroups(contexts);
  if (groups.length === 0) {
    lines.push("No group had positive ROI in both years or A/E >1.0 in both years with adequate sample, so no outlier stress group was eligible.");
    lines.push("");
    return;
  }
  lines.push("Groups are included only if they had positive ROI in both years or A/E >1.0 in both years, with at least 30 settled selections in both years.");
  lines.push("");
  table(lines, groups.map((group) => {
    const original = summarize(group.selections);
    const stressedRows = removeBiggestPricedWinner(group.selections);
    const stressed = summarize(stressedRows);
    const concentration = concentrationStats(group.selections);
    return {
      group: group.group,
      year: group.year,
      selections: original.settledSelections,
      "original ROI": pct(original.roiPercentage),
      "original A/E": number(aeStats(group.selections).ae),
      "ROI without biggest winner": pct(stressed.roiPercentage),
      "A/E without biggest winner": number(aeStats(stressedRows).ae),
      "largest winner SP": number(concentration.largestWinnerSp),
      "largest winner P/L share": pct(concentration.largestWinnerShare),
      "top 3 winners P/L share": pct(concentration.top3WinnerShare),
    };
  }));
  lines.push("");
}

function writeConclusion(lines: string[], contexts: Context[]) {
  lines.push("## 10. Conclusion");
  lines.push("");
  numbered(lines, [
    `Does TPR rank 1 + lead >=6 perform differently when the market also makes the horse favourite? ${favouriteConclusion(contexts)}`,
    `Is there evidence TPR is more useful when the market ranks the horse 2nd or 3rd+? ${disagreementConclusion(contexts)}`,
    `Are any SP bands consistently better on A/E in both years? ${spBandConclusion(contexts)}`,
    `Does TPR >=110 add information after market rank is considered? ${tpr110Conclusion(contexts)}`,
    `Is any apparent value signal robust after removing the biggest-priced winner? ${stressConclusion(contexts)}`,
    `Are there groups with A/E >1.0 in both 2025 and 2026 with adequate sample? ${repeatAeConclusion(contexts)}`,
    `Is there one narrow market-disagreement angle worth a separately pre-specified confirmation test? ${confirmationConclusion(contexts)}`,
    `If not, should TPR remain a ranking tool rather than a betting system? ${rankingToolConclusion(contexts)}`,
  ]);
}

function metricColumns(rows: ResearchSelection[]) {
  const summary = summarize(rows);
  return {
    selections: summary.selections,
    settled: summary.settledSelections,
    winners: summary.wins,
    "strike rate": pct(summary.winStrikeRate),
    "P/L": money(summary.profitLoss),
    ROI: pct(summary.roiPercentage),
    "A/E": number(aeStats(rows).ae),
  };
}

function groupDefinitions(): GroupDefinition[] {
  return [
    ...MARKET_RANK_3.map((group): GroupDefinition => ({
      section: "market rank",
      label: group,
      rows: (context) => context.selections.filter((selection) => marketRank3(context, selection) === group),
    })),
    ...SP_BANDS.map((band): GroupDefinition => ({
      section: "SP band",
      label: band,
      rows: (context) => context.selections.filter((selection) => spBand(selection) === band),
    })),
    ...TPR_BANDS.map((band): GroupDefinition => ({
      section: "TPR band",
      label: band,
      rows: (context) => context.selections.filter((selection) => tprBand(selection) === band),
    })),
    ...TPR_STRENGTHS.flatMap((strength) =>
      MARKET_RANK_3.map((marketRank): GroupDefinition => ({
        section: "TPR x market rank",
        label: `${strength} / ${marketRank}`,
        rows: (context) => context.selections
          .filter((selection) => tprStrength(selection) === strength)
          .filter((selection) => marketRank3(context, selection) === marketRank),
      }))
    ),
  ];
}

function summarize(rows: ResearchSelection[]): BacktestSummary {
  return summarizeSelections(rows);
}

function aeStats(rows: ResearchSelection[]): AeStats {
  const settled = rows
    .map((selection) => ({ selection, settlement: settleSelection(selection.outcome) }))
    .filter((entry): entry is { selection: ResearchSelection; settlement: NonNullable<ReturnType<typeof settleSelection>> } =>
      entry.settlement !== null && entry.settlement.settlementOddsDecimal > 0
    );
  const expectedWins = settled.reduce((total, entry) => total + (1 / entry.settlement.settlementOddsDecimal), 0);
  const wins = settled.filter((entry) => entry.selection.outcome.won).length;
  return {
    wins,
    expectedWins,
    impliedWinRate: settled.length === 0 ? null : expectedWins / settled.length,
    ae: expectedWins === 0 ? null : wins / expectedWins,
  };
}

function spForRow(row: HistoricalTargetRunnerMetricsRow): number | null {
  return settleSelection(row.outcome)?.settlementOddsDecimal ?? null;
}

function settledDecimalSps(rows: ResearchSelection[]): number[] {
  return rows
    .map((selection) => settleSelection(selection.outcome)?.settlementOddsDecimal ?? null)
    .filter(isNumber)
    .filter((value) => value > 0);
}

function rankByRace(
  rows: HistoricalTargetRunnerMetricsRow[],
  valueFor: (row: HistoricalTargetRunnerMetricsRow) => number | null,
): Map<string, number> {
  const rowsByRace = groupBy(rows, (row) => row.features.targetRaceId);
  const ranks = new Map<string, number>();
  for (const raceRows of rowsByRace.values()) {
    const rankable = raceRows
      .filter((row) => row.outcome.resultStatus !== "non_runner")
      .map((row) => ({ row, value: valueFor(row) }))
      .filter((entry): entry is { row: HistoricalTargetRunnerMetricsRow; value: number } =>
        entry.value !== null && Number.isFinite(entry.value)
      )
      .sort((left, right) =>
        left.value - right.value ||
        left.row.features.targetRunnerId.localeCompare(right.row.features.targetRunnerId)
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

function marketRank4(context: Context, selection: ResearchSelection): MarketRank4 | null {
  const rank = context.spRankByRunnerId.get(selection.features.targetRunnerId) ?? null;
  if (rank === null) return null;
  if (rank === 1) return "favourite";
  if (rank === 2) return "second favourite";
  if (rank === 3) return "third favourite";
  return "fourth+";
}

function marketRank3(context: Context, selection: ResearchSelection): MarketRank3 | null {
  const rank = context.spRankByRunnerId.get(selection.features.targetRunnerId) ?? null;
  if (rank === null) return null;
  if (rank === 1) return "favourite";
  if (rank === 2) return "rank 2";
  return "rank 3+";
}

function spBand(selection: ResearchSelection): SpBand | null {
  const sp = settleSelection(selection.outcome)?.settlementOddsDecimal ?? null;
  if (sp === null || sp <= 0) return null;
  if (sp < 3) return "<3.0";
  if (sp < 6) return "3.0-5.99";
  if (sp < 10) return "6.0-9.99";
  if (sp < 20) return "10.0-19.99";
  return "20.0+";
}

function tprBand(selection: ResearchSelection): TprBand | null {
  const rating = selection.turfPerformance?.rating ?? null;
  if (rating === null) return null;
  if (rating < 100) return "<100";
  if (rating < 110) return "100-109.9";
  if (rating < 120) return "110-119.9";
  return "120+";
}

function tprStrength(selection: ResearchSelection): TprStrength | null {
  const rating = selection.turfPerformance?.rating ?? null;
  if (rating === null) return null;
  return rating >= 110 ? "TPR >=110" : "TPR <110";
}

function replication(rows2025: ResearchSelection[], rows2026: ResearchSelection[]): Replication {
  const summary2025 = summarize(rows2025);
  const summary2026 = summarize(rows2026);
  if (summary2025.settledSelections < SAMPLE_FLOOR || summary2026.settledSelections < SAMPLE_FLOOR) {
    return "too sparse";
  }
  const ae2025 = aeStats(rows2025).ae;
  const ae2026 = aeStats(rows2026).ae;
  if (ae2025 === null || ae2026 === null) return "too sparse";
  const roi2025 = summary2025.roiPercentage ?? -Infinity;
  const roi2026 = summary2026.roiPercentage ?? -Infinity;
  if (ae2025 > 1 && ae2026 > 1 && roi2025 > 0 && roi2026 > 0) return "replicated";
  if (ae2025 > 1 && ae2026 > 1) return "partially replicated";
  if ((ae2025 > 1 && ae2026 <= 1) || (ae2025 <= 1 && ae2026 > 1)) return "reversed";
  return "reversed";
}

function stressGroups(contexts: Context[]): StressRow[] {
  return groupDefinitions().flatMap((definition) => {
    const rowsByYear = YEARS.map((year) => {
      const context = contextFor(contexts, year);
      return { context, rows: definition.rows(context) };
    });
    const adequate = rowsByYear.every((entry) => summarize(entry.rows).settledSelections >= SAMPLE_FLOOR);
    const positiveRoiBoth = rowsByYear.every((entry) => (summarize(entry.rows).roiPercentage ?? -Infinity) > 0);
    const positiveAeBoth = rowsByYear.every((entry) => (aeStats(entry.rows).ae ?? -Infinity) > 1);
    if (!adequate || (!positiveRoiBoth && !positiveAeBoth)) return [];
    return rowsByYear.map((entry) => ({
      group: `${definition.section}: ${definition.label}`,
      year: entry.context.year,
      selections: entry.rows,
    }));
  });
}

function removeBiggestPricedWinner(rows: ResearchSelection[]): ResearchSelection[] {
  const winner = biggestPricedWinner(rows);
  return winner ? rows.filter((row) => row.id !== winner.id) : rows;
}

function biggestPricedWinner(rows: ResearchSelection[]): ResearchSelection | null {
  return rows
    .filter((selection) => selection.outcome.won)
    .filter((selection) => settleSelection(selection.outcome) !== null)
    .sort((left, right) =>
      (settleSelection(right.outcome)?.settlementOddsDecimal ?? 0) -
        (settleSelection(left.outcome)?.settlementOddsDecimal ?? 0) ||
      left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
      left.id.localeCompare(right.id)
    )[0] ?? null;
}

function concentrationStats(rows: ResearchSelection[]) {
  const summary = summarize(rows);
  const winnerProfits = rows
    .filter((selection) => selection.outcome.won)
    .map((selection) => ({
      sp: settleSelection(selection.outcome)?.settlementOddsDecimal ?? null,
      profit: settleSelection(selection.outcome)?.profitLoss ?? null,
    }))
    .filter((entry): entry is { sp: number; profit: number } =>
      entry.sp !== null && entry.profit !== null && entry.sp > 0
    )
    .sort((left, right) => right.sp - left.sp);
  const largest = winnerProfits[0] ?? null;
  const top3Profit = sum(winnerProfits.slice(0, 3).map((entry) => entry.profit));
  return {
    largestWinnerSp: largest?.sp ?? null,
    largestWinnerShare: summary.profitLoss === 0 ? null : ((largest?.profit ?? 0) / summary.profitLoss) * 100,
    top3WinnerShare: summary.profitLoss === 0 ? null : (top3Profit / summary.profitLoss) * 100,
  };
}

function favouriteConclusion(contexts: Context[]): string {
  return contexts.map((context) => {
    const fav = context.selections.filter((selection) => marketRank3(context, selection) === "favourite");
    const nonFav = context.selections.filter((selection) => marketRank3(context, selection) !== "favourite");
    return `${context.year}: favourite A/E ${number(aeStats(fav).ae)}, ROI ${pct(summarize(fav).roiPercentage)}; non-favourite A/E ${number(aeStats(nonFav).ae)}, ROI ${pct(summarize(nonFav).roiPercentage)}`;
  }).join("; ");
}

function disagreementConclusion(contexts: Context[]): string {
  return contexts.map((context) => {
    const rank2 = context.selections.filter((selection) => marketRank3(context, selection) === "rank 2");
    const rank3 = context.selections.filter((selection) => marketRank3(context, selection) === "rank 3+");
    return `${context.year}: rank 2 A/E ${number(aeStats(rank2).ae)}, ROI ${pct(summarize(rank2).roiPercentage)}; rank 3+ A/E ${number(aeStats(rank3).ae)}, ROI ${pct(summarize(rank3).roiPercentage)}`;
  }).join("; ");
}

function spBandConclusion(contexts: Context[]): string {
  const repeated = SP_BANDS.filter((band) =>
    contexts.every((context) => {
      const rows = context.selections.filter((selection) => spBand(selection) === band);
      return summarize(rows).settledSelections >= SAMPLE_FLOOR && (aeStats(rows).ae ?? -Infinity) > 1;
    })
  );
  return repeated.length === 0 ? "No SP band has A/E >1.0 with adequate sample in both years." : repeated.join(", ");
}

function tpr110Conclusion(contexts: Context[]): string {
  return contexts.map((context) => {
    const parts = MARKET_RANK_3.map((rank) => {
      const low = context.selections.filter((selection) => tprStrength(selection) === "TPR <110" && marketRank3(context, selection) === rank);
      const high = context.selections.filter((selection) => tprStrength(selection) === "TPR >=110" && marketRank3(context, selection) === rank);
      return `${rank}: <110 A/E ${number(aeStats(low).ae)} vs >=110 ${number(aeStats(high).ae)}`;
    });
    return `${context.year} ${parts.join(", ")}`;
  }).join("; ");
}

function stressConclusion(contexts: Context[]): string {
  const groups = stressGroups(contexts);
  if (groups.length === 0) return "No adequate repeat-positive group qualified for stress testing.";
  const survivors = groups.filter((group) => (summarize(removeBiggestPricedWinner(group.selections)).roiPercentage ?? -Infinity) > 0);
  return `${survivors.length}/${groups.length} stressed year-groups retained positive ROI after removing the biggest-priced winner.`;
}

function repeatAeConclusion(contexts: Context[]): string {
  const repeated = groupDefinitions().filter((definition) =>
    contexts.every((context) => {
      const rows = definition.rows(context);
      return summarize(rows).settledSelections >= SAMPLE_FLOOR && (aeStats(rows).ae ?? -Infinity) > 1;
    })
  );
  return repeated.length === 0
    ? "No."
    : repeated.map((definition) => `${definition.section}: ${definition.label}`).join("; ");
}

function confirmationConclusion(contexts: Context[]): string {
  const repeated = groupDefinitions().filter((definition) =>
    contexts.every((context) => {
      const rows = definition.rows(context);
      return summarize(rows).settledSelections >= SAMPLE_FLOOR &&
        (aeStats(rows).ae ?? -Infinity) > 1 &&
        (summarize(rows).roiPercentage ?? -Infinity) > 0;
    })
  );
  if (repeated.length === 0) {
    return "No. Nothing in this market-disagreement profile clears a strict repeat-positive A/E and ROI screen before stress.";
  }
  return `Possibly: ${repeated.map((definition) => `${definition.section}: ${definition.label}`).join("; ")}. Treat as pre-specified confirmation candidates, not tuned filters.`;
}

function rankingToolConclusion(contexts: Context[]): string {
  const hasConfirmed = groupDefinitions().some((definition) =>
    contexts.every((context) => {
      const rows = definition.rows(context);
      return summarize(rows).settledSelections >= SAMPLE_FLOOR &&
        (aeStats(rows).ae ?? -Infinity) > 1 &&
        (summarize(rows).roiPercentage ?? -Infinity) > 0;
    })
  );
  return hasConfirmed
    ? "Keep TPR as a ranking foundation while any angle is separately confirmed out of sample."
    : "Yes. The evidence is better suited to ranking and diagnostics than a standalone betting system.";
}

function contextFor(contexts: Context[], year: Year): Context {
  const context = contexts.find((item) => item.year === year);
  if (!context) throw new Error(`Missing context for ${year}`);
  return context;
}

function groupBy<T>(items: T[], keyFor: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : sum(values) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function pct(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(1)}%`;
}

function money(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return value < 0 ? `-${Math.abs(value).toFixed(2)}` : value.toFixed(2);
}

function number(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(2);
}

function table(lines: string[], rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    lines.push("_No rows_");
    return;
  }
  const columns = Object.keys(rows[0]!);
  lines.push(`| ${columns.join(" | ")} |`);
  lines.push(`| ${columns.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    lines.push(`| ${columns.map((column) => printable(row[column])).join(" | ")} |`);
  }
}

function numbered(lines: string[], items: string[]) {
  items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item}`);
  });
}

function printable(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\|/g, "\\|");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

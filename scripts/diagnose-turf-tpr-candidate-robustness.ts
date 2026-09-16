import { writeFile } from "node:fs/promises";
import {
  settleSelection,
  summarizeSelections,
  type BacktestSummary,
} from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import {
  DEVELOPMENT_FROM,
  DEVELOPMENT_TO,
  evaluateResearchRule,
  RESEARCH_RULE_VERSION,
  type ResearchRuleV1,
  type ResearchSelection,
} from "@/lib/racing/research-rule";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";
import { TURF_PERFORMANCE_RATING_VERSION } from "@/lib/racing/turf-performance-rating";

type Year = "2025" | "2026";
type SpBand = "<3.0" | "3.0-5.99" | "6.0-9.99" | "10.0-19.99" | "20.0+";
type FieldSizeBand = "<=5" | "6-8" | "9-12" | "13+";

type Context = {
  year: Year;
  cacheFrom: string;
  cacheTo: string;
  actualFrom: string;
  actualTo: string;
  result: ReturnType<typeof evaluateResearchRule>;
  selections: ResearchSelection[];
};

type AeStats = {
  wins: number;
  expectedWins: number;
  ae: number | null;
};

type BiggestWinner = {
  selection: ResearchSelection | null;
  sp: number | null;
  profit: number;
};

type BestMonth = {
  month: string | null;
  selections: ResearchSelection[];
  summary: BacktestSummary;
};

type Scorecard = Record<string, "yes" | "no" | "too sparse / incomplete">;

const YEARS: Year[] = ["2025", "2026"];
const SP_BANDS: SpBand[] = ["<3.0", "3.0-5.99", "6.0-9.99", "10.0-19.99", "20.0+"];
const FIELD_SIZE_BANDS: FieldSizeBand[] = ["<=5", "6-8", "9-12", "13+"];
const OUTPUT_PATH = "/tmp/turf-tpr-candidate-robustness.md";
const MIN_HALF_SAMPLE = 30;

const REFERENCE: Record<Year, { selections: number; strike: number; roi: number }> = {
  "2025": { selections: 788, strike: 17.6, roi: -12.0 },
  "2026": { selections: 528, strike: Number.NaN, roi: 11.3 },
};

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
    rating: { min: 110 },
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
    console.log(`${context.year}: selections ${summary.selections}, settled ${summary.settledSelections}, ROI ${pct(summary.roiPercentage)}, P/L ${money(summary.profitLoss)}, A/E ${number(aeStats(context.selections).ae)}`);
  }
}

async function loadContext(year: Year): Promise<Context> {
  const cache = await loadLatestBacktestFeatureCacheForYear({ year, family: "turf_flat" });
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
    result,
    selections: result.selectedRunners,
  };
}

function writeReport(lines: string[], contexts: Context[]) {
  lines.push("# Turf TPR Candidate Robustness Audit");
  lines.push("");
  lines.push("Diagnostic only. No threshold changes, added filters, cache changes, saved-rule changes, importer changes, or TPR formula changes.");
  lines.push("");
  lines.push("Frozen candidate: Turf · `TPR_S2_V1` · TPR >=110 · TPR rank 1 · TPR lead >=6.");
  lines.push("");
  lines.push("A/E is actual wins divided by expected wins from actual decimal SP implied probability. Settlement uses existing actual-SP £1 level-stake settlement.");
  lines.push("");

  writeBaseline(lines, contexts);
  writeBiggestWinner(lines, contexts);
  writeBestMonth(lines, contexts);
  writeCombinedStress(lines, contexts);
  writeHalfYear(lines, contexts);
  writeMonthlyDistribution(lines, contexts);
  writeSpBands(lines, contexts);
  writeRaceClass(lines, contexts);
  writeFieldSize(lines, contexts);
  writeSlippage(lines, contexts);
  writeCumulative(lines, contexts);
  writeScorecard(lines, contexts);
  writeConclusion(lines, contexts);
}

function writeBaseline(lines: string[], contexts: Context[]) {
  lines.push("## 1. Baseline Reconciliation");
  lines.push("");
  lines.push("Rule evaluated through the existing Research evaluator against the latest compatible Turf cache for each year.");
  lines.push("");
  table(lines, contexts.map((context) => {
    const summary = summarize(context.selections);
    const odds = settledDecimalSps(context.selections);
    return {
      year: context.year,
      "cache window": `${context.cacheFrom} to ${context.cacheTo}`,
      "actual coverage": `${context.actualFrom} to ${context.actualTo}`,
      selections: summary.selections,
      settled: summary.settledSelections,
      winners: summary.wins,
      strike: pct(summary.winStrikeRate),
      "£1 P/L": money(summary.profitLoss),
      ROI: pct(summary.roiPercentage),
      "avg SP": number(average(odds)),
      "median SP": number(median(odds)),
      "A/E": number(aeStats(context.selections).ae),
      "reference check": referenceCheck(context),
    };
  }));
  lines.push("");
}

function writeBiggestWinner(lines: string[], contexts: Context[]) {
  lines.push("## 2. Remove Biggest-Priced Winner");
  lines.push("");
  table(lines, contexts.map((context) => {
    const winner = biggestPricedWinner(context.selections);
    const stressed = winner.selection
      ? context.selections.filter((selection) => selection.id !== winner.selection!.id)
      : context.selections;
    const original = summarize(context.selections);
    const summary = summarize(stressed);
    return {
      year: context.year,
      horse: winner.selection?.features.horseName ?? "n/a",
      race: winner.selection?.features.raceName ?? "n/a",
      date: winner.selection?.features.raceDate ?? "n/a",
      SP: number(winner.sp),
      "winner profit": money(winner.profit),
      "profit share": profitShare(winner.profit, original.profitLoss),
      selections: summary.selections,
      winners: summary.wins,
      strike: pct(summary.winStrikeRate),
      "£1 P/L": money(summary.profitLoss),
      ROI: pct(summary.roiPercentage),
      "A/E": number(aeStats(stressed).ae),
    };
  }));
  lines.push("");
}

function writeBestMonth(lines: string[], contexts: Context[]) {
  lines.push("## 3. Remove Best Month");
  lines.push("");
  table(lines, contexts.map((context) => {
    const best = bestProfitMonth(context.selections);
    const stressed = best.month
      ? context.selections.filter((selection) => monthFor(selection) !== best.month)
      : context.selections;
    const original = summarize(context.selections);
    const summary = summarize(stressed);
    return {
      year: context.year,
      "best month": best.month ?? "n/a",
      "month selections": best.summary.selections,
      "month winners": best.summary.wins,
      "month £1 P/L": money(best.summary.profitLoss),
      "month ROI": pct(best.summary.roiPercentage),
      "annual profit share": profitShare(best.summary.profitLoss, original.profitLoss),
      selections: summary.selections,
      winners: summary.wins,
      strike: pct(summary.winStrikeRate),
      "£1 P/L": money(summary.profitLoss),
      ROI: pct(summary.roiPercentage),
      "A/E": number(aeStats(stressed).ae),
    };
  }));
  lines.push("");
}

function writeCombinedStress(lines: string[], contexts: Context[]) {
  lines.push("## 4. Remove Both Biggest Winner And Best Month");
  lines.push("");
  lines.push("If the biggest-priced winner occurred in the removed month, it is only excluded once.");
  lines.push("");
  table(lines, contexts.map((context) => {
    const winner = biggestPricedWinner(context.selections);
    const best = bestProfitMonth(context.selections);
    const stressed = combinedStressRows(context);
    const summary = summarize(stressed);
    return {
      year: context.year,
      "winner removed": winner.selection?.features.horseName ?? "n/a",
      "month removed": best.month ?? "n/a",
      selections: summary.selections,
      winners: summary.wins,
      strike: pct(summary.winStrikeRate),
      "£1 P/L": money(summary.profitLoss),
      ROI: pct(summary.roiPercentage),
      "A/E": number(aeStats(stressed).ae),
    };
  }));
  lines.push("");
}

function writeHalfYear(lines: string[], contexts: Context[]) {
  lines.push("## 5. Half-Year Stability");
  lines.push("");
  const holdout = contexts.find((context) => context.year === "2026");
  if (holdout && holdout.actualTo < "2026-12-31") {
    lines.push(`2026 holdout coverage ends ${holdout.actualTo}; Jul-Dec uses available holdout rows only.`);
    lines.push("");
  }
  table(lines, contexts.flatMap((context) =>
    ["Jan-Jun", "Jul-Dec"].map((half) => {
      const rows = context.selections.filter((selection) => halfFor(selection) === half);
      const summary = summarize(rows);
      return {
        year: context.year,
        half,
        selections: summary.selections,
        winners: summary.wins,
        strike: pct(summary.winStrikeRate),
        "£1 P/L": money(summary.profitLoss),
        ROI: pct(summary.roiPercentage),
        "A/E": number(aeStats(rows).ae),
        "avg SP": number(average(settledDecimalSps(rows))),
        sample: sampleStatus(summary.settledSelections),
      };
    })
  ));
  lines.push("");
}

function writeMonthlyDistribution(lines: string[], contexts: Context[]) {
  lines.push("## 6. Monthly Distribution");
  for (const context of contexts) {
    lines.push("");
    lines.push(`### ${context.year}`);
    const monthRows = [...groupBy(context.selections, monthFor).entries()]
      .sort(([left], [right]) => left.localeCompare(right));
    table(lines, monthRows.map(([month, rows]) => ({
      month,
      selections: summarize(rows).selections,
      winners: summarize(rows).wins,
      strike: pct(summarize(rows).winStrikeRate),
      "£1 P/L": money(summarize(rows).profitLoss),
      ROI: pct(summarize(rows).roiPercentage),
      "A/E": number(aeStats(rows).ae),
    })));
    const profits = monthRows.map(([month, rows]) => ({ month, profit: summarize(rows).profitLoss }));
    const profitable = profits.filter((entry) => entry.profit > 0).length;
    const lossMaking = profits.filter((entry) => entry.profit < 0).length;
    const totalProfit = summarize(context.selections).profitLoss;
    const topProfits = [...profits].sort((left, right) => right.profit - left.profit);
    lines.push("");
    lines.push(`Profitable months: ${profitable}; loss-making months: ${lossMaking}.`);
    lines.push(`Top 1 month profit share: ${profitShare(sum(topProfits.slice(0, 1).map((entry) => entry.profit)), totalProfit)}.`);
    lines.push(`Top 2 months profit share: ${profitShare(sum(topProfits.slice(0, 2).map((entry) => entry.profit)), totalProfit)}.`);
    lines.push(`Top 3 months profit share: ${profitShare(sum(topProfits.slice(0, 3).map((entry) => entry.profit)), totalProfit)}.`);
  }
  lines.push("");
}

function writeSpBands(lines: string[], contexts: Context[]) {
  lines.push("## 7. SP-Band Dependence");
  for (const context of contexts) {
    lines.push("");
    lines.push(`### ${context.year}`);
    table(lines, SP_BANDS.map((band) => {
      const rows = context.selections.filter((selection) => spBandFor(selection) === band);
      const summary = summarize(rows);
      return {
        band,
        selections: summary.selections,
        winners: summary.wins,
        strike: pct(summary.winStrikeRate),
        "£1 P/L": money(summary.profitLoss),
        ROI: pct(summary.roiPercentage),
        "A/E": number(aeStats(rows).ae),
      };
    }));
    const totalProfit = summarize(context.selections).profitLoss;
    lines.push("");
    lines.push(`Profit from winners at 10.0+: ${profitShare(winnerProfitAtOrAbove(context.selections, 10), totalProfit)}.`);
    lines.push(`Profit from winners at 20.0+: ${profitShare(winnerProfitAtOrAbove(context.selections, 20), totalProfit)}.`);
  }
  lines.push("");
}

function writeRaceClass(lines: string[], contexts: Context[]) {
  lines.push("## 8. Race-Class Concentration");
  for (const context of contexts) {
    lines.push("");
    lines.push(`### ${context.year}`);
    const totalProfit = summarize(context.selections).profitLoss;
    const rowsByClass = [...groupBy(context.selections, (selection) => raceClassBucket(selection.features.raceClass)).entries()]
      .sort(([left], [right]) => compareRaceClassBuckets(left, right));
    table(lines, rowsByClass.map(([raceClass, rows]) => {
      const summary = summarize(rows);
      return {
        class: raceClass,
        selections: summary.selections,
        winners: summary.wins,
        strike: pct(summary.winStrikeRate),
        "£1 P/L": money(summary.profitLoss),
        ROI: pct(summary.roiPercentage),
        "A/E": number(aeStats(rows).ae),
        "P/L contribution": profitShare(summary.profitLoss, totalProfit),
      };
    }));
    const top = largestProfitGroup(rowsByClass, totalProfit);
    lines.push("");
    lines.push(top.share !== null && top.share > 50
      ? `Flag: more than 50% of total profit is concentrated in ${top.label} (${pct(top.share)}).`
      : "No single class contributes more than 50% of total profit.");
  }
  lines.push("");
}

function writeFieldSize(lines: string[], contexts: Context[]) {
  lines.push("## 9. Field-Size Concentration");
  for (const context of contexts) {
    lines.push("");
    lines.push(`### ${context.year}`);
    const totalProfit = summarize(context.selections).profitLoss;
    table(lines, FIELD_SIZE_BANDS.map((band) => {
      const rows = context.selections.filter((selection) => fieldSizeBand(selection) === band);
      const summary = summarize(rows);
      return {
        band,
        selections: summary.selections,
        strike: pct(summary.winStrikeRate),
        ROI: pct(summary.roiPercentage),
        "A/E": number(aeStats(rows).ae),
        "£1 P/L contribution": profitShare(summary.profitLoss, totalProfit),
      };
    }));
  }
  lines.push("");
}

function writeSlippage(lines: string[], contexts: Context[]) {
  lines.push("## 10. Generic Return / Slippage Stress");
  lines.push("");
  lines.push("Winning gross returns are reduced by the stated percentage; losing stakes remain unchanged. This is not exchange commission.");
  lines.push("");
  table(lines, contexts.flatMap((context) =>
    [0.02, 0.05].map((slippage) => {
      const adjusted = adjustedProfit(context.selections, slippage);
      return {
        year: context.year,
        scenario: `${(slippage * 100).toFixed(0)}% adverse return`,
        "adjusted £1 P/L": money(adjusted.profitLoss),
        "adjusted ROI": pct(adjusted.roiPercentage),
      };
    })
  ));
  lines.push("");
}

function writeCumulative(lines: string[], contexts: Context[]) {
  lines.push("## 11. Cumulative P/L And Drawdown");
  for (const context of contexts) {
    const stats = cumulativeStats(context.selections);
    lines.push("");
    lines.push(`### ${context.year}`);
    table(lines, [{
      selections: stats.settled,
      "ending cumulative £1 P/L": money(stats.endingProfit),
      "maximum cumulative £1 P/L": money(stats.maxProfit),
      "maximum drawdown": money(stats.maxDrawdown),
      "longest losing run": stats.longestLosingRun,
      profile: cumulativeProfile(stats),
    }]);
    lines.push("");
    table(lines, monthlyCumulativeRows(context.selections));
  }
  lines.push("");
}

function writeScorecard(lines: string[], contexts: Context[]) {
  lines.push("## 12. Robustness Scorecard");
  lines.push("");
  table(lines, contexts.map((context) => ({ year: context.year, ...scorecard(context) })));
  lines.push("");
}

function writeConclusion(lines: string[], contexts: Context[]) {
  const context2026 = contextFor(contexts, "2026");
  const winnerStress2026 = removeBiggestWinnerRows(context2026);
  const monthStress2026 = removeBestMonthRows(context2026);
  const combined2026 = combinedStressRows(context2026);
  const summary2026 = summarize(context2026.selections);
  const longPrice10Share = winnerProfitAtOrAbove(context2026.selections, 10);
  const longPrice20Share = winnerProfitAtOrAbove(context2026.selections, 20);
  const largestClass = largestProfitGroup(
    [...groupBy(context2026.selections, (selection) => raceClassBucket(selection.features.raceClass)).entries()],
    summary2026.profitLoss,
  );
  const largestField = largestProfitGroup(
    [...groupBy(context2026.selections, fieldSizeBand).entries()],
    summary2026.profitLoss,
  );
  const slip2 = adjustedProfit(context2026.selections, 0.02);
  const slip5 = adjustedProfit(context2026.selections, 0.05);

  lines.push("## 13. Final Conclusion");
  lines.push("");
  numbered(lines, [
    `Is the 2026 positive ROI dependent on one big winner? ${summarize(winnerStress2026).profitLoss > 0 ? "No" : "Yes"}: after removing the biggest-priced winner, P/L is ${money(summarize(winnerStress2026).profitLoss)} and ROI is ${pct(summarize(winnerStress2026).roiPercentage)}.`,
    `Is it dependent on one strong month? ${summarize(monthStress2026).profitLoss > 0 ? "No" : "Yes"}: after removing the best month, P/L is ${money(summarize(monthStress2026).profitLoss)} and ROI is ${pct(summarize(monthStress2026).roiPercentage)}.`,
    `Does profitability survive the combined stress? ${summarize(combined2026).profitLoss > 0 ? "Yes" : "No"}: combined-stress P/L is ${money(summarize(combined2026).profitLoss)} and ROI is ${pct(summarize(combined2026).roiPercentage)}.`,
    `Is it overly dependent on long-priced winners? 10.0+ winner profit share is ${profitShare(longPrice10Share, summary2026.profitLoss)} and 20.0+ share is ${profitShare(longPrice20Share, summary2026.profitLoss)}.`,
    `Is it concentrated in one race class or field-size band? Largest class contribution is ${largestClass.label ?? "n/a"} at ${pct(largestClass.share)}; largest field-size contribution is ${largestField.label ?? "n/a"} at ${pct(largestField.share)}.`,
    `Does it survive modest slippage? 2% stress ${slip2.profitLoss > 0 ? "yes" : "no"} (${money(slip2.profitLoss)}, ${pct(slip2.roiPercentage)}); 5% stress ${slip5.profitLoss > 0 ? "yes" : "no"} (${money(slip5.profitLoss)}, ${pct(slip5.roiPercentage)}).`,
    `Is the rule robust enough to preserve as a serious forward-test candidate? ${preserveConclusion(contexts)}`,
    `Should it remain frozen exactly as TPR >=110 · rank 1 · lead >=6? ${freezeConclusion(contexts)}`,
  ]);
}

function contextFor(contexts: Context[], year: Year): Context {
  const context = contexts.find((item) => item.year === year);
  if (!context) throw new Error(`Missing context for ${year}`);
  return context;
}

function summarize(selections: ResearchSelection[]): BacktestSummary {
  return summarizeSelections(selections);
}

function aeStats(selections: ResearchSelection[]): AeStats {
  const settled = selections
    .map((selection) => ({ selection, settlement: settleSelection(selection.outcome) }))
    .filter((entry): entry is { selection: ResearchSelection; settlement: NonNullable<ReturnType<typeof settleSelection>> } =>
      entry.settlement !== null && entry.settlement.settlementOddsDecimal > 0
    );
  const expectedWins = settled.reduce((total, entry) => total + (1 / entry.settlement.settlementOddsDecimal), 0);
  const wins = settled.filter((entry) => entry.selection.outcome.won).length;
  return { wins, expectedWins, ae: expectedWins === 0 ? null : wins / expectedWins };
}

function biggestPricedWinner(selections: ResearchSelection[]): BiggestWinner {
  const winners = selections
    .map((selection) => ({ selection, settlement: settleSelection(selection.outcome) }))
    .filter((entry): entry is { selection: ResearchSelection; settlement: NonNullable<ReturnType<typeof settleSelection>> } =>
      entry.settlement !== null && entry.selection.outcome.won === true
    )
    .sort((left, right) =>
      right.settlement.settlementOddsDecimal - left.settlement.settlementOddsDecimal ||
      left.selection.features.raceDateTime.getTime() - right.selection.features.raceDateTime.getTime() ||
      left.selection.id.localeCompare(right.selection.id)
    );
  const first = winners[0] ?? null;
  return {
    selection: first?.selection ?? null,
    sp: first?.settlement.settlementOddsDecimal ?? null,
    profit: first?.settlement.profitLoss ?? 0,
  };
}

function bestProfitMonth(selections: ResearchSelection[]): BestMonth {
  const groups = [...groupBy(selections, monthFor).entries()]
    .map(([month, rows]) => ({ month, selections: rows, summary: summarize(rows) }))
    .sort((left, right) => right.summary.profitLoss - left.summary.profitLoss || left.month.localeCompare(right.month));
  return groups[0] ?? { month: null, selections: [], summary: summarize([]) };
}

function removeBiggestWinnerRows(context: Context): ResearchSelection[] {
  const winner = biggestPricedWinner(context.selections);
  return winner.selection
    ? context.selections.filter((selection) => selection.id !== winner.selection!.id)
    : context.selections;
}

function removeBestMonthRows(context: Context): ResearchSelection[] {
  const best = bestProfitMonth(context.selections);
  return best.month
    ? context.selections.filter((selection) => monthFor(selection) !== best.month)
    : context.selections;
}

function combinedStressRows(context: Context): ResearchSelection[] {
  const winner = biggestPricedWinner(context.selections);
  const best = bestProfitMonth(context.selections);
  return context.selections.filter((selection) =>
    (!winner.selection || selection.id !== winner.selection.id) &&
    (!best.month || monthFor(selection) !== best.month)
  );
}

function settledDecimalSps(selections: ResearchSelection[]): number[] {
  return selections
    .map((selection) => settleSelection(selection.outcome)?.settlementOddsDecimal ?? null)
    .filter(isNumber)
    .filter((value) => value > 0);
}

function winnerProfitAtOrAbove(selections: ResearchSelection[], minSp: number): number {
  return selections.reduce((total, selection) => {
    const settlement = settleSelection(selection.outcome);
    if (!settlement || selection.outcome.won !== true || settlement.settlementOddsDecimal < minSp) {
      return total;
    }
    return total + settlement.profitLoss;
  }, 0);
}

function adjustedProfit(selections: ResearchSelection[], slippage: number) {
  const settled = selections
    .map((selection) => ({ selection, settlement: settleSelection(selection.outcome) }))
    .filter((entry): entry is { selection: ResearchSelection; settlement: NonNullable<ReturnType<typeof settleSelection>> } =>
      entry.settlement !== null
    );
  const profitLoss = settled.reduce((total, entry) => {
    const grossReturn = entry.selection.outcome.won
      ? entry.settlement.settlementOddsDecimal * (1 - slippage)
      : 0;
    return total + grossReturn - 1;
  }, 0);
  return {
    profitLoss,
    roiPercentage: settled.length === 0 ? null : (profitLoss / settled.length) * 100,
  };
}

function cumulativeStats(selections: ResearchSelection[]) {
  const settled = [...selections]
    .sort(compareSelectionsChronologically)
    .map((selection) => ({ selection, settlement: settleSelection(selection.outcome) }))
    .filter((entry): entry is { selection: ResearchSelection; settlement: NonNullable<ReturnType<typeof settleSelection>> } =>
      entry.settlement !== null
    );
  let cumulative = 0;
  let maxProfit = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let losingRun = 0;
  let longestLosingRun = 0;

  for (const entry of settled) {
    cumulative += entry.settlement.profitLoss;
    maxProfit = Math.max(maxProfit, cumulative);
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
    if (entry.selection.outcome.won) {
      losingRun = 0;
    } else {
      losingRun += 1;
      longestLosingRun = Math.max(longestLosingRun, losingRun);
    }
  }

  return { settled: settled.length, endingProfit: cumulative, maxProfit, maxDrawdown, longestLosingRun };
}

function monthlyCumulativeRows(selections: ResearchSelection[]) {
  const settled = [...selections]
    .sort(compareSelectionsChronologically)
    .map((selection) => ({ selection, settlement: settleSelection(selection.outcome) }))
    .filter((entry): entry is { selection: ResearchSelection; settlement: NonNullable<ReturnType<typeof settleSelection>> } =>
      entry.settlement !== null
    );
  const months = new Map<string, { selections: number; winners: number; profit: number; cumulative: number }>();
  let cumulative = 0;
  for (const entry of settled) {
    cumulative += entry.settlement.profitLoss;
    const month = monthFor(entry.selection);
    const current = months.get(month) ?? { selections: 0, winners: 0, profit: 0, cumulative: 0 };
    current.selections += 1;
    current.winners += entry.selection.outcome.won ? 1 : 0;
    current.profit += entry.settlement.profitLoss;
    current.cumulative = cumulative;
    months.set(month, current);
  }
  return [...months.entries()].map(([month, value]) => ({
    month,
    selections: value.selections,
    winners: value.winners,
    "monthly £1 P/L": money(value.profit),
    "cumulative £1 P/L": money(value.cumulative),
  }));
}

function scorecard(context: Context): Scorecard {
  const biggest = removeBiggestWinnerRows(context);
  const bestMonth = removeBestMonthRows(context);
  const combined = combinedStressRows(context);
  const slip2 = adjustedProfit(context.selections, 0.02);
  const slip5 = adjustedProfit(context.selections, 0.05);
  const janJun = context.selections.filter((selection) => halfFor(selection) === "Jan-Jun");
  const julDec = context.selections.filter((selection) => halfFor(selection) === "Jul-Dec");
  return {
    "profitable after biggest-winner removal": yesNoIncomplete(summarize(biggest).profitLoss > 0, summarize(biggest).settledSelections),
    "profitable after best-month removal": yesNoIncomplete(summarize(bestMonth).profitLoss > 0, summarize(bestMonth).settledSelections),
    "profitable after both exclusions": yesNoIncomplete(summarize(combined).profitLoss > 0, summarize(combined).settledSelections),
    "profitable under 2% slippage": yesNoIncomplete(slip2.profitLoss > 0, summarize(context.selections).settledSelections),
    "profitable under 5% slippage": yesNoIncomplete(slip5.profitLoss > 0, summarize(context.selections).settledSelections),
    "positive in Jan-Jun": yesNoIncomplete(summarize(janJun).profitLoss > 0, summarize(janJun).settledSelections),
    "positive in Jul-Dec": yesNoIncomplete(summarize(julDec).profitLoss > 0, summarize(julDec).settledSelections),
    "A/E >=1 after biggest-winner removal": yesNoIncomplete((aeStats(biggest).ae ?? -Infinity) >= 1, summarize(biggest).settledSelections),
    "A/E >=1 after best-month removal": yesNoIncomplete((aeStats(bestMonth).ae ?? -Infinity) >= 1, summarize(bestMonth).settledSelections),
  };
}

function referenceCheck(context: Context): string {
  const summary = summarize(context.selections);
  const ref = REFERENCE[context.year];
  const selectionOk = summary.selections === ref.selections || summary.settledSelections === ref.selections;
  const roiOk = Math.abs((summary.roiPercentage ?? Number.NaN) - ref.roi) <= 0.2;
  const strikeOk = Number.isNaN(ref.strike) || Math.abs((summary.winStrikeRate ?? Number.NaN) - ref.strike) <= 0.2;
  return selectionOk && roiOk && strikeOk ? "reconciled" : "differs from prompt reference";
}

function preserveConclusion(contexts: Context[]): string {
  const context2026 = contextFor(contexts, "2026");
  const robust = summarize(removeBiggestWinnerRows(context2026)).profitLoss > 0 &&
    summarize(removeBestMonthRows(context2026)).profitLoss > 0 &&
    summarize(combinedStressRows(context2026)).profitLoss > 0 &&
    adjustedProfit(context2026.selections, 0.05).profitLoss > 0;
  return robust
    ? "Yes, the 2026 profile is robust enough to preserve for forward/live validation."
    : "No, the 2026 profile is fragile enough that it should be treated cautiously despite the headline ROI.";
}

function freezeConclusion(contexts: Context[]): string {
  const context2026 = contextFor(contexts, "2026");
  const combinedPositive = summarize(combinedStressRows(context2026)).profitLoss > 0;
  return combinedPositive
    ? "Yes. Keep it frozen exactly for forward validation rather than optimising thresholds."
    : "Keep it frozen only as a diagnostic watchlist item; do not optimise thresholds from this audit.";
}

function cumulativeProfile(stats: ReturnType<typeof cumulativeStats>): string {
  if (stats.maxDrawdown > Math.max(20, stats.maxProfit * 0.5)) {
    return "large jumps / material drawdowns";
  }
  return "comparatively steady";
}

function raceClassBucket(value: string | null): string {
  const raceClass = raceClassNumber(value);
  return raceClass === null ? "unknown" : `Class ${raceClass}`;
}

function compareRaceClassBuckets(left: string, right: string): number {
  if (left === "unknown") return 1;
  if (right === "unknown") return -1;
  return Number(left.replace("Class ", "")) - Number(right.replace("Class ", ""));
}

function spBandFor(selection: ResearchSelection): SpBand | null {
  const sp = settleSelection(selection.outcome)?.settlementOddsDecimal ?? null;
  if (sp === null || sp <= 0) return null;
  if (sp < 3) return "<3.0";
  if (sp < 6) return "3.0-5.99";
  if (sp < 10) return "6.0-9.99";
  if (sp < 20) return "10.0-19.99";
  return "20.0+";
}

function fieldSizeBand(selection: ResearchSelection): FieldSizeBand {
  const fieldSize = selection.features.actualRunnerCount ?? selection.features.declaredRunnerCount ?? 0;
  if (fieldSize <= 5) return "<=5";
  if (fieldSize <= 8) return "6-8";
  if (fieldSize <= 12) return "9-12";
  return "13+";
}

function largestProfitGroup(
  groups: Array<[string, ResearchSelection[]]>,
  totalProfit: number,
): { label: string | null; share: number | null } {
  const ranked = groups
    .map(([label, rows]) => ({ label, profit: summarize(rows).profitLoss }))
    .sort((left, right) => right.profit - left.profit);
  const top = ranked[0] ?? null;
  return {
    label: top?.label ?? null,
    share: top && totalProfit !== 0 ? (top.profit / totalProfit) * 100 : null,
  };
}

function compareSelectionsChronologically(left: ResearchSelection, right: ResearchSelection): number {
  return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
    left.features.targetRaceId.localeCompare(right.features.targetRaceId) ||
    left.features.targetRunnerId.localeCompare(right.features.targetRunnerId);
}

function monthFor(selection: ResearchSelection): string {
  return selection.features.raceDate.slice(0, 7);
}

function halfFor(selection: ResearchSelection): "Jan-Jun" | "Jul-Dec" {
  return Number(selection.features.raceDate.slice(5, 7)) <= 6 ? "Jan-Jun" : "Jul-Dec";
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

function sampleStatus(settled: number): string {
  return settled < MIN_HALF_SAMPLE ? "too sparse / incomplete" : "adequate";
}

function yesNoIncomplete(value: boolean, settled: number): Scorecard[string] {
  if (settled < MIN_HALF_SAMPLE) return "too sparse / incomplete";
  return value ? "yes" : "no";
}

function profitShare(part: number, total: number): string {
  if (total === 0 || !Number.isFinite(total)) return "n/a";
  return pct((part / total) * 100);
}

function pct(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(1)}%`;
}

function money(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return value < 0 ? `£-${Math.abs(value).toFixed(2)}` : `£${value.toFixed(2)}`;
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

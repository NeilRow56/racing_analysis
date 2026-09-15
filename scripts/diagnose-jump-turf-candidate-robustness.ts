import {
  deriveBacktestFeatureValues,
  settleSelection,
  summarizeSelections,
  type BacktestSelection,
  type BacktestSummary,
} from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";
import { rankRows, type RankedResearchRow } from "@/lib/racing/research-rule";

type Family = "jump" | "turf_flat";
type Year = "2025" | "2026";
type CandidateName = "Jump OR-third+" | "Turf field-size-5";
type StressKind = "biggestWinner" | "bestMonth" | "combined";
type SpBand = "<3.0" | "3.0-5.99" | "6.0-9.99" | "10.0-19.99" | "20.0+";

type Context = {
  family: Family;
  year: Year;
  rows: RankedResearchRow[];
  candidate: RankedResearchRow[];
  officialRatingRankByRunnerId: Map<string, number>;
};

type AeStats = {
  wins: number;
  expectedWins: number;
  ae: number | null;
};

type BiggestWinner = {
  row: RankedResearchRow | null;
  sp: number | null;
  profit: number;
};

type BestMonth = {
  month: string | null;
  profit: number;
};

type CumulativeStats = {
  startingRunnerCount: number;
  endingProfit: number;
  maxProfit: number;
  maxDrawdown: number;
  longestLosingSequence: number;
  signCrossings: number;
};

const YEARS: Year[] = ["2025", "2026"];
const FAMILIES: Family[] = ["jump", "turf_flat"];
const SP_BANDS: SpBand[] = ["<3.0", "3.0-5.99", "6.0-9.99", "10.0-19.99", "20.0+"];
const SPARSE_FLOOR = 50;
const VERY_SPARSE_FLOOR = 25;

async function main() {
  console.log("# Jump/Turf Candidate Robustness Audit");
  console.log("");
  console.log("Diagnostic only. Fixed named candidates only; no new predictive filters, threshold search, production Research changes, cache changes, or holdout changes.");
  console.log("");
  console.log("Candidates: Jump = trainer prior strike >=15%, field size <=5, Best L3 rank >=3, official-rating position third+. Turf = trainer prior strike >=15%, Best L3 rank >=3, exact field size 5.");
  console.log("");
  console.log("Slippage stress formula: for winning selections only, adjusted gross return = decimal SP * (1 - slippage); losing selections remain -1. This is a generic adverse-return stress test, not an exchange commission model.");
  console.log("");

  const contexts = await loadContexts();
  printCandidateReconciliation(contexts);
  printBiggestWinnerStress(contexts);
  printBestMonthStress(contexts);
  printCombinedStress(contexts);
  printHalfYearStability(contexts);
  printCumulativeProfit(contexts);
  printSpDependence(contexts);
  printSlippageStress(contexts);
  printRaceClassConcentration(contexts);
  printRobustnessScorecard(contexts);
  printCandidateConclusion(contexts, "jump");
  printCandidateConclusion(contexts, "turf_flat");
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
      const officialRatingRankByRunnerId = rankByRace(rows, (row) => row.features.officialRating, true);
      const baseContext: Context = {
        family,
        year,
        rows,
        candidate: [],
        officialRatingRankByRunnerId,
      };
      baseContext.candidate = family === "jump"
        ? jumpCandidateRows(rows, baseContext)
        : turfCandidateRows(rows);
      contexts.push(baseContext);
    }
  }
  return contexts;
}

function printCandidateReconciliation(contexts: Context[]) {
  console.log("## Candidate Reconciliation");
  printTable(contexts.map((context) => ({
    period: label(context),
    candidate: candidateName(context.family),
    ...fullMetricColumns(context.candidate),
    "expected previous diagnostic": previousDiagnosticReference(context),
  })));
  console.log("");
}

function printBiggestWinnerStress(contexts: Context[]) {
  console.log("## Biggest-Priced Winner Stress Test");
  printTable(contexts.map((context) => {
    const winner = biggestPricedWinner(context.candidate);
    const stressed = removeRows(context.candidate, new Set(winner.row ? [winner.row.features.targetRunnerId] : []));
    const original = summarizeRows(context.candidate);
    const stressedSummary = summarizeRows(stressed);
    return {
      period: label(context),
      candidate: candidateName(context.family),
      "winner id": winner.row?.features.targetRunnerId ?? "n/a",
      horse: winner.row?.features.horseName ?? "n/a",
      race: winner.row?.features.raceName ?? "n/a",
      "winner SP": number(winner.sp),
      "original £1 P/L": money(original.profitLoss),
      "original ROI": pct(original.roiPercentage),
      "original A/E": number(aeStats(context.candidate).ae),
      "profit from winner": money(winner.profit),
      "winner profit share": profitShare(winner.profit, original.profitLoss),
      "stressed settled": stressedSummary.settledSelections,
      "stressed wins": stressedSummary.wins,
      "stressed £1 P/L": money(stressedSummary.profitLoss),
      "stressed ROI": pct(stressedSummary.roiPercentage),
      "stressed A/E": number(aeStats(stressed).ae),
      "stressed strike": pct(stressedSummary.winStrikeRate),
    };
  }));
  console.log("");
}

function printBestMonthStress(contexts: Context[]) {
  console.log("## Best-Month Stress Test");
  printTable(contexts.map((context) => {
    const best = bestProfitMonth(context.candidate);
    const stressed = best.month ? context.candidate.filter((row) => monthFor(row) !== best.month) : context.candidate;
    const original = summarizeRows(context.candidate);
    const stressedSummary = summarizeRows(stressed);
    return {
      period: label(context),
      candidate: candidateName(context.family),
      "month removed": best.month ?? "n/a",
      "month £1 P/L": money(best.profit),
      "month profit share": profitShare(best.profit, original.profitLoss),
      "stressed settled": stressedSummary.settledSelections,
      "stressed wins": stressedSummary.wins,
      "stressed strike": pct(stressedSummary.winStrikeRate),
      "stressed £1 P/L": money(stressedSummary.profitLoss),
      "stressed ROI": pct(stressedSummary.roiPercentage),
      "stressed A/E": number(aeStats(stressed).ae),
    };
  }));
  console.log("");
}

function printCombinedStress(contexts: Context[]) {
  console.log("## Combined Stress Test");
  console.log("Excludes the biggest-priced winner and the most profitable month. If the winner is in the removed month it is only excluded once.");
  console.log("");
  printTable(contexts.map((context) => {
    const winner = biggestPricedWinner(context.candidate);
    const best = bestProfitMonth(context.candidate);
    const excludedIds = new Set<string>();
    if (winner.row) excludedIds.add(winner.row.features.targetRunnerId);
    const stressed = context.candidate.filter((row) =>
      !excludedIds.has(row.features.targetRunnerId) &&
      (best.month === null || monthFor(row) !== best.month)
    );
    const summary = summarizeRows(stressed);
    return {
      period: label(context),
      candidate: candidateName(context.family),
      "winner removed": winner.row?.features.horseName ?? "n/a",
      "month removed": best.month ?? "n/a",
      settled: summary.settledSelections,
      wins: summary.wins,
      "£1 P/L": money(summary.profitLoss),
      ROI: pct(summary.roiPercentage),
      "A/E": number(aeStats(stressed).ae),
    };
  }));
  console.log("");
}

function printHalfYearStability(contexts: Context[]) {
  console.log("## First-Half Vs Second-Half Stability");
  printTable(contexts.flatMap((context) =>
    ["Jan-Jun", "Jul-Dec"].map((half) => {
      const rows = context.candidate.filter((row) => halfFor(row) === half);
      return {
        period: label(context),
        candidate: candidateName(context.family),
        half,
        ...halfMetricColumns(rows),
      };
    })
  ));
  console.log("");
}

function printCumulativeProfit(contexts: Context[]) {
  console.log("## Cumulative P/L");
  printTable(contexts.map((context) => {
    const stats = cumulativeStats(context.candidate);
    return {
      period: label(context),
      candidate: candidateName(context.family),
      "starting runner count": stats.startingRunnerCount,
      "ending cumulative P/L": money(stats.endingProfit),
      "maximum cumulative profit": money(stats.maxProfit),
      "maximum drawdown": money(stats.maxDrawdown),
      "longest losing sequence": stats.longestLosingSequence,
      "sign crossings": stats.signCrossings,
    };
  }));
  console.log("");

  console.log("### Monthly Cumulative P/L");
  for (const context of contexts) {
    console.log(`#### ${label(context)} ${candidateName(context.family)}`);
    printTable(monthlyCumulativeRows(context.candidate));
    console.log("");
  }
}

function printSpDependence(contexts: Context[]) {
  console.log("## Long-Priced Winner Dependence");
  for (const context of contexts) {
    console.log(`### ${label(context)} ${candidateName(context.family)}`);
    printTable(SP_BANDS.map((band) => {
      const rows = context.candidate.filter((row) => spBandForRow(row) === band);
      return {
        band,
        ...spBandMetricColumns(rows),
      };
    }));
    const totalProfit = summarizeRows(context.candidate).profitLoss;
    console.log("");
    printTable([
      {
        period: label(context),
        "10.0+ winner profit share": profitShare(winnerProfitAtOrAbove(context.candidate, 10), totalProfit),
        "20.0+ winner profit share": profitShare(winnerProfitAtOrAbove(context.candidate, 20), totalProfit),
      },
    ]);
    console.log("");
  }
}

function printSlippageStress(contexts: Context[]) {
  console.log("## Commission / Slippage Stress");
  printTable(contexts.flatMap((context) =>
    [0.02, 0.05].map((slippage) => {
      const adjusted = adjustedProfit(context.candidate, slippage);
      return {
        period: label(context),
        candidate: candidateName(context.family),
        scenario: `${(slippage * 100).toFixed(0)}% winner-return reduction`,
        "adjusted £1 P/L": money(adjusted.profitLoss),
        "adjusted ROI": pct(adjusted.roiPercentage),
      };
    })
  ));
  console.log("");
}

function printRaceClassConcentration(contexts: Context[]) {
  console.log("## Race-Class Concentration");
  for (const context of contexts) {
    console.log(`### ${label(context)} ${candidateName(context.family)}`);
    const totalProfit = summarizeRows(context.candidate).profitLoss;
    const classes = [...new Set(context.candidate.map((row) => raceClassBucket(row.features.raceClass)))]
      .sort(compareRaceClassBuckets);
    printTable(classes.map((raceClass) => {
      const rows = context.candidate.filter((row) => raceClassBucket(row.features.raceClass) === raceClass);
      const summary = summarizeRows(rows);
      return {
        "race class": raceClass,
        settled: summary.settledSelections,
        wins: summary.wins,
        ROI: pct(summary.roiPercentage),
        "A/E": number(aeStats(rows).ae),
        "£1 P/L": money(summary.profitLoss),
        "profit contribution": profitShare(summary.profitLoss, totalProfit),
        sample: sampleWarning(summary.settledSelections),
      };
    }));
    const largestClass = largestProfitClass(context.candidate);
    console.log("");
    printTable([{
      period: label(context),
      "largest profit class": largestClass.raceClass ?? "n/a",
      "more than half of profit": largestClass.share !== null && largestClass.share > 50 ? "yes" : "no",
      share: largestClass.share === null ? "n/a" : pct(largestClass.share),
    }]);
    console.log("");
  }
}

function printRobustnessScorecard(contexts: Context[]) {
  console.log("## Robustness Scorecard");
  printTable(contexts.map((context) => {
    const biggest = stressRows(context, "biggestWinner");
    const bestMonth = stressRows(context, "bestMonth");
    const combined = stressRows(context, "combined");
    const halfRows = ["Jan-Jun", "Jul-Dec"].map((half) => context.candidate.filter((row) => halfFor(row) === half));
    const slippage2 = adjustedProfit(context.candidate, 0.02);
    const slippage5 = adjustedProfit(context.candidate, 0.05);
    return {
      period: label(context),
      candidate: candidateName(context.family),
      "profitable after biggest winner": yesNoOrSparse(biggest),
      "profitable after best month": yesNoOrSparse(bestMonth),
      "profitable after both": yesNoOrSparse(combined),
      "positive ROI both half-years": halfRows.every((rows) => summarizeRows(rows).settledSelections >= VERY_SPARSE_FLOOR)
        ? yesNo(halfRows.every((rows) => (summarizeRows(rows).roiPercentage ?? -Infinity) > 0))
        : "too sparse",
      "A/E >=1 after biggest winner": yesNoOrSparse(biggest, "ae"),
      "A/E >=1 after best month": yesNoOrSparse(bestMonth, "ae"),
      "profitable under 2% slippage": yesNo(slippage2.profitLoss > 0),
      "profitable under 5% slippage": yesNo(slippage5.profitLoss > 0),
    };
  }));
  console.log("");
}

function printCandidateConclusion(contexts: Context[], family: Family) {
  console.log(`## ${familyLabel(family)} Conclusion`);
  printTable([
    { question: "1. Materially dependent on one winner?", answer: winnerDependenceAnswer(contexts, family) },
    { question: "2. Materially dependent on one month?", answer: monthDependenceAnswer(contexts, family) },
    { question: "3. Profitable under combined exclusion?", answer: combinedStressAnswer(contexts, family) },
    { question: "4. Stable between first and second halves?", answer: halfStabilityAnswer(contexts, family) },
    { question: "5. Overly dependent on 10/1+ or 20/1+ winners?", answer: longPriceAnswer(contexts, family) },
    { question: "6. Viable under modest slippage?", answer: slippageAnswer(contexts, family) },
    { question: "7. Preserve as serious named candidate for forward testing?", answer: preserveAnswer(contexts, family) },
  ]);
  console.log("");
}

function printGuardrails() {
  console.log("## Guardrails");
  printTable([
    { item: "Production Research filters changed", result: "No" },
    { item: "Today/saved/frozen rules/UI changed", result: "No" },
    { item: "Cache schema/generation changed", result: "No" },
    { item: "New filters or thresholds searched", result: "No" },
    { item: "Recommendation", result: "Forward/live validation only; no production exposure from this audit." },
  ]);
}

function jumpCandidateRows(rows: RankedResearchRow[], context: Context) {
  return rows
    .filter((row) => row.features.trainerPriorWinRate !== null && row.features.trainerPriorWinRate >= 15)
    .filter((row) => {
      const fieldSize = fieldSizeForRow(row);
      return fieldSize !== null && fieldSize <= 5;
    })
    .filter((row) => {
      const rank = row.ranks.bestSpeedLast3;
      return rank !== null && rank !== undefined && rank >= 3;
    })
    .filter((row) => officialRatingCategory(context, row) === "third+");
}

function turfCandidateRows(rows: RankedResearchRow[]) {
  return rows
    .filter((row) => row.features.trainerPriorWinRate !== null && row.features.trainerPriorWinRate >= 15)
    .filter((row) => {
      const rank = row.ranks.bestSpeedLast3;
      return rank !== null && rank !== undefined && rank >= 3;
    })
    .filter((row) => fieldSizeForRow(row) === 5);
}

function previousDiagnosticReference(context: Context) {
  const refs: Record<string, string> = {
    "jump-2025": "130 settled, ROI 34.2%, A/E 1.3",
    "jump-2026": "141 settled, ROI 19.7%, A/E 1.3",
    "turf_flat-2025": "97 settled, ROI 16.7%, A/E 1.1",
    "turf_flat-2026": "121 settled, ROI 5.3%, A/E 1.1",
  };
  return refs[`${context.family}-${context.year}`];
}

function biggestPricedWinner(rows: RankedResearchRow[]): BiggestWinner {
  const winners = rows
    .map((row) => ({ row, settlement: settleSelection(row.outcome) }))
    .filter((entry): entry is { row: RankedResearchRow; settlement: NonNullable<ReturnType<typeof settleSelection>> } =>
      entry.settlement !== null && entry.row.outcome.won === true
    )
    .sort((left, right) =>
      right.settlement.settlementOddsDecimal - left.settlement.settlementOddsDecimal ||
      left.row.features.raceDateTime.getTime() - right.row.features.raceDateTime.getTime() ||
      left.row.features.targetRunnerId.localeCompare(right.row.features.targetRunnerId)
    );
  const first = winners[0] ?? null;
  return {
    row: first?.row ?? null,
    sp: first?.settlement.settlementOddsDecimal ?? null,
    profit: first ? first.settlement.profitLoss : 0,
  };
}

function bestProfitMonth(rows: RankedResearchRow[]): BestMonth {
  const groups = groupBy(rows, monthFor);
  const months = [...groups.entries()]
    .map(([month, monthRows]) => ({ month, profit: summarizeRows(monthRows).profitLoss }))
    .sort((left, right) => right.profit - left.profit || left.month.localeCompare(right.month));
  return months[0] ?? { month: null, profit: 0 };
}

function stressRows(context: Context, kind: StressKind) {
  const winner = biggestPricedWinner(context.candidate);
  const best = bestProfitMonth(context.candidate);
  const winnerId = winner.row?.features.targetRunnerId ?? null;
  if (kind === "biggestWinner") {
    return winnerId ? context.candidate.filter((row) => row.features.targetRunnerId !== winnerId) : context.candidate;
  }
  if (kind === "bestMonth") {
    return best.month ? context.candidate.filter((row) => monthFor(row) !== best.month) : context.candidate;
  }
  return context.candidate.filter((row) =>
    (winnerId === null || row.features.targetRunnerId !== winnerId) &&
    (best.month === null || monthFor(row) !== best.month)
  );
}

function removeRows(rows: RankedResearchRow[], excludedIds: Set<string>) {
  return rows.filter((row) => !excludedIds.has(row.features.targetRunnerId));
}

function cumulativeStats(rows: RankedResearchRow[]): CumulativeStats {
  const settled = [...rows]
    .sort(compareRowsChronologically)
    .map((row) => ({ row, settlement: settleSelection(row.outcome) }))
    .filter((entry): entry is { row: RankedResearchRow; settlement: NonNullable<ReturnType<typeof settleSelection>> } => entry.settlement !== null);
  let cumulative = 0;
  let maxProfit = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let longestLosingSequence = 0;
  let losingSequence = 0;
  let sign: -1 | 0 | 1 = 0;
  let signCrossings = 0;

  for (const entry of settled) {
    cumulative += entry.settlement.profitLoss;
    maxProfit = Math.max(maxProfit, cumulative);
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
    if (entry.row.outcome.won) {
      losingSequence = 0;
    } else {
      losingSequence += 1;
      longestLosingSequence = Math.max(longestLosingSequence, losingSequence);
    }
    const nextSign = cumulative > 0 ? 1 : cumulative < 0 ? -1 : 0;
    if (sign !== 0 && nextSign !== 0 && nextSign !== sign) {
      signCrossings += 1;
    }
    if (nextSign !== 0) sign = nextSign;
  }

  return {
    startingRunnerCount: settled.length,
    endingProfit: cumulative,
    maxProfit,
    maxDrawdown,
    longestLosingSequence,
    signCrossings,
  };
}

function monthlyCumulativeRows(rows: RankedResearchRow[]) {
  const settled = [...rows]
    .sort(compareRowsChronologically)
    .map((row) => ({ row, settlement: settleSelection(row.outcome) }))
    .filter((entry): entry is { row: RankedResearchRow; settlement: NonNullable<ReturnType<typeof settleSelection>> } => entry.settlement !== null);
  const months = new Map<string, { settled: number; wins: number; profit: number; cumulative: number }>();
  let cumulative = 0;
  for (const entry of settled) {
    cumulative += entry.settlement.profitLoss;
    const month = monthFor(entry.row);
    const current = months.get(month) ?? { settled: 0, wins: 0, profit: 0, cumulative: 0 };
    current.settled += 1;
    current.wins += entry.row.outcome.won ? 1 : 0;
    current.profit += entry.settlement.profitLoss;
    current.cumulative = cumulative;
    months.set(month, current);
  }
  return [...months.entries()].map(([month, value]) => ({
    month,
    settled: value.settled,
    wins: value.wins,
    "monthly £1 P/L": money(value.profit),
    "cumulative £1 P/L": money(value.cumulative),
  }));
}

function adjustedProfit(rows: RankedResearchRow[], slippage: number) {
  const settled = rows
    .map((row) => ({ row, settlement: settleSelection(row.outcome) }))
    .filter((entry): entry is { row: RankedResearchRow; settlement: NonNullable<ReturnType<typeof settleSelection>> } => entry.settlement !== null);
  const profitLoss = settled.reduce((total, entry) => {
    const grossReturn = entry.row.outcome.won
      ? entry.settlement.settlementOddsDecimal * (1 - slippage)
      : 0;
    return total + grossReturn - 1;
  }, 0);
  return {
    profitLoss,
    roiPercentage: settled.length === 0 ? null : (profitLoss / settled.length) * 100,
  };
}

function winnerProfitAtOrAbove(rows: RankedResearchRow[], minSp: number) {
  return rows.reduce((total, row) => {
    const settlement = settleSelection(row.outcome);
    if (!settlement || row.outcome.won !== true || settlement.settlementOddsDecimal < minSp) {
      return total;
    }
    return total + settlement.profitLoss;
  }, 0);
}

function largestProfitClass(rows: RankedResearchRow[]) {
  const totalProfit = summarizeRows(rows).profitLoss;
  const classes = [...groupBy(rows, (row) => raceClassBucket(row.features.raceClass)).entries()]
    .map(([raceClass, classRows]) => ({ raceClass, profit: summarizeRows(classRows).profitLoss }))
    .sort((left, right) => right.profit - left.profit);
  const top = classes[0] ?? null;
  return {
    raceClass: top?.raceClass ?? null,
    share: top && totalProfit !== 0 ? (top.profit / totalProfit) * 100 : null,
  };
}

function winnerDependenceAnswer(contexts: Context[], family: Family) {
  return YEARS.map((year) => {
    const context = contextFor(contexts, family, year);
    const stressed = stressRows(context, "biggestWinner");
    const winner = biggestPricedWinner(context.candidate);
    return `${year}: ${summarizeRows(stressed).profitLoss > 0 ? "survives" : "fails"} after removing ${number(winner.sp)} SP winner; remaining ROI ${pct(summarizeRows(stressed).roiPercentage)}, A/E ${number(aeStats(stressed).ae)}`;
  }).join("; ");
}

function monthDependenceAnswer(contexts: Context[], family: Family) {
  return YEARS.map((year) => {
    const context = contextFor(contexts, family, year);
    const best = bestProfitMonth(context.candidate);
    const stressed = stressRows(context, "bestMonth");
    return `${year}: remove ${best.month}, ${summarizeRows(stressed).profitLoss > 0 ? "still profitable" : "not profitable"}; remaining ROI ${pct(summarizeRows(stressed).roiPercentage)}`;
  }).join("; ");
}

function combinedStressAnswer(contexts: Context[], family: Family) {
  return YEARS.map((year) => {
    const stressed = stressRows(contextFor(contexts, family, year), "combined");
    return `${year}: ${summarizeRows(stressed).profitLoss > 0 ? "profitable" : "not profitable"} (${money(summarizeRows(stressed).profitLoss)}, ROI ${pct(summarizeRows(stressed).roiPercentage)}, A/E ${number(aeStats(stressed).ae)})`;
  }).join("; ");
}

function halfStabilityAnswer(contexts: Context[], family: Family) {
  return YEARS.map((year) => {
    const context = contextFor(contexts, family, year);
    return ["Jan-Jun", "Jul-Dec"].map((half) => {
      const rows = context.candidate.filter((row) => halfFor(row) === half);
      return `${year} ${half}: n=${summarizeRows(rows).settledSelections}, ROI ${pct(summarizeRows(rows).roiPercentage)}, A/E ${number(aeStats(rows).ae)}`;
    }).join(" / ");
  }).join("; ");
}

function longPriceAnswer(contexts: Context[], family: Family) {
  return YEARS.map((year) => {
    const context = contextFor(contexts, family, year);
    const totalProfit = summarizeRows(context.candidate).profitLoss;
    return `${year}: 10.0+ winner share ${profitShare(winnerProfitAtOrAbove(context.candidate, 10), totalProfit)}, 20.0+ winner share ${profitShare(winnerProfitAtOrAbove(context.candidate, 20), totalProfit)}`;
  }).join("; ");
}

function slippageAnswer(contexts: Context[], family: Family) {
  return YEARS.map((year) => {
    const context = contextFor(contexts, family, year);
    const two = adjustedProfit(context.candidate, 0.02);
    const five = adjustedProfit(context.candidate, 0.05);
    return `${year}: 2% ${money(two.profitLoss)} (${pct(two.roiPercentage)}), 5% ${money(five.profitLoss)} (${pct(five.roiPercentage)})`;
  }).join("; ");
}

function preserveAnswer(contexts: Context[], family: Family) {
  const bothYearsProfitable = YEARS.every((year) => summarizeRows(contextFor(contexts, family, year).candidate).profitLoss > 0);
  const combinedBothYears = YEARS.every((year) => summarizeRows(stressRows(contextFor(contexts, family, year), "combined")).profitLoss > 0);
  const slippageBothYears = YEARS.every((year) => adjustedProfit(contextFor(contexts, family, year).candidate, 0.05).profitLoss > 0);
  if (bothYearsProfitable && combinedBothYears && slippageBothYears) {
    return "Yes, preserve as a serious named candidate for forward/live validation only.";
  }
  return "Preserve only cautiously as diagnostic context; weaknesses remain, so forward validation is preferable to further backtest optimisation.";
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

function halfMetricColumns(rows: HistoricalTargetRunnerMetricsRow[]) {
  const summary = summarizeRows(rows);
  const odds = settledDecimalSps(rows);
  return {
    settled: summary.settledSelections,
    wins: summary.wins,
    "strike rate": pct(summary.winStrikeRate),
    ROI: pct(summary.roiPercentage),
    "A/E": number(aeStats(rows).ae),
    "avg SP": number(average(odds)),
    sample: sampleWarning(summary.settledSelections),
  };
}

function spBandMetricColumns(rows: HistoricalTargetRunnerMetricsRow[]) {
  const summary = summarizeRows(rows);
  return {
    settled: summary.settledSelections,
    winners: summary.wins,
    "strike rate": pct(summary.winStrikeRate),
    "£1 P/L": money(summary.profitLoss),
    ROI: pct(summary.roiPercentage),
    "A/E": number(aeStats(rows).ae),
    sample: sampleWarning(summary.settledSelections),
  };
}

function summarizeRows(rows: HistoricalTargetRunnerMetricsRow[]): BacktestSummary {
  return summarizeSelections(rows.map(rowToSelection));
}

function rowToSelection(row: HistoricalTargetRunnerMetricsRow): BacktestSelection {
  return {
    id: row.features.targetRunnerId,
    definitionId: "jump-turf-candidate-robustness",
    selectedReason: "Jump/Turf candidate robustness audit",
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

function officialRatingCategory(context: Context, row: RankedResearchRow) {
  const rank = context.officialRatingRankByRunnerId.get(row.features.targetRunnerId) ?? null;
  if (rank === null) return "missing";
  if (rank === 1) return "top-rated";
  if (rank === 2) return "second";
  return "third+";
}

function raceClassBucket(value: string | null) {
  const raceClass = raceClassNumber(value);
  return raceClass === null ? "unknown" : `Class ${raceClass}`;
}

function compareRaceClassBuckets(left: string, right: string) {
  if (left === "unknown") return 1;
  if (right === "unknown") return -1;
  return Number(left.replace("Class ", "")) - Number(right.replace("Class ", ""));
}

function spBandForRow(row: RankedResearchRow): SpBand | null {
  const sp = settleSelection(row.outcome)?.settlementOddsDecimal ?? null;
  if (sp === null || sp <= 0) return null;
  if (sp < 3) return "<3.0";
  if (sp < 6) return "3.0-5.99";
  if (sp < 10) return "6.0-9.99";
  if (sp < 20) return "10.0-19.99";
  return "20.0+";
}

function fieldSizeForRow(row: HistoricalTargetRunnerMetricsRow) {
  return row.features.actualRunnerCount ?? row.features.declaredRunnerCount;
}

function contextFor(contexts: Context[], family: Family, year: Year) {
  const context = contexts.find((item) => item.family === family && item.year === year);
  if (!context) throw new Error(`Missing context for ${family} ${year}`);
  return context;
}

function raceCodeForFamily(family: Family) {
  return family === "jump" ? "jump" : "turf";
}

function candidateName(family: Family): CandidateName {
  return family === "jump" ? "Jump OR-third+" : "Turf field-size-5";
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

function monthFor(row: HistoricalTargetRunnerMetricsRow) {
  return row.features.raceDate.slice(0, 7);
}

function halfFor(row: HistoricalTargetRunnerMetricsRow) {
  const month = Number(row.features.raceDate.slice(5, 7));
  return month <= 6 ? "Jan-Jun" : "Jul-Dec";
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

function sampleWarning(settled: number) {
  if (settled < VERY_SPARSE_FLOOR) return "very sparse";
  if (settled < SPARSE_FLOOR) return "sparse";
  return "adequate";
}

function profitShare(part: number, total: number) {
  if (total === 0) return "n/a";
  return pct((part / total) * 100);
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

function yesNoOrSparse(rows: HistoricalTargetRunnerMetricsRow[], metric: "profit" | "ae" = "profit") {
  const summary = summarizeRows(rows);
  if (summary.settledSelections < VERY_SPARSE_FLOOR) return "too sparse";
  if (metric === "ae") return yesNo((aeStats(rows).ae ?? -Infinity) >= 1);
  return yesNo(summary.profitLoss > 0);
}

function yesNo(value: boolean) {
  return value ? "yes" : "no";
}

function pct(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(1)}%`;
}

function money(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return value < 0 ? `£-${Math.abs(value).toFixed(2)}` : `£${value.toFixed(2)}`;
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

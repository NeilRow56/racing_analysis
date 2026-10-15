import { writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { settleSelection } from "@/lib/racing/backtest";
import { loadBacktestFeatureCache } from "@/lib/racing/backtest-cache";
import type { HistoricalPreRaceFeatureRow, HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import { loadJumpTissueForward, cleanJumpTissueRace, type JumpTissueRace } from "@/lib/racing/jump-tissue-forward";
import { JUMP_TISSUE_MODEL_PATH, loadJumpTissueModel } from "@/lib/racing/jump-tissue-model";
import { classifyHandicapStatus } from "@/lib/racing/research-rule";
import { loadHistoricalComments, priorCommentsForTarget, raceSoftmax, score, commentVector, type HistoricalComment } from "./diagnose-independent-tissue-feasibility";

const MARKDOWN_OUTPUT = "/tmp/jump-tissue-hurdle-long-price-calibration.md";
const JSON_OUTPUT = "/tmp/jump-tissue-hurdle-long-price-calibration.json";
const YEARS = ["2025", "2026"] as const;
const SUBTYPES = ["HURDLE", "CHASE"] as const;
const SP_BANDS = [
  { label: "< 4/1", min: 0, max: 5, minInclusive: true, maxInclusive: false },
  { label: "4/1 to <8/1", min: 5, max: 9, minInclusive: true, maxInclusive: false },
  { label: "8/1 to <=14/1", min: 9, max: 15, minInclusive: true, maxInclusive: true },
  { label: ">14/1 to 20/1", min: 15, max: 21, minInclusive: false, maxInclusive: true },
  { label: ">20/1 to 33/1", min: 21, max: 34, minInclusive: false, maxInclusive: true },
  { label: ">33/1 to 50/1", min: 34, max: 51, minInclusive: false, maxInclusive: true },
  { label: ">50/1", min: 51, max: Number.POSITIVE_INFINITY, minInclusive: false, maxInclusive: false },
] as const;
const PROBABILITY_BANDS = [
  { label: "0-5%", min: 0, max: 0.05 },
  { label: "5-10%", min: 0.05, max: 0.10 },
  { label: "10-15%", min: 0.10, max: 0.15 },
  { label: "15-20%", min: 0.15, max: 0.20 },
  { label: "20%+", min: 0.20, max: Number.POSITIVE_INFINITY },
] as const;

type Year = typeof YEARS[number];
type Subtype = typeof SUBTYPES[number];
type Entry = {
  year: Year;
  raceId: string;
  runnerId: string;
  subtype: Subtype;
  sp: number;
  won: boolean;
  tissueProbability: number;
  rank: number;
  finalSpProfitLoss: number;
};
type Summary = ReturnType<typeof summarize>;

async function main() {
  const model = await loadJumpTissueModel(JUMP_TISSUE_MODEL_PATH);
  const caches = await Promise.all(YEARS.map((year) => loadBacktestFeatureCache({ from: `${year}-01-01`, to: `${year}-12-31`, family: "jump", outputDir: process.env.JUMP_RESEARCH_CACHE_DIR })));
  if (caches.some((cache) => cache === null)) throw new Error("Missing compatible 2025/2026 jump backtest caches");
  const rows = caches.flatMap((cache) => cache!.rows);

  const connection = createDbConnection();
  let comments: Map<string, HistoricalComment[]>;
  try {
    comments = await loadHistoricalComments(connection.client);
  } finally {
    await connection.client.end();
  }

  const entries = buildEntries(rows, comments, model.model);
  const forward = await loadJumpTissueForward();
  const prospectiveValue = prospectiveValueSummaries(forward.races);
  const report = buildReport(entries, prospectiveValue, model.checksum);
  await writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(MARKDOWN_OUTPUT, markdown(report), "utf8");
  printTerminalSummary(report);
}

function buildEntries(rows: HistoricalTargetRunnerMetricsRow[], commentsByHorse: Map<string, HistoricalComment[]>, model: Awaited<ReturnType<typeof loadJumpTissueModel>>["model"]): Entry[] {
  const supported = rows.filter((row) => row.features.raceCode === "jump" && subtype(row.features) !== null);
  const byRace = groupBy(supported, (row) => row.features.targetRaceId);
  const entries: Entry[] = [];
  for (const [raceId, raceRows] of byRace) {
    const active = raceRows.filter((row) => settleSelection({ ...row.outcome, startingPriceDecimal: "2" }) !== null);
    const settlements = active.map((row) => settleSelection(row.outcome));
    const expected = active[0]?.features.actualRunnerCount;
    if (
      active.length < 2 ||
      settlements.some((settlement) => settlement === null) ||
      expected == null ||
      (expected !== active.length && expected !== raceRows.length) ||
      active.filter((row) => row.outcome.won === true || row.outcome.finishingPosition === 1).length !== 1
    ) continue;
    const values = active.map((row) => [...numericVector(row.features), ...commentVector(priorCommentsForTarget(commentsByHorse.get(row.features.horseId) ?? [], row.features.raceDateTime))]);
    const probabilities = raceSoftmax(values.map((value) => score(model, value)));
    const ranked = active.map((row, index) => ({ row, probability: probabilities[index]! }))
      .sort((left, right) => right.probability - left.probability || left.row.features.targetRunnerId.localeCompare(right.row.features.targetRunnerId));
    const rankByRunner = new Map(ranked.map((entry, index) => [entry.row.features.targetRunnerId, index + 1]));
    for (const [index, row] of active.entries()) {
      const st = settlements[index]!;
      entries.push({
        year: row.features.raceDate.slice(0, 4) as Year,
        raceId,
        runnerId: row.features.targetRunnerId,
        subtype: subtype(row.features)!,
        sp: st.settlementOddsDecimal,
        won: row.outcome.won === true || row.outcome.finishingPosition === 1,
        tissueProbability: probabilities[index]!,
        rank: rankByRunner.get(row.features.targetRunnerId)!,
        finalSpProfitLoss: st.profitLoss,
      });
    }
  }
  return entries;
}

function numericVector(features: HistoricalPreRaceFeatureRow): number[] {
  const values = [
    features.officialRating,
    features.latestJumpSpeedRating,
    features.bestJumpSpeedLast3,
    features.averageJumpSpeedLast3,
    features.trainerPriorWinRate,
    Math.log1p(features.trainerPriorRuns),
    features.jockeyPriorWinRate ?? null,
    Math.log1p(features.jockeyPriorRuns ?? 0),
    features.daysSinceLastRun,
    Math.log1p(features.priorRuns),
    features.horseAge,
    features.weightCarriedLbs,
    numericClass(features.raceClass),
    features.distanceYards === null ? null : features.distanceYards / 220,
    features.actualRunnerCount ?? features.declaredRunnerCount,
    classifyHandicapStatus(features) === "unknown" ? null : classifyHandicapStatus(features) === "handicap" ? 1 : 0,
    /soft|heavy/i.test(features.going ?? "") ? 1 : 0,
    /firm/i.test(features.going ?? "") ? 1 : 0,
  ];
  return [
    ...values.map((value) => typeof value === "number" && Number.isFinite(value) ? value : 0),
    ...values.map((value) => typeof value === "number" && Number.isFinite(value) ? 0 : 1),
  ];
}

function subtype(features: HistoricalPreRaceFeatureRow): Subtype | null {
  const code = classifyJumpRaceSubtype(features);
  if (code === "hurdle") return "HURDLE";
  if (code === "chase") return "CHASE";
  return null;
}

function summarize(rows: Entry[]) {
  const winners = rows.filter((row) => row.won).length;
  const tissueExpected = sum(rows.map((row) => row.tissueProbability));
  const marketExpected = sum(rows.map((row) => 1 / row.sp));
  const profit = sum(rows.map((row) => row.finalSpProfitLoss));
  return {
    runners: rows.length,
    selections: rows.length,
    winners,
    strike: ratio(winners, rows.length),
    tissueExpected,
    actualWinners: winners,
    calibrationRatio: ratio(winners, tissueExpected),
    meanTissueProbability: average(rows.map((row) => row.tissueProbability)),
    medianTissueProbability: median(rows.map((row) => row.tissueProbability)),
    marketExpected,
    marketAe: ratio(winners, marketExpected),
    averageSp: average(rows.map((row) => row.sp)),
    roi: ratio(profit, rows.length),
  };
}

function buildReport(entries: Entry[], prospectiveValue: ReturnType<typeof prospectiveValueSummaries>, modelChecksum: string) {
  const bySpBand = Object.fromEntries(SUBTYPES.map((sub) => [sub, SP_BANDS.map((band) => ({ band: band.label, ...summarize(entries.filter((entry) => entry.subtype === sub && inSpBand(entry.sp, band))) }))])) as Record<Subtype, Array<Summary & { band: string }>>;
  const longPrice = Object.fromEntries(SUBTYPES.map((sub) => [sub, [...YEARS, "combined"].map((year) => {
    const scoped = entries.filter((entry) => entry.subtype === sub && isLongPrice(entry.sp) && (year === "combined" || entry.year === year));
    return { year, ...summarize(scoped) };
  })])) as Record<Subtype, Array<Summary & { year: Year | "combined" }>>;
  const rankOne = Object.fromEntries(SUBTYPES.map((sub) => [sub, [
    { band: "SP <=14/1", ...summarize(entries.filter((entry) => entry.subtype === sub && entry.rank === 1 && !isLongPrice(entry.sp))) },
    { band: "SP >14/1", ...summarize(entries.filter((entry) => entry.subtype === sub && entry.rank === 1 && isLongPrice(entry.sp))) },
  ]])) as Record<Subtype, Array<Summary & { band: string }>>;
  const retrospectiveValue = Object.fromEntries(SUBTYPES.map((sub) => [sub, [
    { band: "SP <=14/1", ...summarize(entries.filter((entry) => entry.subtype === sub && entry.rank === 1 && entry.tissueProbability > 1 / entry.sp && !isLongPrice(entry.sp))) },
    { band: "SP >14/1", ...summarize(entries.filter((entry) => entry.subtype === sub && entry.rank === 1 && entry.tissueProbability > 1 / entry.sp && isLongPrice(entry.sp))) },
  ]])) as Record<Subtype, Array<Summary & { band: string }>>;
  const probabilityBands = Object.fromEntries(SUBTYPES.map((sub) => [sub, PROBABILITY_BANDS.map((band) => ({
    band: band.label,
    ...summarize(entries.filter((entry) => entry.subtype === sub && isLongPrice(entry.sp) && entry.tissueProbability >= band.min && entry.tissueProbability < band.max)),
  }))])) as Record<Subtype, Array<Summary & { band: string }>>;
  const hurdleCombined = longPrice.HURDLE.find((row) => row.year === "combined")!;
  const chaseCombined = longPrice.CHASE.find((row) => row.year === "combined")!;
  const yearClassification = {
    HURDLE: replicatedStatus(longPrice.HURDLE),
    CHASE: replicatedStatus(longPrice.CHASE),
  };
  const classification = classifyCalibration(hurdleCombined);
  return {
    generatedAt: new Date().toISOString(),
    source: "Frozen Jump Tissue v1 over backtest_features_v4 sporting_life jump caches, with canonical settlement and retrospective final SP bands.",
    model: { path: JUMP_TISSUE_MODEL_PATH, checksum: modelChecksum },
    definitions: {
      longPrice: "decimal SP > 15.0 (>14/1), exactly 14/1 excluded",
      marketExpected: "sum(1 / final SP decimal), retrospective only",
      retrospectiveValue: "rank-1 and tissue probability greater than final-SP implied probability; this is not a production qualification-price reconstruction",
      prospectiveValue: "clean recorded Jump Tissue tracker races with the existing frozen qualification-price precedence: t60, then t180, then early",
    },
    population: {
      runners: entries.length,
      races: new Set(entries.map((entry) => entry.raceId)).size,
      bySubtype: Object.fromEntries(SUBTYPES.map((sub) => [sub, { ...summarize(entries.filter((entry) => entry.subtype === sub)), races: new Set(entries.filter((entry) => entry.subtype === sub).map((entry) => entry.raceId)).size }])) as Record<Subtype, Summary & { races: number }>,
    },
    bySpBand,
    longPrice,
    rankOne,
    value: { retrospectiveFinalSp: retrospectiveValue, prospectiveQualificationPrice: prospectiveValue },
    probabilityBands,
    yearClassification,
    directComparison: directComparison(hurdleCombined, chaseCombined),
    classification,
    recommendation: recommendation(classification),
  };
}

function prospectiveValueSummaries(races: JumpTissueRace[]) {
  const clean = races.filter((race) => cleanJumpTissueRace(race) && race.settledAt !== null && (race.subtype === "Hurdle" || race.subtype === "Chase"));
  const selections = clean.flatMap((race) => {
    const leader = race.runners.find((runner) => runner.runnerId === race.top1);
    const price = race.prices.t60 ?? race.prices.t180 ?? race.prices.early;
    if (!leader?.probability || !price || price.impliedProbability == null || leader.probability <= price.impliedProbability || !leader.outcome || leader.outcome.finalSp === null) return [];
    const qualificationProfit = race.selectedPriceProfitLoss.t60 ?? race.selectedPriceProfitLoss.t180 ?? race.selectedPriceProfitLoss.early;
    return [{
      subtype: race.subtype === "Hurdle" ? "HURDLE" as const : "CHASE" as const,
      sp: leader.outcome.finalSp,
      won: leader.outcome.won === true,
      tissueProbability: leader.probability,
      marketExpected: price.impliedProbability,
      qualificationProfit,
      finalSpProfit: leader.outcome.finalSpProfitLoss ?? 0,
    }];
  });
  return Object.fromEntries(SUBTYPES.map((sub) => [sub, [
    prospectiveSummary(selections.filter((entry) => entry.subtype === sub && !isLongPrice(entry.sp)), "SP <=14/1"),
    prospectiveSummary(selections.filter((entry) => entry.subtype === sub && isLongPrice(entry.sp)), "SP >14/1"),
  ]])) as Record<Subtype, Array<ReturnType<typeof prospectiveSummary>>>;
}

function prospectiveSummary(rows: Array<{ won: boolean; tissueProbability: number; marketExpected: number; qualificationProfit: number | null; finalSpProfit: number }>, band: string) {
  const qualifyingRows = rows.filter((row) => row.qualificationProfit !== null);
  return {
    band,
    selections: rows.length,
    winners: rows.filter((row) => row.won).length,
    tissueExpected: sum(rows.map((row) => row.tissueProbability)),
    actualWinners: rows.filter((row) => row.won).length,
    marketExpected: sum(rows.map((row) => row.marketExpected)),
    marketAe: ratio(rows.filter((row) => row.won).length, sum(rows.map((row) => row.marketExpected))),
    qualifyingPriceRoi: ratio(sum(qualifyingRows.map((row) => row.qualificationProfit!)), qualifyingRows.length),
    finalSpRoi: ratio(sum(rows.map((row) => row.finalSpProfit)), rows.length),
  };
}

function directComparison(hurdle: Summary, chase: Summary) {
  return {
    hurdleCalibrationRatio: hurdle.calibrationRatio,
    chaseCalibrationRatio: chase.calibrationRatio,
    calibrationAbsoluteDifference: nullableBinary(hurdle.calibrationRatio, chase.calibrationRatio, (a, b) => a - b),
    calibrationRelativeRatio: nullableBinary(hurdle.calibrationRatio, chase.calibrationRatio, (a, b) => b === 0 ? null : a / b),
    hurdleWinnerRate: hurdle.strike,
    chaseWinnerRate: chase.strike,
    winnerRateAbsoluteDifference: nullableBinary(hurdle.strike, chase.strike, (a, b) => a - b),
    winnerRateRelativeRatio: nullableBinary(hurdle.strike, chase.strike, (a, b) => b === 0 ? null : a / b),
    hurdleMarketAe: hurdle.marketAe,
    chaseMarketAe: chase.marketAe,
    marketAeAbsoluteDifference: nullableBinary(hurdle.marketAe, chase.marketAe, (a, b) => a - b),
    marketAeRelativeRatio: nullableBinary(hurdle.marketAe, chase.marketAe, (a, b) => b === 0 ? null : a / b),
    hurdleSpecificOverprediction: (hurdle.calibrationRatio ?? 1) < 0.85 && (chase.calibrationRatio ?? 0) > (hurdle.calibrationRatio ?? 0) + 0.10,
  };
}

function classifyCalibration(row: Summary) {
  if (row.runners < 500 || row.actualWinners < 20) return "UNSTABLE / MIXED";
  if (row.calibrationRatio === null) return "UNSTABLE / MIXED";
  if (row.calibrationRatio < 0.75) return "MATERIAL OVERPREDICTION";
  if (row.calibrationRatio < 0.9) return "MILD OVERPREDICTION";
  if (row.calibrationRatio > 1.15) return "UNDERPREDICTION";
  return "WELL CALIBRATED";
}

function recommendation(classification: ReturnType<typeof classifyCalibration>) {
  if (classification === "MATERIAL OVERPREDICTION") return "C. Controlled Hurdle Tissue 2 recalibration experiment";
  if (classification === "MILD OVERPREDICTION" || classification === "UNSTABLE / MIXED") return "B. Prospective monitoring only";
  if (classification === "UNDERPREDICTION") return "B. Prospective monitoring only";
  return "A. No action";
}

function replicatedStatus(rows: Array<Summary & { year: Year | "combined" }>) {
  const y2025 = rows.find((row) => row.year === "2025")!;
  const y2026 = rows.find((row) => row.year === "2026")!;
  if (y2025.actualWinners < 10 || y2026.actualWinners < 10) return "too small";
  const direction = (row: Summary) => row.calibrationRatio === null ? "unknown" : row.calibrationRatio < 0.9 ? "over" : row.calibrationRatio > 1.1 ? "under" : "neutral";
  const d2025 = direction(y2025);
  const d2026 = direction(y2026);
  if (d2025 === d2026 && d2025 !== "neutral" && d2025 !== "unknown") return "replicated";
  if ((d2025 === "over" && d2026 === "under") || (d2025 === "under" && d2026 === "over")) return "reversed";
  if (d2025 !== "neutral" || d2026 !== "neutral") return "one-year only";
  return "too small";
}

function markdown(report: ReturnType<typeof buildReport>) {
  const hurdleLong = report.longPrice.HURDLE.find((row) => row.year === "combined")!;
  const chaseLong = report.longPrice.CHASE.find((row) => row.year === "combined")!;
  return [
    "# Jump Tissue Hurdle Long-Price Calibration",
    "",
    "## Executive Summary",
    `Frozen Jump Tissue was applied unchanged to 2025 and 2026 historical jump cache races. For SP >14/1 hurdle runners, Tissue expected ${fmt(hurdleLong.tissueExpected)} winners and observed ${hurdleLong.actualWinners}, a calibration ratio of ${fmt(hurdleLong.calibrationRatio)}. Chases expected ${fmt(chaseLong.tissueExpected)} and observed ${chaseLong.actualWinners}, ratio ${fmt(chaseLong.calibrationRatio)}.`,
    `Classification: **${report.classification}**. Recommendation: **${report.recommendation}**.`,
    "",
    "## Population Context",
    `Rows: ${report.population.runners}; races: ${report.population.races}; source: ${report.source}`,
    table(["Subtype", "Races", "Runners", "Winners", "Tissue exp", "Cal", "Market exp", "A/E"], SUBTYPES.map((sub) => {
      const row = report.population.bySubtype[sub];
      return [sub, row.races, row.runners, row.winners, fmt(row.tissueExpected), fmt(row.calibrationRatio), fmt(row.marketExpected), fmt(row.marketAe)];
    })),
    "## Hurdle Calibration by SP Band",
    summaryTable(report.bySpBand.HURDLE, true),
    "## Chase Calibration by SP Band",
    summaryTable(report.bySpBand.CHASE, true),
    "## Long-Price Comparison",
    summaryTable(report.longPrice.HURDLE.map((row) => ({ ...row, band: `HURDLE ${row.year}` })).concat(report.longPrice.CHASE.map((row) => ({ ...row, band: `CHASE ${row.year}` }))), false),
    "## Rank-1 Analysis",
    rankTable(report.rankOne),
    "## VALUE Analysis",
    "Retrospective final-SP positive edge uses rank-1 and Tissue probability greater than final-SP implied probability. It is context only, not a production qualification-price reconstruction.",
    rankTable(report.value.retrospectiveFinalSp),
    "Prospective qualification-price sample from the existing Jump Tissue tracker where historically valid:",
    prospectTable(report.value.prospectiveQualificationPrice),
    "## Tissue Probability Bands",
    summaryTable(report.probabilityBands.HURDLE.map((row) => ({ ...row, band: `HURDLE ${row.band}` })).concat(report.probabilityBands.CHASE.map((row) => ({ ...row, band: `CHASE ${row.band}` }))), false),
    "## 2025 vs 2026",
    `Hurdles: ${report.yearClassification.HURDLE}. Chases: ${report.yearClassification.CHASE}.`,
    "## Hurdle vs Chase",
    `Calibration absolute difference: ${fmt(report.directComparison.calibrationAbsoluteDifference)}; relative ratio: ${fmt(report.directComparison.calibrationRelativeRatio)}. Winner-rate difference: ${pct(report.directComparison.winnerRateAbsoluteDifference)}; market A/E difference: ${fmt(report.directComparison.marketAeAbsoluteDifference)}. Hurdle-specific overprediction: ${report.directComparison.hurdleSpecificOverprediction ? "yes" : "no"}.`,
    "## Calibration Classification",
    report.classification,
    "## Recommendation",
    report.recommendation,
    "",
  ].join("\n");
}

function summaryTable(rows: Array<Summary & { band: string }>, includeMean = false) {
  return table(
    ["Band", "Runners", "Tissue exp", "Actual", "Cal", ...(includeMean ? ["Mean p"] : []), "Market exp", "A/E"],
    rows.map((row) => [row.band, row.runners, fmt(row.tissueExpected), row.actualWinners, fmt(row.calibrationRatio), ...(includeMean ? [pct(row.meanTissueProbability)] : []), fmt(row.marketExpected), fmt(row.marketAe)]),
  );
}

function rankTable(rowsBySubtype: Record<Subtype, Array<Summary & { band: string }>>) {
  return table(["Subtype", "Band", "Selections", "Winners", "Strike", "Tissue exp", "Cal", "Market exp", "A/E", "ROI"], SUBTYPES.flatMap((sub) => rowsBySubtype[sub].map((row) => [sub, row.band, row.selections, row.winners, pct(row.strike), fmt(row.tissueExpected), fmt(row.calibrationRatio), fmt(row.marketExpected), fmt(row.marketAe), pct(row.roi)])));
}

function prospectTable(rowsBySubtype: ReturnType<typeof prospectiveValueSummaries>) {
  return table(["Subtype", "Band", "Selections", "Winners", "Tissue exp", "Actual", "Market exp", "A/E", "Qual ROI", "Final-SP ROI"], SUBTYPES.flatMap((sub) => rowsBySubtype[sub].map((row) => [sub, row.band, row.selections, row.winners, fmt(row.tissueExpected), row.actualWinners, fmt(row.marketExpected), fmt(row.marketAe), pct(row.qualifyingPriceRoi), pct(row.finalSpRoi)])));
}

function printTerminalSummary(report: ReturnType<typeof buildReport>) {
  const hurdle = report.longPrice.HURDLE.find((row) => row.year === "combined")!;
  const chase = report.longPrice.CHASE.find((row) => row.year === "combined")!;
  const rankHurdle = report.rankOne.HURDLE.find((row) => row.band === "SP >14/1")!;
  const valueHurdle = report.value.retrospectiveFinalSp.HURDLE.find((row) => row.band === "SP >14/1")!;
  const hurdle2025 = report.longPrice.HURDLE.find((row) => row.year === "2025")!;
  const hurdle2026 = report.longPrice.HURDLE.find((row) => row.year === "2026")!;
  console.log(`Wrote ${MARKDOWN_OUTPUT}`);
  console.log(`Wrote ${JSON_OUTPUT}`);
  console.log("");
  console.log("HURDLES SP >14/1");
  printCore(hurdle);
  console.log("");
  console.log("CHASES SP >14/1");
  printCore(chase);
  console.log("");
  console.log("RANK-1 HURDLES >14/1");
  console.log(`Selections: ${rankHurdle.selections}`);
  console.log(`Winners: ${rankHurdle.winners}`);
  console.log(`Tissue expected: ${fmt(rankHurdle.tissueExpected)}`);
  console.log(`Calibration: ${fmt(rankHurdle.calibrationRatio)}`);
  console.log(`A/E: ${fmt(rankHurdle.marketAe)}`);
  console.log("");
  console.log("VALUE HURDLES >14/1");
  console.log(`Selections: ${valueHurdle.selections}`);
  console.log(`Winners: ${valueHurdle.winners}`);
  console.log(`Tissue expected: ${fmt(valueHurdle.tissueExpected)}`);
  console.log(`Calibration: ${fmt(valueHurdle.calibrationRatio)}`);
  console.log(`A/E: ${fmt(valueHurdle.marketAe)}`);
  console.log("");
  console.log(`2025 hurdle long-price calibration: expected=${fmt(hurdle2025.tissueExpected)} actual=${hurdle2025.actualWinners} ratio=${fmt(hurdle2025.calibrationRatio)}`);
  console.log(`2026 hurdle long-price calibration: expected=${fmt(hurdle2026.tissueExpected)} actual=${hurdle2026.actualWinners} ratio=${fmt(hurdle2026.calibrationRatio)}`);
  console.log("");
  console.log(`Classification: ${report.classification}`);
  console.log(`Recommendation: ${report.recommendation.slice(0, 1)}`);
}

function printCore(row: Summary) {
  console.log(`Runners: ${row.runners}`);
  console.log(`Tissue expected: ${fmt(row.tissueExpected)}`);
  console.log(`Actual winners: ${row.actualWinners}`);
  console.log(`Calibration ratio: ${fmt(row.calibrationRatio)}`);
  console.log(`Market expected: ${fmt(row.marketExpected)}`);
  console.log(`Market A/E: ${fmt(row.marketAe)}`);
}

function inSpBand(sp: number, band: typeof SP_BANDS[number]) {
  const aboveMin = band.minInclusive ? sp >= band.min : sp > band.min;
  const belowMax = band.maxInclusive ? sp <= band.max : sp < band.max;
  return aboveMin && belowMax;
}
function isLongPrice(sp: number) { return sp > 15; }
function numericClass(value: string | null) { return Number(value?.match(/\d+/)?.[0] ?? NaN) || null; }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function average(values: number[]) { return values.length ? sum(values) / values.length : null; }
function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
}
function ratio(numerator: number, denominator: number) { return denominator === 0 ? null : numerator / denominator; }
function nullableBinary(left: number | null, right: number | null, fn: (left: number, right: number) => number | null) { return left === null || right === null ? null : fn(left, right); }
function fmt(value: number | null | undefined) { return value === null || value === undefined || !Number.isFinite(value) ? "-" : value.toFixed(4); }
function pct(value: number | null | undefined) { return value === null || value === undefined || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`; }
function groupBy<T, K>(values: T[], keyFor: (value: T) => K) {
  const groups = new Map<K, T[]>();
  for (const value of values) groups.set(keyFor(value), [...(groups.get(keyFor(value)) ?? []), value]);
  return groups;
}
function table(headers: string[], rows: Array<Array<string | number>>) {
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`), ""].join("\n");
}

await main();

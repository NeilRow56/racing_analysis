import {
  EDGE_BANDS,
  FORWARD_VALUE_CALIBRATION_PATH,
  FORWARD_VALUE_PATH,
  edgeBand,
  isCleanPhase2Observation,
  isCleanSettledPhase2Observation,
  loadForwardValueCalibration,
  loadForwardValueData,
  tissueValueAgreement,
  valueExclusionReason,
  valueSampleStatus,
  type FamilyCalibration,
  type ForwardValueData,
  type ForwardValueRecord,
  type ValueFamily,
} from "@/lib/racing/forward-value";
import { createDbConnection } from "@/db";
import { loadAwTissueForward, renderAwTissueValue } from "@/lib/racing/aw-tissue-forward";
import { loadJumpTissueForward, renderJumpTissueValue } from "@/lib/racing/jump-tissue-forward";
import { loadTissueForward, TISSUE_V2_CONFIG } from "@/lib/racing/tissue-forward";
import { getLocalRacingDate, getSportingLifeCurrentCardRaceStatuses, getSportingLifeCurrentPricesForDate } from "@/lib/racing/todays-racing";
import {
  buildForwardValueReportingScope,
  renderDailyPositiveTissueRankOneSummary,
  summarizeForwardValue,
  summarizeForwardValueRecords,
  type ForwardValueMovementMetrics,
  type ForwardValuePersistenceMetrics,
  type ForwardValuePriceDiagnostics,
} from "@/lib/racing/forward-value-summary";

const command = process.argv[2] ?? "summary";
if (command === "summary") await summary();
else if (command === "today") await today(process.argv[3] ?? getLocalRacingDate());
else throw new Error("Usage: report-forward-value.ts <summary|today> [YYYY-MM-DD]");

async function summary() {
  const today = getLocalRacingDate();
  const [data, calibration, dailyReport] = await Promise.all([
    loadForwardValueData(),
    loadForwardValueCalibration(),
    loadDailyPositiveTissueRankOneReport(today),
  ]);
  const reportingScope = await loadReportingScope(data);
  const analyticalRecords = reportingScope.analyticalRecords;
  const sharedSummary = summarizeForwardValue(data, reportingScope);
  const excluded = analyticalRecords.filter((race) => valueExclusionReason(race) !== null);

  console.log(dailyReport.output);
  console.log("");
  console.log("# Forward Value Framework - Phase 2");
  console.log("Prospective market validation only\n");
  console.log(`Tracker: ${FORWARD_VALUE_PATH}`);
  console.log(`Calibration: ${FORWARD_VALUE_CALIBRATION_PATH}`);
  console.log(`Frozen development=${calibration.developmentYear} validation=${calibration.validationYear} settlement=${calibration.settlementVersion} price=${calibration.priceVersion}\n`);
  console.log(`Total prospective observations: ${sharedSummary.totalProspectiveObservations}`);
  console.log(`Clean settled observations: ${sharedSummary.cleanSettledObservations}`);
  console.log(`Unsettled observations: ${sharedSummary.unsettledObservations}`);
  console.log(`Excluded observations: ${sharedSummary.excludedObservations}`);
  console.log(`Superseded race versions (audit only): ${sharedSummary.supersededRaceVersions}`);
  console.log(`Date range: ${sharedSummary.earliestObservationDate ? `${sharedSummary.earliestObservationDate} to ${sharedSummary.latestObservationDate}` : "-"}`);
  printExclusions(excluded);
  printFamilyCounts(analyticalRecords);
  if (sharedSummary.sparseSampleWarning) {
    console.log("\nSample warning: fewer than 25 clean settled observations overall. Results are VERY EARLY and no profitability conclusion is supported.");
  }

  for (const family of ["turf", "jump", "aw"] as ValueFamily[]) {
    const records = analyticalRecords.filter((race) => race.family === family);
    const cleanSettled = records.filter(isCleanSettledPhase2Observation);
    const familyCalibration = calibration.families[family];
    console.log(`\n## ${familyName(family)}`);
    console.log(`Model: ${familyCalibration.ratingVersion} / ${familyCalibration.calibrationVersion}`);
    printAllClean(cleanSettled);
    printPriceDiagnostics(sharedSummary.families.find((entry) => entry.family === family)!.priceDiagnostics);
    printEdgeBuckets(cleanSettled);
    printGapEdgeCrossTab(cleanSettled, familyCalibration);
    printFavouriteComparison(cleanSettled);
    if (family === "turf") printTissueComparison(cleanSettled);
  }
  console.log(`\n${renderJumpTissueValue(dailyReport.jumpTissue, analyticalRecords)}`);
  console.log(`\n${renderAwTissueValue(dailyReport.awTissue, analyticalRecords)}`);
  console.log("\nDiagnostic research only. Fixed buckets and sample labels do not define betting selections.");
}

async function loadCurrentPrices(date: string) {
  const connection = createDbConnection();
  try {
    return await getSportingLifeCurrentPricesForDate(connection.db, date);
  } finally {
    await connection.client.end();
  }
}

function printPriceDiagnostics(diagnostics: ForwardValuePriceDiagnostics) {
  const current = diagnostics.newSchedule;
  console.log(`\n### Price Snapshots (${current.scheduleVersion}, records=${current.records})`);
  console.log("Snapshot | Observations | Mean edge | Positive edge");
  console.log("---|---:|---:|---:");
  for (const [label, snapshot] of [
    ["Early", current.snapshots.early],
    ["T-180", current.snapshots.t180],
    ["T-60", current.snapshots.t60],
  ] as const) {
    console.log(`${label} | ${snapshot.observations} | ${ppPoints(snapshot.meanEdgePercentagePoints)} | ${pct(snapshot.positiveEdgeProportion)}`);
  }
  console.log("\nPrice movement | Comparable | Mean | Median | Shortened | Drifted | Unchanged");
  console.log("---|---:|---:|---:|---:|---:|---:");
  printMovement("Early -> T-180", current.movements.earlyToT180);
  printMovement("T-180 -> T-60", current.movements.t180ToT60);
  printMovement("T-60 -> final SP", current.movements.t60ToFinalSp);
  printMovement("Early -> final SP", current.movements.earlyToFinalSp);
  console.log("\nEdge persistence | Source positive | Comparable | Still positive (wins/strike) | Neutral or negative (wins/strike)");
  console.log("---|---:|---:|---:|---:");
  printPersistence("Early -> T-180", current.persistence.earlyToT180);
  printPersistence("Early -> T-60", current.persistence.earlyToT60);
  printPersistence("T-180 -> T-60", current.persistence.t180ToT60);

  const legacy = diagnostics.legacy;
  if (legacy.records === 0) return;
  console.log(`\n### Legacy Price Snapshots (unversioned, records=${legacy.records})`);
  console.log("Existing T-15 observations retain their original meaning.");
  console.log("Snapshot | Observations | Mean edge | Positive edge");
  console.log("---|---:|---:|---:");
  for (const [label, snapshot] of [
    ["Early", legacy.snapshots.early],
    ["T-60", legacy.snapshots.t60],
    ["T-15", legacy.snapshots.t15],
  ] as const) {
    console.log(`${label} | ${snapshot.observations} | ${ppPoints(snapshot.meanEdgePercentagePoints)} | ${pct(snapshot.positiveEdgeProportion)}`);
  }
  console.log("\nLegacy price movement | Comparable | Mean | Median | Shortened | Drifted | Unchanged");
  console.log("---|---:|---:|---:|---:|---:|---:");
  printMovement("Early -> T-60", legacy.movements.earlyToT60);
  printMovement("T-60 -> T-15", legacy.movements.t60ToT15);
  printMovement("T-15 -> final SP", legacy.movements.t15ToFinalSp);
  printMovement("Early -> final SP", legacy.movements.earlyToFinalSp);
  console.log("\nLegacy edge persistence | Source positive | Comparable | Still positive (wins/strike) | Neutral or negative (wins/strike)");
  console.log("---|---:|---:|---:|---:");
  printPersistence("Early -> T-60", legacy.persistence.earlyToT60);
  printPersistence("Early -> T-15", legacy.persistence.earlyToT15);
  printPersistence("T-60 -> T-15", legacy.persistence.t60ToT15);
}

function printMovement(label: string, value: ForwardValueMovementMetrics) {
  console.log(`${label} | ${value.observations} | ${signedRatio(value.meanMovement)} | ${signedRatio(value.medianMovement)} | ${pct(value.shorteningProportion)} | ${pct(value.driftingProportion)} | ${pct(value.unchangedProportion)}`);
}

function printPersistence(label: string, value: ForwardValuePersistenceMetrics) {
  console.log(`${label} | ${value.sourcePositiveObservations} | ${value.comparableObservations} | ${outcome(value.stillPositive)} | ${outcome(value.turnedNonPositive)}`);
}

async function today(date: string) {
  console.log((await loadDailyPositiveTissueRankOneReport(date)).output);
}

async function loadDailyPositiveTissueRankOneReport(date: string) {
  const [turfTissue, jumpTissue, awTissue, currentPrices] = await Promise.all([
    loadTissueForward(TISSUE_V2_CONFIG.forwardPath, TISSUE_V2_CONFIG),
    loadJumpTissueForward(),
    loadAwTissueForward(),
    loadCurrentPrices(date),
  ]);
  return {
    turfTissue,
    jumpTissue,
    awTissue,
    currentPrices,
    output: renderDailyPositiveTissueRankOneSummary({
      date,
      turf: turfTissue,
      jump: jumpTissue,
      aw: awTissue,
      currentPrices,
      currentRaceIds: new Set(currentPrices.map((price) => price.raceId)),
    }),
  };
}

async function loadReportingScope(data: ForwardValueData) {
  const connection = createDbConnection();
  try {
    const statuses = await getSportingLifeCurrentCardRaceStatuses(
      connection.db,
      data.races.map((race) => race.raceId),
    );
    return buildForwardValueReportingScope(data.races, statuses);
  } finally {
    await connection.client.end();
  }
}

function printExclusions(records: ForwardValueRecord[]) {
  const counts = new Map<string, number>();
  for (const race of records) {
    const reason = valueExclusionReason(race)!;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  console.log("Exclusions by reason:");
  if (counts.size === 0) console.log("  none");
  for (const [reason, count] of [...counts].sort()) console.log(`  ${reason}: ${count}`);
}

function printFamilyCounts(records: ForwardValueRecord[]) {
  console.log("\nFamily | Total | Clean settled | Unsettled | Excluded");
  console.log("---|---:|---:|---:|---:");
  for (const family of ["turf", "jump", "aw"] as ValueFamily[]) {
    const selected = records.filter((race) => race.family === family);
    console.log(`${familyName(family)} | ${selected.length} | ${selected.filter(isCleanSettledPhase2Observation).length} | ${selected.filter((race) => isCleanPhase2Observation(race) && race.settledAt === null).length} | ${selected.filter((race) => valueExclusionReason(race) !== null).length}`);
  }
}

function printAllClean(records: ForwardValueRecord[]) {
  const value = metrics(records);
  console.log(`Clean observations: ${value.observations} | sample: ${valueSampleStatus(value.observations)}`);
  console.log(`Wins: ${value.wins} | strike: ${pct(value.strike)} | mean calibrated: ${pct(value.meanModel)} | expected wins: ${num(value.expectedWins)} | actual minus expected: ${signed(value.actualMinusExpected)}`);
  console.log(`Mean market implied: ${pct(value.meanMarket)} | mean raw edge: ${ppPoints(value.meanEdge)} | rating A/E: ${num(value.ratingAe)} | market A/E: ${num(value.marketAe)}`);
  console.log(`Median-market P/L: ${returnLine(value.shared.medianMarketProfitLoss, value.shared.medianMarketRoi, value.shared.medianMarketSettled)} | best-bookmaker P/L: ${returnLine(value.shared.bestBookmakerProfitLoss, value.shared.bestBookmakerRoi, value.shared.bestBookmakerSettled)}`);
  console.log(`Legacy forecast P/L: ${returnLine(value.shared.legacyForecastProfitLoss, value.shared.legacyForecastRoi, value.shared.legacyForecastSettled)} | final-SP P/L: ${returnLine(value.shared.finalSpProfitLoss, value.shared.finalSpRoi, value.shared.finalSpSettled)} | BSP: unavailable`);
  console.log(`Captured-to-final SP movement: mean ${signedPct(value.meanMovement)} | median ${signedPct(value.medianMovement)} | n=${value.movementCount} (negative=shortened, positive=drifted)`);
}

function printEdgeBuckets(records: ForwardValueRecord[]) {
  console.log("\n### Edge Buckets");
  console.log("Bucket | Observations | Sample | Wins | Strike | Expected rate | Market implied | Mean edge | Median P/L | Legacy P/L | Final SP P/L | Calibration error");
  console.log("---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:");
  for (const band of EDGE_BANDS) {
    const value = metrics(records.filter((race) => race.edgePercentagePoints !== null && edgeBand(race.edgePercentagePoints) === band));
    console.log(`${band} | ${value.observations} | ${valueSampleStatus(value.observations)} | ${value.wins} | ${pct(value.strike)} | ${pct(value.meanModel)} | ${pct(value.meanMarket)} | ${ppPoints(value.meanEdge)} | ${money(value.shared.medianMarketProfitLoss)} | ${money(value.shared.legacyForecastProfitLoss)} | ${money(value.shared.finalSpProfitLoss)} | ${pp(value.calibrationError)}`);
  }
}

function printGapEdgeCrossTab(records: ForwardValueRecord[], calibration: FamilyCalibration) {
  console.log("\n### Rating Gap x Market Edge");
  console.log("Gap | Edge | Observations | Sample | Actual | Expected | Median P/L | Legacy P/L | Final SP P/L");
  console.log("---|---|---:|---|---:|---:|---:|---:|---:");
  for (const gap of calibration.gapBands) {
    for (const edge of EDGE_BANDS) {
      const selected = records.filter((race) => inGapBand(race.leaderGap, gap.minimumGap, gap.maximumGap) && race.edgePercentagePoints !== null && edgeBand(race.edgePercentagePoints) === edge);
      const value = metrics(selected);
      console.log(`${gap.key} | ${edge} | ${value.observations} | ${valueSampleStatus(value.observations)} | ${pct(value.strike)} | ${pct(value.meanModel)} | ${money(value.shared.medianMarketProfitLoss)} | ${money(value.shared.legacyForecastProfitLoss)} | ${money(value.shared.finalSpProfitLoss)}`);
    }
  }
}

function printFavouriteComparison(records: ForwardValueRecord[]) {
  console.log("\n### Favourite Status");
  console.log("Status | Observations | Sample | Wins | Strike | Expected | Market implied | Mean edge | Median P/L | Legacy P/L | Final SP P/L");
  console.log("---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:");
  for (const [label, favourite] of [["leader is favourite", true], ["leader is not favourite", false]] as const) {
    const value = metrics(records.filter((race) => (race.leaderIsMarketFavourite ?? race.agreesWithMarketFavourite) === favourite));
    console.log(`${label} | ${value.observations} | ${valueSampleStatus(value.observations)} | ${value.wins} | ${pct(value.strike)} | ${pct(value.meanModel)} | ${pct(value.meanMarket)} | ${ppPoints(value.meanEdge)} | ${money(value.shared.medianMarketProfitLoss)} | ${money(value.shared.legacyForecastProfitLoss)} | ${money(value.shared.finalSpProfitLoss)}`);
  }
}

function printTissueComparison(records: ForwardValueRecord[]) {
  const comparable = records.filter((race) => tissueValueAgreement(race) !== null);
  console.log("\n### Tissue v2 Comparison");
  console.log("Value signs | Observations | Sample | Rating wins | Tissue wins | Rating p | Tissue p | Rating market p | Tissue market p | Rating edge | Tissue edge");
  console.log("---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:");
  for (const agreement of ["both_positive", "both_non_positive", "disagree"] as const) {
    const selected = comparable.filter((race) => tissueValueAgreement(race) === agreement);
    console.log(`${agreement} | ${selected.length} | ${valueSampleStatus(selected.length)} | ${selected.filter((race) => race.leaderWon).length} | ${selected.filter((race) => race.tissueRunnerId !== null && race.winnerRunnerIds.includes(race.tissueRunnerId)).length} | ${pct(average(selected.map((race) => race.calibratedProbability)))} | ${pct(average(selected.map((race) => race.tissueProbability!)))} | ${pct(average(selected.map((race) => race.capturedMarketProbability!)))} | ${pct(average(selected.map((race) => race.tissueMarketProbability!)))} | ${ppPoints(average(selected.map((race) => race.edgePercentagePoints!)))} | ${ppPoints(average(selected.map((race) => race.tissueEdgePercentagePoints!)))}`);
  }
}

function metrics(records: ForwardValueRecord[]) {
  const shared = summarizeForwardValueRecords(records);
  const { observations, wins, expectedWins, profitLoss } = shared;
  const marketExpected = sum(records.map((race) => race.capturedMarketProbability!));
  const movements = records.flatMap((race) => race.capturedDecimalOdds && race.finalSp
    ? [(race.finalSp / race.capturedDecimalOdds - 1) * 100]
    : []);
  return {
    shared,
    observations,
    wins,
    strike: shared.strikeRate,
    meanModel: shared.expectedWinRate,
    expectedWins,
    actualMinusExpected: observations ? wins - expectedWins : null,
    meanMarket: shared.averageMarketImpliedProbability,
    meanEdge: shared.averageRatingEdgePercentagePoints,
    profitLoss,
    roi: shared.roi,
    ratingAe: expectedWins > 0 ? wins / expectedWins : null,
    marketAe: marketExpected > 0 ? wins / marketExpected : null,
    calibrationError: observations ? wins / observations - expectedWins / observations : null,
    meanMovement: average(movements),
    medianMovement: median(movements),
    movementCount: movements.length,
  };
}

function inGapBand(gap: number | null, minimum: number | null, maximum: number | null) { return gap !== null && (minimum === null || gap > minimum) && (maximum === null || gap <= maximum); }
function familyName(value: ValueFamily) { return value === "turf" ? "TPR / Turf" : value === "jump" ? "JPR-A / Jump" : "AW-D / All Weather"; }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function average(values: number[]) { return values.length ? sum(values) / values.length : null; }
function median(values: number[]) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2; }
function pct(value: number | null) { return value === null ? "-" : `${(value * 100).toFixed(1)}%`; }
function pp(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}pp`; }
function ppPoints(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}pp`; }
function num(value: number | null) { return value === null ? "-" : value.toFixed(3); }
function signed(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(3)}`; }
function money(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}`; }
function signedPct(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`; }
function signedRatio(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`; }
function outcome(value: { observations: number; settledObservations: number; wins: number; strikeRate: number | null }) {
  return `${value.observations} (${value.wins}/${value.settledObservations} settled, ${pct(value.strikeRate)})`;
}
function returnLine(profitLoss: number | null, roi: number | null, observations: number) {
  return profitLoss === null ? "-" : `${money(profitLoss)}, ROI ${pct(roi)}, n=${observations}`;
}

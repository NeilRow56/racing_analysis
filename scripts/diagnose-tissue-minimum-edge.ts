import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDbConnection } from "@/db";
import { isVoidBetResultStatus, settleSelection } from "@/lib/racing/backtest";
import { loadBacktestFeatureCache } from "@/lib/racing/backtest-cache";
import type { HistoricalPreRaceFeatureRow as Features } from "@/lib/racing/historical-target-metrics";
import { HURDLE_VALUE_MAX_DECIMAL_PRICE } from "@/lib/racing/hurdle-value-rule";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import { JUMP_TISSUE_MODEL_PATH, loadJumpTissueModel } from "@/lib/racing/jump-tissue-model";
import { cleanAwTissueRace, loadAwTissueForward } from "@/lib/racing/aw-tissue-forward";
import { AW_TISSUE_MODEL_PATH } from "@/lib/racing/aw-tissue-model";
import { cleanJumpTissueRace, loadJumpTissueForward } from "@/lib/racing/jump-tissue-forward";
import { loadForwardValueData } from "@/lib/racing/forward-value";
import { AW_TURF_VALUE_MAX_DECIMAL_PRICE } from "@/lib/racing/tissue-value-price-cap-rule";
import { TISSUE_V2_CONFIG, loadTissueForward } from "@/lib/racing/tissue-forward";
import { classifyHandicapStatus } from "@/lib/racing/research-rule";
import { loadHistoricalTissueDiagnostic, protectedHashes, type Entry } from "./diagnose-tissue-very-long-price-calibration";
import { commentVector, loadHistoricalComments, priorCommentsForTarget, raceSoftmax, score, type HistoricalComment } from "./diagnose-independent-tissue-feasibility";

const MD_PATH = "/tmp/tissue-minimum-edge-diagnostic.md";
const JSON_PATH = "/tmp/tissue-minimum-edge-diagnostic.json";
const YEARS = ["2025", "2026"] as const;
const PERIODS = [...YEARS, "combined"] as const;
const FAMILIES = ["FLAT TURF", "ALL WEATHER", "HURDLES", "CHASES"] as const;
const EDGE_BANDS = [[">0 to <1pp", 0, 1], ["1 to <2pp", 1, 2], ["2 to <5pp", 2, 5], ["5 to <10pp", 5, 10], ["10pp+", 10, Infinity]] as const;
const COMBINED_EDGE_BANDS = [["0-2pp", 0, 2], ["2-5pp", 2, 5], ["5pp+", 5, Infinity]] as const;
const RELATIVE_BANDS = [["1.00 to <1.10", 1, 1.10], ["1.10 to <1.25", 1.10, 1.25], ["1.25 to <1.50", 1.25, 1.50], ["1.50+", 1.50, Infinity]] as const;
const MARKET_BUCKETS = [["<10%", 0, 0.10], ["10-20%", 0.10, 0.20], ["20-30%", 0.20, 0.30], ["30%+", 0.30, Infinity]] as const;

type Family = typeof FAMILIES[number];
type Period = typeof PERIODS[number];
type DiagnosticEntry = Omit<Entry, "family"> & { family: Family };
type Row = DiagnosticEntry & { marketProbability: number; absoluteEdgePP: number; relativeRatio: number };
type Summary = {
  runners: number;
  selections: number;
  races: number;
  winners: number;
  actualWinners: number;
  strike: number | null;
  actualWinnerPercent: number | null;
  tissueExpected: number;
  calibrationRatio: number | null;
  marketExpected: number;
  marketAe: number | null;
  meanTissueProbability: number | null;
  medianTissueProbability: number | null;
  spProfitLoss: number;
  spRoi: number | null;
  qualifyingPricedSelections: number;
  qualifyingPriceProfitLoss: number | null;
  qualifyingPriceRoi: number | null;
};

const PRICE_CAPS: Record<Family, number | null> = {
  "FLAT TURF": AW_TURF_VALUE_MAX_DECIMAL_PRICE,
  "ALL WEATHER": AW_TURF_VALUE_MAX_DECIMAL_PRICE,
  HURDLES: HURDLE_VALUE_MAX_DECIMAL_PRICE,
  CHASES: null,
};

async function main() {
  const before = await protectedHashes();
  const historical = await loadHistoricalTissueDiagnostic();
  const hurdle = await loadHistoricalHurdles();
  const rows = [...historical.entries.map(remapFamily), ...hurdle].filter((row): row is Row => row !== null);
  const actualValue = [...historical.actualValue.map(remapFamily), ...storedHurdleValue(await loadJumpTissueForward())].filter((row): row is Row => row !== null);
  const today = await todaySanity();
  const report = buildReport(rows, actualValue, today, [...historical.coverage, ...hurdleCoverage]);
  const after = await protectedHashes();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Protected inputs changed during diagnostic");
  const artifact = { ...report, readOnlyVerification: { unchanged: true, fileHashes: after } };
  await writeFile(JSON_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(MD_PATH, renderMarkdown(report), "utf8");
  printTerminal(report);
}

let hurdleCoverage: Array<Record<string, unknown>> = [];

async function loadHistoricalHurdles(): Promise<Row[]> {
  const model = await loadJumpTissueModel();
  const connection = createDbConnection();
  let comments: Map<string, HistoricalComment[]>;
  try {
    comments = await loadHistoricalComments(connection.client);
  } finally {
    await connection.client.end();
  }
  const entries: Row[] = [];
  hurdleCoverage = [];
  for (const year of YEARS) {
    const cache = await loadBacktestFeatureCache({ from: `${year}-01-01`, to: `${year}-12-31`, family: "jump" });
    if (!cache) throw new Error(`Missing compatible HURDLES ${year} v4 cache`);
    const races = group(cache.rows.filter((row) => row.features.raceCode === "jump" && classifyJumpRaceSubtype(row.features) === "hurdle"), (row) => row.features.targetRaceId);
    const stats = { family: "HURDLES", year, cacheDirectory: cache.directory, generatedAt: cache.manifest.generatedAt, inputRaces: races.size, scoredRaces: 0, evaluatedValidSpStarters: 0, missingSpStarters: 0, exclusions: {} as Record<string, number> };
    for (const [raceId, raceRows] of races) {
      const active = raceRows.filter((row) => !isVoidBetResultStatus(row.outcome.resultStatus));
      const labels = active.map((row) => settleSelection({ ...row.outcome, startingPriceDecimal: "2" }));
      const winners = active.filter((row) => row.outcome.finishingPosition === 1 || row.outcome.won === true);
      const field = active[0]?.features.actualRunnerCount;
      const reason = active.length < 2 ? "fewer_than_two_starters"
        : new Set(active.map((row) => row.features.targetRunnerId)).size !== active.length ? "duplicate_runner"
          : raceRows.some((row) => row.features.targetRunnerId !== row.outcome.targetRunnerId || row.features.targetRaceId !== row.outcome.targetRaceId) ? "feature_outcome_mismatch"
            : field == null || raceRows.some((row) => row.features.actualRunnerCount !== field) || (field !== active.length && field !== raceRows.length) ? "incomplete_field"
              : labels.some((label) => label === null) || winners.length === 0 ? "unresolved_outcome" : null;
      if (reason) { stats.exclusions[reason] = (stats.exclusions[reason] ?? 0) + 1; continue; }
      if (active.some((row) => row.features.odds !== null || row.features.oddsDecimal !== null || (row.features.latestRunDate !== null && row.features.latestRunDate >= row.features.raceDate))) throw new Error(`Unsafe pre-race features: ${raceId}`);
      const values = active.map((row) => [...jumpNumericVector(row.features), ...commentVector(priorCommentsForTarget(comments.get(row.features.horseId) ?? [], row.features.raceDateTime))]);
      const probabilities = raceSoftmax(values.map((vector) => score(model.model, vector)));
      const order = [...active.keys()].sort((a, b) => probabilities[b]! - probabilities[a]! || active[a]!.features.targetRunnerId.localeCompare(active[b]!.features.targetRunnerId));
      stats.scoredRaces++;
      for (const [index, row] of active.entries()) {
        const won = row.outcome.finishingPosition === 1 || row.outcome.won === true;
        const settlement = settleSelection({ ...row.outcome, deadHeatDivisor: won ? winners.length : 1 });
        if (!settlement) { stats.missingSpStarters++; continue; }
        stats.evaluatedValidSpStarters++;
        entries.push(enrich({ family: "HURDLES", year, raceId, runnerId: row.features.targetRunnerId, horseName: row.features.horseName, raceDate: row.features.raceDate,
          sp: settlement.settlementOddsDecimal, won, probability: probabilities[index]!, rank: order.indexOf(index) + 1, spProfit: settlement.profitLoss, qualifyingPrice: null, qualifyingProfit: null }));
      }
    }
    hurdleCoverage.push(stats);
    console.log(`HURDLES ${year}: ${stats.scoredRaces} complete races, ${stats.evaluatedValidSpStarters} valid-SP starters`);
  }
  return entries;
}

type FamilyReport = ReturnType<typeof familyReport>;
type MinimumEdgeReport = {
  generatedAt: string;
  definitions: Record<string, string>;
  coverage: Array<Record<string, unknown>>;
  families: FamilyReport[];
  today: TodayRow[];
  terminal: string;
};

function buildReport(rows: Row[], storedValue: Row[], today: TodayRow[], coverage: Array<Record<string, unknown>>): MinimumEdgeReport {
  const currentRows = rows.filter((row) => row.rank === 1 && row.absoluteEdgePP > 0 && withinCurrentCap(row));
  const uncappedRows = rows.filter((row) => row.rank === 1 && row.absoluteEdgePP > 0);
  const families = FAMILIES.map((family) => familyReport(family, currentRows, uncappedRows, storedValue));
  return { generatedAt: new Date().toISOString(), definitions: {
    primaryCohort: "Frozen family Tissue rank 1, Tissue probability > market probability, valid final-SP market probability, current family price caps applied. Historical caps use final SP as the only broadly available market price; stored qualifying-price returns are separately reported only where genuinely retained.",
    edge: "absoluteEdgePP = (Tissue probability - market probability) * 100. Relative ratio = Tissue probability / market probability.",
    roi: "Qualifying-price ROI is only from stored prospective qualifying-price records where returns are available; final-SP ROI is retrospective context only.",
    replication: "2025 is in-sample/training-period context; 2026 is partial holdout. Labels are descriptive, based on whether weak calibration or weak market A/E repeats across both years with non-trivial sample.",
    safety: "Diagnostic only. No VALUE rules, models, trackers, settlement, UI or historical data were changed.",
  }, coverage, families, today, terminal: terminalSummary(families, today) };
}

function familyReport(family: Family, currentRows: Row[], uncappedRows: Row[], storedValue: Row[]) {
  const scoped = currentRows.filter((row) => row.family === family);
  const uncapped = uncappedRows.filter((row) => row.family === family);
  const periods = PERIODS.map((period) => periodReport(scoped.filter((row) => period === "combined" || row.year === period), period));
  const smallVsLarge = PERIODS.map((period) => compareReport(scoped.filter((row) => period === "combined" || row.year === period), period, [["EDGE >0 but <2pp", 0, 2], ["EDGE >=2pp", 2, Infinity]]));
  const fiveCheck = PERIODS.map((period) => compareReport(scoped.filter((row) => period === "combined" || row.year === period), period, [["EDGE <5pp", 0, 5], ["EDGE >=5pp", 5, Infinity]]));
  const relative = PERIODS.map((period) => ({ period, bands: RELATIVE_BANDS.map(([band, min, max]) => ({ band, ...summarizeRows(scoped.filter((row) => (period === "combined" || row.year === period) && inBand(row.relativeRatio, min, max, min === 1))) })) }));
  const marketContext = PERIODS.map((period) => ({ period, buckets: MARKET_BUCKETS.flatMap(([bucket, min, max]) => COMBINED_EDGE_BANDS.map(([edgeBandName, edgeMin, edgeMax]) => ({ bucket, edgeBand: edgeBandName, ...summarizeRows(scoped.filter((row) => (period === "combined" || row.year === period) && row.marketProbability >= min && row.marketProbability < max && inBand(row.absoluteEdgePP, edgeMin, edgeMax, edgeMin === 0))) }))) }));
  const candidates = PERIODS.map((period) => candidateReport(scoped.filter((row) => period === "combined" || row.year === period), period));
  return { family, priceCap: PRICE_CAPS[family], periods, smallVsLarge, fiveCheck, relative, marketContext, candidates,
    storedValue: PERIODS.map((period) => ({ period, ...storedValueSummary(storedValue.filter((row) => row.family === family && (period === "combined" || row.year === period) && withinCurrentCap(row))) })),
    uncappedCombined: summarizeRows(uncapped), recommendation: recommend(scoped), interaction: priceCapInteraction(uncapped, family) };
}

function periodReport(rows: Row[], period: Period) {
  return { period, edgeBands: EDGE_BANDS.map(([band, min, max]) => ({ band, ...summarizeRows(rows.filter((row) => inBand(row.absoluteEdgePP, min, max, min === 0))) })),
    combinedEdgeBands: COMBINED_EDGE_BANDS.map(([band, min, max]) => ({ band, ...summarizeRows(rows.filter((row) => inBand(row.absoluteEdgePP, min, max, min === 0))) })),
    replication: replicationLabel(rows) };
}
function compareReport(rows: Row[], period: Period, bands: readonly (readonly [string, number, number])[]) {
  return { period, bands: bands.map(([band, min, max]) => ({ band, ...summarizeRows(rows.filter((row) => inBand(row.absoluteEdgePP, min, max, min === 0))) })) };
}
function candidateReport(rows: Row[], period: Period) {
  const current = rows;
  const candidates = [
    ["CURRENT", (row: Row) => row.absoluteEdgePP > 0],
    ["MIN_2PP", (row: Row) => row.absoluteEdgePP >= 2],
    ["MIN_5PP", (row: Row) => row.absoluteEdgePP >= 5],
    ["MIN_RELATIVE_1_25", (row: Row) => row.relativeRatio >= 1.25],
  ] as const;
  return { period, candidates: candidates.map(([candidate, fn]) => {
    const retained = current.filter(fn);
    return { candidate, retained: retained.length, retainedPercent: ratio(retained.length, current.length), ...summarizeRows(retained) };
  }) };
}
function priceCapInteraction(rows: Row[], family: Family) {
  const cap = PRICE_CAPS[family];
  const min2 = (row: Row) => row.absoluteEdgePP >= 2;
  const pricePass = (row: Row) => cap === null || row.sp <= cap;
  return { uncappedCurrentSelections: rows.length, removedByPriceCapAlone: rows.filter((row) => !pricePass(row) && min2(row)).length,
    removedByMinimumEdgeAlone: rows.filter((row) => pricePass(row) && !min2(row)).length,
    removedByBoth: rows.filter((row) => !pricePass(row) && !min2(row)).length };
}

function summarizeRows(rows: Row[]): Summary {
  const winners = rows.filter((row) => row.won).length;
  const tissueExpected = sum(rows.map((row) => row.probability));
  const marketExpected = sum(rows.map((row) => row.marketProbability));
  const spProfitLoss = sum(rows.map((row) => row.spProfit));
  return {
    runners: rows.length,
    selections: rows.length,
    races: new Set(rows.map((row) => row.raceId)).size,
    winners,
    actualWinners: winners,
    strike: ratio(winners, rows.length),
    actualWinnerPercent: rows.length ? 100 * winners / rows.length : null,
    tissueExpected,
    calibrationRatio: ratio(winners, tissueExpected),
    marketExpected,
    marketAe: ratio(winners, marketExpected),
    meanTissueProbability: average(rows.map((row) => row.probability)),
    medianTissueProbability: median(rows.map((row) => row.probability)),
    spProfitLoss,
    spRoi: ratio(spProfitLoss, rows.length),
    qualifyingPricedSelections: rows.filter((row) => row.qualifyingProfit !== null).length,
    qualifyingPriceProfitLoss: rows.length && rows.every((row) => row.qualifyingProfit !== null) ? sum(rows.map((row) => row.qualifyingProfit!)) : null,
    qualifyingPriceRoi: rows.length && rows.every((row) => row.qualifyingProfit !== null) ? sum(rows.map((row) => row.qualifyingProfit!)) / rows.length : null,
  };
}
function storedValueSummary(rows: Row[]) {
  const s = summarizeRows(rows);
  return { ...s, availability: rows.length === 0 ? "No stored qualifying-price VALUE observations in this cohort."
    : s.qualifyingPricedSelections === rows.length ? "Complete stored qualifying-price returns for this sparse prospective subset."
      : "Stored qualifying prices exist, but returns are incomplete; missing returns are not reconstructed." };
}

function remapFamily(entry: Entry): Row | null {
  const family = entry.family === "FLAT TURF" ? "FLAT TURF" : entry.family === "ALL WEATHER" ? "ALL WEATHER" : entry.family === "CHASE" ? "CHASES" : null;
  return family ? enrich({ ...entry, family }) : null;
}
function enrich(entry: DiagnosticEntry): Row {
  const marketProbability = 1 / entry.sp;
  return { ...entry, marketProbability, absoluteEdgePP: (entry.probability - marketProbability) * 100, relativeRatio: entry.probability / marketProbability };
}
function withinCurrentCap(row: Row) {
  const cap = PRICE_CAPS[row.family];
  return cap === null || row.sp <= cap;
}
function inBand(value: number, min: number, max: number, includeMin: boolean) {
  return (includeMin ? value > min : value >= min) && value < max;
}
function replicationLabel(rows: Row[]) {
  const y2025 = summarizeRows(rows.filter((row) => row.year === "2025"));
  const y2026 = summarizeRows(rows.filter((row) => row.year === "2026"));
  const weak = (s: Summary) => s.selections >= 10 && ((s.marketAe !== null && s.marketAe < 1) || (s.calibrationRatio !== null && s.calibrationRatio < 0.85));
  if (y2025.selections < 10 || y2026.selections < 10) return "TOO SMALL";
  if (weak(y2025) && weak(y2026)) return "REPLICATED";
  if (weak(y2025)) return "2025 ONLY";
  if (weak(y2026)) return "2026 ONLY";
  return "MIXED";
}
function recommend(rows: Row[]) {
  const small = summarizeRows(rows.filter((row) => row.absoluteEdgePP < 2));
  const ge2 = summarizeRows(rows.filter((row) => row.absoluteEdgePP >= 2));
  const ge5 = summarizeRows(rows.filter((row) => row.absoluteEdgePP >= 5));
  if (rows.length < 50 || small.selections < 20) return "MORE DATA";
  const smallWeak = (small.marketAe ?? 1) < 0.95 || (small.calibrationRatio ?? 1) < 0.85;
  const ge2Useful = ge2.selections >= Math.max(20, rows.length * 0.35) && (ge2.marketAe ?? 0) >= 1 && (ge2.calibrationRatio ?? 0) >= 0.75;
  const ge5TooSparse = ge5.selections < rows.length * 0.25;
  if (smallWeak && ge2Useful) return "2PP";
  if (smallWeak && !ge5TooSparse && (ge5.marketAe ?? 0) >= 1) return "5PP";
  return "CURRENT";
}

type TodayRow = { family: Family; raceTime: string; course: string; horseName: string; tissueProbability: number; marketProbability: number; absoluteEdgePP: number; relativeRatio: number; qualifyingPrice: number; status: string; source: string };
async function todaySanity(): Promise<TodayRow[]> {
  const date = "2026-10-13";
  const [turf, jump, aw, values] = await Promise.all([loadTissueForward(TISSUE_V2_CONFIG.forwardPath, TISSUE_V2_CONFIG), loadJumpTissueForward(), loadAwTissueForward(), loadForwardValueData()]);
  const rows: TodayRow[] = [];
  for (const record of values.races.filter((record) => record.raceDate === date && record.family === "turf" && record.tissueProbability !== null)) {
    const q = record.tissueValuePriceCapRule?.qualification?.snapshot ?? record.tissueEarlyPriceSnapshot ?? record.tissueT180PriceSnapshot ?? record.tissueT60PriceSnapshot;
    if (!q || q.ratingEdgePercentagePoints <= 0) continue;
    const tissueProbability = record.tissueProbability;
    if (tissueProbability === null) continue;
    rows.push({ family: "FLAT TURF", raceTime: record.raceTime, course: record.course, horseName: record.tissueHorseName ?? "-", tissueProbability, marketProbability: q.impliedProbability,
      absoluteEdgePP: q.ratingEdgePercentagePoints, relativeRatio: tissueProbability / q.impliedProbability, qualifyingPrice: q.decimalPrice, status: record.tissueValuePriceCapRule?.excludedByPriceCap ? "LONG_PRICE_SHADOW" : "MAIN", source: "forward-value" });
  }
  for (const race of turf.races.filter((race) => race.raceDate === date && race.recordedPreRace === true && race.winners.length === 0)) {
    const runner = race.runners.find((entry) => entry.tissueRank === 1);
    if (!runner) continue;
    const already = rows.some((row) => row.family === "FLAT TURF" && row.horseName === runner.horseName && row.course === race.course);
    if (!already) rows.push({ family: "FLAT TURF", raceTime: race.raceTime, course: race.course, horseName: runner.horseName, tissueProbability: runner.probability, marketProbability: NaN, absoluteEdgePP: NaN, relativeRatio: NaN, qualifyingPrice: NaN, status: "NO_STORED_PRICE", source: "tissue-forward" });
  }
  for (const race of jump.races.filter((race) => race.raceDate === date && cleanJumpTissueRace(race) && race.settledAt === null)) {
    const runner = race.runners.find((entry) => entry.runnerId === race.top1);
    const price = race.hurdleValueRule?.qualification?.snapshot ?? race.prices.t60 ?? race.prices.t180 ?? race.prices.early;
    if (!runner?.probability || !price || price.ratingEdgePercentagePoints <= 0) continue;
    const family: Family = race.subtype === "Hurdle" ? "HURDLES" : race.subtype === "Chase" ? "CHASES" : "CHASES";
    rows.push({ family, raceTime: race.scheduledTime.slice(0, 5), course: race.course, horseName: runner.horseName, tissueProbability: runner.probability, marketProbability: price.impliedProbability,
      absoluteEdgePP: price.ratingEdgePercentagePoints, relativeRatio: runner.probability / price.impliedProbability, qualifyingPrice: price.decimalPrice, status: race.subtype === "Hurdle" && race.hurdleValueRule?.excludedByPriceCap ? "LONG_PRICE_SHADOW" : "MAIN", source: "jump-tissue" });
  }
  for (const race of aw.races.filter((race) => race.raceDate === date && cleanAwTissueRace(race) && race.settledAt === null)) {
    const runner = race.runners.find((entry) => entry.runnerId === race.top1);
    const price = race.tissueValuePriceCapRule?.qualification?.snapshot ?? race.prices.t60 ?? race.prices.t180 ?? race.prices.early;
    if (!runner?.probability || !price || price.ratingEdgePercentagePoints <= 0) continue;
    rows.push({ family: "ALL WEATHER", raceTime: race.scheduledTime.slice(0, 5), course: race.course, horseName: runner.horseName, tissueProbability: runner.probability, marketProbability: price.impliedProbability,
      absoluteEdgePP: price.ratingEdgePercentagePoints, relativeRatio: runner.probability / price.impliedProbability, qualifyingPrice: price.decimalPrice, status: race.tissueValuePriceCapRule?.excludedByPriceCap ? "LONG_PRICE_SHADOW" : "MAIN", source: "aw-tissue" });
  }
  return rows.sort((a, b) => a.raceTime.localeCompare(b.raceTime) || a.course.localeCompare(b.course));
}

function storedHurdleValue(jump: Awaited<ReturnType<typeof loadJumpTissueForward>>): Row[] {
  return jump.races.filter((race) => race.subtype === "Hurdle" && cleanJumpTissueRace(race) && race.settledAt && race.hurdleValueRule?.qualification && race.hurdleValueRule.normalValueCriteriaPassed === true).flatMap((race) => {
    const leader = race.runners.find((runner) => runner.runnerId === race.top1);
    if (!leader?.probability || !leader.outcome?.finalSp || leader.outcome.won === null || race.selectedPriceProfitLoss.finalSp === null) return [];
    return [enrich({ family: "HURDLES", year: race.raceDate.slice(0, 4), raceId: race.raceId, runnerId: leader.runnerId, horseName: leader.horseName, raceDate: race.raceDate,
      sp: leader.outcome.finalSp, won: leader.outcome.won, probability: leader.probability, rank: 1, spProfit: race.selectedPriceProfitLoss.finalSp, qualifyingPrice: race.hurdleValueRule!.qualification!.qualifyingPrice,
      qualifyingProfit: race.hurdleValueRule!.qualifyingPriceProfitLoss })];
  });
}

function renderMarkdown(r: MinimumEdgeReport) {
  const lines = ["# Tissue Minimum Edge Diagnostic", "", "## Executive Summary", "", table(r.families.map((f) => {
    const combined = f.periods.find((p) => p.period === "combined")!;
    return { family: f.family, currentSelections: combined.combinedEdgeBands.reduce((n, row) => n + row.selections, 0), recommendation: f.recommendation, priceCap: f.priceCap ?? "none", uncappedSelections: f.uncappedCombined.selections };
  })), ...Object.entries(r.definitions).map(([key, value]) => `- ${key}: ${value}`), "", "## Current Rule", table(r.families.map((f) => ({ family: f.family, priceCap: f.priceCap ?? "none", recommendation: f.recommendation, interaction: JSON.stringify(f.interaction) }))), "## Today's Sanity Check", table(r.today.map(todayTableRow)), "## Edge Bands"];
  for (const f of r.families) {
    lines.push(`## ${title(f.family)}`, "Current-cap primary cohort.", "");
    for (const p of f.periods) lines.push(`### ${p.period}`, metricTable(p.edgeBands), "Combined:", metricTable(p.combinedEdgeBands), `Replication label: ${p.replication}`, "");
    lines.push("### Small Edge Question", ...f.smallVsLarge.map((p) => `Period ${p.period}\n${metricTable(p.bands)}`), "### 5pp Check", ...f.fiveCheck.map((p) => `Period ${p.period}\n${metricTable(p.bands)}`));
    lines.push("### Relative Edge", ...f.relative.map((p) => `Period ${p.period}\n${metricTable(p.bands)}`));
    lines.push("### Market Probability Context", ...f.marketContext.map((p) => `Period ${p.period}\n${metricTable(p.buckets)}`));
    lines.push("### Candidate Rules", ...f.candidates.map((p) => `Period ${p.period}\n${table(p.candidates)}`));
    lines.push("### Qualifying-Price ROI", table(f.storedValue), "");
  }
  lines.push("## 2025 vs 2026", table(r.families.flatMap((f) => f.periods.filter((p) => p.period !== "combined").map((p) => ({ family: f.family, period: p.period, replication: p.replication })))));
  lines.push("## Price-Cap Interaction", table(r.families.map((f) => ({ family: f.family, ...f.interaction }))));
  lines.push("## Recommendation", ...r.families.map((f) => `- ${f.family}: **${f.recommendation}**. Read alongside annual replication, retained sample, and stored qualifying-price availability.`), "");
  return lines.join("\n");
}
function printTerminal(report: MinimumEdgeReport) {
  console.log(`Wrote ${MD_PATH}\nWrote ${JSON_PATH}`);
  console.log(report.terminal);
}
function terminalSummary(families: FamilyReport[], today: TodayRow[]) {
  const blocks = families.map((f) => {
    const combined = f.periods.find((p) => p.period === "combined")!;
    const get = (band: string) => combined.combinedEdgeBands.find((row) => row.band === band)!;
    return `${short(f.family)}\n0-2pp:\nSelections: ${get("0-2pp").selections}\nA/E: ${fmt(get("0-2pp").marketAe)}\nCalibration: ${fmt(get("0-2pp").calibrationRatio)}\n\n2-5pp:\nSelections: ${get("2-5pp").selections}\nA/E: ${fmt(get("2-5pp").marketAe)}\nCalibration: ${fmt(get("2-5pp").calibrationRatio)}\n\n5pp+:\nSelections: ${get("5pp+").selections}\nA/E: ${fmt(get("5pp+").marketAe)}\nCalibration: ${fmt(get("5pp+").calibrationRatio)}\n\nRecommended minimum:\n${f.recommendation}`;
  });
  const current = today.filter((row) => row.status === "MAIN");
  return `${blocks.join("\n\n")}\n\nCURRENT-DAY:\nSelections under current rule: ${current.length}\nWould remain at 2pp: ${current.filter((row) => row.absoluteEdgePP >= 2).length}\nWould remain at 5pp: ${current.filter((row) => row.absoluteEdgePP >= 5).length}\n\nFINAL RECOMMENDATION:\n${families.map((f) => `${short(f.family)}: ${f.recommendation}`).join("\n")}`;
}

function jumpNumericVector(f: Features) {
  const handicap = classifyHandicapStatus(f);
  const raceClass = f.raceClass?.match(/\d+/);
  const raw = [f.officialRating, f.latestJumpSpeedRating, f.bestJumpSpeedLast3, f.averageJumpSpeedLast3,
    f.trainerPriorWinRate, Math.log1p(f.trainerPriorRuns), f.jockeyPriorWinRate ?? null, Math.log1p(f.jockeyPriorRuns ?? 0),
    f.daysSinceLastRun, Math.log1p(f.priorRuns), f.horseAge, f.weightCarriedLbs, raceClass ? Number(raceClass[0]) : null,
    f.distanceYards === null ? null : f.distanceYards / 220, f.actualRunnerCount ?? f.declaredRunnerCount,
    handicap === "unknown" ? null : handicap === "handicap" ? 1 : 0, /soft|heavy/i.test(f.going ?? "") ? 1 : 0, /firm/i.test(f.going ?? "") ? 1 : 0];
  return [...raw.map((value) => value !== null && Number.isFinite(value) ? value : 0), ...raw.map((value) => value !== null && Number.isFinite(value) ? 0 : 1)];
}
function table(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "No rows.\n";
  const keys = Object.keys(rows[0]!);
  const cell = (value: unknown) => (value == null ? "-" : typeof value === "number" ? Number.isInteger(value) ? String(value) : value.toFixed(4) : typeof value === "object" ? JSON.stringify(value) : String(value)).replaceAll("|", "\\|");
  return [`| ${keys.join(" | ")} |`, `| ${keys.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${keys.map((key) => cell(row[key])).join(" | ")} |`), ""].join("\n");
}
function metricTable(rows: Array<Summary & Record<string, unknown>>) {
  return table(rows.map((s) => ({ cohort: s.band ?? s.bucket ?? s.edgeBand ?? s.period ?? "-", selections: s.selections, winners: s.winners, strike: s.strike, tissueExpected: s.tissueExpected, calibration: s.calibrationRatio, marketExpected: s.marketExpected, marketAe: s.marketAe, qualifyingPriceProfitLoss: s.qualifyingPriceProfitLoss, qualifyingPriceRoi: s.qualifyingPriceRoi, finalSpRoiContext: s.spRoi })));
}
function todayTableRow(row: TodayRow) { return { horse: row.horseName, family: row.family, tissueProbability: row.tissueProbability, marketProbability: Number.isFinite(row.marketProbability) ? row.marketProbability : null, absoluteEdgePP: Number.isFinite(row.absoluteEdgePP) ? row.absoluteEdgePP : null, relativeRatio: Number.isFinite(row.relativeRatio) ? row.relativeRatio : null, qualifyingPrice: Number.isFinite(row.qualifyingPrice) ? row.qualifyingPrice : null, status: row.status, source: row.source }; }
function title(family: Family) { return family === "ALL WEATHER" ? "AW" : family === "FLAT TURF" ? "Turf" : family === "HURDLES" ? "Hurdles" : "Chases"; }
function short(family: Family) { return family === "ALL WEATHER" ? "AW" : family === "FLAT TURF" ? "TURF" : family; }
function group<T>(rows: T[], key: (row: T) => string) { const map = new Map<string, T[]>(); for (const row of rows) { const k = key(row); const bucket = map.get(k) ?? []; bucket.push(row); map.set(k, bucket); } return map; }
function sum(values: number[]) { return values.reduce((a, b) => a + b, 0); }
function ratio(a: number, b: number) { return b > 0 ? a / b : null; }
function average(values: number[]) { return values.length ? sum(values) / values.length : null; }
function median(values: number[]) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2; }
function fmt(value: number | null) { return value === null ? "-" : value.toFixed(4); }

export async function protectedMinimumEdgeHashes() {
  const paths = [JUMP_TISSUE_MODEL_PATH, AW_TISSUE_MODEL_PATH, TISSUE_V2_CONFIG.modelPath,
    "data/research/jump-tissue-forward-v1.json", "data/research/aw-tissue-forward-v1.json", TISSUE_V2_CONFIG.forwardPath, "data/research/forward-value-v1.json"];
  return Object.fromEntries(await Promise.all(paths.map(async (path) => [path, createHash("sha256").update(await readFile(path)).digest("hex")] as const)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();

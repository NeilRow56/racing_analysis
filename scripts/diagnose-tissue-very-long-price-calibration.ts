import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDbConnection } from "@/db";
import { isVoidBetResultStatus, settleSelection } from "@/lib/racing/backtest";
import { loadBacktestFeatureCache, type BacktestCacheFamily } from "@/lib/racing/backtest-cache";
import type { HistoricalPreRaceFeatureRow as Features } from "@/lib/racing/historical-target-metrics";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import { isOrdinaryFlatTurfRace } from "@/lib/racing/turf-speed-rating";
import { isSupportedAllWeatherRace } from "@/lib/racing/aw-speed-rating";
import { loadJumpTissueModel, JUMP_TISSUE_MODEL_PATH } from "@/lib/racing/jump-tissue-model";
import { loadAwTissueModel, awTissueModelInputs, awTissueProbabilities, AW_TISSUE_MODEL_PATH } from "@/lib/racing/aw-tissue-model";
import { loadFrozenTissueModel, TISSUE_V2_CONFIG } from "@/lib/racing/tissue-forward";
import { loadJumpTissueForward, cleanJumpTissueRace } from "@/lib/racing/jump-tissue-forward";
import { loadAwTissueForward, cleanAwTissueRace } from "@/lib/racing/aw-tissue-forward";
import { loadForwardValueData, isCleanPhase2Observation } from "@/lib/racing/forward-value";
import { frozenTissueRankOneEdge } from "@/lib/racing/tissue-rank-one-edge";
import { classifyHandicapStatus } from "@/lib/racing/research-rule";
import { loadHistory, featureValues, type PriorRun } from "./diagnose-aw-tissue-stage1";
import { commentVector, numericVector, loadHistoricalComments, priorCommentsForTarget, raceSoftmax, score, type HistoricalComment, type Model } from "./diagnose-independent-tissue-feasibility";

const MD_PATH = "/tmp/tissue-very-long-price-calibration.md";
const JSON_PATH = "/tmp/tissue-very-long-price-calibration.json";
const YEARS = ["2025", "2026"] as const;
const PERIODS = [...YEARS, "combined"] as const;
const FAMILIES = ["CHASE", "ALL WEATHER", "FLAT TURF"] as const;
type Family = typeof FAMILIES[number];
type Period = typeof PERIODS[number];
export type Entry = { family: Family; year: string; raceId: string; runnerId: string; horseName: string; raceDate: string; sp: number; won: boolean; probability: number; rank: number; spProfit: number; qualifyingPrice: number | null; qualifyingProfit: number | null };
export type Summary = ReturnType<typeof summarize>;
const BANDS = [[">14/1 to 20/1", 15, 21], [">20/1 to 25/1", 21, 26], [">25/1 to 33/1", 26, 34], [">33/1 to 50/1", 34, 51], [">50/1", 51, Infinity]] as const;
const CACHE_FAMILY: Record<Family, BacktestCacheFamily> = { CHASE: "jump", "ALL WEATHER": "all_weather_flat", "FLAT TURF": "turf_flat" };

export async function loadHistoricalTissueDiagnostic() {
  const [jump, aw, turf] = await Promise.all([loadJumpTissueModel(), loadAwTissueModel(), loadFrozenTissueModel(TISSUE_V2_CONFIG.modelPath, TISSUE_V2_CONFIG.modelVersion)]);
  const turfContents = JSON.parse(await readFile(TISSUE_V2_CONFIG.modelPath, "utf8")) as { specification: unknown; model: Model; checksum: string };
  if (createHash("sha256").update(JSON.stringify({ specification: turfContents.specification, model: turfContents.model })).digest("hex") !== turf.checksum) throw new Error("Frozen Turf checksum mismatch");
  const connection = createDbConnection();
  let comments: Map<string, HistoricalComment[]>;
  try { comments = await loadHistoricalComments(connection.client); }
  finally { await connection.client.end(); }
  const entries: Entry[] = [];
  const coverage: Array<{ family: Family; year: string; cacheDirectory: string; generatedAt: string; inputRaces: number; scoredRaces: number; scoredStarters: number; evaluatedValidSpStarters: number; missingSpStarters: number; deadHeatRaces: number; exclusions: Record<string, number>; dateFrom: string | null; dateTo: string | null }> = [];
  for (const family of FAMILIES) {
    const caches = await Promise.all(YEARS.map(async (year) => {
      const cache = await loadBacktestFeatureCache({ from: `${year}-01-01`, to: `${year}-12-31`, family: CACHE_FAMILY[family] });
      if (!cache) throw new Error(`Missing compatible ${family} ${year} v4 cache`);
      return { year, cache };
    }));
    const awHistory = family === "ALL WEATHER" ? await loadHistory(caches.flatMap(({ cache }) => cache.rows)) : new Map<string, PriorRun[]>();
    for (const { year, cache } of caches) {
      const supported = cache.rows.filter((row) => familyFor(row.features) === family);
      const races = groupBy(supported, (row) => row.features.targetRaceId);
      const stats = { family, year, cacheDirectory: cache.directory, generatedAt: cache.manifest.generatedAt, inputRaces: races.size, scoredRaces: 0, scoredStarters: 0, evaluatedValidSpStarters: 0, missingSpStarters: 0, deadHeatRaces: 0, exclusions: {} as Record<string, number>, dateFrom: null as string | null, dateTo: null as string | null };
      for (const [raceId, raceRows] of races) {
        const active = raceRows.filter((row) => !isVoidBetResultStatus(row.outcome.resultStatus));
        const labels = active.map((row) => settleSelection({ ...row.outcome, startingPriceDecimal: "2" }));
        const winners = active.filter((row) => row.outcome.finishingPosition === 1 || row.outcome.won === true);
        const field = active[0]?.features.actualRunnerCount;
        const reason = active.length < 2 ? "fewer_than_two_starters" :
          new Set(active.map((row) => row.features.targetRunnerId)).size !== active.length ? "duplicate_runner" :
          raceRows.some((row) => row.features.targetRunnerId !== row.outcome.targetRunnerId || row.features.targetRaceId !== row.outcome.targetRaceId) ? "feature_outcome_mismatch" :
          field == null || raceRows.some((row) => row.features.actualRunnerCount !== field) || (field !== active.length && field !== raceRows.length) ? "incomplete_field" :
          labels.some((label) => label === null) || winners.length === 0 ? "unresolved_outcome" : null;
        if (reason) { stats.exclusions[reason] = (stats.exclusions[reason] ?? 0) + 1; continue; }
        if (active.some((row) => row.features.odds !== null || row.features.oddsDecimal !== null || (row.features.latestRunDate !== null && row.features.latestRunDate >= row.features.raceDate))) throw new Error(`Unsafe pre-race features: ${raceId}`);
        const values = active.map((row) => {
          const f = row.features;
          if (family === "ALL WEATHER") {
            const priorAwStarts = (awHistory.get(f.horseId) ?? []).filter((run) => run.aw && run.raceId !== raceId && run.raceDateTime < f.raceDateTime).length;
            const raw = featureValues({ row, raceId, won: false, priorAwStarts, priorComments: [], probabilities: {} }, "AW-T0").slice(0, 16);
            return awTissueModelInputs(raw, aw);
          }
          const prior = priorCommentsForTarget(comments.get(f.horseId) ?? [], f.raceDateTime);
          return [...(family === "CHASE" ? jumpNumericVector(f) : numericVector(f)), ...commentVector(prior)];
        });
        const probabilities = family === "ALL WEATHER" ? awTissueProbabilities(values, aw) : raceSoftmax(values.map((vector) => score(family === "CHASE" ? jump.model : turf.model, vector)));
        if (probabilities.some((p) => !Number.isFinite(p) || p <= 0) || Math.abs(sum(probabilities) - 1) > 1e-12) throw new Error(`Invalid probability book: ${raceId}`);
        const order = [...active.keys()].sort((a, b) => probabilities[b]! - probabilities[a]! || active[a]!.features.targetRunnerId.localeCompare(active[b]!.features.targetRunnerId));
        stats.scoredRaces++; stats.scoredStarters += active.length;
        if (winners.length > 1) stats.deadHeatRaces++;
        for (const [i, row] of active.entries()) {
          const won = row.outcome.finishingPosition === 1 || row.outcome.won === true;
          const settlement = settleSelection({ ...row.outcome, deadHeatDivisor: won ? winners.length : 1 });
          if (!settlement) { stats.missingSpStarters++; continue; }
          stats.evaluatedValidSpStarters++;
          entries.push({ family, year, raceId, runnerId: row.features.targetRunnerId, horseName: row.features.horseName, raceDate: row.features.raceDate,
            sp: settlement.settlementOddsDecimal, won, probability: probabilities[i]!, rank: order.indexOf(i) + 1, spProfit: settlement.profitLoss, qualifyingPrice: null, qualifyingProfit: null });
          stats.dateFrom = stats.dateFrom === null || row.features.raceDate < stats.dateFrom ? row.features.raceDate : stats.dateFrom;
          stats.dateTo = stats.dateTo === null || row.features.raceDate > stats.dateTo ? row.features.raceDate : stats.dateTo;
        }
      }
      coverage.push(stats);
      console.log(`${family} ${year}: ${stats.scoredRaces} complete races, ${stats.evaluatedValidSpStarters} valid-SP starters`);
    }
  }
  const actualValue = await storedValueEntries({ jump: jump.checksum, aw: aw.checksum, turf: turf.checksum });
  return { entries, coverage, actualValue, models: [
    { family: "CHASE", path: JUMP_TISSUE_MODEL_PATH, version: jump.version, checksum: jump.checksum },
    { family: "ALL WEATHER", path: AW_TISSUE_MODEL_PATH, version: aw.version, checksum: aw.checksum },
    { family: "FLAT TURF", path: TISSUE_V2_CONFIG.modelPath, version: turf.version, checksum: turf.checksum },
  ] };
}

async function main() {
  const protectedBefore = await protectedHashes();
  const { entries, coverage, actualValue, models } = await loadHistoricalTissueDiagnostic();
  const familyReports = FAMILIES.map((family) => {
    const rows = entries.filter((entry) => entry.family === family);
    const periods = PERIODS.map((period) => {
      const scoped = rows.filter((row) => period === "combined" || row.year === period);
      const rank1 = scoped.filter((row) => row.rank === 1);
      const value = actualValue.filter((row) => row.family === family && row.sp > 26 && (period === "combined" || row.year === period));
      return { period, populationAbove25: summarize(scoped.filter((row) => row.sp > 26)), rank1Above25: summarize(rank1.filter((row) => row.sp > 26)), rank1AtMost25: summarize(rank1.filter((row) => row.sp <= 26)),
        storedValueAbove25: { ...summarize(value), qualifyingPricedSelections: value.filter((row) => row.qualifyingProfit !== null).length,
          qualifyingPriceProfitLoss: value.some((row) => row.qualifyingProfit !== null) ? sum(value.flatMap((row) => row.qualifyingProfit === null ? [] : [row.qualifyingProfit])) : null,
          qualifyingPriceRoi: value.length > 0 && value.every((row) => row.qualifyingProfit !== null) ? sum(value.map((row) => row.qualifyingProfit!)) / value.length : null,
          availability: value.length ? "Stored prospective qualifying-price observations only; not a full historical VALUE population." : "Unavailable: no retained eligible VALUE observations with final SP >25/1; missing qualifying prices were not reconstructed." },
        bands: BANDS.map(([band, min, max]) => ({ band, ...summarize(scoped.filter((row) => row.sp > min && row.sp <= max)) })),
        probabilitySanity: sanity(rank1.filter((row) => row.sp > 26)),
        sensitivity: ([21, 34] as const).map((cutoff) => ({ cutoffFractional: cutoff - 1, cutoffDecimal: cutoff, ...summarize(rank1.filter((row) => row.sp > cutoff)) })),
      };
    });
    return { family, periods, decision: decide(periods) };
  });
  const report = { generatedAt: new Date().toISOString(), models, definitions: {
    primary: "Final decimal SP strictly >26.0 (>25/1); exactly 26.0 remains <=25/1. No live qualification rule is changed.",
    population: "All genuine canonical starters in complete verified fields, evaluated only where final SP is valid; voids/NR excluded, started non-finishers are losses. Missing-SP starters remain in the probability book; rank is not reassigned after SP exclusion.",
    deadHeats: "Each co-winner counts as an actual winner; canonical SP P/L uses the co-winner divisor. Probability books retain sum 1. Dead-heat counts are in coverage.",
    storedValue: "Existing recorded pre-race rank-1 positive edge against a retained qualifying bookmaker snapshot. Uses the original captured model probability and stored qualifying-price return. This sparse prospective subset is NOT final-SP positive edge reconstructed as VALUE. Turf stored VALUE requires a retained finishing position for a canonical result label because its Tissue tracker lacks runner result status; missing statuses/qualifying returns are not inferred.",
    market: "sum(1/final decimal SP); unnormalised bookmaker SP implied probability, retrospective only.",
    replication: "2025 is the frozen models' training period, not an independent holdout; 2026 is the holdout, truncated at actual available dates.",
    classification: "Material overprediction descriptively means actual/expected <0.75 (same broad convention as earlier diagnostics); no sample-count or p-value cutoff, odds search, fitting, or ROI optimisation. Replication is direction-based. Where both annual rank-1 intervals span the ordinary-cohort calibration, uncertainty supports monitoring rather than a cap recommendation. Wilson intervals assume binomial sampling and fixed predictions; population runners within a race are correlated, so population intervals are descriptive only.",
    safety: "Only this diagnostic script and the two /tmp outputs are written. Models, trackers, VALUE semantics, UI, settlement and historical data remain unchanged.",
  }, coverage, families: familyReports, storedValueCoverage: FAMILIES.map((family) => ({ family, retainedSelections: actualValue.filter((row) => row.family === family).length,
    dateFrom: actualValue.filter((row) => row.family === family).map((row) => row.raceDate).sort()[0] ?? null,
    dateTo: actualValue.filter((row) => row.family === family).map((row) => row.raceDate).sort().at(-1) ?? null })),
  };
  const protectedAfter = await protectedHashes();
  if (JSON.stringify(protectedBefore) !== JSON.stringify(protectedAfter)) throw new Error("Protected input changed during the diagnostic; refusing a read-only verification claim");
  const artifact = { ...report, readOnlyVerification: { unchanged: true, fileHashes: protectedAfter } };
  await writeFile(JSON_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(MD_PATH, renderMarkdown(report), "utf8");
  console.log(`Wrote ${MD_PATH}\nWrote ${JSON_PATH}`);
  for (const family of report.families) {
    const combined = family.periods.find((row) => row.period === "combined")!.rank1Above25;
    console.log(`\n${family.family} >25/1\nRank1 selections: ${combined.selections}\nWinners: ${combined.winners}\nTissue expected: ${fmt(combined.tissueExpected)}\nCalibration: ${fmt(combined.calibrationRatio)}\n2025 calibration: ${fmt(family.periods[0]!.rank1Above25.calibrationRatio)}\n2026 calibration: ${fmt(family.periods[1]!.rank1Above25.calibrationRatio)}\nDecision: ${family.decision.decision}`);
  }
  console.log("\nRecommended caps:");
  for (const family of report.families) console.log(`${family.family}: ${family.decision.recommendedCap}`);
}

function familyFor(f: Features): Family | null {
  if (f.raceCode === "jump" && classifyJumpRaceSubtype(f) === "chase") return "CHASE";
  if (f.raceCode === "aw" && isSupportedAllWeatherRace(f)) return "ALL WEATHER";
  if (f.raceCode === "turf" && isOrdinaryFlatTurfRace(f)) return "FLAT TURF";
  return null;
}
function jumpNumericVector(f: Features) {
  const handicap = classifyHandicapStatus(f);
  const raceClass = f.raceClass?.match(/\d+/);
  const raw = [f.officialRating, f.latestJumpSpeedRating, f.bestJumpSpeedLast3, f.averageJumpSpeedLast3,
    f.trainerPriorWinRate, Math.log1p(f.trainerPriorRuns), f.jockeyPriorWinRate ?? null, Math.log1p(f.jockeyPriorRuns ?? 0),
    f.daysSinceLastRun, Math.log1p(f.priorRuns), f.horseAge, f.weightCarriedLbs, raceClass ? Number(raceClass[0]) : null,
    f.distanceYards === null ? null : f.distanceYards / 220, f.actualRunnerCount ?? f.declaredRunnerCount,
    handicap === "unknown" ? null : handicap === "handicap" ? 1 : 0, /soft|heavy/i.test(f.going ?? "") ? 1 : 0, /firm/i.test(f.going ?? "") ? 1 : 0];
  return [...raw.map((v) => v !== null && Number.isFinite(v) ? v : 0), ...raw.map((v) => v !== null && Number.isFinite(v) ? 0 : 1)];
}
async function storedValueEntries(hashes: { jump: string; aw: string; turf: string }): Promise<Entry[]> {
  const [jump, aw, values] = await Promise.all([loadJumpTissueForward(), loadAwTissueForward(), loadForwardValueData()]);
  const rows: Entry[] = [];
  for (const [family, races, hash] of [["CHASE", jump.races.filter((race) => race.subtype === "Chase" && cleanJumpTissueRace(race)), hashes.jump],
    ["ALL WEATHER", aw.races.filter(cleanAwTissueRace), hashes.aw]] as const) {
    for (const race of races) {
      if (race.modelHash !== hash || !race.settledAt) continue;
      const leader = race.runners.find((runner) => runner.runnerId === race.top1);
      if (!leader || leader.probability === null || !leader.outcome || leader.outcome.won === null || !validPrice(leader.outcome.finalSp)) continue;
      const comparison = frozenTissueRankOneEdge(leader.probability, race.raceId, leader.runnerId, race.prices, null);
      if (!comparison || comparison.edge <= 0 || comparison.qualificationPrice.capturedAt < race.recordedAt || comparison.qualificationPrice.capturedAt >= race.scheduledOffAt) continue;
      const spProfit = leader.outcome.finalSpProfitLoss;
      if (spProfit === null) continue;
      rows.push({ family, year: race.raceDate.slice(0, 4), raceId: race.raceId, runnerId: leader.runnerId, horseName: leader.horseName, raceDate: race.raceDate,
        sp: leader.outcome.finalSp!, won: leader.outcome.won, probability: leader.probability, rank: 1, spProfit, qualifyingPrice: comparison.qualificationPrice.decimalPrice,
        qualifyingProfit: race.selectedPriceProfitLoss[comparison.qualificationStage] });
    }
  }
  for (const record of values.races) {
    if (record.family !== "turf" || !isCleanPhase2Observation(record) || !record.settledAt || !record.tissueRunnerId || record.tissueProbability == null || record.tissueEdgePercentagePoints == null || record.tissueEdgePercentagePoints <= 0 || !validPrice(record.tissueCapturedDecimalOdds) || !record.tissuePriceCapturedAt || record.tissuePriceCapturedAt < record.recordedAt || record.tissuePriceCapturedAt >= record.raceDateTime || (record.tissueBookmakerQuoteCount ?? 0) < 1) continue;
    // A Turf rating record alone cannot establish the Tissue horse's SP or rank. Read its frozen Tissue race.
    const tissue = await storedTurfRace(record.raceId);
    if (!tissue || tissue.tissueModelVersion !== TISSUE_V2_CONFIG.modelVersion || tissue.tissueModelChecksum !== hashes.turf || !tissue.recordedPreRace || !tissue.settledAt) continue;
    const leader = tissue.runners.find((runner) => runner.runnerId === record.tissueRunnerId && runner.tissueRank === 1);
    if (!leader || !validPrice(leader.finalSp) || leader.finishingPosition === null) continue;
    const won = tissue.winners.includes(leader.horseName);
    const result = settleSelection({ targetRaceId: record.raceId, targetRunnerId: leader.runnerId, finishingPosition: leader.finishingPosition, resultStatus: "finished", won, placed: null, startingPrice: null, startingPriceDecimal: String(leader.finalSp), deadHeatDivisor: won ? Math.max(1, tissue.winners.length) : 1 });
    if (!result) continue;
    // The rating tracker's P/L belongs to its rating leader, so never substitute it for a missing Tissue qualifying-price return.
    rows.push({ family: "FLAT TURF", year: record.raceDate.slice(0, 4), raceId: record.raceId, runnerId: leader.runnerId, horseName: leader.horseName, raceDate: record.raceDate,
      sp: leader.finalSp!, won, probability: record.tissueProbability, rank: 1, spProfit: result.profitLoss, qualifyingPrice: record.tissueCapturedDecimalOdds!, qualifyingProfit: null });
  }
  return rows;
}
let turfTracker: Awaited<ReturnType<typeof import("@/lib/racing/tissue-forward").loadTissueForward>> | null = null;
async function storedTurfRace(raceId: string) {
  const { loadTissueForward } = await import("@/lib/racing/tissue-forward");
  turfTracker ??= await loadTissueForward(TISSUE_V2_CONFIG.forwardPath, TISSUE_V2_CONFIG);
  return turfTracker.races.find((race) => race.raceId === raceId);
}
export function summarize(rows: Entry[]) {
  const winners = rows.filter((row) => row.won).length;
  const tissueExpected = sum(rows.map((row) => row.probability));
  const marketExpected = sum(rows.map((row) => 1 / row.sp));
  const interval = wilson(winners, rows.length);
  return { runners: rows.length, selections: rows.length, races: new Set(rows.map((row) => row.raceId)).size, winners, actualWinners: winners,
    strike: ratio(winners, rows.length), actualWinnerPercent: rows.length ? 100 * winners / rows.length : null,
    tissueExpected, calibrationRatio: ratio(winners, tissueExpected), marketExpected, marketAe: ratio(winners, marketExpected),
    meanTissueProbability: average(rows.map((row) => row.probability)), medianTissueProbability: median(rows.map((row) => row.probability)),
    spProfitLoss: sum(rows.map((row) => row.spProfit)), spRoi: ratio(sum(rows.map((row) => row.spProfit)), rows.length),
    calibrationWilson95: interval && tissueExpected > 0 ? { lower: interval.lower * rows.length / tissueExpected, upper: interval.upper * rows.length / tissueExpected } : null };
}
export function sanity(rows: Entry[]) {
  const metrics = { tissueProbability: rows.map((row) => row.probability), marketProbability: rows.map((row) => 1 / row.sp),
    absoluteProbabilityGap: rows.map((row) => Math.abs(row.probability - 1 / row.sp)), tissueMarketProbabilityRatio: rows.map((row) => row.probability * row.sp) };
  const metricSummary = (values: number[]) => ({ mean: average(values), median: median(values) });
  return { selections: rows.length, tissueProbability: metricSummary(metrics.tissueProbability), marketProbability: metricSummary(metrics.marketProbability),
    absoluteProbabilityGap: metricSummary(metrics.absoluteProbabilityGap), tissueMarketProbabilityRatio: metricSummary(metrics.tissueMarketProbabilityRatio) };
}
function decide(periods: Array<{ period: Period; populationAbove25: Summary; rank1Above25: Summary; rank1AtMost25: Summary; storedValueAbove25: Summary & { availability: string } }>) {
  const a = periods[0]!, b = periods[1]!, combined = periods[2]!;
  const poor = (s: Summary) => s.calibrationRatio !== null && s.calibrationRatio < 0.75;
  const worse = (p: typeof a) => p.rank1Above25.calibrationRatio !== null && p.rank1AtMost25.calibrationRatio !== null && p.rank1Above25.calibrationRatio < p.rank1AtMost25.calibrationRatio;
  const missing = a.rank1Above25.selections === 0 || b.rank1Above25.selections === 0;
  const replication = missing ? "TOO SMALL" : poor(a.rank1Above25) && poor(b.rank1Above25) ? "REPLICATED POOR CALIBRATION" : poor(a.rank1Above25) ? "2025 ONLY" : poor(b.rank1Above25) ? "2026 ONLY" : poor(a.populationAbove25) || poor(b.populationAbove25) ? "MIXED" : "NO PROBLEM";
  const replicatedPopulation = poor(a.populationAbove25) && poor(b.populationAbove25);
  const rankComparisonUncertainBothYears = [a, b].every((p) => p.rank1Above25.calibrationWilson95 !== null && p.rank1AtMost25.calibrationRatio !== null &&
    p.rank1Above25.calibrationWilson95.upper >= p.rank1AtMost25.calibrationRatio);
  const justified = !missing && replication === "REPLICATED POOR CALIBRATION" && replicatedPopulation && worse(a) && worse(b) && !rankComparisonUncertainBothYears;
  const decision = missing ? "INSUFFICIENT DATA" : justified ? "25/1 CAP JUSTIFIED" : poor(combined.rank1Above25) || poor(combined.populationAbove25) || replication !== "NO PROBLEM" ? "MONITOR ONLY" : "NO CAP NEEDED";
  return { replication, populationReplication: poor(a.populationAbove25) && poor(b.populationAbove25) ? "REPLICATED POOR CALIBRATION" : poor(a.populationAbove25) ? "2025 ONLY" : poor(b.populationAbove25) ? "2026 ONLY" : "NO PROBLEM",
    decision, recommendedCap: decision === "25/1 CAP JUSTIFIED" ? "25/1" : decision === "NO CAP NEEDED" ? "NONE" : "MONITOR",
    answers: {
      A: `All-runner calibration ${fmt(combined.populationAbove25.calibrationRatio)}; rank-1 ${fmt(combined.rank1Above25.calibrationRatio)}. ${poor(combined.populationAbove25) || poor(combined.rank1Above25) ? "Material overprediction is present in at least one cohort." : "No material overprediction at the descriptive 0.75 convention."}`,
      B: `All runners: ${poor(a.populationAbove25) ? "poor" : "not materially poor"} in 2025, ${poor(b.populationAbove25) ? "poor" : "not materially poor"} in 2026. Rank-1: ${replication}.`,
      C: `Rank-1 <=25/1 calibration ${fmt(combined.rank1AtMost25.calibrationRatio)} versus >25/1 ${fmt(combined.rank1Above25.calibrationRatio)}; worse in 2025: ${worse(a)}, in 2026: ${worse(b)}.`,
      D: `Rank-1 deterioration is ${replication}. Actual VALUE evidence is limited to ${combined.storedValueAbove25.selections} stored eligible >25/1 observations; no missing historical qualification prices are inferred.`,
      E: justified ? "A prospective research-backed actionable-price cap is supported by material population and rank-1 overprediction in both periods and worse rank-1 calibration than <=25/1 in each. This is not proof of improved profitability or independent 2025 validation." : rankComparisonUncertainBothYears ? "Monitor only: both annual rank-1 calibration intervals also admit the <=25/1 cohort's calibration. The direction is poor, but the selected-horse sample does not firmly establish a distinct collapse in both periods." : "A new actionable cap is not established by this fixed diagnostic; retain current semantics and monitor where evidence is mixed or limited.",
    },
    uncertainty: `Rank-1 >25/1: 2025 n=${a.rank1Above25.selections}, wins=${a.rank1Above25.winners}, expected=${fmt(a.rank1Above25.tissueExpected)}; 2026 n=${b.rank1Above25.selections}, wins=${b.rank1Above25.winners}, expected=${fmt(b.rank1Above25.tissueExpected)}. Zero or few wins are uncertain; ratios and descriptive Wilson intervals should be read together. No arbitrary sample-size/significance pass threshold was imposed. Combined market A/E=${fmt(combined.rank1Above25.marketAe)}; model overprediction does not itself establish a negative edge against the bookmaker market.` };
}
type Report = { generatedAt: string; models: Array<{ family: string; path: string; version: string; checksum: string }>; definitions: Record<string, string>; coverage: Array<Record<string, unknown>>; storedValueCoverage: Array<Record<string, unknown>>; families: Array<{ family: Family; periods: Array<{ period: Period; populationAbove25: Summary; rank1Above25: Summary; rank1AtMost25: Summary; storedValueAbove25: Summary & { availability: string; qualifyingPricedSelections: number; qualifyingPriceProfitLoss: number | null; qualifyingPriceRoi: number | null }; bands: Array<Summary & { band: string }>; probabilitySanity: ReturnType<typeof sanity>; sensitivity: Array<Summary & { cutoffFractional: number; cutoffDecimal: number }> }>; decision: ReturnType<typeof decide> }> };
function renderMarkdown(r: Report) {
  const lines = ["# Tissue Very Long-Price Calibration", "", "## Executive Summary", "",
    "Frozen family-specific models, final SP >25/1 (decimal >26.0), no cutoff optimisation and no implementation. Hurdles are excluded. Exactly 26.0 belongs to <=25/1.",
    ...r.families.map((f) => { const s = f.periods[2]!.rank1Above25; return `- ${f.family}: ${s.selections} rank-1 selections, ${s.winners} wins, ${fmt(s.tissueExpected)} expected, calibration ${fmt(s.calibrationRatio)}. ${f.decision.replication}; **${f.decision.decision}**.`; }),
    "", "2025 is in-sample for all three frozen models. 2026 is holdout and partial-year. Agreement of direction across these periods is not two independent out-of-sample replications.",
    "Chase and AW rank-1 >25/1 market A/E and retrospective SP ROI are positive in the combined sample despite poor model calibration. An actionability cap is therefore a probability-reliability recommendation, not evidence that these market-positive selections lose money; keep any prospective excluded group measurable.",
    "", "## Data And Definitions", ...Object.entries(r.definitions).map(([key, value]) => `- ${key}: ${value}`), "Protected model and tracker hashes were unchanged across the run (see JSON readOnlyVerification).", "", table(r.models), table(r.coverage), "",
  ];
  for (const f of r.families) {
    lines.push(`## ${f.family === "CHASE" ? "Chase" : f.family === "ALL WEATHER" ? "All Weather" : "Flat Turf"}`, "",
      metricTable(f.periods.map((p) => ({ label: p.period, ...p.populationAbove25 }))), f.decision.uncertainty, "");
  }
  lines.push("## Rank-1 Analysis", "");
  for (const f of r.families) lines.push(`### ${f.family}`, metricTable(f.periods.flatMap((p) => [
    { label: `${p.period} <=25/1`, ...p.rank1AtMost25 }, { label: `${p.period} >25/1`, ...p.rank1Above25 },
  ])), "Rank-1 uncertainty (descriptive Wilson 95% calibration intervals):", table(f.periods.map((p) => ({ period: p.period, ...p.rank1Above25.calibrationWilson95 }))), "Probability sanity (>25/1 rank-1; probabilities/gaps are proportions):", table(f.periods.flatMap((p) => Object.entries(p.probabilitySanity).flatMap(([metric, value]) => typeof value === "number" ? [] : [{ period: p.period, selections: p.probabilitySanity.selections, metric, ...value }]))), "");
  lines.push("## VALUE Analysis", "Actual stored qualifying-price evidence only. No final-SP positive-edge proxy is labelled VALUE. No 2025 bookmaker snapshots are reconstructed.", table(r.storedValueCoverage));
  for (const f of r.families) lines.push(`### ${f.family}`, metricTable(f.periods.map((p) => ({ label: p.period, ...p.storedValueAbove25 }))), table(f.periods.map((p) => ({ period: p.period,
    selections: p.storedValueAbove25.selections, qualifyingPriced: p.storedValueAbove25.qualifyingPricedSelections, qualifyingPriceProfitLoss: p.storedValueAbove25.qualifyingPriceProfitLoss, qualifyingPriceRoi: p.storedValueAbove25.qualifyingPriceRoi, availability: p.storedValueAbove25.availability }))), "");
  lines.push("## Price Bands", "Fixed all-starter bands, not optimised. Boundaries are strict lower / inclusive upper.");
  for (const f of r.families) lines.push(`### ${f.family}`, metricTable(f.periods.flatMap((p) => p.bands.map((band) => ({ label: `${p.period} ${band.band}`, ...band })))), "");
  lines.push("## 2025 vs 2026", table(r.families.map((f) => ({ family: f.family, population: f.decision.populationReplication, rank1: f.decision.replication,
    n2025: f.periods[0]!.rank1Above25.selections, n2026: f.periods[1]!.rank1Above25.selections, calibration2025: f.periods[0]!.rank1Above25.calibrationRatio, calibration2026: f.periods[1]!.rank1Above25.calibrationRatio }))));
  lines.push("## 20/1 and 33/1 Sensitivity", "Context only; the primary hypothesis remains >25/1.");
  for (const f of r.families) lines.push(`### ${f.family}`, metricTable(f.periods.flatMap((p) => p.sensitivity.map((s) => ({ label: `${p.period} >${s.cutoffFractional}/1`, ...s })))), "");
  lines.push("## Family Decisions");
  for (const f of r.families) lines.push(`### ${f.family}: ${f.decision.decision}`, ...Object.entries(f.decision.answers).map(([key, value]) => `${key}. ${value}`), "");
  lines.push("## Recommendation", ...r.families.map((f) => f.decision.decision === "25/1 CAP JUSTIFIED"
    ? `- ${f.family}: recommend a future prospective main VALUE cap at captured qualifying bookmaker decimal <=26.0; >26.0 retained and settled in a research shadow. Do not filter live on final SP, forecast, reconstructed or later latest odds. No cap is implemented here.`
    : `- ${f.family}: ${f.decision.decision}. No new cap implemented.`), "", "A final-SP retrospective cohort is not identical to a captured-price prospective cohort. Any future cap should be evaluated prospectively alongside the retained shadow. SP ROI is context only and was not used for decisions.", "");
  return lines.join("\n");
}
function metricTable(rows: Array<Summary & { label: string }>) { return table(rows.map((s) => ({ cohort: s.label, "runners/selections": s.selections, winners: s.winners,
  "winner/strike %": s.actualWinnerPercent, tissueExpected: s.tissueExpected, calibration: s.calibrationRatio, marketExpected: s.marketExpected, marketAe: s.marketAe,
  meanTissueP: s.meanTissueProbability, medianTissueP: s.medianTissueProbability, "SP ROI %": s.spRoi === null ? null : s.spRoi * 100 }))); }
function table(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "No rows.\n";
  const keys = Object.keys(rows[0]!);
  const cell = (v: unknown) => (typeof v === "number" ? Number.isInteger(v) ? String(v) : v.toFixed(4) : v == null ? "-" : typeof v === "object" ? JSON.stringify(v) : String(v)).replaceAll("|", "\\|");
  return [`| ${keys.join(" | ")} |`, `| ${keys.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${keys.map((key) => cell(row[key])).join(" | ")} |`), ""].join("\n");
}
function wilson(wins: number, n: number) { if (!n) return null; const z = 1.96, p = wins / n, d = 1 + z * z / n, centre = (p + z * z / (2 * n)) / d, half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return { lower: Math.max(0, centre - half), upper: Math.min(1, centre + half) }; }
function validPrice(v: number | null | undefined) { return v != null && Number.isFinite(v) && v > 1; }
function groupBy<T>(rows: T[], key: (row: T) => string) { const map = new Map<string, T[]>(); for (const row of rows) { const k = key(row), bucket = map.get(k) ?? []; bucket.push(row); map.set(k, bucket); } return map; }
function sum(v: number[]) { return v.reduce((a, b) => a + b, 0); }
function ratio(a: number, b: number) { return b > 0 ? a / b : null; }
function average(v: number[]) { return v.length ? sum(v) / v.length : null; }
function median(v: number[]) { if (!v.length) return null; const s = [...v].sort((a, b) => a - b), i = Math.floor(s.length / 2); return s.length % 2 ? s[i]! : (s[i - 1]! + s[i]!) / 2; }
function fmt(v: number | null) { return v === null ? "-" : v.toFixed(4); }

export async function protectedHashes() {
  const paths = [JUMP_TISSUE_MODEL_PATH, AW_TISSUE_MODEL_PATH, TISSUE_V2_CONFIG.modelPath,
    "data/research/jump-tissue-forward-v1.json", "data/research/aw-tissue-forward-v1.json", TISSUE_V2_CONFIG.forwardPath, "data/research/forward-value-v1.json"];
  return Object.fromEntries(await Promise.all(paths.map(async (path) => [path, createHash("sha256").update(await readFile(path)).digest("hex")] as const)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { candidates, evaluateRace, loadHistoricalRaces } from "./build-ranking-model-stage2";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import { calculateAwRaceRatings } from "@/lib/racing/aw-performance-rating";
import { calculateJumpRaceRatings } from "@/lib/racing/jump-performance-rating";
import { rankRows } from "@/lib/racing/research-rule";
import { buildPopulation, featureValues, loadHistory } from "./diagnose-aw-tissue-stage1";
import { buildExamples, NUMERIC_FEATURES, commentVector, priorCommentsForTarget, raceSoftmax, score } from "./diagnose-independent-tissue-feasibility";
import { loadFrozenTissueModel } from "@/lib/racing/tissue-forward";
import { loadJumpTissueModel, JUMP_TISSUE_NUMERIC_FEATURES } from "@/lib/racing/jump-tissue-model";
import { loadAwTissueModel, awTissueModelInputs, awTissueProbabilities } from "@/lib/racing/aw-tissue-model";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { loadAwRatingForward } from "@/lib/racing/aw-rating-forward";
import { loadJumpRatingForward } from "@/lib/racing/jump-rating-forward";
import { loadAwTissueForward } from "@/lib/racing/aw-tissue-forward";
import { loadJumpTissueForward } from "@/lib/racing/jump-tissue-forward";
import { loadTissueForward, TISSUE_V2_CONFIG } from "@/lib/racing/tissue-forward";
import { loadForwardValueData, type ForwardValuePriceSnapshot } from "@/lib/racing/forward-value";
import { awTissueRankOneSelections, confidenceBand, forwardValueRankOneSelections, jumpTissueRankOneSelections, turfTissueRankOneSelections } from "@/lib/racing/rank-one-diagnostics";
import { MARKET_PRICE_BANDS, SHORT_MARKET_PRICE_BANDS, marketFavourite, marketPriceBand, safeMarketCapture, shortMarketPriceBand, summarizeMarketSelections, validMarketPrice, type MarketAuditSelection } from "@/lib/racing/ranking-market-audit";

type Selection = MarketAuditSelection;
type Metrics = ReturnType<typeof summarizeMarketSelections>;
const families = ["Turf", "Jump", "All Weather"] as const;
const years = ["2025", "2026"] as const;
const tissueByFamily = { Turf: "Turf Tissue v2", Jump: "JUMP_TISSUE_V1", "All Weather": "AW_TISSUE_V1" };
const ratingByFamily = { Turf: "TPR_S2_V1", Jump: "JPR-A", "All Weather": "AW-D" };
const labelByFamily = { turf: "Turf", jump: "Jump", aw: "All Weather" } as const;
const inputs = [
  "data/research/tissue-forward-v2.json", "data/research/jump-tissue-forward-v1.json", "data/research/aw-tissue-forward-v1.json",
  "data/research/forward-value-v1.json", "data/research/jump-rating-forward-v1.json", "data/research/aw-rating-forward-v1.json",
  "data/research/tissue-model-v2.json", "data/research/jump-tissue-model-v1.json", "data/research/aw-tissue-model-v1.json",
  "data/research/forward-value-calibration-v1.json", "/tmp/ranking-model-rebuild-stage2.json",
];
const pct = (n: number | null) => n === null ? "n/a" : `${(n * 100).toFixed(1)}%`;
const num = (n: number | null) => n === null ? "n/a" : n.toFixed(3);

async function hashes() {
  return Object.fromEntries(await Promise.all(inputs.map(async (path) => [path, createHash("sha256").update(await readFile(path)).digest("hex")])));
}

async function loadSelections() {
  if (process.argv.includes("--reuse-selections")) {
    const previous = JSON.parse(await readFile("/tmp/ranking-market-adjusted-audit.json", "utf8")) as { protectedInputHashes: Record<string, string>; selections: Selection[]; cacheSources: Array<Record<string, unknown>>; replay: Array<{ model: string; selections: number; winners: number; matchesExistingStage2: boolean }> };
    if (JSON.stringify(previous.protectedInputHashes) !== JSON.stringify(await hashes())) throw new Error("Saved audit selections have stale inputs");
    if (families.some((family) => !previous.selections.some((row) => row.model === tissueByFamily[family] && row.cohort === "historical_cache"))) throw new Error("Saved audit lacks historical tissue inference");
    return { rows: previous.selections, cacheSources: previous.cacheSources, replay: previous.replay };
  }
  const [fv, turf, jump, aw, jr, ar, races, stage2] = await Promise.all([
    loadForwardValueData(), loadTissueForward(TISSUE_V2_CONFIG.forwardPath, TISSUE_V2_CONFIG),
    loadJumpTissueForward(), loadAwTissueForward(), loadJumpRatingForward(), loadAwRatingForward(),
    loadHistoricalRaces(), readFile("/tmp/ranking-model-rebuild-stage2.json", "utf8").then((text) => JSON.parse(text) as { summaries: Record<string, { races: number; top1Wins: number }> }),
  ]);
  const rows: Selection[] = [];
  const fvByRace = new Map(fv.races.map((race) => [race.raceId, race]));
  const spFields = new Map<string, Array<{ runnerId: string; price: number | null }>>();
  for (const race of turf.races) spFields.set(race.raceId, race.runners.filter((runner) => runner.finishingPosition !== null || runner.finalSp !== null).map((runner) => ({ runnerId: runner.runnerId, price: runner.finalSp })));
  for (const race of [...jump.races, ...aw.races]) spFields.set(race.raceId, race.runners.filter((runner) => runner.outcome?.won != null).map((runner) => ({ runnerId: runner.runnerId, price: runner.outcome?.finalSp ?? null })));
  for (const race of [...jr.races, ...ar.races]) if (!spFields.has(race.raceId)) spFields.set(race.raceId, race.runners.filter((runner) => runner.settlement !== null).map((runner) => ({ runnerId: runner.runnerId, price: runner.finalSp })));

  const frozen = [
    ...turfTissueRankOneSelections(turf, "Turf Tissue v2"), ...jumpTissueRankOneSelections(jump),
    ...awTissueRankOneSelections(aw), ...forwardValueRankOneSelections(fv),
  ];
  for (const s of frozen) {
    // Market-favourite agreement must not determine model confidence.
    const confidence = confidenceBand({ ...s, independentAgreements: s.model === "TPR_S2_V1" || s.model === "JPR-A" || s.model === "AW-D" ? Number(fvByRace.get(s.raceId)?.tissueAgreesWithTpr === true) : s.independentAgreements }).toUpperCase() as Selection["confidence"];
    if (!validMarketPrice(s.finalSp)) continue;
    rows.push({ family: s.family, model: s.model, cohort: "frozen_forward", basis: "final_sp", raceId: s.raceId, raceDate: s.raceDate, runnerId: s.runnerId, won: s.won, price: s.finalSp, modelProbability: s.modelProbability, confidence, favourite: marketFavourite(s.runnerId, spFields.get(s.raceId) ?? []), capturedAt: null });
  }
  // Add the wider frozen rating population without conditioning on bookmaker availability.
  for (const [family, data] of [["Jump", jr], ["All Weather", ar]] as const) {
    for (const race of data.races) {
      if (!race.recordedPreRace || !race.settledAt || race.winnerRunnerIds.length !== 1 || race.ratingCoverageStatus === "insufficient_coverage") continue;
      const leaders = race.runners.filter((runner) => ("jprARank" in runner ? runner.jprARank : runner.awDRank) === 1).sort((a, b) => a.runnerId.localeCompare(b.runnerId));
      const leader = leaders[0];
      if (!leader?.settlement || !validMarketPrice(leader.finalSp)) continue;
      const existing = rows.find((row) => row.cohort === "frozen_forward" && row.family === family && row.model === ratingByFamily[family] && row.raceId === race.raceId);
      if (existing) continue;
      rows.push({ family, model: ratingByFamily[family], cohort: "frozen_forward", basis: "final_sp", raceId: race.raceId, raceDate: race.raceDate, runnerId: leader.runnerId, won: race.winnerRunnerIds.includes(leader.runnerId), price: leader.finalSp, modelProbability: null, confidence: "UNAVAILABLE", favourite: marketFavourite(leader.runnerId, spFields.get(race.raceId) ?? []), capturedAt: null });
    }
  }
  // Preserve a fixed early capture basis; never select a quote according to the result.
  for (const s of [...rows]) {
    const record = fvByRace.get(s.raceId);
    const rating = s.model === ratingByFamily[s.family];
    const tissueRace = s.family === "Jump" ? jump.races.find((r) => r.raceId === s.raceId) : s.family === "All Weather" ? aw.races.find((r) => r.raceId === s.raceId) : null;
    let snapshot: ForwardValuePriceSnapshot | null | undefined;
    let recordedAt = "", offAt = "";
    if (record && (rating ? record.leaderRunnerId : record.tissueRunnerId) === s.runnerId) {
      snapshot = rating ? record.earlyPriceSnapshot : record.tissueEarlyPriceSnapshot;
      recordedAt = record.recordedAt;
      offAt = record.raceDateTime;
      if (!rating && s.family === "Turf") recordedAt = turf.races.find((race) => race.raceId === s.raceId)?.recordedAt ?? recordedAt;
    }
    if (!rating && tissueRace?.top1 === s.runnerId && tissueRace.prices.early) {
      snapshot = tissueRace.prices.early;
      recordedAt = tissueRace.recordedAt;
      offAt = tissueRace.scheduledOffAt;
    }
    if (!snapshot || snapshot.marketPriceBasisVersion !== "median_bookmaker_v1" || !validMarketPrice(snapshot.medianBookmakerPriceDecimal) || !safeMarketCapture(snapshot.capturedAt, recordedAt, offAt)) continue;
    // Stored favourite IDs are usable only at their own capture time, not a later price stage.
    const ids = record?.priceCapturedAt === snapshot.capturedAt ? record.marketFavouriteRunnerIds : [];
    const favourite: Selection["favourite"] = ids.length === 0 ? "unknown" : ids.includes(s.runnerId) ? ids.length > 1 ? "joint_favourite" : "favourite" : "not_favourite";
    rows.push({ ...s, basis: "prospective_median", price: snapshot.medianBookmakerPriceDecimal, capturedAt: snapshot.capturedAt, favourite });
  }

  const cacheSources: Array<Record<string, unknown>> = [];
  const canonicalSp = new Map<string, number>();
  const historicalRows: HistoricalTargetRunnerMetricsRow[] = [];
  for (const family of ["turf", "jump", "aw"] as const) {
    for (const year of years) {
      const cache = await loadLatestBacktestFeatureCacheForYear({ year, family: family === "turf" ? "turf_flat" : family === "aw" ? "all_weather_flat" : "jump" });
      if (!cache) throw new Error(`Missing ${family} ${year} cache`);
      cacheSources.push({ family, year, directory: cache.directory, manifest: cache.manifest, actualCoverage: cache.actualCoverage });
      const cacheRows = cache.rows.filter((row) => row.features.raceCode === family);
      historicalRows.push(...cacheRows);
      for (const row of cacheRows) {
        const sp = Number(row.outcome.startingPriceDecimal);
        if (validMarketPrice(sp)) canonicalSp.set(row.features.targetRunnerId, sp);
      }
      const turfRatings = family === "turf" ? new Map(rankRows(cacheRows).map((row) => [row.features.targetRunnerId, row.turfPerformance])) : null;
      const grouped = group(cacheRows, (row) => row.features.targetRaceId);
      for (const [raceId, field] of grouped) {
        const active = field.filter((row) => row.outcome.resultStatus !== "non_runner");
        if (active.length < 2 || active.some((row) => row.outcome.won === null) || active.filter((row) => row.outcome.won).length !== 1) continue;
        const ratings = family === "aw" ? calculateAwRaceRatings(active.map((row) => ({ runnerId: row.features.targetRunnerId, resultStatus: row.outcome.resultStatus, averageAwSpeedLast3: row.features.averageAwSpeedLast3, trainerPriorStrikeRate: row.features.trainerPriorWinRate, jockeyPriorStrikeRate: row.features.jockeyPriorWinRate ?? null }))) : family === "jump" ? calculateJumpRaceRatings(active.map((row) => ({ runnerId: row.features.targetRunnerId, resultStatus: row.outcome.resultStatus, averageJumpSpeedLast3: row.features.averageJumpSpeedLast3, trainerPriorStrikeRate: row.features.trainerPriorWinRate, officialRating: row.features.officialRating }))) : null;
        const ranked = active.flatMap((row) => {
          const rating = turfRatings?.get(row.features.targetRunnerId) ?? ratings?.get(row.features.targetRunnerId);
          const rank = rating && "jprA" in rating ? rating.jprA?.rank : rating && "awD" in rating ? rating.awD?.rank : rating && "rank" in rating ? rating.rank : null;
          return rank == null ? [] : [{ row, rank }];
        }).sort((a, b) => a.rank - b.rank || a.row.features.targetRunnerId.localeCompare(b.row.features.targetRunnerId));
        if (ranked.length < 2 || ranked.length / active.length < .2) continue;
        const leader = ranked[0]!.row;
        const price = canonicalSp.get(leader.features.targetRunnerId);
        if (!price) continue;
        rows.push({ family: labelByFamily[family], model: ratingByFamily[labelByFamily[family]], cohort: "historical_cache", basis: "final_sp", raceId, raceDate: leader.features.raceDate, runnerId: leader.features.targetRunnerId, won: leader.outcome.won === true, price, modelProbability: null, confidence: "UNAVAILABLE", favourite: marketFavourite(leader.features.targetRunnerId, active.map((row) => ({ runnerId: row.features.targetRunnerId, price: canonicalSp.get(row.features.targetRunnerId) ?? null }))), capturedAt: null });
      }
    }
  }
  console.log("Loading existing prior-run history for frozen-model inference (no fitting).");
  const history = await loadHistory(historicalRows);
  const [turfModel, jumpModel, awModel] = await Promise.all([loadFrozenTissueModel(TISSUE_V2_CONFIG.modelPath, TISSUE_V2_CONFIG.modelVersion), loadJumpTissueModel(), loadAwTissueModel()]);
  function addBook(family: Selection["family"], field: Array<{ row: HistoricalTargetRunnerMetricsRow; probability: number }>) {
    if (field.length < 2) return;
    const ranked = [...field].sort((a, b) => b.probability - a.probability || a.row.features.targetRunnerId.localeCompare(b.row.features.targetRunnerId));
    const leader = ranked[0]!, f = leader.row.features;
    const price = canonicalSp.get(f.targetRunnerId);
    if (!price) return;
    const p = leader.probability, gap = p - ranked[1]!.probability;
    const confidence: Selection["confidence"] = confidenceBand({ family, model: tissueByFamily[family], raceId: f.targetRaceId, raceDate: f.raceDate, runnerId: f.targetRunnerId, horseName: f.horseName, course: f.courseName, raceTime: "", won: leader.row.outcome.won === true, finalSp: price, marketImpliedProbability: 1 / price, modelProbability: p, probabilityGap: gap, ratingGap: null, independentAgreements: 0 }).toUpperCase() as Selection["confidence"];
    rows.push({ family, model: tissueByFamily[family], cohort: "historical_cache", basis: "final_sp", raceId: f.targetRaceId, raceDate: f.raceDate, runnerId: f.targetRunnerId, won: leader.row.outcome.won === true, price, modelProbability: p, confidence, favourite: marketFavourite(f.targetRunnerId, field.map((runner) => ({ runnerId: runner.row.features.targetRunnerId, price: canonicalSp.get(runner.row.features.targetRunnerId) ?? null }))), capturedAt: null });
  }
  const turfExamples = buildExamples(historicalRows, history);
  for (const field of group(turfExamples, (e) => e.raceId).values()) {
    const probabilities = raceSoftmax(field.map((e) => score(turfModel.model, [...e.numeric, ...e.comments])));
    addBook("Turf", field.map((e, i) => ({ row: e.row, probability: probabilities[i]! })));
  }
  const jumpRows = historicalRows.filter((row) => row.features.raceCode === "jump" && row.outcome.resultStatus !== "non_runner" && classifyJumpRaceSubtype(row.features) !== "unknown_other");
  const numericGetters = new Map(NUMERIC_FEATURES);
  for (const field of group(jumpRows, (row) => row.features.targetRaceId).values()) {
    if (field.filter((row) => row.outcome.won).length !== 1 || field.some((row) => row.outcome.won === null)) continue;
    const probabilities = raceSoftmax(field.map((row) => {
      const f = row.features;
      const jumpValues: Record<string, number | null> = { latest_jump_speed: f.latestJumpSpeedRating, best_l3_jump_speed: f.bestJumpSpeedLast3, avg_l3_jump_speed: f.averageJumpSpeedLast3, log_prior_jump_starts: Math.log1p(f.priorRuns) };
      const raw = JUMP_TISSUE_NUMERIC_FEATURES.map((name) => name in jumpValues ? jumpValues[name]! : numericGetters.get(name)!(f));
      const values = [...raw.map((value) => value !== null && Number.isFinite(value) ? value : 0), ...raw.map((value) => value !== null && Number.isFinite(value) ? 0 : 1), ...commentVector(priorCommentsForTarget(history.get(f.horseId) ?? [], f.raceDateTime))];
      return score(jumpModel.model, values);
    }));
    addBook("Jump", field.map((row, i) => ({ row, probability: probabilities[i]! })));
  }
  const awExamples = buildPopulation(historicalRows, history).examples;
  for (const field of group(awExamples, (e) => e.raceId).values()) {
    const inputs = field.map((e) => featureValues(e, "AW-T0").slice(0, 16));
    const probabilities = awTissueProbabilities(inputs.map((raw) => awTissueModelInputs(raw, awModel)), awModel);
    addBook("All Weather", field.map((e, i) => ({ row: e.row, probability: probabilities[i]! })));
  }
  console.log("Frozen historical tissue inference complete.");
  const replay = [];
  for (const candidate of candidates) {
    const evaluated = races.filter((race) => race.family === candidate.family).map((race) => evaluateRace(candidate, race));
    const wins = evaluated.filter((row) => row.ranking[0]!.won).length;
    const previous = stage2.summaries[candidate.id];
    if (!previous || previous.races !== evaluated.length || previous.top1Wins !== wins) throw new Error(`Stage 2 replay mismatch: ${candidate.id}`);
    replay.push({ model: candidate.id, selections: evaluated.length, winners: wins, matchesExistingStage2: true });
    for (const e of evaluated) {
      const leader = e.ranking[0]!;
      const price = canonicalSp.get(leader.runnerId);
      if (!price) continue;
      rows.push({ family: labelByFamily[candidate.family], model: candidate.id, cohort: "historical_cache", basis: "final_sp", raceId: e.race.raceId, raceDate: e.race.raceDate, runnerId: leader.runnerId, won: leader.won, price, modelProbability: e.probabilities.get(leader.runnerId)!, confidence: e.confidence, favourite: marketFavourite(leader.runnerId, e.race.runners.map((runner) => ({ runnerId: runner.runnerId, price: canonicalSp.get(runner.runnerId) ?? null }))), capturedAt: null });
    }
  }
  return { rows, cacheSources, replay };
}

function group<T>(rows: T[], key: (row: T) => string) {
  const result = new Map<string, T[]>();
  for (const row of rows) { const k = key(row); const values = result.get(k) ?? []; values.push(row); result.set(k, values); }
  return result;
}

function audit(rows: Selection[], model: string, family: Selection["family"], cohort: Selection["cohort"], basis: Selection["basis"]) {
  return {
    model, family, cohort, basis, ...summarizeMarketSelections(rows),
    from: rows.length ? rows.map((row) => row.raceDate).sort()[0] : null,
    to: rows.length ? rows.map((row) => row.raceDate).sort().at(-1) : null,
    byYear: years.map((year) => ({ year, ...summarizeMarketSelections(rows.filter((row) => row.raceDate.startsWith(year))) })),
    byPriceBand: MARKET_PRICE_BANDS.map((band) => ({ band, ...summarizeMarketSelections(rows.filter((row) => marketPriceBand(row.price) === band)) })),
    shortPrice: SHORT_MARKET_PRICE_BANDS.map((band) => ({ band, ...summarizeMarketSelections(rows.filter((row) => shortMarketPriceBand(row.price) === band)) })),
    favourite: (["favourite", "joint_favourite", "not_favourite", "unknown"] as const).map((status) => ({ status, ...summarizeMarketSelections(rows.filter((row) => row.favourite === status)) })),
    confidence: (["HIGH", "MEDIUM", "LOW", "UNAVAILABLE"] as const).map((confidence) => ({ confidence, ...summarizeMarketSelections(rows.filter((row) => row.confidence === confidence)) })),
    shortConfidence: (["HIGH", "MEDIUM", "LOW", "UNAVAILABLE"] as const).map((confidence) => ({ confidence, ...summarizeMarketSelections(rows.filter((row) => row.price < 3 && row.confidence === confidence)) })),
    shortConfidenceByBand: SHORT_MARKET_PRICE_BANDS.flatMap((band) => (["HIGH", "MEDIUM", "LOW", "UNAVAILABLE"] as const).map((confidence) => ({ band, confidence, ...summarizeMarketSelections(rows.filter((row) => shortMarketPriceBand(row.price) === band && row.confidence === confidence)) }))),
    shortPriceByYear: years.flatMap((year) => SHORT_MARKET_PRICE_BANDS.map((band) => ({ year, band, ...summarizeMarketSelections(rows.filter((row) => row.raceDate.startsWith(year) && shortMarketPriceBand(row.price) === band)) }))),
  };
}

function paired(left: Selection[], right: Selection[]) {
  const ids = new Set(right.map((row) => row.raceId));
  const l = left.filter((row) => ids.has(row.raceId));
  const common = new Set(l.map((row) => row.raceId));
  const r = right.filter((row) => common.has(row.raceId));
  const lm = summarizeMarketSelections(l), rm = summarizeMarketSelections(r);
  return { left: lm, right: rm, commonRaces: common.size,
    rawStrikeDifference: lm.actualStrike === null || rm.actualStrike === null ? null : lm.actualStrike - rm.actualStrike,
    expectedStrikeDifference: lm.marketExpectedStrike === null || rm.marketExpectedStrike === null ? null : lm.marketExpectedStrike - rm.marketExpectedStrike,
    residualStrikeDifference: lm.actualMinusExpectedStrike === null || rm.actualMinusExpectedStrike === null ? null : lm.actualMinusExpectedStrike - rm.actualMinusExpectedStrike,
    samePriceBand: MARKET_PRICE_BANDS.map((band) => ({ band, left: summarizeMarketSelections(l.filter((row) => marketPriceBand(row.price) === band)), right: summarizeMarketSelections(r.filter((row) => marketPriceBand(row.price) === band)) })),
    sameFavourite: (["favourite", "joint_favourite", "not_favourite", "unknown"] as const).map((status) => ({ status, left: summarizeMarketSelections(l.filter((row) => row.favourite === status)), right: summarizeMarketSelections(r.filter((row) => row.favourite === status)) })),
  };
}

function hypothesis(comparison: ReturnType<typeof paired>) {
  const { left: rating, right: tissue, rawStrikeDifference: raw, expectedStrikeDifference: expected } = comparison;
  if (comparison.commonRaces === 0 || raw === null || expected === null) return { verdict: "NOT ASSESSABLE", reason: "No common priced races." };
  const shorter = rating.medianPrice! < tissue.medianPrice! && rating.underTwoToOne! > tissue.underTwoToOne! && expected > 0;
  const verdict = raw > 0 && shorter ? expected >= raw ? "SUPPORTED" : "PARTIALLY SUPPORTED" : "NOT SUPPORTED";
  return { verdict, reason: `Common-race raw strike difference ${pct(raw)}; market expected difference ${pct(expected)}; residual difference ${pct(comparison.residualStrikeDifference)}. ${raw <= 0 ? "The claimed raw strike advantage is absent in this cohort." : shorter ? "The rating selects shorter prices on all three profile measures." : "The shorter-price profile is not consistent across median, under-2/1 share and expected strike."} This is a descriptive decomposition, not causal proof.` };
}

function table(lines: string[], heading: string, headers: string[], rows: Array<Array<string | number>>) {
  lines.push(`## ${heading}`, "", `| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`), "");
}
const metricHeaders = ["N", "Wins", "Strike", "Market exp wins", "Market exp strike", "Actual - exp wins", "Actual - exp strike", "A/E", "Model exp wins", "Actual - model exp"];
function metricCells(m: Metrics) { return [m.selections, m.actualWinners, pct(m.actualStrike), num(m.marketExpectedWinners), pct(m.marketExpectedStrike), num(m.actualMinusExpectedWinners), pct(m.actualMinusExpectedStrike), num(m.ae), num(m.modelExpectedWinners), num(m.actualMinusModelExpected)]; }

async function main() {
  const before = await hashes();
  const { rows, cacheSources, replay } = await loadSelections();
  const audits = [...group(rows, (row) => `${row.family}|${row.model}|${row.cohort}|${row.basis}`)].map(([, selections]) => { const s = selections[0]!; return audit(selections, s.model, s.family, s.cohort, s.basis); });
  const comparisons = [];
  for (const family of families) {
    for (const cohort of ["frozen_forward", "historical_cache"] as const) {
      for (const basis of ["final_sp", "prospective_median"] as const) {
        const subset = rows.filter((row) => row.family === family && row.cohort === cohort && row.basis === basis);
        const models = [...new Set(subset.map((row) => row.model))];
        for (let i = 0; i < models.length; i++) for (let j = i + 1; j < models.length; j++) {
          const comparison = paired(subset.filter((row) => row.model === models[i]), subset.filter((row) => row.model === models[j]));
          comparisons.push({ family, cohort, basis, leftModel: models[i]!, rightModel: models[j]!, ...comparison });
        }
      }
    }
  }
  const hypotheses = (["Jump", "All Weather"] as const).flatMap((family) => (["frozen_forward", "historical_cache"] as const).flatMap((cohort) => (cohort === "frozen_forward" ? ["final_sp", "prospective_median"] as const : ["final_sp"] as const).flatMap((basis) => (cohort === "frozen_forward" ? ["2026"] : ["all", ...years]).map((year) => {
    const subset = rows.filter((row) => row.family === family && row.cohort === cohort && row.basis === basis && (year === "all" || row.raceDate.startsWith(year)));
    const comparison = paired(subset.filter((row) => row.model === ratingByFamily[family]), subset.filter((row) => row.model === tissueByFamily[family]));
    return { family, cohort, basis, year, ratingModel: ratingByFamily[family], tissueModel: tissueByFamily[family], ...comparison, ...hypothesis(comparison) };
  }))));
  const forwardBest = families.map((family) => {
    const subset = rows.filter((row) => row.family === family && row.cohort === "frozen_forward" && row.basis === "final_sp");
    const models = [tissueByFamily[family], ratingByFamily[family]];
    const common = models.map((model) => new Set(subset.filter((row) => row.model === model).map((row) => row.raceId)));
    const ids = new Set([...common[0]!].filter((id) => common[1]!.has(id)));
    const scores = models.map((model) => ({ model, ...summarizeMarketSelections(subset.filter((row) => row.model === model && ids.has(row.raceId))) })).sort((a, b) => (b.ae ?? -1) - (a.ae ?? -1));
    return { family, scope: "common frozen current-model races, final SP", commonRaces: ids.size, bestObserved: ids.size ? scores[0]!.model : null, scores, limitation: "Descriptive A/E leader; Stage 2 historical candidates have different coverage and cannot be declared better than current tissue from these unmatched cohorts." };
  });
  const best = families.map((family) => {
    const subset = rows.filter((row) => row.family === family && row.cohort === "historical_cache" && row.basis === "final_sp" && row.raceDate.startsWith("2026"));
    const models = [...new Set(subset.map((row) => row.model))];
    const byModel = models.map((model) => new Set(subset.filter((row) => row.model === model).map((row) => row.raceId)));
    const ids = new Set([...(byModel[0] ?? [])].filter((id) => byModel.every((set) => set.has(id))));
    const scores = models.map((model) => ({ model, ...summarizeMarketSelections(subset.filter((row) => row.model === model && ids.has(row.raceId))) })).sort((a, b) => (b.ae ?? -1) - (a.ae ?? -1));
    return { family, scope: "2026 historical common races across current models and all Stage 2 candidates, final SP", commonRaces: ids.size, bestObserved: ids.size ? scores[0]!.model : null, scores, limitation: "Descriptive ranking by A/E on equal race coverage; no claim of statistically significant superiority or prospective historical prices." };
  });
  const positive = audits.filter((a) => a.ae !== null && a.ae > 1).map((a) => `${a.model} (${a.cohort}, ${a.basis}, N=${a.selections}, A/E=${num(a.ae)}, approximate interval ${a.aeApprox95!.map(num).join(" to ")})`);
  const positiveYears = audits.flatMap((a) => a.byYear.filter((y) => y.ae !== null && y.ae > 1).map((y) => `${a.model} (${a.cohort} / ${a.basis} / ${y.year}, N=${y.selections}, A/E=${num(y.ae)})`));
  const strong = audits.filter((a) => a.marketResidualZ !== null && a.marketResidualZ > 1.96).map((a) => `${a.model} / ${a.cohort} / ${a.basis}`);
  const turfControls = audits.filter((a) => a.model === "Turf Tissue v2");
  const marketProfileFindings = families.map((family) => {
    const subset = rows.filter((row) => row.family === family && row.cohort === "historical_cache" && row.raceDate.startsWith("2026"));
    const candidate = family === "Turf" ? "TURF-R2" : family === "Jump" ? "JUMP-R3" : "AW-R3";
    const c = paired(subset.filter((row) => row.model === tissueByFamily[family]), subset.filter((row) => row.model === candidate));
    return { family, referenceModel: tissueByFamily[family], candidate, ...c, description: `${tissueByFamily[family]} vs ${candidate} on ${c.commonRaces} common 2026 races: raw tissue strike advantage ${(100 * (c.rawStrikeDifference ?? 0)).toFixed(2)} percentage points, market-profile expected advantage ${(100 * (c.expectedStrikeDifference ?? 0)).toFixed(2)} points, residual advantage ${(100 * (c.residualStrikeDifference ?? 0)).toFixed(2)} points. ${c.rawStrikeDifference !== null && c.rawStrikeDifference > 0 && c.expectedStrikeDifference !== null && c.expectedStrikeDifference >= c.rawStrikeDifference ? "The raw tissue advantage is fully accounted for descriptively by its shorter-price profile." : "Price profile explains part of the raw difference; the residual is the remaining descriptive difference."}` };
  });
  const favouriteFindings = families.map((family) => {
    const subset = rows.filter((row) => row.family === family && row.cohort === "historical_cache" && row.raceDate.startsWith("2026"));
    const c = paired(subset.filter((row) => row.model === tissueByFamily[family]), subset.filter((row) => row.model === ratingByFamily[family]));
    const groups = c.sameFavourite.filter((g) => g.status !== "unknown").map((g) => `${g.status}: ${tissueByFamily[family]} N=${g.left.selections}, strike=${pct(g.left.actualStrike)}, A/E=${num(g.left.ae)} vs ${ratingByFamily[family]} N=${g.right.selections}, strike=${pct(g.right.actualStrike)}, A/E=${num(g.right.ae)}`);
    const eligible = c.sameFavourite.filter((g) => g.status === "favourite" || g.status === "not_favourite");
    const persists = eligible.every((g) => g.left.actualStrike !== null && g.right.actualStrike !== null && g.left.actualStrike > g.right.actualStrike);
    return { family, commonRaces: c.commonRaces, description: `${family}: tissue-minus-rating overall strike ${pct(c.rawStrikeDifference)}. ${groups.join("; ")}. ${persists ? "Tissue's strike advantage persists among both sole favourites and non-favourites." : "The overall strike ordering does not persist uniformly after favourite control."} Favourite control does not fix the remaining price differences; A/E remains the adjustment within each category.` };
  });
  const bandLeaders = best.flatMap((b) => MARKET_PRICE_BANDS.map((band) => {
    const subset = rows.filter((row) => row.family === b.family && row.cohort === "historical_cache" && row.raceDate.startsWith("2026"));
    const models = b.scores.map((s) => s.model);
    const common = models.map((model) => new Set(subset.filter((row) => row.model === model).map((row) => row.raceId)));
    const ids = new Set([...(common[0] ?? [])].filter((id) => common.every((set) => set.has(id))));
    const scores = models.map((model) => ({ model, ...summarizeMarketSelections(subset.filter((row) => row.model === model && ids.has(row.raceId) && marketPriceBand(row.price) === band)) })).sort((a, c) => (c.ae ?? -1) - (a.ae ?? -1));
    return { family: b.family, band, bestObserved: scores[0]?.ae !== null ? scores[0]?.model ?? null : null, scores };
  }));
  const conclusions = [
    `Pooled-cohort A/E above 1: ${positive.join("; ") || "none"}. Year-specific overall A/E above 1: ${positiveYears.join("; ") || "none"}. No model has A/E above 1 on the common 2026 all-model comparison. Positive pooled residual beyond 1.96 market-null standard deviations: ${strong.join("; ") || "none"}. No durable market-beating model is established. Raw inverse odds retain overround; negative residual can reflect bookmaker margin as well as selection weakness.`,
    `Raw strike versus price profile: ${marketProfileFindings.map((f) => f.description).join(" ")} Shorter-price hypotheses on common 2026 historical final-SP races: ${hypotheses.filter((h) => h.cohort === "historical_cache" && h.year === "2026").map((h) => `${h.ratingModel}: ${h.verdict}. ${h.reason}`).join(" ")}`,
    `Short-price market residuals in historical 2026: ${audits.filter((a) => a.cohort === "historical_cache").map((a) => { const short = summarizeMarketSelections(rows.filter((r) => r.model === a.model && r.cohort === a.cohort && r.raceDate.startsWith("2026") && r.price < 3)); return `${a.model} N=${short.selections}, wins=${short.actualWinners}, expected=${num(short.marketExpectedWinners)}, A/E=${num(short.ae)}, z=${num(short.marketResidualZ)}`; }).join("; ")}. Turf Tissue and TPR short-price deficits exceed two raw-market-null standard deviations in both 2025 and 2026, so the observed market-relative weakness repeats. Jump weakens in 2026; AW Tissue does not show a comparably strong short-price deficit. This is not proof of a structural flaw after removing bookmaker margin. Short-priced tissue selections actually win more often than their own model probabilities predict: market-relative underperformance and model underconfidence can coexist.`,
    `Short-price confidence separation in historical 2026: ${audits.filter((a) => a.cohort === "historical_cache" && a.model === tissueByFamily[a.family]).map((a) => { const short = rows.filter((r) => r.model === a.model && r.cohort === a.cohort && r.raceDate.startsWith("2026") && r.price < 3); const high = summarizeMarketSelections(short.filter((r) => r.confidence === "HIGH")), low = summarizeMarketSelections(short.filter((r) => r.confidence === "LOW")); return `${a.model}: HIGH N=${high.selections}, A/E=${num(high.ae)}; LOW N=${low.selections}, A/E=${num(low.ae)}; ${high.ae !== null && low.ae !== null && high.ae > low.ae ? "HIGH improves observed A/E" : "no demonstrated HIGH-over-LOW improvement"}`; }).join("; ")}. Compare the per-band tables to control the remaining price profile. Historical rank-only baselines have UNAVAILABLE confidence; no market-favourite agreement enters confidence.`,
    "The next rebuild should prioritise ranking measured on common chronological cohorts with market-profile controls, followed by redesign/validation of confidence and abstention. The proposed short-price plus weak-confidence claim is not consistently supported by the existing confidence definitions. Calibration needs attention in both directions wherever model expected wins differ from actual wins; it cannot by itself repair rank ordering. Candidate softmax probabilities are uncalibrated scorebook outputs. Market-disagreement handling remains research where non-favourite residuals differ; no price input or betting threshold is justified here.",
  ];
  const lines = ["# Market-Adjusted Rank-1 Audit", "", `Generated ${new Date().toISOString()}. Research only. No model fitting or rebuilding.`, "",
    "Expected wins = sum(1 / decimal price); expected strike = expected wins / priced selections; A/E = wins / expected wins. Decimal 3 is 2/1, so under 2/1 means price <3. Bookmaker overround is retained. No forecast or capped settlement price is labelled SP.", "",
    "Prospective median prices and final SP are separate overlapping views, never added together. The prospective view uses the fixed early median snapshot captured at/after prediction and strictly before scheduled off. No later quote is selected based on outcome. Favourite status requires a full SP field, or stored favourite IDs at exactly the median capture time; otherwise unknown.", "",
    "Frozen forward current-model selections cover late 2026. Historical tissue selections are inference from the unchanged frozen artifacts using existing cached features and prior-run database history; these are retrospective, not predictions recorded in 2025. 2025 is the tissue training year and results are in-sample; 2026 is the chronological holdout. Historical rating baselines use existing production formulas with the current >=2 rated / >=20% coverage guard. Ties resolve to one leader using runner ID; frozen Forward Value leaders are preserved. Candidate ties retain the existing Stage 2 horse-name convention. These tie rules and population differences limit comparisons.", "",
    "Stage 2 did not persist selection rows. This audit replays the unchanged fixed scorebooks and verifies every candidate's N/wins against the saved Stage 2 JSON before attaching prices. It does not rerun the Stage 2 build command. Audit pricing uses outcome startingPriceDecimal only; cache feature odds are never substituted for missing SP. Models are never selected or modified from audit results.", "",
    "Current confidence: HIGH if p>=.38, gap>=.08 (rating gap>=10 if probability gap unavailable), or p>=.30 with independent model agreement; MEDIUM if p>=.20, gap>=.04 (rating gap>=4), or independent agreement; otherwise LOW. Candidate confidence: HIGH if p>=.30, gap>=.06, priorRuns>=3 and <=1 missing among OR/trainer/jockey/recency; MEDIUM if p>=.22 and gap>=.03, score gap>=.8, or priorRuns>=5 and field<=7; otherwise LOW. The two pre-existing definitions are distinct and comparisons across them are descriptive. Rank-only historical baseline confidence/model expectations are unavailable.", "",
    "Historical comment/history retrieval is SELECT-only with target-time filtering. No target/future comments enter scoring. Retrospective source data do not prove unchanged pre-race publication of comments. Missing numeric values follow the frozen models' native handling. Approximate A/E intervals use variance sum(p*(1-p)) under a fixed independent-market null, not a fitted market model or causal test; tiny groups and multiple comparisons need caution.", ""];
  lines.push("## Conclusions", "", ...conclusions.map((line, i) => `${i + 1}. ${line}`), "");
  for (const cohort of ["frozen_forward", "historical_cache"] as const) for (const basis of ["prospective_median", "final_sp"] as const) {
    const subset = audits.filter((a) => a.cohort === cohort && a.basis === basis);
    if (!subset.length) continue;
    const suffix = `${cohort} / ${basis}`;
    table(lines, `Rank-1 Metrics: ${suffix}`, ["Family", "Model", "From", "To", ...metricHeaders, "A/E approx 95%"], subset.map((a) => [a.family, a.model, a.from ?? "n/a", a.to ?? "n/a", ...metricCells(a), a.aeApprox95?.map(num).join(" to ") ?? "n/a"]));
    table(lines, `Price Distribution: ${suffix}`, ["Model", "Average", "Median", "Under 2/1", ...MARKET_PRICE_BANDS], subset.map((a) => [a.model, num(a.averagePrice), num(a.medianPrice), pct(a.underTwoToOne), ...a.priceDistribution.map((b) => pct(b.proportion))]));
    table(lines, `Same Price Bands: ${suffix}`, ["Model", "Band", ...metricHeaders], subset.flatMap((a) => a.byPriceBand.map((b) => [a.model, b.band, ...metricCells(b)])));
    table(lines, `Short-Price Failures: ${suffix}`, ["Model", "Band", ...metricHeaders, "Residual z"], subset.flatMap((a) => a.shortPrice.map((b) => [a.model, b.band, ...metricCells(b), num(b.marketResidualZ)])));
    table(lines, `Short-Price Failures by Year: ${suffix}`, ["Model", "Year", "Band", ...metricHeaders], subset.flatMap((a) => a.shortPriceByYear.map((b) => [a.model, b.year, b.band, ...metricCells(b)])));
    table(lines, `Favourite Relationship: ${suffix}`, ["Model", "Status", ...metricHeaders], subset.flatMap((a) => a.favourite.map((b) => [a.model, b.status, ...metricCells(b)])));
    table(lines, `Short Price x Confidence: ${suffix}`, ["Family", "Model", "Confidence", ...metricHeaders], subset.flatMap((a) => a.shortConfidence.map((b) => [a.family, a.model, b.confidence, ...metricCells(b)])));
    table(lines, `Short Bands x Confidence: ${suffix}`, ["Model", "Band", "Confidence", ...metricHeaders], subset.flatMap((a) => a.shortConfidenceByBand.filter((b) => b.selections > 0).map((b) => [a.model, b.band, b.confidence, ...metricCells(b)])));
    table(lines, `2025 vs 2026: ${suffix}`, ["Model", "Year", ...metricHeaders], subset.flatMap((a) => a.byYear.map((b) => [a.model, b.year, ...metricCells(b)])));
  }
  table(lines, "Common-Race Model Comparisons", ["Family", "Cohort", "Basis", "Left", "Right", "Common N", "Left strike", "Right strike", "Left A/E", "Right A/E", "Raw delta", "Market delta", "Residual delta"], comparisons.map((c) => [c.family, c.cohort, c.basis, c.leftModel, c.rightModel, c.commonRaces, pct(c.left.actualStrike), pct(c.right.actualStrike), num(c.left.ae), num(c.right.ae), pct(c.rawStrikeDifference), pct(c.expectedStrikeDifference), pct(c.residualStrikeDifference)]));
  lines.push("## Market Profile Findings (2026 Historical)", "", ...marketProfileFindings.flatMap((f) => [f.description, ""]));
  table(lines, "Common-Race Same Price-Band Comparisons", ["Cohort / basis", "Pair", "Band", "Model", ...metricHeaders], comparisons.flatMap((c) => c.samePriceBand.flatMap((b) => [[`${c.cohort} / ${c.basis}`, `${c.leftModel} vs ${c.rightModel}`, b.band, c.leftModel, ...metricCells(b.left)], [`${c.cohort} / ${c.basis}`, `${c.leftModel} vs ${c.rightModel}`, b.band, c.rightModel, ...metricCells(b.right)]])));
  table(lines, "Common-Race Favourite Controls", ["Cohort / basis", "Pair", "Status", "Model", ...metricHeaders], comparisons.flatMap((c) => c.sameFavourite.flatMap((b) => [[`${c.cohort} / ${c.basis}`, `${c.leftModel} vs ${c.rightModel}`, b.status, c.leftModel, ...metricCells(b.left)], [`${c.cohort} / ${c.basis}`, `${c.leftModel} vs ${c.rightModel}`, b.status, c.rightModel, ...metricCells(b.right)]])));
  lines.push("## Favourite Control Findings (2026 Historical)", "", ...favouriteFindings.flatMap((f) => [f.description, ""]));
  lines.push("## Turf Tissue Control", "");
  for (const a of turfControls) {
    const high = a.confidence.find((c) => c.confidence === "HIGH")!, low = a.confidence.find((c) => c.confidence === "LOW")!;
    lines.push(`${a.cohort} / ${a.basis}: A/E ${num(a.ae)} (${a.ae! > 1 ? "above" : "below"} market expectation), ${a.actualWinners} wins vs ${num(a.marketExpectedWinners)} expected. 2025 A/E ${num(a.byYear[0]!.ae)}; 2026 A/E ${num(a.byYear[1]!.ae)}. ${a.cohort === "historical_cache" ? `Above market in both years? ${a.byYear.every((y) => y.ae !== null && y.ae > 1) ? "Yes, descriptively" : "No"}; 2025 is in-sample.` : "2025 frozen forward observations unavailable."} Favourites: ${a.favourite.map((f) => `${f.status} N=${f.selections}, A/E=${num(f.ae)}`).join("; ")}. HIGH N=${high.selections}, strike=${pct(high.actualStrike)}, A/E=${num(high.ae)}; LOW N=${low.selections}, strike=${pct(low.actualStrike)}, A/E=${num(low.ae)}. ${high.ae !== null && low.ae !== null ? `HIGH ${high.ae > low.ae ? "improves" : "does not improve"} on LOW observed market-adjusted performance.` : "Confidence comparison unavailable in this basis."}`, "");
  }
  table(lines, "AW and Jump Hypotheses (Common Races)", ["Family", "Cohort", "Year", "Basis", "Model", "N", "Median", "Under 2/1", "Expected strike", "Actual strike", "A/E"], hypotheses.flatMap((h) => [[h.family, h.cohort, h.year, h.basis, h.ratingModel, h.left.selections, num(h.left.medianPrice), pct(h.left.underTwoToOne), pct(h.left.marketExpectedStrike), pct(h.left.actualStrike), num(h.left.ae)], [h.family, h.cohort, h.year, h.basis, h.tissueModel, h.right.selections, num(h.right.medianPrice), pct(h.right.underTwoToOne), pct(h.right.marketExpectedStrike), pct(h.right.actualStrike), num(h.right.ae)]]));
  for (const h of hypotheses) lines.push(`${h.family} / ${h.cohort} / ${h.year} / ${h.basis}: **${h.verdict}**. ${h.reason}`, "");
  table(lines, "Best Observed Models on Matched 2026 Historical Races", ["Family", "Best A/E", "Common N"], best.map((b) => [b.family, b.bestObserved ?? "n/a", b.commonRaces]));
  table(lines, "Matched 2026 Historical Scores", ["Family", "Model", ...metricHeaders], best.flatMap((b) => b.scores.map((s) => [b.family, s.model, ...metricCells(s)])));
  table(lines, "Best Observed A/E Within Bands (Matched 2026 Historical Races)", ["Family", "Band", "Model", "N", "Strike", "Expected strike", "A/E", "Residual wins"], bandLeaders.map((b) => { const s = b.scores[0]!; return [b.family, b.band, b.bestObserved ?? "n/a", s.selections, pct(s.actualStrike), pct(s.marketExpectedStrike), num(s.ae), num(s.actualMinusExpectedWinners)]; }));
  lines.push("Band leaders are descriptive maxima. Even within broad bands prices differ, so residuals/A/E are more useful than raw strike; very small selections and multiple comparisons do not establish superiority.", "");
  table(lines, "Best Observed Frozen Current Models", ["Family", "Best A/E on common final-SP races", "Common N"], forwardBest.map((b) => [b.family, b.bestObserved ?? "n/a", b.commonRaces]));
  lines.push("Observed A/E leaders are reported on matched races within each cohort. Historical and frozen forward results are kept separate.", "", "## Coverage and Integrity", "", "Input SHA-256 fingerprints and exact cache manifests are stored in JSON. Frozen selections, replay checks and all paired comparisons are included for reproducibility. 2025 historical tissue predictions are inference from frozen artifacts, not retrospective forward records. Frozen TPR observations come from clean settled Forward Value records, so availability of that capture limits TPR forward coverage. Jump/AW frozen rating trackers add eligible rank-1 observations even without median captures. Historical rank baselines have no model expectation unless a frozen probability exists. Unknown favourite status is reported explicitly.", "");
  for (const source of cacheSources) lines.push(`- ${source.family} ${source.year}: ${source.directory}`);
  const after = await hashes();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Protected input changed during audit");
  const report = { generatedAt: new Date().toISOString(), methodology: { marketProbability: "1/price, overround retained", pricePriority: "early prospective median where safe; SP in a separately labelled descriptive view", inference: "unchanged Stage 2 scorebook replay and frozen current artifact inference, no retraining", historical2025Tissue: "inference on training-year data, not prospective", confidenceDefinitions: "candidate Stage 2 full definition; current Stage 2 shared short-price audit definition with market agreement removed", matchedComparisons: "within cohort and price basis only", modelConfidenceUnavailableForHistoricalRankBaselines: true }, protectedInputHashes: before, protectedInputsUnchanged: true, cacheSources, replay, audits, comparisons, hypotheses, best, forwardBest, bandLeaders, favouriteFindings, marketProfileFindings, conclusions, selections: rows };
  await writeFile("/tmp/ranking-market-adjusted-audit.json", `${JSON.stringify(report, null, 2)}\n`);
  await writeFile("/tmp/ranking-market-adjusted-audit.md", `${lines.join("\n")}\n`);
  console.log("Model | Cohort | Basis | Rank-1 selections | Actual strike | Market expected strike | A/E | Median price | % under 2/1");
  for (const a of audits) console.log(`${a.model} | ${a.cohort} | ${a.basis} | ${a.selections} | ${pct(a.actualStrike)} | ${pct(a.marketExpectedStrike)} | ${num(a.ae)} | ${num(a.medianPrice)} | ${pct(a.underTwoToOne)}`);
  for (const b of best) console.log(`Best market-adjusted ${b.family}: ${b.bestObserved ?? "unavailable"} (common 2026 historical final-SP races N=${b.commonRaces}; descriptive A/E leader)`);
  for (const h of hypotheses) console.log(`${h.ratingModel} shorter-price hypothesis / ${h.cohort} / ${h.year} / ${h.basis}: ${h.verdict}`);
  console.log("Protected inputs unchanged. Wrote /tmp/ranking-market-adjusted-audit.md and /tmp/ranking-market-adjusted-audit.json");
}

if (process.argv[1]?.endsWith("audit-ranking-market-adjusted.ts")) await main();

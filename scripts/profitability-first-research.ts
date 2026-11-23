/** Offline research. Exclusive writes create new versioned artifacts. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { dateClusterInterval, frozenFeature, mean, sum } from "../src/lib/racing/chase-t3-research";
import { settleSelection } from "../src/lib/racing/backtest";
import { indexHurdleFinalSpResults, type HurdleFinalSpResultRow } from "../src/lib/racing/hurdle-final-sp";
import { loadTissueGeneration } from "../src/lib/racing/tissue-generation-forward";
import { generationModelPath, loadTissueGenerationModels } from "../src/lib/racing/tissue-generation-model";
import { normalizeCompleteMarket, TISSUE_VALUE_FAMILIES as families, type TissueValueFamily as Family } from "../src/lib/racing/tissue-value-metrics";
import { parseSportingLifeEstimatedPrice } from "../src/lib/racing/tissue-forward";
import { raceSoftmax, score } from "./diagnose-independent-tissue-feasibility";
import type { ResearchInput } from "./extract-retrospective-market-research";

const paths = {
  baseline: "docs/tissue-t2-profit-baseline-v1.json", definitions: "docs/profitability-first-model-definitions-v1.json",
  evaluation: "docs/profitability-first-model-evaluation-v1.json", prices: "docs/tissue-rank1-vs-rank2-diagnostic-evidence.json",
  aw: "docs/aw-v3-isolated-adjustment-evidence.json", oldFit: "docs/retrospective-market-beating-models-2026-fit.json",
};
const definition = {
  id: "PROFITABILITY_FIRST_RESEARCH_V1",
  baseline: "TISSUE_T2_PROFIT_BASELINE_V1",
  aw: "AW_V3_NO_SAME_OR_T2",
  trainThrough: "2025-09-30",
  experiments: {
    A: { id: "T2_RELIABILITY_BLEND_V1", minimumEdge: .03, historyPrior: 3, measuredBlend: .5, sparseBlend: .25,
      action: "Only original T2; blend its p toward the normalized pre-off market using the frozen history count and observed Best L3; allocate remaining mass by market." },
    B: { id: "MARKET_FORM_TILT_V1", minimumEdge: .03, l2: .035, steps: 160, rate: .4,
      features: ["minimum of within-field latest and Best L3 Speed midranks × history coverage", "within-field OR midrank", "history coverage minus 0.5 (missing = 0)"],
      historySaturation: 6, action: "Offer qualifies at p × decimal price − 1 ≥ 3%; select highest expected net return, then runner ID." },
    C: { id: "MARKET_FORM_LOG_UTILITY_V1", referenceFraction: .01,
      action: "Same B forecasts and 3% qualification; one runner with greatest positive expected log growth at a 1% reference fraction, then runner ID; actual evaluation remains £1." },
  },
  attempts: "Exactly three specified policies; one pooled fit and one set of constants. No fitted return model, search, post-validation calibration, threshold variants or 2026 refit.",
  pricing: "2025 and early-2026 broad books use own final SP as a retrospective selection input; November decisions use frozen pre-off prices, and all settlement uses final SP.",
} as const;

type Feature = { id: string; or: number | null; speed: number | null; recent: number | null; prior: number | null };
type Offer = Feature & { price: number; tissue?: number; tissueRank?: number };
type Result = { sp: number; fractional: string | null; market: number; credit: number; pl: number };
type Runner = Feature & { name?: string; tissue?: number; tissueRank?: number; awProbability?: number; quote: number | null; result: Result | null };
type Book = { id: string; date: string; family: Family; course: string; runners: Runner[]; baseId?: string; awId?: string };
type Pick = { index: number; p: number; edge: number; utility?: number };
type Decision = { identity: string; horse?: string; price: number | null; sp: number | null; pl: number | null; market: number | null; credit: number; tissueRank?: number; p: number | null; edge: number | null; utility?: number };
type Quality = { logLoss: number; brier: number };
type Eval = { id: string; date: string; family: Family; course: string; policies: Record<string, Decision | null>; quality: Record<string, Quality>; decisionsAvailable: boolean };
type PriorPick = { runnerId: string; rank: number; probability: number; decimal: number | null; sp: string | null; pl: number | null; status: string };
type Prior = { hashes: Record<string, string>; pairs: { raceId: string; fullSp: boolean; t1: PriorPick; t2: PriorPick }[]; diagnostics: { ALL: { matched: { n: number; t2: { w: number; pl: number; roi: number } } } } };
type AuditResult = { id: string; p: number | null; status: string | null; outcome: string | null; state: string; sp: number | null; credit: number };
type AuditBook = { id: string; date: string; complete: boolean; stage: string; runners: AuditResult[] };

async function read<T>(path: string) {
  const bytes = await readFile(path);
  return { value: JSON.parse(bytes.toString("utf8")) as T, sha256: hash(bytes) };
}
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const fileHash = async (path: string) => hash(await readFile(path));
const near = (a: number, b: number, tolerance = 1e-10) => Math.abs(a - b) < tolerance;
async function freeze(path: string, body: object) {
  const digest = hash(JSON.stringify(body));
  const bytes = JSON.stringify({ sha256: digest, content: body }) + "\n";
  try { await writeFile(path, bytes, { flag: "wx" }); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    assert.equal(await readFile(path, "utf8"), bytes, "Refusing to replace a versioned research artifact");
  }
  return digest;
}
async function pinned<T>(path: string) {
  const { value } = await read<{ sha256: string; content: T }>(path);
  assert.equal(value.sha256, hash(JSON.stringify(value.content)));
  return value;
}
function rankFeature(value: number | null, data: readonly (number | null)[]) {
  const present = data.filter((v): v is number => v !== null);
  if (value === null || present.length < 2) return 0;
  const above = present.filter(v => v > value).length;
  const below = present.filter(v => v < value).length;
  return (below - above) / (present.length - 1);
}
export function prepare(offers: readonly Offer[]) {
  const market = normalizeCompleteMarket(offers.map(r => r.price));
  assert.ok(market);
  const logMarket = market.probabilities.map(Math.log);
  const column = (key: "or" | "speed" | "recent") => offers.map(r => r[key]);
  const official = column("or"), best = column("speed"), latest = column("recent");
  const x = offers.map(r => {
    const coverage = Math.min(definition.experiments.B.historySaturation, Math.max(0, r.prior ?? 0)) / definition.experiments.B.historySaturation;
    return [r.speed === null || r.recent === null ? 0 : Math.min(rankFeature(r.speed, best), rankFeature(r.recent, latest)) * coverage,
      rankFeature(r.or, official), r.prior === null ? 0 : coverage - .5];
  });
  return { market: market.probabilities, logMarket, x };
}
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
function forecast(prepared: ReturnType<typeof prepare>, weights: readonly number[]) {
  return raceSoftmax(prepared.logMarket.map((log, i) => log + dot(prepared.x[i], weights)));
}

export function choose(offers: readonly Offer[], weights: readonly number[], allowTissue: boolean) {
  const prepared = prepare(offers);
  const bForecast = forecast(prepared, weights);
  const threshold = definition.experiments.B.minimumEdge;
  const reference = definition.experiments.C.referenceFraction;
  const items = offers.map((r, index) => {
    const p = bForecast[index];
    const edge = p * r.price - 1;
    const utility = p * Math.log1p(reference * (r.price - 1)) + (1 - p) * Math.log1p(-reference);
    return { index, p, edge, utility };
  }).filter(x => x.edge >= threshold);
  const top = (key: "edge" | "utility") => items.filter(x => key !== "utility" || x.utility > 0)
    .sort((a, b) => b[key] - a[key] || offers[a.index].id.localeCompare(offers[b.index].id))[0] ?? null;
  const idx = allowTissue ? offers.findIndex(r => r.tissueRank === 2) : -1;
  const aRunner = offers[idx];
  let aForecast: number[] | null = null;
  let a: Pick | null = null;
  if (aRunner?.tissue !== undefined) {
    const spec = definition.experiments.A;
    const runs = Math.max(0, aRunner.prior ?? 0);
    const weight = (aRunner.speed === null ? spec.sparseBlend : spec.measuredBlend) * runs / (runs + spec.historyPrior);
    const market = prepared.market[idx];
    const p = market + weight * (aRunner.tissue - market);
    const edge = p * aRunner.price - 1;
    aForecast = prepared.market.map((q, i) => i === idx ? p : q * (1 - p) / (1 - market));
    if (edge >= spec.minimumEdge) a = { index: idx, p, edge };
  }
  return { a, b: top("edge"), c: top("utility"), aForecast, bForecast };
}
function toOffers(book: Book, quote: "preoff" | "retrospective"): Offer[] | null {
  const prices = book.runners.map(r => quote === "preoff" ? r.quote : r.result?.sp);
  if (!prices.every(p => typeof p === "number" && Number.isFinite(p) && p > 1)) return null;
  return book.runners.map(({ id, or, speed, recent, prior, tissue, tissueRank }, i) =>
    ({ id, or, speed, recent, prior, tissue, tissueRank, price: prices[i] as number }));
}
function quality(book: Book, p: readonly number[]): Quality {
  const starter = book.runners.flatMap((r, i) => r.result ? [[r.result.credit, p[i]]] : []);
  const mass = sum(starter.map(x => x[1]));
  assert.ok(near(sum(starter.map(x => x[0])), 1) && mass > 0);
  return { logLoss: -sum(starter.map(([credit, prob]) => credit * Math.log(prob / mass))),
    brier: sum(starter.map(([credit, prob]) => (prob / mass - credit) ** 2)) };
}
function evaluate(book: Book, weights: readonly number[], price: "preoff" | "retrospective"): Eval {
  const offers = toOffers(book, price);
  const selection = offers ? choose(offers, weights, price === "preoff") : null;
  const chooseResult = (r: Runner | undefined, p: number | null, quote: number | null, edge: number | null, utility?: number): Decision | null =>
    r ? { identity: r.id, horse: r.name, price: quote, sp: r.result?.sp ?? null, pl: r.result?.pl ?? null, market: r.result?.market ?? null,
      credit: r.result?.credit ?? 0, tissueRank: r.tissueRank, p, edge, utility } : null;
  const control = (r: Runner | undefined) => chooseResult(r, r?.tissue ?? null, null, null);
  const decision = (p: Pick | null | undefined) => p ? chooseResult(book.runners[p.index], p.p, offers![p.index].price, p.edge, p.utility) : null;
  const market = book.runners.filter(r => r.result).sort((a, b) => a.result!.sp - b.result!.sp || a.id.localeCompare(b.id))[0];
  const q: Record<string, Quality> = {
    SP: quality(book, book.runners.map(r => r.result?.market ?? 0)),
  };
  if (selection) {
    q.B = quality(book, selection.bForecast);
    q.C = q.B;
    if (selection.aForecast) q.A = quality(book, selection.aForecast);
    if (price === "preoff") q.PREOFF_MARKET = quality(book, prepare(offers!).market);
  }
  if (book.runners.every(r => r.tissue !== undefined)) q.BASELINE = quality(book, book.runners.map(r => r.tissue!));
  if (book.runners.every(r => r.awProbability !== undefined)) q.AW = quality(book, book.runners.map(r => r.awProbability!));
  const revisedAw = book.runners.find(r => r.id === book.awId);
  return { id: book.id, date: book.date, course: book.course, family: book.family, decisionsAvailable: !!selection, quality: q,
    policies: { BASELINE: control(book.runners.find(r => r.id === book.baseId)), AW: chooseResult(revisedAw, revisedAw?.awProbability ?? null, null, null),
      SP: control(market), A: decision(selection?.a), B: decision(selection?.b), C: decision(selection?.c) } };
}

function summary(rows: Eval[], name: string) {
  const picks = rows.flatMap(r => r.policies[name] ? [{ row: r, pick: r.policies[name]! }] : []);
  const stakes = picks.filter(x => x.pick.pl !== null);
  const winners = stakes.filter(x => x.pick.credit > 0);
  const sp = stakes.map(x => x.pick.sp!);
  const median = (values: number[]) => { const sorted = values.toSorted((a, b) => a - b); return sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2 : null; };
  const total = (ss: typeof stakes) => ({ stakes: ss.length, profit: ss.length ? sum(ss.map(x => x.pick.pl!)) : null, roi: mean(ss.map(x => x.pick.pl!)) });
  const marketExpected = sum(stakes.map(x => x.pick.market!));
  const largest = winners.toSorted((a, b) => b.pick.pl! - a.pick.pl! || a.row.id.localeCompare(b.row.id)).slice(0, 2);
  const without = (count: number) => largest.length < count ? null : total(stakes.filter(x => !largest.slice(0, count).some(y => y.row.id === x.row.id)));
  const byDay = dateClusterInterval(rows.map(row => ({ date: row.date, value: row.policies[name]?.pl ?? 0, denominator: row.policies[name]?.pl != null ? 1 : 0 })));
  const breakdown = (groups: Map<string, Eval[]>) => Object.fromEntries([...groups].map(([key, rs]) => [key, { races: rs.length, ...total(stakes.filter(s => rs.includes(s.row))) }]));
  const winPrices = winners.map(x => x.pick.sp!);
  const predictions = rows.flatMap(r => r.quality[name] ? [r.quality[name]] : []);
  return { races: rows.length, profitPerRace: rows.length ? (total(stakes).profit ?? 0) / rows.length : null, dates: new Set(rows.map(r => r.date)).size, selections: picks.length, betDates: new Set(stakes.map(x => x.row.date)).size,
    noBetFraction: rows.length ? 1 - picks.length / rows.length : null, ...total(stakes), winners: winners.length, strike: stakes.length ? winners.length / stakes.length : null,
    marketExpected, marketAE: marketExpected ? sum(winners.map(x => x.pick.credit)) / marketExpected : null,
    meanSP: mean(sp), medianSP: median(sp), meanWinningSP: mean(winPrices), medianWinningSP: median(winPrices),
    roiInterval: byDay, largest: largest.map(x => ({ race: x.row.id, date: x.row.date, sp: x.pick.sp, pl: x.pick.pl })), afterOne: without(1), afterTwo: without(2),
    quality: { races: predictions.length, logLoss: mean(predictions.map(x => x.logLoss)), brier: mean(predictions.map(x => x.brier)) },
    monthly: breakdown(Map.groupBy(rows, r => r.date.slice(0, 7))), yearly: breakdown(Map.groupBy(rows, r => r.date.slice(0, 4))),
    prices: [0, 9, 13, 21, 34].map((min, i, boundaries) => {
      const ss = stakes.filter(x => x.pick.sp! >= min && x.pick.sp! < (boundaries[i + 1] ?? Infinity));
      return { minDecimal: min, ...total(ss), winners: ss.filter(x => x.pick.credit > 0).length,
        winnerGross: sum(ss.filter(x => x.pick.credit > 0).map(x => 1 + x.pick.pl!)) };
    }) };
}
const summaries = (rows: Eval[], policies: string[]) => Object.fromEntries(["ALL", ...families].map(f => [f, Object.fromEntries(policies.map(p =>
  [p, summary(rows.filter(r => f === "ALL" || r.family === f), p)]))]));

const ledgerPath = "data/research/tissue-generation-forward-2026-11.json";
async function current(terminalPath: string) {
  const [data, models, priorFile, raw, aw] = await Promise.all([
    loadTissueGeneration(), loadTissueGenerationModels(), read<Prior>(paths.prices), read<HurdleFinalSpResultRow[]>(terminalPath),
    read<{ hashes: Record<string, string>; races: Array<{ raceId: string; source: string; common: boolean; variants: { C: { runnerId: string; probability: number }[] } }> }>(paths.aw),
  ]);
  const pins = { ...priorFile.value.hashes, [paths.prices]: priorFile.sha256, [terminalPath]: raw.sha256, [paths.aw]: aw.sha256 };
  for (const [p, sha] of Object.entries(pins)) assert.equal(await fileHash(p), sha, p);
  assert.equal(aw.value.hashes[ledgerPath], pins[ledgerPath]);
  const old = new Map(priorFile.value.pairs.map(x => [x.raceId, x]));
  const terminal = indexHurdleFinalSpResults(raw.value);
  const awPrior = new Map(aw.value.races.filter(r => r.source === "production").map(r => [r.raceId, r]));
  const refs = [];
  const books: Book[] = [];
  const awCompletePairs = new Set<string>();
  assert.equal(new Set(data.races.map(b => b.raceId)).size, data.races.length);
  for (const b of data.races) {
    assert.ok(b.featureCutoffAt <= b.capturedAt && b.capturedAt < b.scheduledOff);
    const model = models[b.family];
    assert.equal(model.checksum, b.modelHash);
    assert.deepEqual(model.baseModel.names, b.featureNames);
    assert.deepEqual(model.adjustment.names, b.adjustmentFeatureNames);
    const p = old.get(b.raceId);
    assert.ok(p);
    const [t1, t2] = [1, 2].map(rank => {
      const picks = b.runners.filter(r => r.rank === rank);
      assert.equal(picks.length, 1);
      return picks[0];
    });
    assert.equal(t1.runnerId, p.t1.runnerId);
    assert.equal(t2.runnerId, p.t2.runnerId);
    assert.equal(t2.probability, p.t2.probability);
    let awId: string | undefined;
    let alternate: number[] | undefined;
    if (b.family === "AW") {
      const noGap = { ...model.adjustment, weights: model.adjustment.weights.map((w, i) => model.adjustment.names[i] === "same_or_speed_gap" ? 0 : w) };
      alternate = raceSoftmax(b.runners.map(r => score(model.baseModel, r.modelInputs) + score(noGap, r.adjustmentInputs)));
      const probabilities = alternate;
      const order = probabilities.map((_, i) => i).sort((i, j) => probabilities[j] - probabilities[i] || b.runners[i].runnerId.localeCompare(b.runners[j].runnerId));
      const archived = awPrior.get(b.raceId);
      assert.ok(archived);
      awId = b.runners[order[1]].runnerId;
      assert.equal(awId, archived.variants.C[1].runnerId);
      assert.ok(near(alternate[order[1]], archived.variants.C[1].probability));
      if (archived.common) awCompletePairs.add(b.raceId);
    }
    const field = terminal.get(b.raceId);
    const starters = b.runners.filter(r => r.outcome?.status === "settled");
    const results = new Map<string, Result>();
    if (field && p.fullSp) {
      assert.equal(field.size, starters.length);
      const decimals = [...field.values()].map(x => parseSportingLifeEstimatedPrice(x.resultPrice));
      const market = normalizeCompleteMarket(decimals);
      assert.ok(market);
      [...field.values()].forEach((x, i) => {
        const r = b.runners.find(item => item.runnerId === x.runnerId);
        const o = r?.outcome;
        assert.ok(o && o.status === "settled" && o.finishPosition === x.finishingPosition && o.winner === (x.state === "win") && o.deadHeatDivisor === x.deadHeatDivisor);
        assert.ok(near(Number(x.startingPriceDecimal), decimals[i]!, .000500001));
        const s = settleSelection({ ...x, targetRaceId: b.raceId, targetRunnerId: x.runnerId, startingPrice: x.resultPrice, startingPriceDecimal: String(decimals[i]), won: o.winner, placed: null });
        assert.ok(s && s.settlementVersion === "canonical_settlement_v3");
        results.set(x.runnerId, { sp: decimals[i]!, fractional: x.resultPrice, market: market.probabilities[i],
          credit: x.state === "win" ? 1 / x.deadHeatDivisor : 0, pl: s.profitLoss });
      });
    }
    const matched = results.has(t1.runnerId) && results.has(t2.runnerId);
    const result = results.get(t2.runnerId);
    assert.equal(result?.pl ?? null, p.t2.pl);
    assert.equal(result?.fractional ?? null, p.t2.sp);
    refs.push({ raceId: b.raceId, date: b.raceDate, scheduledOff: b.scheduledOff, course: b.course, family: b.family, capture: b.capturedAt, cutoff: b.featureCutoffAt,
      version: b.modelVersion, modelChecksum: b.modelHash, runnerId: t2.runnerId, horseId: t2.horseId, horse: t2.horseName, rank: t2.rank, probability: t2.probability,
      capturedPrice: t2.capturedPrice, matched, pairedT1: t1.runnerId, outcome: t2.outcome?.status ?? "pending", position: t2.outcome?.finishPosition ?? null,
      resultStatus: t2.outcome?.resultStatus ?? null, settledAt: t2.outcome?.settledAt ?? null, finalSP: result?.fractional ?? null, finalDecimal: result?.sp ?? null,
      winCredit: result?.credit ?? null, finalSPProfit: result?.pl ?? null, finalMarketProbability: result?.market ?? null });
    if (!field || !p.fullSp) continue;
    const flat = b.family === "AW" || b.family === "TURF";
    const speed = flat ? "turf_speed" : "jump_speed";
    books.push({ id: b.raceId, date: b.raceDate, course: b.course, family: b.family, baseId: t2.runnerId, awId,
      runners: b.runners.map((r, i) => {
        const rawRuns = frozenFeature(b, r, flat ? "log_prior_runs" : "log_prior_jump_starts");
        return { id: r.runnerId, name: r.horseName, or: frozenFeature(b, r, "official_rating"), speed: frozenFeature(b, r, "best_l3_" + speed),
          recent: frozenFeature(b, r, "latest_" + speed), prior: rawRuns === null ? null : Math.round(Math.expm1(rawRuns)),
          quote: r.capturedPrice, tissue: r.probability, tissueRank: r.rank, awProbability: alternate?.[i], result: results.get(r.runnerId) ?? null };
      }) });
  }
  const settled = refs.filter(r => r.matched);
  const expected = priorFile.value.diagnostics.ALL.matched;
  const reconciliation = { races: settled.length, winners: settled.filter(r => r.winCredit! > 0).length, profit: sum(settled.map(r => r.finalSPProfit!)), roi: mean(settled.map(r => r.finalSPProfit!))! };
  assert.equal(reconciliation.races, expected.n);
  assert.equal(reconciliation.winners, expected.t2.w);
  assert.ok(near(reconciliation.profit, expected.t2.pl) && near(reconciliation.roi, expected.t2.roi));
  return { id: definition.baseline, pins, modelDefinitions: Object.fromEntries(families.map(f => {
    const m = models[f];
    return [f, { version: m.version, artifact: generationModelPath(f), checksum: m.checksum, baseVersion: m.baseVersion, baseChecksum: m.baseChecksum,
      generation: m.generation, epoch: m.prospectiveEpoch, developmentCutoff: m.developmentCutoff, baseInputNames: m.baseModel.names, adjustmentNames: m.adjustment.names }];
  })), policy: {
    selection: "Select exactly the original frozen rank 2 when present. No SP, market, edge or odds filter; no replacement after a withdrawal.",
    ranking: "Family frozen logits plus full-field softmax. Turf uses competition rank for equal probabilities. AW, Hurdle and Chase break ties by ascending runner ID.",
    eligibility: "Validated complete pre-off current-generation primary books, unique race IDs, original active runners at capture. Reference money requires both original T1 and T2 to be priced starters in a reconciled final field.",
    settlement: "canonical_settlement_v3 final fractional Sporting Life SP, £1 win stakes, split dead-heat credit and gross return, no stake for NR/void/unresolved. Market expectation is normalized over actual starters.",
  }, reconciliation, rows: refs, books, awCompletePairs };
}

async function earlier(path: string, auditPath: string, year: string) {
  const source = await read<ResearchInput>(path);
  const booksMap = new Map(source.value.races.map(r => [r.id, r]));
  assert.equal(booksMap.size, source.value.races.length);
  const found = new Set<string>(), books: Book[] = [];
  const exclusions: Record<string, number> = {};
  const exclude = (key: string) => { exclusions[key] = (exclusions[key] ?? 0) + 1; };
  const sha = createHash("sha256");
  const stream = createReadStream(auditPath);
  stream.on("data", bytes => sha.update(bytes));
  for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) {
    const id = /^\{"id":"([^"]+)"/.exec(line)?.[1];
    const b = id && booksMap.get(id);
    if (!b) continue;
    assert.ok(!found.has(b.id) && b.date.startsWith(year));
    found.add(b.id);
    const audit = JSON.parse(line) as AuditBook;
    assert.equal(audit.date, b.date);
    const s = audit.runners.filter(r => r.state === "win" || r.state === "loss");
    if (!audit.complete) { exclude("terminal field not independently complete"); continue; }
    if (s.length !== b.runners.length || new Set(s.map(r => r.id)).size !== s.length ||
      new Set(b.runners.map(r => r.id)).size !== s.length) { exclude("starter roster differs"); continue; }
    const map = new Map(s.map(r => [r.id, r]));
    const market = normalizeCompleteMarket(s.map(r => r.sp));
    if (!market) { exclude("incomplete final SP"); continue; }
    if (b.runners.some(r => !map.has(r.id) || map.get(r.id)!.credit !== r.credit || r.sp === null || !near(map.get(r.id)!.sp!, r.sp, .000500001))) {
      exclude("identity, result credit or final SP mismatch"); continue;
    }
    const probabilities = new Map(s.map((r, i) => [r.id, market.probabilities[i]]));
    const runnerRows = b.runners.map(r => {
      const x = map.get(r.id)!;
      const stake = settleSelection({ targetRaceId: b.id, targetRunnerId: r.id, finishingPosition: x.p, resultStatus: x.status, outcomeCode: x.outcome,
        raceStage: audit.stage, won: x.credit > 0, placed: null, startingPrice: null, startingPriceDecimal: String(x.sp), deadHeatDivisor: x.credit ? 1 / x.credit : 1 });
      assert.ok(stake && stake.settlementVersion === "canonical_settlement_v3");
      return { id: r.id, or: r.or, speed: r.speed, recent: r.recent, prior: r.prior, quote: null,
        result: { sp: x.sp!, fractional: null, market: probabilities.get(r.id)!, credit: x.credit, pl: stake.profitLoss } };
    });
    books.push({ id: b.id, date: b.date, course: b.course, family: b.family, runners: runnerRows });
  }
  exclusions["missing audit race ID"] = booksMap.size - found.size;
  assert.equal(books.length + sum(Object.values(exclusions)), booksMap.size);
  return { books, coverage: { original: booksMap.size, accepted: books.length, dates: [books[0]?.date, books.at(-1)?.date], exclusions },
    pins: { [path]: source.sha256, [auditPath]: sha.digest("hex"), rawPayloadDigest: source.value.rawDigest, cachePins: source.value.hashes } };
}

function fit(books: Book[]) {
  const samples = books.map(book => ({
    x: prepare(toOffers(book, "retrospective")!), outcome: book.runners.map(r => r.result!.credit),
  }));
  const spec = definition.experiments.B;
  let w = Array<number>(spec.features.length).fill(0);
  assert.ok(samples.length && samples.every(s => near(sum(s.outcome), 1)));
  for (let step = 0; step < spec.steps; step++) {
    const grad = w.map(v => spec.l2 * v);
    for (const { x, outcome } of samples) {
      const p = forecast(x, w);
      p.forEach((prob, i) => {
        const residual = (prob - outcome[i]) / samples.length;
        for (let j = 0; j < w.length; j++) grad[j] += residual * x.x[i][j];
      });
    }
    w = w.map((v, i) => v - spec.rate * grad[i]);
  }
  assert.ok(w.every(Number.isFinite));
  return w;
}
type Frozen = { specification: typeof definition; weights: number[]; training: { n: number; from: string; through: string }; input: Awaited<ReturnType<typeof earlier>>["pins"]; baselinePin: string; script: string };
type AwPick = { runnerId: string; probability: number; sp: string | null; decimal: number | null; marketProbability: number | null; profit: number | null; credit: number };
type AwReplay = { output: Array<{ raceId: string; date: string; course: string; priorCommon: boolean; source: string; scores: Record<"A" | "B", { picks: AwPick[]; quality: QualityInput }>;
  market: AwPick & { quality: QualityInput } }> };
type QualityInput = { logLoss: number; brier: number };
type IsolatedAw = { races: Array<{ raceId: string; source: string; common: boolean; variants: Record<"A" | "C", { runnerId: string; score: number; probability: number }[]> }> };
async function earlierAw(archivePath: string, historicPath: string) {
  const [archive, historical, prior] = await Promise.all([read<AwReplay>(archivePath), read<AwReplay>(historicPath), read<IsolatedAw>(paths.aw)]);
  const saved = new Map(prior.value.races.filter(r => r.source === "historical").map(r => [r.raceId, r]));
  const convert = (p: AwPick): Decision => {
    assert.ok(p.decimal !== null && p.profit !== null && p.marketProbability !== null);
    return { identity: p.runnerId, sp: p.decimal, pl: p.profit, market: p.marketProbability, credit: p.credit, p: p.probability ?? null, price: null, edge: null };
  };
  const toEval = (b: AwReplay["output"][number]): Eval => {
    if (b.source === "historical") {
      const p = saved.get(b.raceId);
      assert.ok(p && p.common && p.variants.A[1].runnerId === b.scores.A.picks[1].runnerId && p.variants.C[1].runnerId === b.scores.B.picks[1].runnerId);
    }
    return { id: b.raceId, date: b.date, course: b.course, family: "AW", decisionsAvailable: true,
      quality: { AW_FORMULA_CONTROL: b.scores.A.quality, AW: b.scores.B.quality, SP: b.market.quality },
      policies: { AW_FORMULA_CONTROL: convert(b.scores.A.picks[1]), AW: convert(b.scores.B.picks[1]), SP: convert(b.market) } };
  };
  return { sources: { [archivePath]: archive.sha256, [historicPath]: historical.sha256, [paths.aw]: prior.sha256 },
    october: archive.value.output.filter(b => b.source === "historical" && b.priorCommon).map(toEval),
    year2025: historical.value.output.filter(b => b.source === "archive2025").map(toEval),
    early2026: historical.value.output.filter(b => b.source === "archive2026").map(toEval) };
}

async function main(args: string[]) {
  const [mode, terminal, audit, year2025, year2026, awReplay, awHistoric] = args;
  assert.ok(mode === "freeze" || mode === "evaluate");
  assert.ok(terminal && audit && year2025);
  const state = await current(terminal);
  const { books, awCompletePairs, ...baseline } = state;
  if (mode === "freeze") {
    const basePin = await freeze(paths.baseline, baseline);
    const data = await earlier(year2025, audit, "2025");
    const previous = await read<{ input: string }>(paths.oldFit);
    assert.equal(data.pins[year2025], previous.value.input);
    const training = data.books.filter(b => b.date <= definition.trainThrough);
    const artifact: Frozen = { specification: definition, baselinePin: basePin, weights: fit(training), input: data.pins,
      training: { n: training.length, from: training[0].date, through: training.at(-1)!.date }, script: await fileHash("scripts/profitability-first-research.ts") };
    const pin = await freeze(paths.definitions, artifact);
    console.log({ baseline: baseline.reconciliation, basePin, weights: artifact.weights, fitRaceCount: training.length, pin });
    return;
  }
  assert.ok(year2026 && awReplay && awHistoric);
  const frozen = await pinned<Frozen>(paths.definitions);
  const pinnedBaseline = await pinned<typeof baseline>(paths.baseline);
  assert.equal(pinnedBaseline.sha256, frozen.content.baselinePin);
  assert.deepEqual(pinnedBaseline.content, baseline);
  assert.deepEqual(frozen.content.specification, definition);
  assert.equal(frozen.content.script, await fileHash("scripts/profitability-first-research.ts"));
  const [old, replay, aw] = await Promise.all([earlier(year2025, audit, "2025"), earlier(year2026, audit, "2026"), earlierAw(awReplay, awHistoric)]);
  assert.deepEqual(old.pins, frozen.content.input);
  const w = frozen.content.weights;
  const a2025 = old.books.map(b => evaluate(b, w, "retrospective"));
  const a2026 = replay.books.map(b => evaluate(b, w, "retrospective"));
  const matches = new Set(state.rows.filter(r => r.matched).map(r => r.raceId));
  const november = books.filter(b => matches.has(b.id)).map(b => evaluate(b, w, "preoff"));
  const novemberCommon = november.filter(b => b.decisionsAvailable);
  const conditional = Object.fromEntries(["A", "B", "C"].map(p => {
    const eligible = novemberCommon.filter(r => r.policies[p]?.pl != null);
    return [p, summaries(eligible, [p, "BASELINE", "SP"])];
  }));
  const awNovember = books.filter(b => awCompletePairs.has(b.id)).map(b => evaluate(b, w, "preoff"));
  assert.equal(awNovember.length, 120);
  const historicalPolicy = ["B", "C", "SP"];
  const awPolicy = ["AW_FORMULA_CONTROL", "AW", "SP"];
  const scopes = {
    fitting2025: summaries(a2025.filter(r => r.date <= definition.trainThrough), historicalPolicy),
    validation2025: summaries(a2025.filter(r => r.date > definition.trainThrough), historicalPolicy),
    year2025: summaries(a2025, historicalPolicy),
    explored2026: summaries(a2026, historicalPolicy),
    exploredSameBetRaces: Object.fromEntries(["B", "C"].map(p => [p, summaries(a2026.filter(r => r.policies[p]?.pl != null), [p, "SP"])])),
    novemberReference: summaries(november, ["BASELINE", "SP"]),
    novemberCommon: summaries(novemberCommon, ["BASELINE", "SP", "A", "B", "C", "PREOFF_MARKET"]),
    novemberSameBetRaces: conditional,
    awNovember: summaries(awNovember, ["BASELINE", "AW", "SP"]),
    awOctober: summaries(aw.october, awPolicy),
    aw2025: summaries(aw.year2025, awPolicy),
    awEarly2026: summaries(aw.early2026, awPolicy),
  };
  const compact = (rows: Eval[], policies: string[]) => rows.map(r => [r.id, r.date, r.family, r.course, ...policies.map(p => r.policies[p])]);
  const body = {
    id: definition.id, baselinePin: pinnedBaseline.sha256, definitionsPin: frozen.sha256,
    coverage: { development: old.coverage, replay: replay.coverage, novemberReference: november.length, novemberQuotes: novemberCommon.length },
    evidence: { development: old.pins, replay: replay.pins, aw: aw.sources }, scopes,
    rowSchema: ["raceId", "raceDate", "family", "course", "one decision or null for each corresponding policy"],
    rows: {
      year2025: { policies: historicalPolicy, decisions: compact(a2025, historicalPolicy) },
      explored2026: { policies: historicalPolicy, decisions: compact(a2026, historicalPolicy) },
      novemberReference: { policies: ["BASELINE", "SP"], decisions: compact(november, ["BASELINE", "SP"]) },
      novemberCommon: { policies: ["BASELINE", "SP", "A", "B", "C"], decisions: compact(novemberCommon, ["BASELINE", "SP", "A", "B", "C"]) },
      awNovember: { policies: ["BASELINE", "AW", "SP"], decisions: compact(awNovember, ["BASELINE", "AW", "SP"]) },
      awOctober: { policies: awPolicy, decisions: compact(aw.october, awPolicy) },
      aw2025: { policies: awPolicy, decisions: compact(aw.year2025, awPolicy) },
      awEarly2026: { policies: awPolicy, decisions: compact(aw.early2026, awPolicy) },
    },
  };
  const pin = await freeze(paths.evaluation, body);
  console.log({ coverage: body.coverage, pin });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/profitability-first-research.ts")) await main(process.argv.slice(2));

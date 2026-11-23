import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FULL_HISTORY_V1, independentProbabilities, predictFullHistoryV1, type IndependentParameters } from "../src/lib/racing/full-history-profitability";
import { normalizeCompleteMarket } from "../src/lib/racing/tissue-value-metrics";
import { jsonLines, type DatasetRace } from "./build-full-history-profitability";

const cap = FULL_HISTORY_V1.D.capDecimal;
const config = FULL_HISTORY_V1.fit;
const hash = (x: string | Buffer) => createHash("sha256").update(x).digest("hex");
const baselinePath = "docs/tissue-t2-profit-baseline-v1.json";
const baselineHash = "16834242dc50c60bbfb9d803b49825ef218b9b8b350478a139a6020d97571a7a";
const families = ["AW", "TURF", "HURDLE", "CHASE"] as const;
type Training = { first: string; last: string; races: number; starters: number; moneyRaces: number; moneyStarters: number };
export type IndependentArtifact = { specification: typeof FULL_HISTORY_V1; datasetSha256: string; training: Training; parameters: IndependentParameters };
type Pinned<T> = { sha256: string; content: T };
type Inventory = { datasetSha256: string; sourceSha256: string; latest: string; sourceRaces: number };
const read = async <T>(p: string) => JSON.parse(await readFile(p, "utf8")) as T;
async function readPinned<T>(p: string) {
  const value = await read<Pinned<T>>(p);
  assert.equal(hash(JSON.stringify(value.content)), value.sha256, p);
  return value;
}
async function writePinned(p: string, value: object) {
  const pinned = { sha256: hash(JSON.stringify(value)), content: value };
  const bytes = JSON.stringify(pinned) + "\n";
  try { await writeFile(p, bytes, { flag: "wx" }); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    assert.equal(await readFile(p, "utf8"), bytes, "Existing version differs");
  }
  return pinned.sha256;
}
async function dataset(p: string) {
  const inventory = await read<Inventory>(p + ".inventory.json");
  const digest = createHash("sha256");
  const books: DatasetRace[] = [];
  let date = "";
  const ids = new Set<string>();
  for await (const b of jsonLines<DatasetRace>(p, digest)) {
    assert.ok(b.race.date >= date && !ids.has(b.race.id) && b.features.length === b.outcomes.length);
    assert.ok(b.features.every((f, i) => f.id === b.race.runners[i].id));
    date = b.race.date;
    ids.add(b.race.id);
    if (date >= "2025-01-01") books.push(b);
  }
  assert.equal(digest.digest("hex"), inventory.datasetSha256);
  return { inventory, books };
}
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const average = (xs: readonly number[]) => xs.length ? sum(xs) / xs.length : null;
const median = (xs: readonly number[]) => {
  if (!xs.length) return null;
  const sorted = xs.toSorted((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
};

function fitRace(books: readonly DatasetRace[], key: "A" | "B") {
  let w = Array<number>(books[0].features[0][key].length).fill(0);
  for (let step = 0; step < config.steps; step++) {
    const gradient = w.map(x => config.l2 * x);
    for (const b of books) {
      const p = independentProbabilities(b.features, w, key);
      b.features.forEach((f, i) => {
        const residual = (p[i] - b.outcomes[i].credit) / books.length;
        f[key].forEach((x, j) => { gradient[j] += x * residual; });
      });
    }
    w = w.map((x, j) => x - config.stepSize * gradient[j]);
  }
  return w;
}
function fitReturn(books: readonly DatasetRace[]) {
  const k = books[0].features[0].D.length;
  const covariance = Array.from({ length: k }, () => Array<number>(k).fill(0));
  const response = Array<number>(k).fill(0);
  let count = 0;
  for (const b of books) for (const [i, f] of b.features.entries()) {
    const { sp, credit } = b.outcomes[i];
    assert.ok(sp !== null);
    const y = credit * Math.min(sp, cap) - 1;
    count++;
    f.D.forEach((x, j) => {
      response[j] += x * y;
      f.D.forEach((z, l) => { covariance[j][l] += x * z; });
    });
  }
  let w = Array<number>(k).fill(0);
  for (let i = 0; i < config.returnSteps; i++) {
    w = w.map((weight, j) => weight - config.returnStepSize * (
      (sum(covariance[j].map((x, l) => x * w[l])) - response[j]) / count + (j ? config.l2 * weight : 0)));
  }
  return w;
}
async function fit(path: string, output: string) {
  const { books, inventory } = await dataset(path);
  const training = books.filter(b => b.race.date <= config.chronologicalCutoff);
  const money = training.filter(b => b.completeSP);
  const artifact: IndependentArtifact = {
    specification: FULL_HISTORY_V1, datasetSha256: inventory.datasetSha256,
    training: { first: training[0].race.date, last: training.at(-1)!.race.date, races: training.length,
      starters: sum(training.map(x => x.features.length)), moneyRaces: money.length, moneyStarters: sum(money.map(x => x.features.length)) },
    parameters: { A: fitRace(training, "A"), B: fitRace(training, "B"), D: fitReturn(money) },
  };
  assert.ok(Object.values(artifact.parameters).flat().every(Number.isFinite));
  return writePinned(output, artifact);
}

type Pick = { race: string; date: string; id: string; sp: number; pl: number; credit: number; market: number };
type Quality = { logLoss: number; brier: number; predictedWinner: number; winnerCredit: number };
type RaceEval = { b: DatasetRace; picks: Record<string, Pick[]>; quality: Record<string, Quality> };
type Baseline = { id: string; reconciliation: { races: number; winners: number; profit: number; roi: number };
  rows: { raceId: string; runnerId: string; matched: boolean; finalSPProfit: number | null; finalDecimal: number | null; winCredit: number | null }[] };
function quality(p: readonly number[], outcomes: DatasetRace["outcomes"]): Quality {
  const best = p.indexOf(Math.max(...p));
  return { logLoss: -sum(p.map((x, i) => outcomes[i].credit * Math.log(Math.max(x, 1e-15)))),
    brier: sum(p.map((x, i) => (x - outcomes[i].credit) ** 2)), predictedWinner: p[best], winnerCredit: outcomes[best].credit };
}
function evaluateRace(b: DatasetRace, parameters: IndependentParameters, baseline: Map<string, Baseline["rows"][number]>): RaceEval {
  const sp = normalizeCompleteMarket(b.outcomes.map(x => x.sp));
  assert.ok(sp && b.completeSP);
  const preview = predictFullHistoryV1(b.features, parameters, b.quotes ?? undefined);
  assert.ok(preview.probabilities);
  const { A, B, C } = preview.probabilities;
  const index = new Map(b.features.map((f, i) => [f.id, i] as const));
  const best = (p: readonly number[]) => p.map((prob, i) => ({ prob, id: b.features[i].id }))
    .sort((a, x) => x.prob - a.prob || a.id.localeCompare(x.id))[0].id;
  const picks = (ids: readonly string[]) => ids.map(id => {
    const i = index.get(id);
    assert.notEqual(i, undefined);
    const outcome = b.outcomes[i!];
    assert.ok(outcome.sp !== null && outcome.pl !== null);
    return { id, race: b.race.id, date: b.race.date, sp: outcome.sp, pl: outcome.pl, credit: outcome.credit, market: sp.probabilities[i!] };
  });
  const predictionPicks = (x: { selections: readonly { id: string }[] }) => picks(x.selections.map(s => s.id));
  const t2 = baseline.get(b.race.id);
  const frozen = t2 && index.has(t2.runnerId) ? picks([t2.runnerId]) : [];
  if (frozen.length) {
    assert.ok(t2 && Math.abs(frozen[0].pl - t2.finalSPProfit!) < 1e-12 && Math.abs(frozen[0].sp - t2.finalDecimal!) < 1e-12 &&
      frozen[0].credit === t2.winCredit);
  }
  const q: Record<string, Quality> = { A: quality(A, b.outcomes), B: quality(B, b.outcomes), SP: quality(sp.probabilities, b.outcomes) };
  if (C) q.C = quality(C, b.outcomes);
  if (b.quotes) q.QUOTE = quality(normalizeCompleteMarket(b.quotes)!.probabilities, b.outcomes);
  return { b, picks: { A_TOP: picks([best(A)]), B_TOP: picks([best(B)]), SP: picks([best(sp.probabilities)]),
    A: predictionPicks(preview.A), B: predictionPicks(preview.B), C: predictionPicks(preview.C), D: predictionPicks(preview.D), T2: frozen }, quality: q };
}

function money(stakes: readonly Pick[]) {
  const expected = sum(stakes.map(x => x.market));
  const credit = sum(stakes.map(x => x.credit));
  const logs = stakes.map(p => p.sp);
  return { bets: stakes.length, winners: stakes.filter(x => x.credit > 0).length, credit,
    strike: average(stakes.map(x => Number(x.credit > 0))), profit: stakes.length ? sum(stakes.map(x => x.pl)) : null,
    roi: average(stakes.map(x => x.pl)), marketExpected: expected, ae: expected ? credit / expected : null,
    meanSP: average(logs), medianSP: median(logs) };
}

type Money = ReturnType<typeof money>;
type Summary = Money & {
  races: number; starters: number; noSelection: number; largest: Pick[]; afterOne: Money | null; afterTwo: Money | null;
  monthly?: Record<string, Summary>; prices?: (Money & { from: number })[];
};
function summarize(books: readonly RaceEval[], model: string, full = false): Summary {
  const stakes = books.flatMap(b => b.picks[model]);
  const winners = stakes.filter(x => x.credit > 0).toSorted((a, b) => b.pl - a.pl || a.id.localeCompare(b.id)).slice(0, 2);
  const units = new Set(stakes.map(s => s.race));
  const summary = { races: books.length, starters: sum(books.map(b => b.b.outcomes.length)), noSelection: books.length - units.size, ...money(stakes),
    largest: winners, afterOne: winners[0] ? money(stakes.filter(x => x.id !== winners[0].id)) : null,
    afterTwo: winners[1] ? money(stakes.filter(x => !winners.some(w => w.id === x.id))) : null };
  if (!full) return summary;
  const bands = [1, 3, 5, 9, 13, 21];
  return { ...summary,
    monthly: Object.fromEntries([...Map.groupBy(books, b => b.b.race.date.slice(0, 7))].map(([month, rows]) => [month, summarize(rows, model)])),
    prices: bands.map((from, i) => ({ from, ...money(stakes.filter(s => s.sp >= from && s.sp < (bands[i + 1] ?? Infinity))) })) };
}

function scope(books: readonly RaceEval[], policies: readonly string[]) {
  const groups = [["ALL", books] as const, ...families.map(f => [f, books.filter(b => b.b.race.family === f)] as const)];
  return Object.fromEntries(groups.map(([f, rows]) => [f, Object.fromEntries(policies.map(p => [p, summarize(rows, p, true)]))]));
}
function diagnostics(books: readonly RaceEval[], policies: readonly string[]) {
  return Object.fromEntries(policies.map(p => {
    const rows = books.flatMap(b => b.quality[p] ? [b.quality[p]] : []);
    const ranges = [0, 0.2, 0.4, 0.6, 0.8, Infinity];
    return [p, { races: rows.length, logLoss: average(rows.map(x => x.logLoss)), brier: average(rows.map(x => x.brier)),
      calibration: ranges.slice(0, -1).map((lo, i) => {
        const bin = rows.filter(x => x.predictedWinner >= lo && x.predictedWinner < ranges[i + 1]);
        return { lo, races: bin.length, expected: average(bin.map(x => x.predictedWinner)), actual: average(bin.map(x => x.winnerCredit)) };
      }) }];
  }));
}
type Provenance = { evaluation: string; dataset: string; source: string; model: string; baseline: string };
async function evaluate(path: string, definitionPath: string, output: string) {
  const [data, model, frozen] = await Promise.all([dataset(path), readPinned<IndependentArtifact>(definitionPath), readPinned<Baseline>(baselinePath)]);
  assert.equal(data.inventory.datasetSha256, model.content.datasetSha256);
  assert.deepEqual(model.content.specification, FULL_HISTORY_V1);
  assert.equal(frozen.sha256, baselineHash);
  assert.equal(frozen.content.reconciliation.races, 380);
  assert.equal(frozen.content.reconciliation.winners, 83);
  const original = new Map(frozen.content.rows.filter(r => r.matched).map(r => [r.raceId, r]));
  const all = data.books.filter(b => b.completeSP).map(b => evaluateRace(b, model.content.parameters, original));
  const y25 = all.filter(b => b.b.race.date.startsWith("2025")), y26 = all.filter(b => b.b.race.date.startsWith("2026"));
  const fit = y25.filter(b => b.b.race.date <= config.chronologicalCutoff);
  const validation = y25.filter(b => b.b.race.date > config.chronologicalCutoff);
  const quoted = y26.filter(b => b.b.quotes);
  const common = y26.filter(b => b.picks.T2.length);
  const commonQuotes = common.filter(b => b.b.quotes);
  const archivePolicies = ["A_TOP", "B_TOP", "D", "SP"];
  const quotePolicies = ["A", "B", "C", "D", "SP"];
  const provenance: Provenance = { evaluation: "FULL_HISTORY_PROFITABILITY_EVALUATION_V1", dataset: data.inventory.datasetSha256,
    source: data.inventory.sourceSha256, model: model.sha256, baseline: frozen.sha256 };
  const selectedRaceComparison = Object.fromEntries(["A", "B", "C", "D"].map(p => {
    const rows = (p === "D" ? common : commonQuotes).filter(row => row.picks[p].length);
    return [p, { policy: summarize(rows, p), baseline: summarize(rows, "T2"), favourite: summarize(rows, "SP") }];
  }));
  const evaluation = {
    provenance, training: model.content.training,
    totals: { coherent2025: data.books.filter(b => b.race.date.startsWith("2025")).length,
      coherent2026: data.books.filter(b => b.race.date.startsWith("2026")).length, originalT2: frozen.content.reconciliation,
      unmatchedIds: [...original.keys()].filter(id => !common.some(x => x.b.race.id === id)) },
    broad: { year2025: scope(y25, archivePolicies), fit2025: scope(fit, archivePolicies),
      validation2025: scope(validation, archivePolicies), replay2026: scope(y26, archivePolicies) },
    captured: { replay2026: scope(quoted, quotePolicies), matchedT2: scope(commonQuotes, [...quotePolicies, "T2"]) },
    commonT2: scope(common, [...archivePolicies, "T2"]), selectedRaceComparison,
    probability: { validation: diagnostics(validation, ["A", "B", "SP"]), replay: diagnostics(y26, ["A", "B", "SP"]),
      captured: diagnostics(quoted, ["A", "B", "C", "QUOTE", "SP"]) },
  };
  return writePinned(output, evaluation);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, path, model, output] = process.argv.slice(2);
  assert.ok(path && model && (mode === "fit" || mode === "evaluate" || mode === "preview"),
    "Use fit DATASET MODEL, evaluate DATASET MODEL EVIDENCE, or preview DATASET MODEL RACE_ID.");
  if (mode === "fit") console.log(await fit(path, model));
  if (mode === "evaluate") {
    assert.ok(output);
    console.log(await evaluate(path, model, output));
  }
  if (mode === "preview") {
    assert.ok(output, "Provide a race UUID.");
    const [data, frozen] = await Promise.all([dataset(path), readPinned<IndependentArtifact>(model)]);
    assert.deepEqual(frozen.content.specification, FULL_HISTORY_V1);
    assert.equal(data.inventory.datasetSha256, frozen.content.datasetSha256);
    const book = data.books.find(b => b.race.id === output);
    console.log(JSON.stringify(book ? {
      race: book.race.id, family: book.race.family, date: book.race.date, model: frozen.sha256,
      capturedQuoteAt: book.quoteAt, decisions: predictFullHistoryV1(book.features, frozen.content.parameters, book.quotes ?? undefined),
    } : { status: "no-selection", reason: "no-matching-race" }, null, 2));
  }
}

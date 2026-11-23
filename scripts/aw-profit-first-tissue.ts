import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { historyFamily, jsonLines, reconcileHistoryRace, type DbRace } from "./build-full-history-profitability";
import { raceSoftmax, score } from "./diagnose-independent-tissue-feasibility";
import { selectAwRecentPerformance } from "../src/lib/racing/aw-profit-policy";
import type { AwTissueRace } from "../src/lib/racing/aw-tissue-forward";
import { descendingRanks } from "../src/lib/racing/descending-ranks";
import { frozenNumeric, tissueGenerationFeatures } from "../src/lib/racing/tissue-generation-features";
import type { GenerationRace } from "../src/lib/racing/tissue-generation-forward";
import { loadTissueGenerationModels, predictTissueGeneration } from "../src/lib/racing/tissue-generation-model";
import { normalizeCompleteMarket } from "../src/lib/racing/tissue-value-metrics";
import { summarizeBookmakerMarket } from "../src/lib/racing/forward-value";
import { parseSportingLifeBookmakerQuotes } from "../src/lib/racing/todays-racing";

export type PolicyRunner = {
  runnerId: string;
  rank: number;
  speedRank: number | null;
  sameOrSpeedGap: number;
  performanceRank: number | null;
  priorTrainerRate: number | null;
  marketRank: number | null;
  hadSameSurfaceRun: boolean;
};

const topThree = (rank: number | null) => rank !== null && rank <= 3;

export const awProfitPolicies = [
  { id: "A", name: "Measured Speed", accepts: (r: PolicyRunner) => r.speedRank !== null },
  { id: "B", name: "Faster than same-OR peers", accepts: (r: PolicyRunner) => r.sameOrSpeedGap > 0 },
  { id: "C", name: "Recent AW performance", accepts: (r: PolicyRunner) => topThree(r.performanceRank) },
  { id: "D", name: "Market favourite", accepts: (r: PolicyRunner) => r.marketRank === 1, requiresMarket: true },
  { id: "E", name: "Recent form and trainer", accepts: (r: PolicyRunner) =>
    topThree(r.performanceRank) && r.priorTrainerRate !== null && r.priorTrainerRate >= 15 },
  { id: "F", name: "Speed rank and surface history", accepts: (r: PolicyRunner) =>
    r.hadSameSurfaceRun && (r.speedRank === 2 || r.speedRank === 3) },
] as const;

export function selectAwProfitRunner(policy: typeof awProfitPolicies[number], runners: readonly PolicyRunner[]) {
  if (policy.id === "C") return selectAwRecentPerformance(runners);
  return runners.reduce<PolicyRunner | undefined>((best, runner) =>
    runner.rank <= 3 && (!best || runner.rank < best.rank) && policy.accepts(runner) ? runner : best, undefined);
}

type Vector = { runnerId: string; horseName: string; modelInputs: number[] };
type Source = "Historical vectors" | "Card rebuild" | "V2 archive" | "V3 frozen";
type Book = { raceId: string; date: string; capturedAt: string; off: string; runners: Vector[];
  source: Source; baseLogits?: number[]; quotes?: Map<string, number | null>; frozenRanks?: Map<string, number> };
type HistoricalRow = { features: { targetRaceId: string; targetRunnerId: string; raceDate: string; raceDateTime: string;
  latestRunDate: string | null; horseName: string; odds: null; oddsDecimal: null }; numeric: number[] };
type Ticket = { name: string; sp: number; win: boolean; pl: number; date: string;
  raceId: string; runner: PolicyRunner };
type EvaluatedRace = { source: Source; date: string; raceId: string; market: boolean; runners: PolicyRunner[];
  tickets: Map<string, Ticket>; hasRecordedNR: boolean };
type SavedPick = { id: string; odds: number; win: boolean; pl: number };

async function pinnedJson<T>(path: string, sha: string): Promise<T> {
  const bytes = await readFile(path);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), sha, path);
  return JSON.parse(bytes.toString()) as T;
}

async function readBooks(controlled: string, historical: string, featureNames: string[]) {
  const [forecast, frozen, archived, rebuilt] = await Promise.all([
    pinnedJson<Record<string, number>>(join(historical, "aw-v2-forecasts.json"),
      "eca8637accb61569c4b0fb48bbb1fb95f38b28df76c8b83b3b306e2162412a40"),
    pinnedJson<{ races: GenerationRace[] }>(join(controlled, "generation.json"),
      "b807b997515d85f4387936ecae444158f39a7766eb0aa92aa3ec746d425bb941"),
    pinnedJson<AwTissueRace[]>(join(controlled, "v2.json"),
      "a97aa6a190d2418a0ea2d231100193f326eee5283108f4054b24991f17513fdb"),
    pinnedJson<{ output: (Omit<Book, "source"> & { cutoff: string })[] }>(join(controlled, "reconstruction.json"),
      "286c5258634a5a9709f7a1862a123a95e517854c2b579205ea2043e517a6a30f"),
  ]);
  const books = new Map<string, Book>();
  const hash = createHash("sha256");
  for await (const { features: f, numeric } of jsonLines<HistoricalRow>(join(historical, "aw-v2-prefit-rows.ndjson"), hash)) {
    assert.ok((f.latestRunDate === null || f.latestRunDate < f.raceDate) && f.odds === null && f.oddsDecimal === null);
    let book = books.get(f.targetRaceId);
    if (!book) {
      book = { raceId: f.targetRaceId, date: f.raceDate, capturedAt: f.raceDateTime, off: f.raceDateTime,
        runners: [], source: "Historical vectors", baseLogits: [] };
      books.set(f.targetRaceId, book);
    }
    const probability = forecast[f.targetRunnerId];
    assert.ok(Number.isFinite(probability) && probability > 0);
    book.baseLogits!.push(Math.log(probability));
    book.runners.push({ runnerId: f.targetRunnerId, horseName: f.horseName, modelInputs: numeric });
  }
  assert.equal(hash.digest("hex"), "fea708306814f2b8f49c3b0bc0f9d5b8c525ed817607f6c492bb36ff78e5c419");
  for (const book of rebuilt.output) {
    assert.ok(Date.parse(book.cutoff) <= Date.parse(book.capturedAt) && Date.parse(book.capturedAt) < Date.parse(book.off));
    books.set(book.raceId, { ...book, source: "Card rebuild" });
  }
  for (const book of archived) {
    assert.ok(book.recordedPreRace && book.featureCutoffAt && book.featureCutoffAt <= book.recordedAt && book.recordedAt < book.scheduledOffAt);
    books.set(book.raceId, { raceId: book.raceId, date: book.raceDate, capturedAt: book.recordedAt, off: book.scheduledOffAt,
      source: "V2 archive", runners: book.runners.map(r => ({ ...r, modelInputs: r.modelInputs! })),
      quotes: new Map(book.firstCaptureMarket?.map(r => [r.runnerId, r.price])) });
  }
  for (const book of frozen.races.filter(r => r.family === "AW")) {
    assert.deepEqual(book.featureNames, featureNames);
    assert.ok(book.featureCutoffAt <= book.capturedAt && book.capturedAt < book.scheduledOff);
    books.set(book.raceId, { raceId: book.raceId, date: book.raceDate, capturedAt: book.capturedAt, off: book.scheduledOff,
      source: "V3 frozen", runners: book.runners, frozenRanks: new Map(book.runners.map(r => [r.runnerId, r.rank])),
      quotes: book.completeMarket ? new Map(book.runners.map(r => [r.runnerId, r.capturedPrice])) : undefined });
  }
  return books;
}

function verifiedQuotes(book: Book, db: DbRace, result: ReturnType<typeof reconcileHistoryRace>) {
  const { quotes } = result;
  if (book.source === "Historical vectors" && quotes) {
    return new Map(result.race.runners.map((r, i) => [r.id, quotes[i]]));
  }
  if (book.source !== "Card rebuild") return book.quotes;
  assert.equal(Date.parse(db.cardAt ?? ""), Date.parse(book.capturedAt));
  assert.equal(db.cardId, db.source);
  assert.equal(db.cardDate, db.date);
  const active = new Map(db.cardRides?.filter(x => x[2] === "RUNNER").map(x => [x[0], x]));
  assert.equal(active.size, book.runners.length);
  const runners = new Map(db.runners.map(r => [r[0], r]));
  return new Map(book.runners.map(r => {
    const stored = runners.get(r.runnerId)!;
    const card = active.get(stored[1]);
    assert.ok(card && card[1] === stored[3]);
    return [r.runnerId, summarizeBookmakerMarket(parseSportingLifeBookmakerQuotes(card[4])).decimalPrice];
  }));
}

async function readRaces(controlled: string, historical: string, terminalPath: string, year: string) {
  const { AW: model } = await loadTissueGenerationModels();
  assert.equal(createHash("sha256").update(await readFile("data/research/tissue-generation-2026-11-aw.json")).digest("hex"),
    "d9c44881e2ea13ee1ed637122e2eb49028866aba8668086718d757c0e94a7f8c");
  const names = model.baseModel.names;
  const [books, saved] = await Promise.all([
    readBooks(controlled, historical, names),
    pinnedJson<{ results: { raceId: string; date: string; A: SavedPick[] }[];
      pending: { id: string; date: string; picks: { id: string }[][] }[] }>(join(controlled, "results.json"),
      "39f63a417ace77dea5cf58822a38bacfd0714539e279ca93543f2c554e7c61e9"),
  ]);
  const matched = new Map(saved.results.filter(r => r.date.startsWith(year)).map(r => [r.raceId, r.A]));
  const pending = new Map(saved.pending.filter(r => r.date.startsWith(year)).map(r => [r.id, r.picks[0]]));
  const hash = createHash("sha256");
  const races: EvaluatedRace[] = [];
  const coverage = { database: 0, completeSP: 0, noBook: 0, rosterConflict: 0, priorMatched: 0, priorWithdrawals: 0 };
  for await (const db of jsonLines<DbRace>(terminalPath, hash)) {
    if (!db.date.startsWith(year) || historyFamily(db) !== "AW") continue;
    coverage.database++;
    const terminal = reconcileHistoryRace(db, "AW");
    if (!terminal.race || !terminal.completeSP) continue;
    coverage.completeSP++;
    const book = books.get(db.id);
    if (!book) {
      coverage.noBook++;
      continue;
    }
    const runnerIds = new Set(book.runners.map(r => r.runnerId));
    const dbIds = new Set(db.runners.map(r => r[0]));
    if (runnerIds.size !== book.runners.length || terminal.race.runners.some(r => !runnerIds.has(r.id)) ||
        book.runners.some(r => !dbIds.has(r.runnerId)) ||
        (book.baseLogits && runnerIds.size !== terminal.race.runners.length)) {
      coverage.rosterConflict++;
      continue;
    }
    assert.equal(book.date, db.date);
    assert.ok(book.runners.every(r => r.modelInputs.length === (book.baseLogits ? 52 : 95) && r.modelInputs.every(Number.isFinite)));
    const input = { ...book, family: "AW" as const, featureNames: names };
    const context = tissueGenerationFeatures(input);
    const predictions = book.baseLogits
      ? raceSoftmax(book.runners.map((r, i) => book.baseLogits![i] + score(model.adjustment, context.get(r.runnerId)!)))
        .map((probability, i) => ({ runnerId: book.runners[i].runnerId, probability }))
        .sort((a, b) => b.probability - a.probability || a.runnerId.localeCompare(b.runnerId))
        .map((r, i) => ({ runnerId: r.runnerId, rank: i + 1 }))
      : predictTissueGeneration(model, input);
    const ranks = new Map(predictions.map(r => [r.runnerId, r.rank]));
    if (book.frozenRanks) for (const [id, rank] of book.frozenRanks) assert.equal(ranks.get(id), rank, db.id);
    const numeric = (r: Vector, name: string) => frozenNumeric(names, r.modelInputs, name);
    const speed = descendingRanks(book.runners, r => numeric(r, "best_l3_turf_speed"));
    const performance = descendingRanks(book.runners, r => numeric(r, "latest_performance"));
    const quotes = verifiedQuotes(book, db, terminal);
    const market = quotes?.size === book.runners.length &&
      Boolean(normalizeCompleteMarket(book.runners.map(r => quotes.get(r.runnerId))));
    const marketRanks = market ? descendingRanks(book.runners, r => -quotes!.get(r.runnerId)!) : null;
    const runners = book.runners.map(r => ({
      runnerId: r.runnerId, rank: ranks.get(r.runnerId)!, speedRank: speed.get(r.runnerId) ?? null,
      sameOrSpeedGap: context.get(r.runnerId)![2], performanceRank: performance.get(r.runnerId) ?? null,
      priorTrainerRate: numeric(r, "trainer_prior_rate"), marketRank: marketRanks?.get(r.runnerId) ?? null,
      hadSameSurfaceRun: (numeric(r, "log_surface_runs_365d") ?? 0) > 0,
    })).sort((a, b) => a.rank - b.rank);

    const vectors = new Map(book.runners.map(r => [r.runnerId, r]));
    const policyRunners = new Map(runners.map(r => [r.runnerId, r]));
    const tickets = new Map(terminal.race.runners.map((r, i) => {
      const outcome = terminal.outcomes[i];
      assert.ok(outcome.sp !== null && outcome.pl !== null);
      return [r.id, { name: vectors.get(r.id)!.horseName, sp: outcome.sp, pl: outcome.pl,
        win: outcome.status === "win", runner: policyRunners.get(r.id)!, date: db.date, raceId: db.id }];
    }));
    const prior = matched.get(db.id);
    const withdrawn = pending.get(db.id);
    assert.ok(prior || withdrawn, db.id);
    (prior ?? withdrawn)!.forEach((p, i) => assert.equal(runners[i].runnerId, p.id, db.id));
    if (prior) {
      coverage.priorMatched++;
      for (const p of prior) {
        const t = tickets.get(p.id)!;
        assert.equal(t.pl, p.pl);
        assert.equal(t.sp, p.odds);
        assert.equal(t.win, p.win);
      }
    } else coverage.priorWithdrawals++;
    races.push({ source: book.source, date: db.date, raceId: db.id, market, runners, tickets,
      hasRecordedNR: db.runners.length !== terminal.race.runners.length });
  }
  assert.equal(hash.digest("hex"), "f94b8dce3d2d92f2732f802d5e6e0f21ce43d330841c7f630905898e5f835160");
  assert.equal(coverage.priorMatched, matched.size);
  assert.equal(coverage.priorWithdrawals, pending.size);
  assert.equal(new Set(races.map(r => r.raceId)).size, races.length);
  return { races, coverage };
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const bands = ["<2/1", "2–<5/1", "5–<8/1", "8–<12/1", "12–<20/1", "20/1+"];
const band = (sp: number) => bands[[3, 6, 9, 13, 21].filter(bound => sp >= bound).length];
const profit = (tickets: Ticket[]) => sum(tickets.map(t => t.pl));

function metrics(tickets: Ticket[]) {
  const wins = tickets.filter(t => t.win);
  const pl = profit(tickets);
  return { bets: tickets.length, wins: wins.length, pl, roi: tickets.length ? pl / tickets.length : null,
    strike: tickets.length ? wins.length / tickets.length : null,
    averageWinSp: wins.length ? sum(wins.map(t => t.sp - 1)) / wins.length : null };
}

function group(tickets: Ticket[], keys: readonly string[], keyFor: (t: Ticket) => string) {
  return Object.fromEntries(keys.map(key => [key, metrics(tickets.filter(t => keyFor(t) === key))]));
}

function summarize(tickets: Ticket[], months: string[]) {
  const winners = tickets.filter(t => t.win).sort((a, b) => b.pl - a.pl || a.date.localeCompare(b.date) || a.raceId.localeCompare(b.raceId));
  const top = winners.slice(0, 2);
  const pl = profit(tickets), winningProfit = profit(winners);
  return { ...metrics(tickets), top, withoutOne: pl - (top[0]?.pl ?? 0), withoutTwo: pl - profit(top),
    shareWinningProfit: winningProfit > 0 ? profit(top) / winningProfit : null,
    shareNetProfit: pl > 0 ? profit(top) / pl : null,
    bands: group(tickets, bands, t => band(t.sp)), months: group(tickets, months, t => t.date.slice(0, 7)),
    ranks: group(tickets, ["1", "2", "3"], t => String(t.runner.rank)) };
}

function evaluate(races: EvaluatedRace[]) {
  const months = [...new Set(races.map(r => r.date.slice(0, 7)))].sort();
  const rankTicket = (race: EvaluatedRace, rank: number) => race.tickets.get(race.runners[rank - 1]?.runnerId);
  const baseline = [1, 2, 3].map(rank => {
    const tickets = races.flatMap(r => rankTicket(r, rank) ?? []);
    return { rank, races: races.filter(r => r.runners.length >= rank).length,
      voids: races.filter(r => r.runners.length >= rank).length - tickets.length, ...summarize(tickets, months) };
  });
  const candidates = awProfitPolicies.map(policy => {
    const eligible = races.filter(r => !("requiresMarket" in policy) || r.market);
    const selected = eligible.flatMap(race => {
      const runner = selectAwProfitRunner(policy, race.runners);
      return runner ? [{ race, ticket: race.tickets.get(runner.runnerId) }] : [];
    });
    const tickets = selected.flatMap(s => s.ticket ?? []);
    const paired = [1, 2].map(rank => {
      const pairs = selected.flatMap(({ race, ticket }) => {
        const reference = rankTicket(race, rank);
        return ticket && reference ? [{ ticket, reference }] : [];
      });
      return { rank, candidate: metrics(pairs.map(p => p.ticket)), reference: metrics(pairs.map(p => p.reference)) };
    });
    return { id: policy.id, eligible: eligible.length, unverified: races.length - eligible.length,
      noBet: eligible.length - selected.length, voids: selected.length - tickets.length,
      fullReferences: [1, 2].map(rank => metrics(eligible.flatMap(r => rankTicket(r, rank) ?? []))),
      paired, ...summarize(tickets, months) };
  });

  const observations = races.flatMap(r => {
    const ticket = rankTicket(r, 1);
    return ticket ? [{ runner: r.runners[0], ticket }] : [];
  });
  const interaction = [false, true].flatMap(surface => [false, true].map(speed => ({
    surface, speed, ...metrics(observations.filter(({ runner: r }) =>
      r.hadSameSurfaceRun === surface && (r.speedRank === 2 || r.speedRank === 3) === speed).map(o => o.ticket)),
  })));
  const measuredVsMissing = [true, false].map(measured => metrics(observations.filter(({ runner }) =>
    (runner.speedRank !== null) === measured).map(o => o.ticket)));
  return { races: races.length, dates: [races[0]?.date, races.at(-1)?.date], verifiedMarkets: races.filter(r => r.market).length,
    baseline, candidates, interaction, measuredVsMissing };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [year, controlled, historical, terminal] = process.argv.slice(2);
  assert.ok(["2025", "2026"].includes(year) && controlled && historical && terminal,
    "Usage: bun scripts/aw-profit-first-tissue.ts <2025|2026> <controlled archive dir> <historical archive dir> <terminal NDJSON>");
  const { races, coverage } = await readRaces(controlled, historical, terminal, year);
  races.sort((a, b) => a.date.localeCompare(b.date) || a.raceId.localeCompare(b.raceId));
  const sources = ["Historical vectors", "Card rebuild", "V2 archive", "V3 frozen"] as const;
  const historicalRaces = races.filter(r => r.source === "Historical vectors");
  process.stdout.write(JSON.stringify({ year, coverage,
    cohorts: Object.fromEntries(sources.map(source => [source, evaluate(races.filter(r => r.source === source))])),
    historicalNoRecordedNR: evaluate(historicalRaces.filter(r => !r.hasRecordedNR)),
  }));
}

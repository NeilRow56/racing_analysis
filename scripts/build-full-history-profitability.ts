import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { isSupportedAllWeatherRace } from "../src/lib/racing/aw-speed-rating";
import { settleSelection } from "../src/lib/racing/backtest";
import { summarizeBookmakerMarket } from "../src/lib/racing/forward-value";
import { classifyJumpRaceSubtype, isJumpRace } from "../src/lib/racing/jump-speed-rating";
import { isVoidRaceOutcome, settlementOutcomeState } from "../src/lib/racing/settlement-outcome";
import { parseSportingLifeBookmakerQuotes } from "../src/lib/racing/todays-racing";
import { isOrdinaryFlatTurfRace } from "../src/lib/racing/turf-speed-rating";
import { IndependentRaceHistory, type HistoryFamily, type HistoryRace, type HistoryRunner, type IndependentFeatures } from "../src/lib/racing/full-history-profitability";

type ResultRide = [ride: string | null, horse: string | null, position: string | null, status: string | null, casualty: string | null, sp: string | null];
type CardRide = [ride: string | null, horse: string | null, status: string | null, or: string | null, quotes: unknown];
type DbRunner = [id: string, source: string | null, horse: string, horseSource: string | null, trainer: string | null, jockey: string | null,
  position: number | null, status: string | null, code: string | null, or: number | null, speed: number | null, rpr: number | null,
  sp: number | null, weight: number | null, age: number | null];
export type DbRace = {
  id: string; source: string; date: string; off: string | null; course: string; country: string | null;
  name: string | null; type: string | null; code: string | null; class: string | null; yards: number | null;
  going: string | null; declared: number | null; actual: number | null; resultId: string | null; stage: string | null;
  surface: string | null; handicap: "true" | "false" | null; starterCount: string | null; resultRides: ResultRide[] | null;
  cardAt: string | null; cardStage: string | null; cardId: string | null; cardDate: string | null; cardRides: CardRide[] | null; runners: DbRunner[];
};
type Terminal = { position: number | null; status: "win" | "loss"; credit: number; divisor: number; sp: number | null; pl: number | null;
  or: number | null; speed: number | null; performance: number };
export type DatasetRace = { race: HistoryRace; source: string; course: string; surface: string | null; type: string | null;
  quoteAt: string | null; quotes: number[] | null; features: IndependentFeatures[]; outcomes: Terminal[]; completeSP: boolean };
const terminalStages = new Set(["WEIGHEDIN", "OFFICIAL", "COMPLETED"]);
const preOffStages = new Set(["DORMANT", "PRE_RACE", "GOINGDOWN", "GOINGBEHIND", "ATTHEPOST"]);
const nr = (status: string | null) => ["WITHDRAWN", "NONRUNNER", "NR"].includes((status ?? "").trim().toUpperCase().replace(/[\s_-]/g, ""));
const textValue = (value: string | null) => value?.trim() || null;
export function historyFamily(r: Pick<DbRace, "name" | "type" | "code" | "surface" | "course">): HistoryFamily | "OTHER" {
  const info = { raceName: r.name, raceType: r.type, raceTypeCode: r.code, surface: r.surface, courseName: r.course };
  if (isJumpRace(info)) {
    const subtype = classifyJumpRaceSubtype(info);
    return subtype === "chase" ? "CHASE" : subtype === "hurdle" ? "HURDLE" : "OTHER";
  }
  return isSupportedAllWeatherRace(info) ? "AW" : isOrdinaryFlatTurfRace(info) ? "TURF" : "OTHER";
}

export function finalSp(value: string | null) {
  const odds = (value ?? "").trim().toUpperCase();
  if (odds === "EVENS" || odds === "EVS") return 2;
  const parts = /^(\d+)\/(\d+)$/.exec(odds);
  return parts && Number(parts[1]) > 0 && Number(parts[2]) > 0 ? 1 + Number(parts[1]) / Number(parts[2]) : null;
}

const dbOutcome = (r: DbRace, x: DbRunner) => ({
  raceStage: r.stage, finishingPosition: x[6], resultStatus: x[7], outcomeCode: x[8],
});
const rawOutcome = (r: DbRace, x: ResultRide) => ({
  raceStage: r.stage, finishingPosition: Number(x[2]) > 0 ? Number(x[2]) : null,
  resultStatus: nr(x[3]) || nr(x[4]) ? "non_runner" : null, outcomeCode: x[4] ?? x[3],
});

export function reconcileHistoryRace(r: DbRace, family: HistoryFamily | "OTHER") {
  if (family === "OTHER") return { reason: "unsupported-family" } as const;
  if (isVoidRaceOutcome({ raceStage: r.stage, resultStatus: null, finishingPosition: null }) ||
      r.runners.some(x => isVoidRaceOutcome(dbOutcome(r, x)))) return { reason: "void-or-abandoned" } as const;
  if (!r.resultRides || r.resultId !== r.source) return { reason: "missing-or-mismatched-result-source" } as const;
  if (!terminalStages.has(r.stage ?? "")) return { reason: "nonterminal-result" } as const;
  const raw = new Map(r.resultRides.map(x => [x[0], x]));
  if (raw.has(null) || raw.size !== r.resultRides.length || raw.size !== r.runners.length ||
      new Set(r.runners.map(x => x[1])).size !== r.runners.length || new Set(r.runners.map(x => x[2])).size !== r.runners.length ||
      r.runners.some(x => !raw.has(x[1]) || raw.get(x[1])![1] !== x[3])) {
    return { reason: "ride-or-horse-identity-mismatch" } as const;
  }
  for (const x of r.runners) {
    const db = dbOutcome(r, x), imported = rawOutcome(r, raw.get(x[1])!);
    if (db.finishingPosition !== imported.finishingPosition || settlementOutcomeState(db) !== settlementOutcomeState(imported)) {
      return { reason: "result-disagreement" } as const;
    }
  }
  const active = r.runners.filter(x => settlementOutcomeState(dbOutcome(r, x)) !== "NR");
  const winners = active.filter(x => settlementOutcomeState(dbOutcome(r, x)) === "win").length;
  if (active.length !== Number(r.starterCount) || active.length < 2 || !winners ||
      active.some(x => !["win", "loss"].includes(settlementOutcomeState(dbOutcome(r, x))))) {
    return { reason: "unproved-starter-count-or-outcome" } as const;
  }
  const race: HistoryRace = { id: r.id, date: r.date, family, class: /^\s*(?:class\s*)?([1-7])\s*$/i.test(r.class ?? "") ? Number(r.class!.match(/[1-7]/)![0]) : null,
    yards: r.yards, going: textValue(r.going)?.toLowerCase() ?? null,
    handicap: r.handicap === "true" ? true : r.handicap === "false" ? false : r.type === "handicap" ? true : null,
    runners: active.map(([id, , horse, , trainer, jockey, , , , , , , , weight, age]): HistoryRunner => ({ id, horse, trainer, jockey, age, weight })) };
  const outcomes = active.map(x => {
    const evidence = dbOutcome(r, x);
    const status = settlementOutcomeState(evidence) === "win" ? "win" : "loss";
    const imported = finalSp(raw.get(x[1])![5]);
    const sp = imported !== null && x[12] !== null && Math.abs(imported - x[12]) < 0.000501 ? imported : null;
    const settlement = settleSelection({ ...evidence, targetRaceId: r.id, targetRunnerId: x[0], startingPrice: null,
      startingPriceDecimal: sp === null ? null : String(sp), won: status === "win", placed: null, deadHeatDivisor: winners });
    return { position: x[6], status, credit: status === "win" ? 1 / winners : 0, divisor: winners,
      sp, pl: settlement?.profitLoss ?? null, or: x[9], speed: x[10],
      performance: x[6] === null ? 0 : Math.max(0, 1 - (x[6] - 1) / (active.length - 1)) } satisfies Terminal;
  });
  const card = new Map((r.cardRides ?? []).filter(x => !nr(x[2])).map(x => [x[0], x]));
  const cardTime = Date.parse(r.cardAt ?? ""), off = Date.parse(r.off ?? "");
  const matchedCard = cardTime < off && preOffStages.has(r.cardStage ?? "") && r.cardId === r.source && r.cardDate === r.date &&
    !card.has(null) && card.size === active.length && card.size === r.cardRides?.filter(x => !nr(x[2])).length &&
    active.every(x => card.get(x[1])?.[1] === x[3]);
  const offers = matchedCard ? active.map(x => summarizeBookmakerMarket(parseSportingLifeBookmakerQuotes(card.get(x[1])?.[4])).decimalPrice) : [];
  const quotes = offers.length === active.length && offers.every((p): p is number => p !== null) ? offers : null;
  return { race, outcomes, quotes, matchedCard, cardOr: matchedCard ? active.filter(x => textValue(card.get(x[1])?.[3] ?? null)).length : 0,
    quoteAt: quotes ? r.cardAt : null, completeSP: outcomes.every(x => x.pl !== null) };
}

type Count = Record<string, number>;
const add = (counts: Count, key: string, n = 1) => { counts[key] = (counts[key] ?? 0) + n; };
type Inventory = { first: string; last: string; counts: Count; exclusions: Count; trusted: Count };
export async function* jsonLines<T>(path: string, hash?: ReturnType<typeof createHash>) {
  const stream = createReadStream(path);
  if (hash) stream.on("data", chunk => hash.update(chunk));
  for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) if (line) yield JSON.parse(line) as T;
}

export async function buildFullHistory(source: string, target: string) {
  const history = new IndependentRaceHistory(), inventory = new Map<string, Inventory>();
  const dates = new Map<string, Count>(), repairs = new Map<string, { family: string; starters: number; completeSP: boolean }>();
  const hash = createHash("sha256"), datasetHash = createHash("sha256");
  const output = await open(target, "wx");
  let currentDate = "", sourceRaces = 0;
  let pending: DatasetRace[] = [];
  const seen = new Set<string>();
  async function flush() {
    await output.writeFile(pending.filter(x => x.race.date >= "2024-01-01").map(x => JSON.stringify(x) + "\n").join(""));
    for (const row of pending) {
      if (row.race.date >= "2024-01-01") datasetHash.update(JSON.stringify(row) + "\n");
      history.record(row.race, row.outcomes);
    }
    pending = [];
  }
  try {
    for await (const r of jsonLines<DbRace>(source, hash)) {
      assert.ok(r.date >= currentDate && !seen.has(r.id), r.id);
      seen.add(r.id);
      sourceRaces++;
      if (currentDate !== r.date) await flush();
      currentDate = r.date;
      const family = historyFamily(r);
      const key = `${r.date.slice(0, 4)}|${family}`;
      const v = inventory.get(key) ?? { first: r.date, last: r.date, counts: {}, exclusions: {}, trusted: {} };
      inventory.set(key, v);
      v.last = r.date;
      const c = v.counts;
      add(c, "races");
      add(c, "databaseRunnerRows", r.runners.length);
      const states = r.runners.map(x => settlementOutcomeState(dbOutcome(r, x)));
      const start = r.runners.filter((_, i) => states[i] === "win" || states[i] === "loss");
      add(c, "settledOutcomes", start.length);
      add(c, "sourceReportedStarters", terminalStages.has(r.stage ?? "") ? Number(r.starterCount) || 0 : 0);
      add(c, "unresolvedRunnerRows", states.filter(s => s === "unresolved").length);
      add(c, "nonRunnerRows", states.filter(s => s === "NR").length);
      add(c, "winners", states.filter(s => s === "win").length);
      add(c, "databaseSP", start.filter(x => x[12] !== null && x[12] > 1).length);
      add(c, "databaseOR", start.filter(x => x[9] !== null).length);
      add(c, "databaseSpeed", start.filter(x => x[10] !== null).length);
      add(c, "databaseRPR", start.filter(x => x[11] !== null).length);
      add(c, "trainerId", start.filter(x => x[4] !== null).length);
      add(c, "jockeyId", start.filter(x => x[5] !== null).length);
      add(c, "class", Number(textValue(r.class) !== null));
      add(c, "distance", Number(r.yards !== null && r.yards > 0));
      add(c, "going", Number(textValue(r.going) !== null));
      add(c, "handicap", Number(r.handicap === "true" || r.handicap === "false" || r.type === "handicap"));
      add(c, "cardImports", Number(r.cardAt !== null));
      const audited = reconcileHistoryRace(r, family);
      if (r.date.startsWith("2026")) {
        const datesKey = `${r.date}|${family}`;
        const daily = dates.get(datesKey) ?? {};
        dates.set(datesKey, daily);
        add(daily, "databaseRaces");
        add(daily, "accepted", Number(!("reason" in audited)));
        if ("reason" in audited && audited.reason !== undefined) add(daily, audited.reason);
        else add(daily, "completeSP", Number(audited.completeSP));
      }
      if ("reason" in audited && audited.reason !== undefined) { add(v.exclusions, audited.reason); continue; }
      const features = history.prepare(audited.race);
      const u = v.trusted;
      add(u, "races");
      add(u, "starters", audited.outcomes.length);
      add(u, "winners", audited.outcomes.filter(x => x.credit > 0).length);
      add(u, "pricedStarters", audited.outcomes.filter(x => x.pl !== null).length);
      add(u, "completeSPBooks", Number(audited.completeSP));
      add(u, "matchedPreOffCards", Number(audited.matchedCard));
      add(u, "preOffOR", audited.cardOr);
      add(u, "completeQuoteBooks", Number(audited.quotes !== null));
      for (const f of features) for (const [metric, present] of Object.entries(f.coverage)) add(u, metric, Number(present));
      if (r.date === "2026-10-09" && ["942523","942524","942525","942526","942755","942756","943052","943054"].includes(r.source)) {
        repairs.set(r.source, { family, starters: audited.outcomes.length, completeSP: audited.completeSP });
      }
      pending.push({ race: audited.race, source: r.source, course: r.course, surface: r.surface, type: r.type, features, outcomes: audited.outcomes,
        quoteAt: audited.quoteAt, quotes: audited.quotes, completeSP: audited.completeSP });
    }
    await flush();
  } finally {
    await output.close();
  }
  const meta = { latest: currentDate, sourceRaces, sourceSha256: hash.digest("hex"), datasetSha256: datasetHash.digest("hex"),
    repairs: Object.fromEntries(repairs), inventory: Object.fromEntries(inventory), dates2026: Object.fromEntries(dates) };
  await writeFile(target + ".inventory.json", JSON.stringify(meta) + "\n", { flag: "wx" });
  return meta;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source, target] = process.argv.slice(2);
  assert.ok(source && target, "Provide a source NDJSON snapshot and a new output dataset filename.");
  const r = await buildFullHistory(source, target);
  console.log({ latest: r.latest, sourceRaces: r.sourceRaces, datasetSha256: r.datasetSha256, repairs: r.repairs });
}

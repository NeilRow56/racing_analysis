/** Offline research only. Emits an eligibility-audited research sample to stdout. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadBacktestFeatureCache } from "../src/lib/racing/backtest-cache";
import { settleSelection, settledWinValue } from "../src/lib/racing/backtest";
import { classifyJumpRaceSubtype } from "../src/lib/racing/jump-speed-rating";
import { ISOLATED_JUMP_CANDIDATE, readIsolatedJumpCandidate } from "../src/lib/racing/jump-candidate-reader";
import { classifyHandicapStatus } from "../src/lib/racing/research-rule";
import { settlementOutcomeState } from "../src/lib/racing/settlement-outcome";
import { CANONICAL_SETTLEMENT_VERSION } from "../src/lib/racing/research-settlement-version";
import { latestPreOffCaptures } from "../src/lib/racing/frozen-capture-selection";
import { frozenFeature } from "../src/lib/racing/chase-t3-research";
import { loadTissueGeneration, TISSUE_GENERATION_FORWARD_PATH } from "../src/lib/racing/tissue-generation-forward";
import { normalizeCompleteMarket } from "../src/lib/racing/tissue-value-metrics";
import { validDeadHeatDivisor } from "../src/lib/racing/win-settlement";

export const families = ["CHASE", "HURDLE", "AW", "TURF"] as const;
export type Family = typeof families[number];
type Cache = NonNullable<Awaited<ReturnType<typeof loadBacktestFeatureCache>>>;
type Row = Cache["rows"][number];
export type Runner = {
  id: string; trainer: string | null; or: number | null; speed: number | null; recent: number | null;
  form: number | null; age: number | null; weight: number | null; layoff: number | null;
  trainerRate: number | null; jockeyRate: number | null; prior: number | null; orDrop: number | null;
  sp: number | null; pnl: number | null; credit: number; tissue?: number;
};
export type Race = {
  id: string; date: string; family: Family; course: string; handicap: string; declared: number | null;
  runners: Runner[];
};
type Ride = {
  horse?: { name?: string }; ride_reference?: { id?: number }; ride_status?: string;
  finish_position?: number; casualty?: { type?: string; short_name?: string; name?: string; reason?: string };
};
type RawRace = {
  race_summary?: { date?: string; course_name?: string; name?: string; race_stage?: string; ride_count?: number; race_summary_reference?: { id?: number } };
  rides?: Ride[];
};
type FrozenChase = { races: { raceId: string; runners: { runnerId: string; shadow: number; won: boolean }[] }[] };
export type ResearchInput = {
  races: Race[]; generation: Race[]; audit: Record<string, number>; inventory: { family: Family; rows: number; races: number; coverage: Record<string, number> }[];
  hashes: Record<string, string>; rawDigest: string; rawBooks: number;
};
const cacheFamilies = ["jump", "all_weather_flat", "turf_flat"] as const;
const rawDirectory = "data/raw/sporting-life";
const promotion = "data/research/tissue-generation-chase-promotion-2026-11.json";
const promotionHash = "56116ca16d8e3d514d407833b08a8de6c7a6e253c3fd733aaf995ebe49ab1ff2";
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const token = (s: string | null | undefined) => (s ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
const horseToken = (s: string | undefined) => token(s?.replace(/\s*\([A-Z]{2,4}\)\s*$/i, ""));
const key = (date: string | undefined, course: string | undefined | null, race: string | undefined | null) => [date, token(course), token(race)].join("/");
const cacheKey = ({ features: f }: Row) => key(f.raceDate, f.courseName, f.raceName);
const cacheFamily = ({ features: f }: Row): Family | null => {
  if (f.raceCode === "aw") return "AW";
  if (f.raceCode === "turf") return "TURF";
  if (f.raceCode !== "jump") return null;
  const subtype = classifyJumpRaceSubtype(f);
  return subtype === "chase" ? "CHASE" : subtype === "hurdle" ? "HURDLE" : null;
};
function restoreSettlement(rows: Row[], race: RawRace): Row[] | null {
  const summary = race.race_summary;
  if (!summary?.race_stage || !["WEIGHEDIN", "OFFICIAL", "COMPLETED"].includes(summary.race_stage) ||
      !race.rides || race.rides.length !== rows.length) return null;
  const rides = new Map(race.rides.map(ride => [horseToken(ride.horse?.name), ride]));
  const rideIds = new Set(race.rides.map(ride => ride.ride_reference?.id));
  if (rides.size !== rows.length || rides.has("") || rideIds.size !== rows.length || rideIds.has(undefined) ||
      new Set(rows.map(row => horseToken(row.features.horseName))).size !== rows.length) return null;
  const joined: Row[] = [];
  for (const row of rows) {
    const ride = rides.get(horseToken(row.features.horseName));
    if (!ride) return null;
    const casualty = ride.casualty;
    const code = casualty?.type || casualty?.short_name || casualty?.name || casualty?.reason || ride.ride_status;
    const position = (ride.finish_position ?? 0) > 0 ? ride.finish_position! : null;
    const nr = ["NONRUNNER", "NON_RUNNER", "NON-RUNNER", "WITHDRAWN", "NR"].includes(code ?? "");
    if (position !== row.outcome.finishingPosition || nr !== (settlementOutcomeState(row.outcome) === "NR")) return null;
    joined.push({ ...row, outcome: { ...row.outcome, raceStage: summary.race_stage, outcomeCode: code } });
  }
  const states = joined.map(r => settlementOutcomeState(r.outcome));
  return states.every(s => s === "NR" || s === "win" || s === "loss") &&
    states.filter(s => s !== "NR").length === summary.ride_count ? joined : null;
}
function researchRace(rows: Row[], family: Family): Race | null {
  const f = rows[0].features;
  const active = rows.filter(r => settlementOutcomeState(r.outcome) !== "NR");
  if (active.length < 2 || active.some(r => settledWinValue(r.outcome) === null)) return null;
  const wins = active.filter(r => settledWinValue(r.outcome) === true).length;
  if (!wins || active.some(r => settledWinValue(r.outcome) && validDeadHeatDivisor(r.outcome.deadHeatDivisor) !== wins)) return null;
  assert.equal(new Set(rows.map(r => r.features.targetRunnerId)).size, rows.length);
  return { id: f.targetRaceId, date: f.raceDate, family, course: f.courseName, handicap: classifyHandicapStatus(f), declared: f.declaredRunnerCount,
    runners: active.map(({ features: x, outcome }) => {
      assert.equal(x.targetRunnerId, outcome.targetRunnerId);
      assert.equal(x.targetRaceId, outcome.targetRaceId);
      const priorDate = x.latestRunDate !== null && x.latestRunDate < x.raceDate;
      const speed = family === "CHASE" || family === "HURDLE" ? x.bestJumpSpeedLast3 :
        family === "AW" ? x.bestAwSpeedLast3 : x.bestTurfSpeedLast3;
      const recent = family === "CHASE" || family === "HURDLE" ? x.latestJumpSpeedRating :
        family === "AW" ? x.latestAwSpeedRating : x.latestTurfSpeedRating;
      const stake = settleSelection(outcome);
      return { id: x.targetRunnerId, trainer: x.trainerName, or: x.officialRating, speed: priorDate ? speed : null, recent: priorDate ? recent : null,
        form: priorDate ? x.latestPerformanceRating : null, age: x.horseAge, weight: x.weightCarriedLbs, layoff: priorDate ? x.daysSinceLastRun : null,
        trainerRate: x.trainerPriorWinRate, jockeyRate: x.jockeyPriorWinRate ?? null, prior: priorDate ? x.priorRuns : null,
        orDrop: priorDate && x.latestOr !== null && x.officialRating !== null ? x.latestOr - x.officialRating : null,
        sp: stake?.settlementOddsDecimal ?? null, pnl: stake?.profitLoss ?? null, credit: settledWinValue(outcome) ? 1 / wins : 0 };
    }),
  };
}

async function main(year: "2025" | "2026") {
  const hashPaths: string[] = [];
  const jump = year === "2026" ? await readIsolatedJumpCandidate() : null;
  const cacheRoot = jump ? join(ISOLATED_JUMP_CANDIDATE, "cache") : undefined;
  delete process.env.DATABASE_URL; // legacy loader may otherwise enrich settlement from the live DB
  const caches = await Promise.all(cacheFamilies.map(async family => {
    const isolated = family === "jump" && jump;
    const cache = await loadBacktestFeatureCache({ from: `${year}-01-01`, to: isolated ? "2026-10-14" : `${year}-12-31`, family, outputDir: isolated ? cacheRoot : undefined });
    assert(cache, `Missing compatible ${year} ${family} cache`);
    hashPaths.push(...["manifest.json", cache.manifest.featuresFile, cache.manifest.outcomesFile].map(file => join(cache.directory, file)));
    return cache;
  }));
  if (jump) hashPaths.push(...Object.keys(jump.sourcePins).map(file => join(ISOLATED_JUMP_CANDIDATE, file)));
  if (year === "2026") hashPaths.push(promotion, TISSUE_GENERATION_FORWARD_PATH);
  const hashes = Object.fromEntries(await Promise.all([...new Set(hashPaths)].sort().map(async path => [path, sha(await readFile(path))])));
  const audit: Record<string, number> = {};
  const mark = (family: Family, label: string) => {
    const k = `${family}: ${label}`;
    audit[k] = (audit[k] ?? 0) + 1;
  };
  const races: Race[] = [];
  const inventories = new Map<Family, Row[]>();
  const byKey = new Map<string, { rows: Row[]; family: Family }[]>();
  const proofs = new Map(jump?.fieldProofs.map(p => [p.raceId, p]));
  const checkedRaw = new Map<string, string>();
  const rawMatches = new Map<string, { rows: Row[]; path: string; digest: string }[]>();

  for (const cache of caches) for (const [id, rows] of Map.groupBy(cache.rows, r => r.features.targetRaceId)) {
    const family = cacheFamily(rows[0]);
    if (!family) continue;
    const list = inventories.get(family) ?? [];
    list.push(...rows);
    inventories.set(family, list);
    if (jump && (family === "CHASE" || family === "HURDLE")) {
      const proof = proofs.get(id);
      if (!proof) { mark(family, "no independent field proof"); continue; }
      const race = researchRace(rows, family);
      if (!race) { mark(family, "canonical outcome incomplete"); continue; }
      assert.equal([...proof.starterIds].sort().join(), race.runners.map(r => r.id).sort().join());
      checkedRaw.set(proof.sourcePath, proof.sha256);
      races.push(race);
    } else {
      const k = cacheKey(rows[0]);
      const group = byKey.get(k) ?? [];
      group.push({ rows, family });
      byKey.set(k, group);
    }
  }

  const rawFiles = (await readdir(rawDirectory)).filter(file => file.startsWith(year + "-") && /-\d+-full-result-next-data\.json$/.test(file));
  const targetDates = new Set([...byKey.keys()].map(k => k.slice(0, 10)));
  const files = rawFiles.filter(file => targetDates.has(file.slice(0, 10)));
  for (let start = 0; start < files.length; start += 48) {
    await Promise.all(files.slice(start, start + 48).map(async file => {
      const path = join(rawDirectory, file);
      const bytes = await readFile(path);
      let raw: RawRace | undefined;
      try {
        raw = JSON.parse(bytes.toString())?.props?.pageProps?.race as RawRace | undefined;
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        return;
      }
      const s = raw?.race_summary;
      if (!raw || !s || String(s.race_summary_reference?.id) !== file.match(/-(\d+)-full-result/)?.[1]) return;
      const k = key(s.date, s.course_name, s.name);
      for (const target of byKey.get(k) ?? []) {
        const rows = restoreSettlement(target.rows, raw);
        if (!rows) continue;
        const id = rows[0].features.targetRaceId;
        const matches = rawMatches.get(id) ?? [];
        matches.push({ rows, path, digest: sha(bytes) });
        rawMatches.set(id, matches);
      }
    }));
  }
  for (const { family, rows } of [...byKey.values()].flat()) {
    if (byKey.get(cacheKey(rows[0]))!.length !== 1) { mark(family, "ambiguous cache race key"); continue; }
    const matches = rawMatches.get(rows[0].features.targetRaceId);
    if (matches?.length !== 1) { mark(family, matches ? "ambiguous local raw result" : "unproved local final result"); continue; }
    const match = matches[0];
    const race = researchRace(match.rows, family);
    if (!race) { mark(family, "canonical outcome incomplete"); continue; }
    checkedRaw.set(match.path, match.digest);
    races.push(race);
  }
  const generation: Race[] = [];
  if (year === "2026") {
    assert.equal(hashes[promotion], promotionHash);
    const reference = JSON.parse(await readFile(promotion, "utf8")) as FrozenChase;
    const referenceById = new Map(reference.races.map(r => [r.raceId, r]));
    for (const race of races) {
      const book = referenceById.get(race.id);
      if (race.family !== "CHASE" || !book || race.runners.length !== book.runners.length) continue;
      const lookup = new Map(book.runners.map(p => [p.runnerId, p]));
      if (!race.runners.every(r => lookup.get(r.id)?.won === (r.credit > 0))) continue;
      race.runners.forEach(r => { r.tissue = lookup.get(r.id)!.shadow; });
    }
    const ledger = await loadTissueGeneration();
    for (const book of latestPreOffCaptures(ledger.races).filter(r => r.raceDate <= "2026-11-18")) {
      if (!book.completeMarket || book.runners.some(r => r.outcome?.status !== "settled" ||
          r.capturedPrice === null || r.outcome.profitLoss === null)) continue;
      const winnerCount = book.runners.filter(r => r.outcome?.winner).length;
      if (!winnerCount || book.runners.some(r => r.outcome!.winner === null ||
          (r.outcome!.winner ? validDeadHeatDivisor(r.outcome!.deadHeatDivisor) !== winnerCount : r.outcome!.finishPosition === 1))) continue;
      const returned = book.runners.map(r => {
        const o = r.outcome!;
        if (o.settlementVersion === CANONICAL_SETTLEMENT_VERSION) return o.profitLoss;
        // A legacy result without a positive finishing position lacks enough
        // evidence for v3. Replay complete classified legacy fields in memory.
        if (o.finishPosition === null || !Number.isInteger(o.finishPosition) ||
            o.finishPosition < 1 || o.finishPosition > book.runners.length ||
            o.winner !== (o.finishPosition === 1)) return null;
        const replay = settleSelection({
          targetRaceId: book.raceId, targetRunnerId: r.runnerId, finishingPosition: o.finishPosition,
          resultStatus: o.resultStatus, won: o.winner, placed: null, startingPrice: null,
          startingPriceDecimal: String(r.capturedPrice), deadHeatDivisor: o.deadHeatDivisor,
        });
        return replay && Math.abs(replay.profitLoss - o.profitLoss!) < 1e-10 ? replay.profitLoss : null;
      });
      if (returned.some(p => p === null)) continue;
      const f = (r: typeof book.runners[number], name: string) => frozenFeature(book, r, name);
      const terrain = book.family === "CHASE" || book.family === "HURDLE" ? "jump" : "turf";
      const runners = book.runners.map((r, index) => ({
        id: r.runnerId, trainer: null, or: f(r,"official_rating"), speed: book.family === "AW" ? null : f(r,`best_l3_${terrain}_speed`),
        recent: book.family === "AW" ? null : f(r,`latest_${terrain}_speed`),
        form: f(r,"latest_performance"), age: f(r,"age"), weight: f(r,"weight_lbs"), layoff: f(r,"days_since_run"),
        trainerRate: f(r,"trainer_prior_rate"), jockeyRate: f(r,"jockey_prior_rate"), prior: null, orDrop: null,
        sp: r.capturedPrice, pnl: returned[index],
        credit: r.outcome!.winner ? 1 / validDeadHeatDivisor(r.outcome!.deadHeatDivisor) : 0,
        tissue: r.probability,
      }));
      if (normalizeCompleteMarket(runners.map(r => r.sp)) && Math.abs(runners.reduce((s, r) => s + r.credit, 0) - 1) < 1e-10) {
        generation.push({ id: book.raceId, date: book.raceDate, family: book.family, course: book.course, handicap: "unknown", declared: null, runners });
      }
    }
  }
  for (const [path, digest] of Object.entries(hashes)) assert.equal(sha(await readFile(path)), digest, path);
  const rawEntries = [...checkedRaw].sort(([a], [b]) => a.localeCompare(b));
  for (let start = 0; start < rawEntries.length; start += 48) {
    await Promise.all(rawEntries.slice(start, start + 48).map(async ([path, digest]) => assert.equal(sha(await readFile(path)), digest, path)));
  }
  const inventory = [...inventories].map(([family, rows]) => ({
    family, rows: rows.length, races: new Set(rows.map(r => r.features.targetRaceId)).size,
    coverage: Object.fromEntries((["raceClass","distanceYards","going","declaredRunnerCount","actualRunnerCount","horseAge","weightCarriedLbs","officialRating",
      "latestPerformanceRating","priorRuns","daysSinceLastRun","trainerPriorWinRate","jockeyPriorWinRate","latestRunDate","bestJumpSpeedLast3","bestAwSpeedLast3","bestTurfSpeedLast3"] as const)
      .map(field => [field, rows.filter(r => r.features[field] !== null && r.features[field] !== undefined).length])),
  }));
  assert.equal(new Set(races.map(r => r.id)).size, races.length);
  races.sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const output: ResearchInput = { races, generation, audit, inventory, hashes,
    rawDigest: sha(rawEntries.map(([path, digest]) => `${path} ${digest}`).join("\n")), rawBooks: rawEntries.length };
  console.log(JSON.stringify(output));
}
const year = process.argv[2];
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert(year === "2025" || year === "2026", "Usage: bun scripts/extract-retrospective-market-research.ts 2025|2026");
  await main(year);
}

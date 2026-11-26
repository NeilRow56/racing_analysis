import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { captureAwProfitShadow, initAwProfitShadow } from "./aw-profit-shadow";
import { armAwSprint, captureAwSprint, settleAwSprint, summarizeAwSprint, type SprintCard } from "./aw-profit-sprint-filter";
import { indexHurdleFinalSpResults, type HurdleFinalSpResultRow } from "./hurdle-final-sp";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";
import { renderToStaticMarkup } from "react-dom/server";
import { AwSprintMonitor } from "../../app/racing/research/forward-value/aw-sprint-monitor";
import { GENERATION_MODEL_HASHES } from "./tissue-generation-config";
import type { GenerationRace } from "./tissue-generation-forward";
import { getLocalRacingDate, type TodayRace, type TodayRunner } from "./todays-racing";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "aw-profit-shadow-"));
  const path = join(dir, "shadow.json");
  const data = await initAwProfitShadow(path);
  const sprint = join(dir, "sprint.json");
  assert.equal((await armAwSprint(sprint))?.races.length, 0);
  assert.ok(data);
  const armedAt = new Date(data.armedAt);
  const date = new Date(armedAt.getTime() + 86_400_000).toISOString().slice(0, 10);
  const capture = new Date(date + "T09:00:00.000Z");
  const decision = new Date(date + "T09:01:00.000Z");
  const off = new Date(date + "T15:00:00.000Z");
  const terminal = new Date(date + "T16:00:00.000Z");
  const book: GenerationRace = {
    family: "AW", raceId: "aw-race", raceDate: getLocalRacingDate(capture), course: "Chelmsford City",
    modelVersion: "AW_TISSUE_V3", modelHash: GENERATION_MODEL_HASHES.AW, scheduledOff: off.toISOString(),
    capturedAt: capture.toISOString(), featureCutoffAt: capture.toISOString(),
    featureNames: ["latest_performance", "latest_performance_missing", "best_l3_turf_speed", "best_l3_turf_speed_missing", "distance_furlongs", "distance_furlongs_missing", "handicap", "handicap_missing"],
    adjustmentFeatureNames: [], completeMarket: false, marketSource: "sporting_life_median_bookmaker_at_capture_v1",
    runners: [1, 2, 3].map((n) => ({
      runnerId: "r" + n, horseId: "h" + n, horseName: "Horse " + n, rank: n, probability: (4 - n) / 6,
      modelInputs: n === 3 ? [51.48, 0, 86.48, 0] : [0, 1, 0, 1], adjustmentInputs: [], capturedPrice: null,
      quotes: n === 3 ? [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: "33/1", decimalOdds: 34 }] : [],
      outcome: null,
    })),
  };
  const race: TodayRace = {
    raceId: book.raceId, sourceId: "123", raceStage: "DORMANT", raceDateTime: off, scheduledTime: "15:00",
    raceName: "Handicap Stakes", raceClass: "2", courseCountry: "ENG", raceType: "handicap",
    raceTypeCode: null, distance: null, distanceYards: null, going: null, surface: "ALLWEATHER",
    declaredRunnerCount: 3, actualRunnerCount: null, winningTime: null,
    runners: book.runners.map((r): TodayRunner => ({
      runnerId: r.runnerId, runnerSourceId: r.runnerId, horseId: r.horseId, horseName: r.horseName,
      saddleclothNumber: null, horseAge: null, horseSex: null, weight: null, weightCarriedLbs: null, draw: null,
      jockeyName: null, trainerId: null, trainerName: null, officialRating: null, odds: null, oddsDecimal: null,
      resultStatus: null, finishingPosition: null, metrics: null,
    })),
  };
  const entry = (id: string, yards: number, opts: { flag?: boolean | null; noBet?: boolean; noQuote?: boolean; conflict?: boolean; missing?: boolean } = {}) => {
    const copy = structuredClone(book);
    copy.raceId = id;
    copy.completeMarket = !opts.noQuote;
    for (const r of copy.runners) {
      r.modelInputs = [
        ...(opts.noBet ? [0, 1, 0, 1] : r.modelInputs),
        ((opts.conflict && r.rank === 2) ? yards + 1 : yards) / 220, 0, opts.flag === false ? 0 : 1, 0,
      ];
      r.quotes = opts.noQuote ? [] : [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: "3/1", decimalOdds: 4 }];
      r.capturedPrice = opts.noQuote ? null : 4;
    }
    const card = { ...structuredClone(race), raceId: id, sourceId: "provider-" + id,
      raceName: opts.flag === false ? "Maiden Stakes" : "Handicap Stakes",
      raceType: opts.flag === false ? "maiden" : "handicap", distanceYards: opts.missing ? null : yards };
    return { book: copy, evidence: { race: card, sourceHandicap: opts.flag === undefined ? true : opts.flag } };
  };
  const observe = async (entries: ReturnType<typeof entry>[], at = new Date(decision.getTime() + 1000), since = capture) => {
    const books = entries.map(e => e.book);
    const cards = new Map<string, SprintCard>(entries.map(e => [e.book.raceId, e.evidence]));
    const data = await captureAwProfitShadow(books, new Map([...cards].map(([id, ev]) => [id, ev.race])), capture, path, () => decision);
    assert(data);
    return captureAwSprint(data.races, books, cards, since, sprint, () => at);
  };
  return { sprint, path, capture, decision, off, terminal, entry, observe, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test("uses actual V1 decisions and both inclusive exact-yard cutoffs with conservative fallback", async () => {
  const f = await fixture();
  try {
    const es = [
      f.entry("lower", 990), f.entry("upper", 1429), f.entry("below", 989), f.entry("above", 1430),
      f.entry("maiden", 1200, { flag: false }), f.entry("unknown", 1200, { flag: null }),
      f.entry("missing", 1200, { missing: true }), f.entry("inconsistent", 1200, { conflict: true }),
      f.entry("ambiguous", 1200.25), f.entry("no-bet", 1200, { noBet: true }),
    ];
    const data = await f.observe(es);
    assert(data);
    assert.deepEqual(data.races.map(r => r.reason), [
      "sprint_handicap_filter", "sprint_handicap_filter", "v1_retained", "v1_retained", "v1_retained", "v1_retained",
      "v1_retained", "v1_retained", "v1_retained", "v1_no_bet",
    ]);
    assert.equal(data.races[0].distanceYards, 990);
    assert.equal(data.races[1].distanceYards, 1429);
    assert.equal(data.races[0].v1?.runnerId, "r3");
    assert.equal(data.races[0].t2.runnerId, "r2");
    assert.equal(data.races[0].selectionRunnerId, null);
    assert.equal(data.races[0].sourceCapturedAt, f.capture.toISOString());
    const before = await readFile(f.sprint, "utf8"), source = await readFile(f.path, "utf8");
    await f.observe(es);
    assert.equal(await readFile(f.sprint, "utf8"), before);
    assert.equal(await readFile(f.path, "utf8"), source);
  } finally { await f.cleanup(); }
});

test("requires pre-off current-run exact source and rejects missing generation matches", async () => {
  const f = await fixture();
  try {
    const e = f.entry("aw", 1200);
    assert.equal((await f.observe([e], f.off))?.races.length, 0);
    assert.equal((await f.observe([e], f.terminal))?.races.length, 0);
    assert.equal((await f.observe([e], new Date(f.decision.getTime() + 500), f.decision))?.races.length, 0);
    const wrong = structuredClone(e);
    wrong.book.capturedAt = new Date(f.capture.getTime() + 1).toISOString();
    assert.equal((await f.observe([wrong]))?.races.length, 0);
  } finally { await f.cleanup(); }
});

test("matches both prices with canonical dead heats, refunds and missing quotes, and provides a fixed control", async () => {
  const f = await fixture();
  try {
    const es = [f.entry("omit-win", 1200), f.entry("control-loss", 1540), f.entry("control-win", 1760),
      f.entry("nr", 1200), f.entry("void", 1200), f.entry("no-quote", 1300, { noQuote: true })];
    await f.observe(es);
    const results: HurdleFinalSpResultRow[] = [];
    const books = es.map(e => e.book);
    for (const b of books) for (const r of b.runners) {
      const status = b.raceId === "void" ? "void" : b.raceId === "nr" && r.rank === 3 ? "NR" : "settled";
      const heat = b.raceId === "omit-win" && r.rank >= 2;
      const win = heat || r.rank === (b.raceId === "control-loss" || b.raceId === "nr" ? 2 : 3);
      const finish = win ? 1 : r.rank === 1 && b.raceId !== "nr" ? 3 : 2;
      r.outcome = { status, settlementVersion: CANONICAL_SETTLEMENT_VERSION,
        winner: status === "settled" ? win : null, finishPosition: status === "settled" ? finish : null,
        resultStatus: status === "settled" ? "finished" : status === "NR" ? "non_runner" : "void_race",
        deadHeatDivisor: heat ? 2 : 1, grossReturn: null, profitLoss: null, settledAt: f.terminal.toISOString() };
      if (b.raceId !== "void") results.push({ raceId: b.raceId, runnerId: r.runnerId, raceStage: "WEIGHEDIN",
        actualRunnerCount: 3, resultRideCount: 3, resultRideId: r.runnerId,
        resultPosition: status === "NR" ? null : String(finish), resultPrice: "4/1", finishingPosition: status === "NR" ? null : finish,
        resultStatus: r.outcome.resultStatus, outcomeCode: null, startingPriceDecimal: "5.000" });
    }
    const data = await settleAwSprint(books, indexHurdleFinalSpResults(results), f.sprint, f.terminal);
    assert(data);
    assert.equal(data.races[0].outcomes.v1?.finalSp?.profitLoss, 1.5);
    assert.equal(data.races[0].outcomes.v1?.capturedPL, 1);
    assert.equal(data.races[3].outcomes.v1?.status, "NR");
    assert.equal(data.races[4].outcomes.t2?.status, "void");
    assert.equal(data.races[5].outcomes.v1?.capturedPL, null);
    const m = summarizeAwSprint(data);
    assert.deepEqual(m.prices.map(x => [x.matched,x.t2.bets,x.v1.bets,x.shadow.bets,x.v1.profit,x.shadow.profit,x.shadow.roi,x.gainV1]),
      [[5,4,3,2,3,2,1,-1],[6,5,4,2,8.5,3,1.5,-5.5]]);
    assert.deepEqual(m.controls.map(c => [c.target,c.comparable,c.count,c.draws]), [[1,2,1,1000],[2,2,2,1000]]);
    assert.deepEqual(summarizeAwSprint({ ...data, races: [...data.races].reverse() }).controls,m.controls);
    const edited = structuredClone(data);
    for (const r of edited.races) if (r.outcomes.v1?.status === "settled") r.outcomes.v1.winner = !r.outcomes.v1.winner;
    assert.deepEqual(summarizeAwSprint(edited).controls,m.controls);
    const html = renderToStaticMarkup(<AwSprintMonitor data={data} />);
    for (const expected of ["ARMED", "Winners missed 2", "equal-abstention control", "Race decisions"]) assert(html.includes(expected));
  } finally { await f.cleanup(); }
});

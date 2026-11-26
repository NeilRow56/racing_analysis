import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HurdleClass4Monitor } from "../../app/racing/research/forward-value/hurdle-class4-monitor";
import {
  armHurdleClass4, captureHurdleClass4, loadHurdleClass4, pendingHurdleClass4,
  settleHurdleClass4, summarizeHurdleClass4,
} from "./hurdle-t2-class4-filter";
import { indexHurdleFinalSpResults, type HurdleFinalSpResultRow } from "./hurdle-final-sp";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";
import { GENERATION_MODEL_HASHES } from "./tissue-generation-config";
import type { TodayRace } from "./todays-racing";
import type { GenerationRace } from "./tissue-generation-forward";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "hurdle-class4-"));
  const path = join(dir, "shadow.json");
  const armed = await armHurdleClass4(path);
  assert.ok(armed);
  const date = new Date(Date.parse(armed.armedAt) + 2 * 86_400_000).toISOString().slice(0, 10);
  const at = (time: string) => new Date(`${date}T${time}:00.000Z`);
  const sourceAt = at("08:00"), beforeOff = at("08:01"), off = at("13:00"), afterOff = at("15:00");
  function book(id: string, handicap: 0 | 1 | null = 0, distance: number | null = 17, captured = true, raceClass: number | null = 4): GenerationRace {
    return {
      family: "HURDLE", raceId: id, raceDate: date, course: "Wincanton",
      modelVersion: "HURDLE_TISSUE_V2", modelHash: GENERATION_MODEL_HASHES.HURDLE,
      scheduledOff: off.toISOString(), capturedAt: sourceAt.toISOString(), featureCutoffAt: sourceAt.toISOString(),
      featureNames: ["handicap", "handicap_missing", "distance_furlongs", "distance_furlongs_missing", "class", "class_missing"],
      adjustmentFeatureNames: [], completeMarket: captured, marketSource: "sporting_life_median_bookmaker_at_capture_v1",
      runners: [1, 2].map(rank => ({
        rank, runnerId: `${id}-r${rank}`, horseId: `${id}-h${rank}`, horseName: `Horse ${rank}`, probability: rank === 1 ? 0.6 : 0.4,
        modelInputs: [handicap ?? 0, handicap === null ? 1 : 0, distance ?? 0, distance === null ? 1 : 0, raceClass ?? 0, raceClass === null ? 1 : 0],
        adjustmentInputs: [],
        capturedPrice: captured ? 4 : null,
        quotes: captured ? [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: "3/1", decimalOdds: 4 }] : [],
        outcome: null,
      })),
    };
  }
  function card(b: GenerationRace, overrides: Partial<TodayRace> = {}): TodayRace {
    const [handicap, missingHandicap, distance, missingDistance, raceClass, missingClass] = b.runners[0].modelInputs;
    const type = missingHandicap ? "Hurdle" : handicap ? "Handicap Hurdle" : "Maiden Hurdle";
    return {
      raceId: b.raceId, sourceId: "provider-" + b.raceId, scheduledTime: "13:00", raceDateTime: off,
      courseCountry: "GB", raceName: type, raceType: type, raceTypeCode: null, raceStage: "DORMANT",
      raceClass: missingClass ? null : String(raceClass), distance: null, distanceYards: missingDistance ? null : Math.round(distance * 220),
      going: null, surface: "Turf", declaredRunnerCount: 2, actualRunnerCount: null, winningTime: null,
      runners: b.runners.map(r => ({ runnerId: r.runnerId, horseId: r.horseId, finishingPosition: null, resultStatus: null } as TodayRace["runners"][number])),
      ...overrides,
    };
  }
  const cards = (books: GenerationRace[]) => new Map(books.map(b => [b.raceId, card(b)]));
  return { armed, path, sourceAt, beforeOff, off, afterOff, book, card, cards, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test("the existing exclusion takes precedence and Class 4 requires all three confirmed facts", async () => {
  const f = await fixture();
  try {
    assert.equal(f.armed.races.length, 0);
    const books = [
      f.book("class4-handicap", 1), f.book("class3", 1, 17, true, 3), f.book("class5", 1, 17, true, 5),
      f.book("unknown-class", 1, 17, true, null), f.book("overlap"), f.book("exact-18", 0, 18),
      f.book("just-short", 0, 3959 / 220), f.book("unknown-handicap", null), f.book("unknown-distance", 1, null),
      f.book("conflicting-distance", 1), f.book("ambiguous-class", 1), f.book("class-mismatch", 1),
      f.book("card-missing", 1), f.book("frozen-disagreement", 1), f.book("wrong-field", 1),
      f.book("card-handicap-conflict", 1), f.book("original-exclusion-no-card"),
    ];
    const cards = f.cards(books);
    cards.get("conflicting-distance")!.distanceYards = 3900;
    cards.get("ambiguous-class")!.raceClass = "4/5";
    cards.get("class-mismatch")!.raceClass = "Class 3";
    cards.delete("card-missing");
    books.find(b => b.raceId === "frozen-disagreement")!.runners[1].modelInputs[2] = 18;
    cards.get("wrong-field")!.runners[0].horseId = "other";
    cards.get("card-handicap-conflict")!.raceName = cards.get("card-handicap-conflict")!.raceType = "Maiden Hurdle";
    cards.delete("original-exclusion-no-card");
    cards.get("exact-18")!.raceClass = "Class 4";
    const data = await captureHurdleClass4([...books, books[0]], cards, f.sourceAt, f.path, () => f.beforeOff);
    assert.ok(data);
    assert.deepEqual(data.races.map(r => r.abstentionReason), [
      "confirmed_class_4", null, null, null, "confirmed_non_handicap_under_18f", "confirmed_class_4",
      "confirmed_non_handicap_under_18f", null, null, null, null, null, null, null, null, null,
      "confirmed_non_handicap_under_18f",
    ]);
    assert.equal(data.races[0].originalDecision, "BET");
    assert.equal(data.races[0].existingDecision, "BET");
    assert.equal(data.races[0].t2.quotes.length, 1);
    assert.equal(data.races[4].existingDecision, "NO BET");
    assert.equal(data.races[5].confirmedDistanceYards, 3960);
    assert.equal(data.races[5].t2.runnerId, "exact-18-r2");
    assert.equal(data.races[5].capturedAt, f.beforeOff.toISOString());
    const bytes = await readFile(f.path, "utf8");
    await captureHurdleClass4(books, cards, f.sourceAt, f.path, () => f.beforeOff);
    assert.equal(await readFile(f.path, "utf8"), bytes);
    assert.deepEqual(await armHurdleClass4(f.path), await loadHurdleClass4(f.path));
  } finally { await f.cleanup(); }
});

test("rejects invalid T2, pre-activation and prior-run books, and post-off or result-bearing decisions", async () => {
  const f = await fixture();
  try {
    const invalid = f.book("invalid");
    invalid.runners[1].rank = 3;
    const postOffCard = f.book("post-off-card");
    const cards = new Map([[postOffCard.raceId, f.card(postOffCard, { raceStage: "WEIGHEDIN" })]]);
    for (const [books, since, clock] of [
      [[invalid, postOffCard], f.sourceAt, f.beforeOff],
      [[f.book("earlier run")], f.beforeOff, f.beforeOff],
      [[f.book("off")], f.sourceAt, f.off],
      [[f.book("after")], f.sourceAt, f.afterOff],
    ] as const) {
      assert.equal((await captureHurdleClass4(books, cards, since, f.path, () => clock))?.races.length, 0);
    }
    const old = f.book("pre-activation");
    const day = new Date(Date.parse(f.armed.armedAt) - 2 * 86_400_000).toISOString().slice(0, 10);
    old.raceDate = day;
    old.capturedAt = old.featureCutoffAt = day + "T08:00:00.000Z";
    old.scheduledOff = day + "T13:00:00.000Z";
    const result = await captureHurdleClass4([old], cards, new Date(old.capturedAt), f.path, () => new Date(day + "T08:01:00.000Z"));
    assert.equal(result?.races.length, 0);
  } finally { await f.cleanup(); }
});

test("settles skipped winners and avoided losses, refunds and dead heats on matched price bases", async () => {
  const f = await fixture();
  try {
    const books = [f.book("skipped winner"), f.book("skipped loser"), f.book("dead heat", 1, 17, true, 3),
      f.book("nr", 1, 17, true, 3), f.book("void", 1, 17, true, 5), f.book("missing quote", 1, 17, false, 5), f.book("class4 winner", 1), f.book("class4 loser", 1), f.book("control loser", 1, 17, true, 5)];
    await captureHurdleClass4(books, f.cards(books), f.sourceAt, f.path, () => f.beforeOff);
    const raw: HurdleFinalSpResultRow[] = [];
    for (const book of books) {
      const won = !book.raceId.endsWith("loser");
      const deadHeat = book.raceId === "dead heat";
      const status = book.raceId === "nr" ? "NR" : book.raceId === "void" ? "void" : "settled";
      const rankTwo = book.runners[1];
      rankTwo.outcome = {
        settlementVersion: CANONICAL_SETTLEMENT_VERSION, status, winner: status === "settled" ? won : null,
        finishPosition: status === "settled" ? won ? 1 : 2 : null, resultStatus: status === "NR" ? "non_runner" : status === "void" ? "void_race" : "finished",
        deadHeatDivisor: deadHeat ? 2 : 1, grossReturn: status === "settled" && rankTwo.capturedPrice !== null ? won ? deadHeat ? 2 : 4 : 0 : null,
        profitLoss: status === "settled" && rankTwo.capturedPrice !== null ? won ? deadHeat ? 1 : 3 : -1 : null,
        settledAt: f.afterOff.toISOString(),
      };
      if (status !== "settled") continue;
      for (const runner of book.runners) {
        const position = deadHeat || (runner.rank === 2) === won ? 1 : 2;
        raw.push({
          raceId: book.raceId, runnerId: runner.runnerId, raceStage: "WEIGHEDIN", actualRunnerCount: 2, resultRideCount: 2,
          resultRideId: runner.runnerId, resultPosition: String(position), resultPrice: "4/1",
          finishingPosition: position, resultStatus: "finished", outcomeCode: null, startingPriceDecimal: "5.000",
        });
      }
    }
    const first = await settleHurdleClass4(books, new Map(), f.path, f.afterOff);
    assert.ok(first);
    assert.equal(pendingHurdleClass4(first).length, 7);
    const data = await settleHurdleClass4(books, indexHurdleFinalSpResults(raw), f.path, f.afterOff);
    assert.ok(data);
    assert.equal(pendingHurdleClass4(data).length, 0);
    assert.deepEqual(data.races.map(r => r.settlement?.status), ["settled", "settled", "settled", "NR", "void", "settled", "settled", "settled", "settled"]);
    assert.equal(data.races[0].selectionRunnerId, null);
    assert.equal(data.races[0].settlement?.winner, true);
    assert.equal(data.races[1].settlement?.capturedProfitLoss, -1);
    assert.equal(data.races[2].settlement?.finalSp?.profitLoss, 1.5);
    assert.equal(data.races[5].settlement?.capturedProfitLoss, null);
    assert.equal(data.races[5].settlement?.finalSp?.profitLoss, 4);
    const m = summarizeHurdleClass4(data);
    assert.deepEqual([m.eligible, m.retained, m.existingAbstentions, m.additionalAbstentions, m.winners, m.missedWinners, m.refunds, m.missingCapturedPrice], [9, 5, 2, 2, 2, 2, 2, 1]);
    assert.deepEqual(m.prices.map(r => [r.original.bets, r.existing.bets, r.combined.bets, r.original.profit, r.existing.profit, r.combined.profit, r.improvement, r.incremental, r.combined.roi]),
      [[6, 4, 2, 4, 2, 0, -4, -2, 0], [7, 5, 3, 10.5, 7.5, 4.5, -6, -3, 1.5]]);
    assert.deepEqual(m.controls.map(r => [r.target, r.covered, r.draws, r.actual, r.median, r.actualMinusMedian]),
      [[2, 2, 1000, -2, 0, -2], [2, 2, 1000, -3, -3, 0]]);
    assert.deepEqual(summarizeHurdleClass4({ ...data, races: [...data.races].reverse() }).controls, m.controls);
    const html = renderToStaticMarkup(<HurdleClass4Monitor data={data} />);
    for (const expected of ["ARMED", "Missed winners 2", "Matched results and equal-stake control", "Final SP", "Captured bookmaker", "Race decisions"])
      assert.ok(html.includes(expected), expected);
    assert.ok(renderToStaticMarkup(<HurdleClass4Monitor data={null} />).includes("UNARMED"));
  } finally {
    await f.cleanup();
  }
});

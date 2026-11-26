import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HurdleT2FilterMonitor } from "../../app/racing/research/forward-value/hurdle-t2-filter-monitor";
import {
  armHurdleT2Filter, captureHurdleT2Filter, loadHurdleT2Filter, pendingHurdleT2Filter,
  settleHurdleT2Filter, summarizeHurdleT2Filter,
} from "./hurdle-t2-nonhandicap-filter";
import { indexHurdleFinalSpResults, type HurdleFinalSpResultRow } from "./hurdle-final-sp";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";
import { GENERATION_MODEL_HASHES } from "./tissue-generation-config";
import type { GenerationRace } from "./tissue-generation-forward";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "hurdle-t2-filter-"));
  const path = join(dir, "shadow.json");
  const armed = await armHurdleT2Filter(path);
  assert.ok(armed);
  const date = new Date(Date.parse(armed.armedAt) + 2 * 86_400_000).toISOString().slice(0, 10);
  const at = (time: string) => new Date(`${date}T${time}:00.000Z`);
  const sourceAt = at("08:00"), beforeOff = at("08:01"), off = at("13:00"), afterOff = at("15:00");
  function book(id: string, handicap: 0 | 1 | null = 0, distance: number | null = 17, captured = true): GenerationRace {
    return {
      family: "HURDLE", raceId: id, raceDate: date, course: "Wincanton",
      modelVersion: "HURDLE_TISSUE_V2", modelHash: GENERATION_MODEL_HASHES.HURDLE,
      scheduledOff: off.toISOString(), capturedAt: sourceAt.toISOString(), featureCutoffAt: sourceAt.toISOString(),
      featureNames: ["handicap", "handicap_missing", "distance_furlongs", "distance_furlongs_missing"],
      adjustmentFeatureNames: [], completeMarket: captured, marketSource: "sporting_life_median_bookmaker_at_capture_v1",
      runners: [1, 2].map(rank => ({
        rank, runnerId: `${id}-r${rank}`, horseId: `${id}-h${rank}`, horseName: `Horse ${rank}`, probability: rank === 1 ? 0.6 : 0.4,
        modelInputs: [handicap ?? 0, handicap === null ? 1 : 0, distance ?? 0, distance === null ? 1 : 0],
        adjustmentInputs: [],
        capturedPrice: captured ? 4 : null,
        quotes: captured ? [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: "3/1", decimalOdds: 4 }] : [],
        outcome: null,
      })),
    };
  }
  return { armed, path, sourceAt, beforeOff, off, afterOff, book, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test("captures only the original T2 and applies the exact distance boundary with frozen uncertainty", async () => {
  const f = await fixture();
  try {
    const ambiguous = f.book("ambiguous");
    ambiguous.runners[1].modelInputs[0] = 1;
    const books = [
      f.book("short", 0, 17), f.book("17.99", 0, 17.99), f.book("exact", 0, 18),
      f.book("long", 0, 18.01), f.book("handicap", 1), f.book("unknown", null),
      f.book("distance missing", 0, null), ambiguous, f.book("short"),
    ];
    const data = await captureHurdleT2Filter(books, f.sourceAt, f.path, () => f.beforeOff);
    assert.ok(data);
    assert.deepEqual(data.races.map(r => r.decision), ["NO BET", "NO BET", "BET", "BET", "BET", "BET", "BET", "BET"]);
    assert.equal(data.races[0].abstentionReason, "confirmed_non_handicap_under_18f");
    assert.equal(data.races[0].selectionRunnerId, null);
    assert.equal(data.races[2].t2.rank, 2);
    assert.equal(data.races[2].selectionRunnerId, "exact-r2");
    assert.equal(data.races[2].capturedAt, f.beforeOff.toISOString());
    assert.deepEqual(data.races[5].handicapEvidence.values, [null, null]);
    assert.equal(data.races[7].handicap, "unknown");
    assert.deepEqual(data.races[7].handicapEvidence.values, [0, 1]);
    assert.equal(data.races[6].distanceFurlongs, null);
    const bytes = await readFile(f.path, "utf8");
    await captureHurdleT2Filter([f.book("short", 1)], f.sourceAt, f.path, () => f.beforeOff);
    assert.equal(await readFile(f.path, "utf8"), bytes);
    assert.deepEqual(await armHurdleT2Filter(f.path), await loadHurdleT2Filter(f.path));
  } finally {
    await f.cleanup();
  }
});

test("rejects books without a valid T2, prior-run books, pre-activation books and decisions at or after the off", async () => {
  const f = await fixture();
  try {
    const invalid = f.book("invalid");
    invalid.runners[1].rank = 3;
    for (const [books, since, clock] of [
      [[invalid], f.sourceAt, f.beforeOff],
      [[f.book("earlier run")], f.beforeOff, f.beforeOff],
      [[f.book("off")], f.sourceAt, f.off],
      [[f.book("after")], f.sourceAt, f.afterOff],
    ] as const) {
      const result = await captureHurdleT2Filter(books, since, f.path, () => clock);
      assert.equal(result?.races.length, 0);
    }
    const old = f.book("pre-activation");
    const previous = new Date(Date.parse(f.armed.armedAt) - 2 * 86_400_000);
    const day = previous.toISOString().slice(0, 10);
    old.raceDate = day;
    old.capturedAt = old.featureCutoffAt = day + "T08:00:00.000Z";
    old.scheduledOff = day + "T13:00:00.000Z";
    const result = await captureHurdleT2Filter([old], new Date(old.capturedAt), f.path, () => new Date(day + "T08:01:00.000Z"));
    assert.equal(result?.races.length, 0);
  } finally {
    await f.cleanup();
  }
});

test("settles skipped winners and avoided losses, refunds and dead heats on matched price bases", async () => {
  const f = await fixture();
  try {
    const books = [f.book("skipped winner"), f.book("skipped loser"), f.book("dead heat", 1),
      f.book("nr", 1), f.book("void", 1), f.book("missing quote", 1, 17, false)];
    await captureHurdleT2Filter(books, f.sourceAt, f.path, () => f.beforeOff);
    const raw: HurdleFinalSpResultRow[] = [];
    for (const book of books) {
      const won = book.raceId !== "skipped loser";
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
    const first = await settleHurdleT2Filter(books, new Map(), f.path, f.afterOff);
    assert.ok(first);
    assert.equal(pendingHurdleT2Filter(first).length, 4);
    const data = await settleHurdleT2Filter(books, indexHurdleFinalSpResults(raw), f.path, f.afterOff);
    assert.ok(data);
    assert.equal(pendingHurdleT2Filter(data).length, 0);
    assert.deepEqual(data.races.map(r => r.settlement?.status), ["settled", "settled", "settled", "NR", "void", "settled"]);
    assert.equal(data.races[0].selectionRunnerId, null);
    assert.equal(data.races[0].settlement?.winner, true);
    assert.equal(data.races[1].settlement?.capturedProfitLoss, -1);
    assert.equal(data.races[2].settlement?.finalSp?.profitLoss, 1.5);
    assert.equal(data.races[5].settlement?.capturedProfitLoss, null);
    assert.equal(data.races[5].settlement?.finalSp?.profitLoss, 4);
    const m = summarizeHurdleT2Filter(data);
    assert.deepEqual([m.eligible, m.selected, m.abstentions, m.winners, m.missedWinners, m.refunds], [6, 4, 2, 2, 1, 2]);
    assert.deepEqual(m.prices.map(r => [r.benchmark.bets, r.shadow.bets, r.benchmark.profit, r.shadow.profit, r.difference]),
      [[3, 1, 3, 1, -2], [4, 2, 8.5, 5.5, -3]]);
    const html = renderToStaticMarkup(<HurdleT2FilterMonitor data={data} />);
    for (const expected of ["ARMED", "Winners missed 1", "Matched comparison against original T2", "Final SP", "Captured bookmaker"])
      assert.ok(html.includes(expected), expected);
    assert.ok(renderToStaticMarkup(<HurdleT2FilterMonitor data={null} />).includes("UNARMED"));
  } finally {
    await f.cleanup();
  }
});

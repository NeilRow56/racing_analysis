import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChaseClass46Monitor } from "../../app/racing/research/forward-value/chase-class46-monitor";
import {
  armChaseClass46, captureChaseClass46, loadChaseClass46, pendingChaseClass46,
  settleChaseClass46, summarizeChaseClass46,
} from "./chase-t3-class46-handicap";
import { indexHurdleFinalSpResults } from "./hurdle-final-sp";
import { GENERATION_MODEL_HASHES } from "./tissue-generation-config";
import { emptyTissueGeneration, settleTissueGeneration, type GenerationRace } from "./tissue-generation-forward";
import type { TodayRace, TodayRunner } from "./todays-racing";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "chase-class46-"));
  const path = join(directory, "shadow.json");
  const armed = await armChaseClass46(path);
  assert.ok(armed);
  const date = new Date(Date.parse(armed.armedAt) + 2 * 86_400_000).toISOString().slice(0, 10);
  const at = (time: string) => new Date(date + "T" + time + ":00.000Z");
  const source = at("08:00"), before = at("08:01"), off = at("13:00"), after = at("15:00");
  function field(id: string, officialClass: number | null = 4, handicap: 0 | 1 | null = 1) {
    const book: GenerationRace = {
      family: "CHASE", raceId: id, raceDate: date, course: "Wincanton", modelVersion: "CHASE_TISSUE_V2",
      modelHash: GENERATION_MODEL_HASHES.CHASE, scheduledOff: off.toISOString(), capturedAt: source.toISOString(),
      featureCutoffAt: source.toISOString(), marketSource: "sporting_life_median_bookmaker_at_capture_v1", completeMarket: true,
      featureNames: ["handicap", "handicap_missing", "class", "class_missing"], adjustmentFeatureNames: [],
      runners: [1, 2, 3].map(rank => ({
        runnerId: id + "-r" + rank, horseId: id + "-h" + rank, horseName: "Horse " + rank, rank, probability: (4 - rank) / 6,
        modelInputs: [handicap ?? 0, handicap === null ? 1 : 0, officialClass ?? 0, officialClass === null ? 1 : 0],
        adjustmentInputs: [], capturedPrice: rank + 2, outcome: null,
        quotes: [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: null, decimalOdds: rank + 2 }],
      })),
    };
    const card: TodayRace = {
      raceId: id, sourceId: id, raceName: handicap === 1 ? "Handicap Chase" : handicap === 0 ? "Novice Chase" : "Chase",
      raceStage: "DORMANT", raceDateTime: off, scheduledTime: "13:00", raceType: "chase", raceTypeCode: null,
      raceClass: officialClass?.toString() ?? null, surface: null, going: null, distance: null, distanceYards: 4500,
      courseCountry: "GB", declaredRunnerCount: 3, actualRunnerCount: null, winningTime: null,
      runners: book.runners.map((r): TodayRunner => ({
        runnerId: r.runnerId, horseId: r.horseId, horseName: r.horseName, runnerSourceId: r.runnerId, horseAge: null, horseSex: null,
        saddleclothNumber: null, weight: null, weightCarriedLbs: null, draw: null, trainerId: null, trainerName: null,
        jockeyName: null, officialRating: null, odds: null, oddsDecimal: null, resultStatus: null, finishingPosition: null, metrics: null,
      })),
    };
    return { book, card };
  }
  const capture = (fields: ReturnType<typeof field>[], clock = before, since = source) =>
    captureChaseClass46(fields.map(f => f.book), new Map(fields.map(f => [f.card.raceId, f.card])), since, path, () => clock);
  return { path, armed, field, capture, before, off, after, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test("arms empty, freezes only valid original rankings and checks verified class and handicap", async () => {
  const f = await fixture();
  try {
    assert.deepEqual(f.armed.races, []);
    const missingT3 = f.field("missing3"), missingT2 = f.field("missing2"), invalid = f.field("invalid"), withdrawn = f.field("withdrawn");
    missingT3.book.runners[2].rank = 4;
    missingT2.book.runners[1].rank = 4;
    invalid.book.runners[2].probability = 0.7;
    withdrawn.card.runners[2].resultStatus = "non_runner";
    const ambiguous = f.field("ambiguous");
    ambiguous.card.raceClass = "4/5";
    const inconsistent = f.field("inconsistent");
    inconsistent.card.raceName = "Novice Chase";
    const fields = [
      f.field("class4"), f.field("class5", 5), f.field("class6", 6),
      f.field("class3", 3), f.field("class2", 2), f.field("non-hcap", 4, 0),
      f.field("unknown-hcap", 4, null), f.field("unknown-class", null), missingT3, missingT2,
      invalid, withdrawn, ambiguous, inconsistent,
    ];
    const snapshot = structuredClone(fields);
    const d = await f.capture(fields);
    assert.ok(d);
    assert.deepEqual(fields, snapshot);
    assert.deepEqual(d.races.map(r => r.reason), ["class46_handicap", "class46_handicap", "class46_handicap", "other_class", "other_class",
      "non_handicap", "unknown_handicap", "unknown_class", "missing_or_invalid_t3", "missing_or_invalid_t2",
      "missing_or_invalid_t3", "t3_withdrawn", "unknown_class", "unknown_handicap"]);
    assert.deepEqual(d.races.slice(0, 3).map(r => r.decision), Array(3).fill("T3_SUBSTITUTION"));
    assert.equal(d.races[9].decision, "NO_SELECTION");
    assert.equal(d.races[9].selectionRunnerId, null);
    assert.equal(d.races[8].selectionRunnerId, "missing3-r2");
    assert.equal(d.races[0].selectionRunnerId, "class4-r3");
    assert.deepEqual([d.races[0].t2?.rank, d.races[0].t3?.rank], [2, 3]);
    assert.deepEqual([d.races[0].t2?.capturedPrice, d.races[0].t3?.capturedPrice], [4, 5]);
    const bytes = await readFile(f.path, "utf8");
    await f.capture([f.field("class4", 2)]);
    assert.equal(await readFile(f.path, "utf8"), bytes);
    assert.deepEqual(await armChaseClass46(f.path), await loadChaseClass46(f.path));
    assert.ok(renderToStaticMarkup(<ChaseClass46Monitor data={f.armed} />).includes("Captured 0"));
  } finally {
    await f.cleanup();
  }
});

test("rejects pre-activation, previous-run, post-off and result-bearing books", async () => {
  const f = await fixture();
  try {
    const old = f.field("old");
    const day = new Date(Date.parse(f.armed.armedAt) - 86_400_000).toISOString().slice(0, 10);
    old.book.raceDate = day;
    old.book.capturedAt = old.book.featureCutoffAt = day + "T08:00:00.000Z";
    old.book.scheduledOff = day + "T13:00:00.000Z";
    const final = f.field("card-result");
    final.card.raceStage = "OFF";
    for (const data of [
      await f.capture([old], new Date(day + "T08:01:00.000Z"), new Date(old.book.capturedAt)),
      await f.capture([f.field("earlier run")], f.before, f.before),
      await f.capture([f.field("off")], f.off),
      await f.capture([f.field("after")], f.after),
      await f.capture([final]),
    ]) assert.equal(data?.races.length, 0);
  } finally {
    await f.cleanup();
  }
});

test("uses only paired quotes and official SP, with canonical split and refunded stakes", async () => {
  const f = await fixture();
  try {
    const fields = ["dead heat", "lost switch", "missing price", "withdrawal", "void"].map(id => f.field(id));
    const missing = fields[2].book;
    missing.completeMarket = false;
    for (const r of missing.runners) r.capturedPrice = null;
    missing.runners[2].quotes = [];
    const captured = await f.capture(fields);
    assert.ok(captured);
    assert.equal(captured.races[2].t2?.capturedPrice, 4);
    assert.equal(captured.races[2].t3?.priceStatus, "missing");
    const cards = new Map(fields.map(({ card }, index) => {
      const positions = [[3, 1, 1], [2, 1, 3], [2, 3, 1], [2, 1, null], [null, null, null]][index];
      const race: TodayRace = { ...card, raceStage: index === 4 ? "ABANDONED" : "WEIGHEDIN", actualRunnerCount: index === 3 ? 2 : 3,
        runners: card.runners.map((r, i) => ({ ...r, finishingPosition: positions[i],
          resultStatus: index === 3 && i === 2 ? "non_runner" : index === 4 ? null : "finished" })) };
      return [race.raceId, race] as const;
    }));
    const generation = settleTissueGeneration({ ...emptyTissueGeneration(), races: fields.map(x => x.book) }, cards, f.after);
    const sp = indexHurdleFinalSpResults([...cards.values()].filter(card => card.raceStage === "WEIGHEDIN").flatMap(card =>
      card.runners.map(r => ({
        raceId: card.raceId, runnerId: r.runnerId, raceStage: card.raceStage ?? null, actualRunnerCount: card.actualRunnerCount,
        resultRideCount: 3, resultRideId: r.runnerId, resultPosition: r.finishingPosition === null ? null : String(r.finishingPosition),
        finishingPosition: r.finishingPosition, resultStatus: r.resultStatus, outcomeCode: null, resultPrice: "5/1", startingPriceDecimal: "6.000",
      }))));
    const interim = await settleChaseClass46(generation.races, new Map(), f.path, f.after);
    assert.ok(interim);
    assert.equal(pendingChaseClass46(interim).length, 4);
    const settled = await settleChaseClass46(generation.races, sp, f.path, f.after);
    assert.ok(settled);
    assert.equal(pendingChaseClass46(settled).length, 0);
    assert.equal(settled.races[0].outcomes.shadow?.finalSp?.profitLoss, 2);
    assert.equal(settled.races[0].outcomes.shadow?.capturedProfitLoss, 1.5);
    assert.equal(settled.races[3].outcomes.shadow?.status, "NR");
    assert.equal(settled.races[3].decision, "T3_SUBSTITUTION");
    assert.equal(settled.races[4].outcomes.t2?.status, "void");
    const m = summarizeChaseClass46(settled);
    assert.equal(m.missingPrices, 1);
    assert.equal(m.capturedPrice.pairs, 4);
    assert.deepEqual([m.capturedPrice.benchmark.bets, m.capturedPrice.shadow.bets, m.capturedPrice.difference], [3, 2, -6.5]);
    assert.deepEqual([m.finalSp.benchmark.bets, m.finalSp.shadow.bets, m.finalSp.difference], [4, 3, -5]);
    assert.deepEqual([m.winnersGained, m.winnersMissed], [1, 2]);
    const html = renderToStaticMarkup(<ChaseClass46Monitor data={settled} />);
    for (const label of ["ARMED", "Missing either quote 1", "Matched comparison against original Chase T2", "Inspect substitutions", "Won (dead heat)", "Class 4", "Class 5", "Class 6"])
      assert.ok(html.includes(label), label);
    assert.ok(renderToStaticMarkup(<ChaseClass46Monitor data={null} />).includes("UNARMED"));
  } finally {
    await f.cleanup();
  }
});

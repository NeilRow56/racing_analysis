import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { ChaseShadowPanel } from "@/app/racing/research/winter-2026/chase-shadow";
import { CHASE_SHADOW_HASH, CHASE_SHADOW_MODEL_PATH, loadChaseShadowModel } from "./chase-shadow-model";
import { buildChaseShadow, captureChaseShadow, CHASE_SHADOW_EPOCH, emptyChaseShadow, loadChaseShadow, mutateChaseShadow, settleChaseShadow } from "./chase-shadow-forward";
import { summarizeChaseShadow } from "./chase-shadow-summary";
import { chaseExperienceGroup, classifyChaseContext } from "./chase-shadow-context";
import { buildJumpTissueRace } from "./jump-tissue-forward";
import { loadJumpTissueModel } from "./jump-tissue-model";
import { raceSoftmax, score } from "../../../scripts/diagnose-independent-tissue-feasibility";
import type { TodayRace, TodayRunner } from "./todays-racing";
const model = await loadChaseShadowModel(), currentModel = await loadJumpTissueModel();
const now = new Date(Date.parse(CHASE_SHADOW_EPOCH.declaredAt) + 60_000);
function runner(id: string, rating: number): TodayRunner {
  return { runnerId: id, runnerSourceId: id, horseId: `horse-${id}`, horseName: id, saddleclothNumber: null,
    horseAge: 7, horseSex: null, weight: null, weightCarriedLbs: 154, draw: null, jockeyName: null, trainerId: null, trainerName: null,
    officialRating: rating, odds: "6/1", oddsDecimal: "7", forecastDecimalOdds: 99,
    bookmakerQuotes: [{ bookmakerId: 1, bookmakerName: "Test Book", fractionalOdds: "6/1", decimalOdds: 7 }],
    resultStatus: null, finishingPosition: null,
    metrics: { priorRuns: 3, latestJumpSpeedRating: 100, bestJumpSpeedLast3: 102, averageJumpSpeedLast3: 101, daysSinceLastRun: 30,
      jumpSpeedReliability: { level: "HIGH", relevantJumpRuns: 3, windowRuns: 3, nonJumpRuns: 0, reason: "existing" } } as TodayRunner["metrics"],
    trainerMetrics: { trainerPriorRuns: 20, trainerPriorWins: 4, trainerPriorWinRate: .2 },
    jockeyMetrics: { jockeyPriorRuns: 20, jockeyPriorWins: 3, jockeyPriorWinRate: .15 } };
}
function card(): TodayRace {
  return { raceId: "race", sourceId: "source", scheduledTime: "13:00", raceDateTime: new Date("2026-10-30T13:00:00Z"), courseCountry: "GB",
    raceName: "Handicap Chase", raceClass: "Class 4", raceType: "Chase", raceTypeCode: null, distance: "2m", distanceYards: 3520,
    going: "Soft", surface: "Turf", declaredRunnerCount: 3, actualRunnerCount: null, winningTime: null,
    runners: [runner("a", 100), runner("b", 150), runner("c", 120)] };
}
function capture(race = card(), at = now) {
  const current = buildJumpTissueRace({ raceDate: "2026-10-30", course: "Test", race, recordedAt: at, model: currentModel, commentsByHorse: new Map() })!;
  const contexts = new Map(race.runners.map((r, i) => [r.horseId, { priorChaseStarts: [0, 2, 3][i]!, latestCompletion: i === 1 ? "non_completion" as const : "completed" as const }]));
  return { current, shadow: buildChaseShadow(current, race, contexts, model, at)! };
}
function result(statuses: Array<[number | null, string | null]> = [[1, "finished"], [null, "pulled_up"], [2, "finished"]]): TodayRace {
  const race = card();
  return { ...race, actualRunnerCount: statuses.filter(([, s]) => s !== "non_runner").length, winningTime: "4m", runners: race.runners.map((r, i) => ({ ...r, finishingPosition: statuses[i]![0], resultStatus: statuses[i]![1] })) };
}
function settled() {
  return settleChaseShadow(captureChaseShadow(emptyChaseShadow(), [capture().shadow]), new Map([["race", result()]]), new Date("2026-10-30T14:00:00Z"));
}
test("exact report artifact loads; missing, changed and rechecksummed coefficients fail", async () => {
  assert.equal(model.checksum, CHASE_SHADOW_HASH);
  assert.equal(model.set, "A");
  const dir = await mkdtemp(join(tmpdir(), "chase-shadow-"));
  try {
    await assert.rejects(loadChaseShadowModel(join(dir, "missing")), /exact frozen/);
    const changed = JSON.parse(await readFile(CHASE_SHADOW_MODEL_PATH, "utf8"));
    changed.model.weights[0] += .00001;
    const { checksum: ignored, ...content } = changed;
    void ignored;
    changed.checksum = createHash("sha256").update(JSON.stringify(content)).digest("hex");
    const path = join(dir, "changed.json"); await writeFile(path, JSON.stringify(changed));
    await assert.rejects(loadChaseShadowModel(path), /exact frozen/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("prospective capture scores frozen inputs; Current coexists unchanged and prices cannot affect scoring", () => {
  const { current, shadow } = capture(), before = structuredClone(current);
  assert.deepEqual(shadow.current, current);
  assert.deepEqual(shadow.runners.map(r => r.probability), raceSoftmax(current.runners.map(r => score(model.model, r.modelInputs!))));
  assert.deepEqual(current, before);
  assert.equal(shadow.runners[0]!.price?.decimal, 7);
  assert.equal(shadow.runners[0]!.reliability?.level, "HIGH");
  const race = card(); race.runners.forEach(r => { r.bookmakerQuotes = []; r.forecastDecimalOdds = 200; });
  const withoutPrice = capture(race).shadow;
  assert.equal(withoutPrice.runners[0]!.price, null);
  assert.deepEqual(withoutPrice.runners.map(r => r.probability), shadow.runners.map(r => r.probability));
});
test("no historical capture/backfill, stale capture, after-off, result-present or wrong subtype", () => {
  const { current } = capture();
  assert.equal(buildChaseShadow({ ...current, recordedAt: "2026-10-29T06:00:00Z" }, card(), new Map(), model, now), null);
  assert.equal(buildChaseShadow(current, card(), new Map(), model, new Date(now.getTime() + 60_001)), null);
  assert.equal(buildChaseShadow(current, card(), new Map(), model, new Date("2026-10-30T14:00:00Z")), null);
  assert.equal(buildChaseShadow(current, result(), new Map(), model, now), null);
  assert.equal(buildChaseShadow({ ...current, subtype: "Hurdle" }, card(), new Map(), model, now), null);
  const data = captureChaseShadow(emptyChaseShadow(), [capture().shadow]);
  assert.equal(captureChaseShadow(data, [{ ...capture().shadow, runners: [] }]), data);
});
test("canonical settlement counts PU as loss and uses frozen prices without revising probabilities", () => {
  const data = settled(), book = data.races[0]!;
  assert.equal(book.current.runners[1]!.outcome?.won, false);
  assert.deepEqual(book.runners, capture().shadow.runners);
  const s = summarizeChaseShadow(data);
  assert.equal(s.current.settled, 3); assert.equal(s.shadow.settled, 3);
  assert.equal(s.shadow.winners, 1); assert.equal(s.shadow.priceN, 3);
  assert.equal(s.shadow.profit, 4);
  assert.equal(s.shadow.expected, 1);
  assert.equal(s.shadow.calibration.reduce((n, b) => n + b.runners, 0), 3);
  assert.equal(s.completion.find(r => r.label === "non_completion")!.shadow.settled, 1);
  assert.equal(s.newChasers.find(r => r.label === "0")!.shadow.winners, 1);
});
test("NR excludes stakes and expectations; dead heats split canonical captured-price returns", () => {
  const data = captureChaseShadow(emptyChaseShadow(), [capture().shadow]);
  const nr = summarizeChaseShadow(settleChaseShadow(data, new Map([["race", result([[1, "finished"], [null, "non_runner"], [2, "finished"]])]])));
  assert.equal(nr.shadow.settled, 2); assert.equal(nr.shadow.priceN, 2); assert.equal(nr.shadow.profit, 5);
  const dh = summarizeChaseShadow(settleChaseShadow(data, new Map([["race", result([[1, "finished"], [1, "finished"], [null, "fell"]])]])));
  assert.equal(dh.shadow.winners, 2); assert.equal(dh.shadow.profit, 5);
  assert.equal(dh.shadow.logLoss, -(Math.log(capture().shadow.runners[0]!.probability!) + Math.log(capture().shadow.runners[1]!.probability!)) / 2);
});
test("disagreement and agreement use identical settled races and distinct rank-one selections", () => {
  const data = settled(), book = data.races[0]!, leader = book.runners.find(r => r.rank === 1)!;
  book.current.top1 = book.current.runners.find(r => r.runnerId !== leader.runnerId)!.runnerId;
  book.current.runners.forEach(r => { r.rank = r.runnerId === book.current.top1 ? 1 : r.runnerId === leader.runnerId ? 2 : 3; });
  const s = summarizeChaseShadow(data);
  assert.equal(s.disagreement[0]!.races, 1); assert.equal(s.disagreement[1]!.races, 0);
  assert.equal(s.disagreement[0]!.current.top1.settled, 1); assert.equal(s.disagreement[0]!.shadow.top1.settled, 1);
  book.current.top1 = leader.runnerId;
  assert.equal(summarizeChaseShadow(data).disagreement[1]!.races, 1);
});
test("pending and changed fields cannot enter the settled comparison", () => {
  const data = captureChaseShadow(emptyChaseShadow(), [capture().shadow]);
  const pending = settleChaseShadow(data, new Map([["race", card()]]));
  assert.equal(summarizeChaseShadow(pending).settledRaces, 0);
  const changed = result(); changed.runners.push({ ...runner("d", 130), finishingPosition: 3, resultStatus: "finished" }); changed.actualRunnerCount = 4;
  const s = summarizeChaseShadow(settleChaseShadow(data, new Map([["race", changed]])));
  assert.equal(s.excludedRaces, 1); assert.equal(s.settledRaces, 0);
});
test("fixed Chase experience and pre-capture completion groups exclude future results and NR", () => {
  assert.deepEqual([0, 1, 2, 3, 20, null].map(chaseExperienceGroup), ["0", "1–2", "1–2", "3+", "3+", "unavailable"]);
  const prior = (date: string, status: string, pos: number | null, type = "Chase") => ({ horseId: "h", raceDateTime: new Date(date), raceName: null, raceType: type, raceTypeCode: null, finishingPosition: pos, resultStatus: status });
  const history = [prior("2026-10-29", "pulled_up", null), prior("2026-10-28", "finished", 2), prior("2026-10-30T09:00:00Z", "finished", 1), prior("2026-10-29T12:00:00Z", "non_runner", null)];
  assert.deepEqual(classifyChaseContext(history, now), { priorChaseStarts: 2, latestCompletion: "non_completion" });
  assert.equal(classifyChaseContext([prior("2026-10-29", "finished", 2, "Hurdle")], now).priorChaseStarts, 0);
  assert.equal(classifyChaseContext([], now).latestCompletion, "unavailable");
  assert.equal(classifyChaseContext([prior("2026-10-29", "other", null)], now).latestCompletion, "unavailable");
  assert.equal(classifyChaseContext([prior("2026-10-29", "disqualified", null)], now).latestCompletion, "unavailable");
});
test("unavailable features retain coverage records and never enter paired metrics", () => {
  const { current } = capture(); current.runners[0]!.modelInputs = null;
  const shadow = buildChaseShadow(current, card(), new Map(), model, now)!;
  assert.equal(shadow.coverage, "unavailable");
  const s = summarizeChaseShadow(captureChaseShadow(emptyChaseShadow(), [shadow]));
  assert.equal(s.unavailableRaces, 1); assert.equal(s.pairedRaces, 0); assert.equal(s.shadow.logLoss, null);
});
test("fixed calibration bands retain exact boundaries without fitting", () => {
  const data = settled(), race = data.races[0]!;
  race.runners.forEach((r, i) => { r.probability = [.1, .15, .75][i]!; });
  const s = summarizeChaseShadow(data);
  assert.deepEqual(s.shadow.calibration.map(b => b.runners), [0, 1, 1, 0, 1]);
  assert.equal(s.shadow.calibration[1]!.winners, 1);
  assert.equal(s.shadow.calibration[1]!.actualModel, 10);
  assert.ok(Math.abs(s.shadow.calibrationError! - .6) < 1e-12);
  assert.equal(s.shadow.logLoss, -Math.log(.1));
});
test("checkpoint membership freezes at threshold and cannot be displaced by late results", () => {
  const template = settled().races[0]!;
  const data = emptyChaseShadow();
  data.races = Array.from({ length: 50 }, (_, i) => ({ ...structuredClone(template), raceId: `r${i}`, current: { ...structuredClone(template.current), raceId: `r${i}` } }));
  const at50 = settleChaseShadow(data, new Map());
  assert.equal(at50.checkpoints.length, 1); assert.equal(at50.checkpoints[0]!.raceIds.length, 50);
  const extra = structuredClone(template); extra.raceId = "late"; extra.current.settledAt = "2026-10-30T13:01:00Z";
  const later = settleChaseShadow({ ...at50, races: [...at50.races, extra] }, new Map());
  assert.deepEqual(later.checkpoints, at50.checkpoints);
  assert.equal(summarizeChaseShadow(later).checkpoints[0]!.shadow.races, 50);
});
test("atomic ledger persists first capture and settlement side-by-side", async () => {
  const dir = await mkdtemp(join(tmpdir(), "chase-ledger-")), path = join(dir, "ledger.json");
  try {
    await Promise.all([mutateChaseShadow(d => captureChaseShadow(d, [capture().shadow]), path), mutateChaseShadow(d => captureChaseShadow(d, [capture().shadow]), path)]);
    assert.equal((await loadChaseShadow(path)).races.length, 1);
    await mutateChaseShadow(d => settleChaseShadow(d, new Map([["race", result()]])), path);
    assert.equal((await loadChaseShadow(path)).races[0]!.current.runners[1]!.outcome?.won, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("dashboard renders shadow-only labels, weakness views, price counts and empty states", () => {
  const html = renderToStaticMarkup(<ChaseShadowPanel summary={summarizeChaseShadow(settled())} />);
  for (const text of ["SHADOW ONLY", "NOT USED FOR TODAY RANKINGS", "CURRENT JUMP_TISSUE_V1", "Disagreement", "Agreement", "prior Chase starts", "non-completion", "Price n", "200", "No backfill"]) assert.ok(html.includes(text), text);
  assert.ok(renderToStaticMarkup(<ChaseShadowPanel summary={summarizeChaseShadow(emptyChaseShadow())} />).includes("—"));
});
test("shadow integration supplies display-only badges to Today and never changes Value", async () => {
  const today = await readFile("src/app/racing/today/page.tsx", "utf8");
  assert.match(today, /loadChaseShadow\(\)\.catch/);
  assert.doesNotMatch(today, /buildChaseShadow|raceSoftmax|score\(/);
  const sync = await readFile("src/lib/racing/jump-tissue-sync.ts", "utf8");
  assert.match(sync, /buildChaseShadow\(book, race/);
  assert.match(sync, /return updateJumpTissueForward\(updated/);
  assert.doesNotMatch(await readFile("src/lib/racing/tissue-value-config.ts", "utf8"), /CHASE_SHADOW/);
});

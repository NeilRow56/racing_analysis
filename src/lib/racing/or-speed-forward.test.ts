import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { calculateHorseMetricsAsOf } from "./horse-metrics";
import type { TodayMeeting, TodayRace, TodayRunner } from "./todays-racing";
import { appendOrSpeed, buildOrSpeedObservations, emptyOrSpeed, loadOrSpeed, mutateOrSpeed, OR_SPEED_EPOCH, pendingOrSpeedRaceIds, settleOrSpeed, summarizeOrSpeed } from "./or-speed-forward";
import { workflowSteps } from "../../../scripts/run-research-workflow";
import { main } from "../../../scripts/track-or-speed-forward";
const date = "2026-10-22", now = new Date(`${date}T08:00:00Z`), after = new Date(`${date}T18:00:00Z`);
function runner(id: string, or = 80, speed: number | null = 90): TodayRunner {
  return { runnerId: id, runnerSourceId: id, horseId: `horse-${id}`, horseName: `Horse ${id}`, saddleclothNumber: 1,
    horseAge: 5, horseSex: null, weight: null, weightCarriedLbs: 140, draw: null, jockeyName: null, trainerId: null,
    trainerName: null, officialRating: or, odds: null, oddsDecimal: null, resultStatus: null, finishingPosition: null,
    metrics: { ...calculateHorseMetricsAsOf({ runs: [], beforeDateTime: now }), bestTurfSpeedLast3: speed, bestAwSpeedLast3: speed } };
}
function race(family = "TURF"): TodayRace {
  return { raceId: family, sourceId: "sl", scheduledTime: "14:00", raceDateTime: new Date(`${date}T14:00:00Z`), courseCountry: "GB",
    raceName: family === "HURDLE" ? "Novices Hurdle" : family === "CHASE" ? "Handicap Chase" : "Handicap Stakes",
    raceClass: "4", raceType: family === "HURDLE" ? "hurdle" : family === "CHASE" ? "chase" : "flat", raceTypeCode: null,
    distance: "1m", distanceYards: 1760, going: family === "AW" ? "Standard" : "Good",
    surface: family === "AW" ? "AllWeather" : family === "TURF" ? "Turf" : null,
    declaredRunnerCount: 3, actualRunnerCount: null, winningTime: null,
    runners: [runner("a", 80, 95.02536010898659), runner("b", 80, 90), runner("c", 90, null)] };
}
function build(r = race(), time = now, raceDate = date) {
  const meetings: TodayMeeting[] = [{ courseId: "course", courseSourceId: "test", courseName: "Test Course", country: "GB", order: 1, races: [r] }];
  return buildOrSpeedObservations({ meetings, raceDate, capturedAt: time });
}
function captured(r = race()) { return appendOrSpeed(emptyOrSpeed(), build(r)); }
function result(r = race()): TodayRace {
  return { ...r, actualRunnerCount: 3, winningTime: "1m 40s", runners: r.runners.map((row, i) => ({ ...row, finishingPosition: i + 1, resultStatus: "finished" })) };
}
function settled(res = result(), data = captured()) { return settleOrSpeed(data, new Map([[res.raceId, res]]), after); }
for (const family of ["TURF", "AW"]) test(`${family}: capture freezes exact inputs, group, OR context and provenance without prices`, () => {
  const r = race(family), rows = build(r), row = rows[0];
  assert.equal(rows.length, 1); assert.equal(row.runnerId, "a"); assert.equal(row.family, family);
  assert.equal(row.officialRating, 80); assert.equal(row.bestL3Speed, r.runners[0].metrics!.bestTurfSpeedLast3);
  assert.equal(row.speedEdge, 95.02536010898659 - 90); assert.equal(row.displayedSpeedEdge, "5.03");
  assert.equal(row.orRank, 2); assert.equal(row.top3Or, true); assert.equal(row.sharesTopOr, false);
  assert.equal(row.sameOrGroupSize, 2); assert.equal(row.nextHighestBestL3, 90); assert.equal(row.edgeAtLeast10, false);
  assert.equal(row.displayTier, "OR-relevant / Top-3"); assert.equal(row.speedVersion, family === "AW" ? "aw_speed_v1" : "turf_speed_v2");
  assert.equal(row.handicap, "handicap"); assert.equal(row.raceClass, "4"); assert.equal(row.declaredFieldSize, 3);
});
for (const family of ["HURDLE", "CHASE"]) test(`${family}: no Speed observations`, () => assert.deepEqual(build(race(family)), []));
test("no comparator, missing/invalid family Speed, non-leaders and tied leaders do not qualify", () => {
  for (const change of [
    (r: TodayRace) => { r.runners[1].officialRating = 79; },
    (r: TodayRace) => { r.runners[1].metrics!.bestTurfSpeedLast3 = null; },
    (r: TodayRace) => { r.runners[0].metrics!.bestTurfSpeedLast3 = NaN; },
    (r: TodayRace) => { r.runners[0].officialRating = Infinity; },
    (r: TodayRace) => { r.runners[0].metrics!.bestTurfSpeedLast3 = 90; },
  ]) { const r = race(); change(r); assert.deepEqual(build(r), []); }
  const aw = race("AW"); aw.runners.forEach(r => { r.metrics!.bestAwSpeedLast3 = null; }); assert.deepEqual(build(aw), []);
  assert.deepEqual(build().map(r => r.runnerId), ["a"]);
});
test("OR rank 4+, exact >=10 boundary, top OR ties and displayed NR cohort", () => {
  for (const speed of [99.999999, 100, 110]) {
    const r = race(); r.runners[0].metrics!.bestTurfSpeedLast3 = speed;
    r.runners.push(runner("d", 95, null), runner("e", 95, null)); r.declaredRunnerCount = 5;
    const row = build(r)[0]; assert.equal(row.orRank, 4); assert.equal(row.top3Or, false);
    assert.equal(row.displayTier, "restrained"); assert.equal(row.edgeAtLeast10, speed >= 100);
  }
  const r = race(); r.runners[2].officialRating = 80; r.runners[1].resultStatus = "non_runner";
  const row = build(r)[0]; assert.equal(row.orRank, 1); assert.equal(row.sharesTopOr, true); assert.equal(row.sameOrGroupSize, 2);
});
test("no historical backfill, no completed/started races, epoch and complete-field guards", () => {
  assert.deepEqual(build(race(), new Date(new Date(OR_SPEED_EPOCH).valueOf() - 1)), []);
  assert.deepEqual(build(race(), after), []); assert.deepEqual(build(race(), now, "2026-10-21"), []);
  for (const change of [
    (r: TodayRace) => { r.raceDateTime = new Date("2026-10-20T14:00:00Z"); },
    (r: TodayRace) => { r.raceDateTime = null; },
    (r: TodayRace) => { r.winningTime = "1m"; },
    (r: TodayRace) => { r.runners[0].finishingPosition = 1; },
    (r: TodayRace) => { r.runners[0].resultStatus = "pulled_up"; },
    (r: TodayRace) => { r.declaredRunnerCount = 4; },
    (r: TodayRace) => { r.runners[1].runnerId = "a"; },
  ]) { const r = race(); change(r); assert.deepEqual(build(r), []); }
});
test("repeated capture and later refresh cannot duplicate or rewrite frozen values", () => {
  const r = race(), data = captured(r), before = JSON.stringify(data);
  r.runners[0].officialRating = 70; r.runners[1].officialRating = 70; r.runners[0].metrics!.bestTurfSpeedLast3 = 120;
  assert.equal(appendOrSpeed(data, build(r)), data); assert.equal(JSON.stringify(data), before);
  assert.equal(appendOrSpeed(emptyOrSpeed(), [...build(), ...build()]).observations.length, 1);
});
test("settlement records winners, normalized finish, Top-3 and dead-heat credit; inputs stay frozen", () => {
  const data = captured(), res = result(); res.runners[1].finishingPosition = 1;
  const next = settled(res, data), row = next.observations[0], outcome = row.outcome!;
  assert.equal(outcome.status, "settled"); assert.equal(outcome.starter, true); assert.equal(outcome.winner, true);
  assert.equal(outcome.deadHeatDivisor, 2); assert.equal(outcome.winnerCredit, .5); assert.equal(outcome.normalizedFinish, 0); assert.equal(outcome.top3, true);
  assert.deepEqual({ ...row, outcome: null }, data.observations[0]); assert.deepEqual(pendingOrSpeedRaceIds(next), []);
  assert.equal(settled(res, next), next);
});
test("started non-finishers remain settled losers ranked last; NR and void excluded", () => {
  for (const status of ["pulled_up", "fell", "unseated", "refused"]) {
    const res = result(); res.runners[0].finishingPosition = null; res.runners[0].resultStatus = status; res.runners[1].finishingPosition = 1;
    const out = settled(res).observations[0].outcome!;
    assert.equal(out.status, "settled"); assert.equal(out.winner, false); assert.equal(out.top3, false);
    assert.equal(out.normalizedFinish, 1); assert.equal(out.finishRank, 3);
  }
  for (const status of ["non_runner", "race_void"]) {
    const res = result(); res.runners[0].resultStatus = status; res.runners[0].finishingPosition = null;
    const data = settled(res), out = data.observations[0].outcome!;
    assert.equal(out.status, status === "non_runner" ? "NR" : "void"); assert.equal(out.normalizedFinish, null);
    assert.equal(summarizeOrSpeed(data)[0].settled, 0);
  }
});
test("incomplete or invalid results remain pending", () => {
  for (const change of [
    (r: TodayRace) => { r.runners[0].finishingPosition = null; r.runners[0].resultStatus = "finished"; },
    (r: TodayRace) => { r.runners[0].finishingPosition = 99; },
    (r: TodayRace) => { r.actualRunnerCount = 4; },
    (r: TodayRace) => { r.runners.pop(); },
  ]) { const res = result(); change(res); assert.equal(settled(res).observations[0].outcome, null); }
});
test("settlement-only cannot create observations; morning alone captures; summary is read-only", async () => {
  assert.equal(settleOrSpeed(emptyOrSpeed(), new Map([["TURF", result()]]), after).observations.length, 0);
  for (const mode of ["night", "late", "live", "after"] as const) assert.ok(!workflowSteps(mode, date).some(s => s.script === "or-speed:capture"));
  assert.equal(workflowSteps("morning", date)[1].script, "or-speed:capture");
  const source = readFileSync("scripts/settle-research-results.ts", "utf8");
  assert.ok(source.includes("pendingOrSpeedRaceIds")); assert.ok(source.includes("settleOrSpeed")); assert.ok(!source.includes("buildOrSpeedObservations"));
  await assert.rejects(main(["results", date]), /Usage/);
});
test("summary separates families/cohorts, uses settled starters and labels sample sizes", () => {
  assert.equal(summarizeOrSpeed(emptyOrSpeed()).length, 10);
  const row = settled().observations[0];
  for (const [n, sample] of [[0, "TOO EARLY"], [49, "TOO EARLY"], [50, "EARLY"], [149, "EARLY"], [150, "DEVELOPING"], [299, "DEVELOPING"], [300, "MEANINGFUL"]] as const) {
    const data = { ...emptyOrSpeed(), observations: Array.from({ length: n }, () => row) };
    const summary = summarizeOrSpeed(data); assert.equal(summary[0].sample, sample); assert.equal(summary[0].settled, n);
    assert.equal(summary[0].winPercent, n ? 100 : null); assert.equal(summary[0].top3Percent, n ? 100 : null);
    assert.equal(summary[0].meanNormalizedFinish, n ? 0 : null); assert.equal(summary[2].observations, 0); assert.equal(summary[5].observations, 0);
  }
});
test("JSON persistence serializes concurrent captures without rewriting originals", async () => {
  const directory = await mkdtemp(join(tmpdir(), "or-speed-")), path = join(directory, "tracker.json");
  try {
    assert.deepEqual(await loadOrSpeed(path), emptyOrSpeed());
    await Promise.all(Array.from({ length: 3 }, () => mutateOrSpeed(data => appendOrSpeed(data, build()), path)));
    const data = await loadOrSpeed(path); assert.equal(data.observations.length, 1);
    await mutateOrSpeed(data => settleOrSpeed(data, new Map([["TURF", result()]]), after), path);
    assert.deepEqual((await loadOrSpeed(path)).observations[0], settled().observations[0]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("historical capture command and summary leave the tracker file unchanged", async () => {
  const path = "data/research/or-best-l3-speed-forward-v1.json";
  const before = readFileSync(path, "utf8");
  await main(["capture", "2000-01-01"]);
  await main(["summary"]);
  assert.equal(readFileSync(path, "utf8"), before);
});

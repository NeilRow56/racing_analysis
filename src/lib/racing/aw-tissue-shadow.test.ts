import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAwTissueRace, settleAwTissueRace } from "./aw-tissue-forward";
import { loadAwTissueModel, predictAwTissue } from "./aw-tissue-model";
import { AW_SHADOW_CHECKSUM, AW_SHADOW_IMPLEMENTED_AT, loadAwShadowModel, shadowInputs, shadowProbabilities, type AwShadowExtras } from "./aw-tissue-shadow-model";
import { captureAwShadow, cleanShadowValue, emptyAwShadow, loadAwShadowForward, mutateAwShadow, updateAwShadow } from "./aw-tissue-shadow-forward";
import { renderAwShadowReport, summarizeAwShadow } from "./aw-tissue-shadow-report";
import { FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION, type ForwardValuePriceSnapshot, type ForwardValueRecord } from "./forward-value";
import type { HorseMetricsAsOf } from "./horse-metrics";
import type { TodayRace, TodayRunner } from "./todays-racing";

const v1 = await loadAwTissueModel(), candidate = await loadAwShadowModel();
const now = new Date(AW_SHADOW_IMPLEMENTED_AT), off = new Date(now.getTime() + 4 * 60 * 60_000);
const starts = new Map([["a", 3], ["b", 0]]);
function runner(id: string, speed: number | null): TodayRunner {
  return { runnerId: id, runnerSourceId: id, horseId: id, horseName: id, saddleclothNumber: null,
    horseAge: 4, horseSex: null, weight: null, weightCarriedLbs: 130, draw: 1,
    jockeyName: "J", trainerId: null, trainerName: "T", officialRating: 70,
    odds: "4/1", oddsDecimal: "5", forecastOdds: null, forecastDecimalOdds: null,
    resultStatus: null, finishingPosition: null,
    trainerMetrics: { trainerPriorRuns: 100, trainerPriorWins: 10, trainerPriorWinRate: 10 },
    jockeyMetrics: { jockeyPriorRuns: 100, jockeyPriorWins: 10, jockeyPriorWinRate: 10 },
    metrics: { averageAwSpeedLast3: speed, latestAwSpeedRating: speed, bestAwSpeedLast3: speed,
      averageAwPerformanceLast3: speed === null ? null : speed - 40, latestAwPerformanceRating: speed === null ? null : speed - 40, daysSinceLastRun: 14 } as HorseMetricsAsOf,
    bookmakerQuotes: [],
  };
}
function race(): TodayRace {
  return { raceId: "race", sourceId: "source", scheduledTime: "08:00", raceDateTime: off, courseCountry: "GB",
    raceName: "Handicap", raceClass: "Class 5", raceType: "Handicap", raceTypeCode: null,
    distance: "1m", distanceYards: 1760, going: "Standard", surface: "ALLWEATHER", declaredRunnerCount: 2,
    actualRunnerCount: 2, winningTime: null, runners: [runner("a", 100), runner("b", null)] };
}
const extra = (): Map<string, AwShadowExtras> => new Map(["a", "b"].map(id => [id, { trainerPriorRuns: 100, jockeyPriorRuns: 100,
  comments: [{ raceId: "prior", raceDateTime: "2026-10-01T12:00:00.000Z", comment: id === "a" ? "weakened" : "ran on" }] }]));
function fixture() {
  const current = race(), source = buildAwTissueRace(current, "Wolverhampton", "2026-10-07", starts, v1, now)!;
  const shadow = captureAwShadow(source, current, extra(), v1, candidate, now)!;
  return { current, source, shadow };
}
function price(capturedAt = new Date(now.getTime() + 60_000).toISOString()): ForwardValuePriceSnapshot {
  return { decimalPrice: 10, impliedProbability: .1, capturedAt, minutesBeforeScheduledOff: 239,
    ratingProbability: .4, ratingEdgePercentagePoints: 30, marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION };
}

describe("isolated frozen AW shadow", () => {
  test("pins the exact 39-column AW-R2 artifact and rejects tampering", async () => {
    assert.equal(candidate.checksum, AW_SHADOW_CHECKSUM);
    assert.equal(candidate.model.names.length, 39);
    assert.deepEqual(candidate.model.names.slice(-3), ["prior_comment_count", "last_weakened", "last3_weakened_count"]);
    assert.equal(candidate.model.weights[17], 0.15621209419413112);
    const dir = await mkdtemp(join(tmpdir(), "aw-shadow-model-"));
    try {
      const artifact = JSON.parse(await readFile("data/research/aw-tissue-parity-shadow-model-v1.json", "utf8"));
      artifact.model.weights[0] += 1;
      const path = join(dir, "model.json"); await writeFile(path, JSON.stringify(artifact));
      await assert.rejects(loadAwShadowModel(path), /Invalid frozen/);
    } finally { await rm(dir, { recursive: true }); }
  });
  test("uses exactly the latest three nonempty prior comments and frozen missingness", () => {
    const base = Array<number | null>(16).fill(null);
    const inputs = shadowInputs(base, { trainerPriorRuns: 0, jockeyPriorRuns: 0, comments: [
      { raceId: "target", raceDateTime: "2026-10-01T00:00:00Z", comment: "weakened" },
      { raceId: "future", raceDateTime: off.toISOString(), comment: "weakened" },
      { raceId: "not_observed", raceDateTime: new Date(now.getTime() + 1).toISOString(), comment: "weakened" },
      { raceId: "empty", raceDateTime: "2026-10-06T00:00:00Z", comment: " " },
      ...[5, 4, 3, 2].map(day => ({ raceId: `${day}`, raceDateTime: `2026-10-0${day}T00:00:00Z`, comment: day === 4 ? "ran on" : "weakened" })),
    ] }, "target", off.toISOString(), now.toISOString());
    assert.deepEqual(inputs.slice(-3), [3, 1, 2]);
    assert.deepEqual(inputs.slice(16, 18), [0, 0]);
    assert.deepEqual(inputs.slice(18, 34), Array(16).fill(1));
    const p = shadowProbabilities([inputs, inputs], candidate); assert.deepEqual(p, [.5, .5]);
  });
  test("market changes cannot affect either probability and shadow never mutates V1", async () => {
    const { current, source, shadow } = fixture();
    const before = JSON.stringify(source), productionBefore = predictAwTissue(current, starts, v1);
    current.runners.forEach(r => { r.odds = "999/1"; r.oddsDecimal = "1000"; r.forecastDecimalOdds = 300;
      r.bookmakerQuotes = [{ bookmakerId: 1, bookmakerName: "Changed", decimalOdds: 1000, fractionalOdds: "999/1" }]; });
    const after = captureAwShadow(source, current, extra(), v1, candidate, now)!;
    assert.deepEqual(after.runners.map(r => r.candidateProbability), shadow.runners.map(r => r.candidateProbability));
    assert.deepEqual(predictAwTissue(current, starts, v1), productionBefore);
    assert.equal(JSON.stringify(source), before);
    assert.deepEqual(shadow.runners.map(r => r.v1Probability), source.runners.map(r => r.probability));
    for (const path of ["src/lib/racing/aw-tissue-model.ts", "src/lib/racing/aw-tissue-sync.ts", "src/lib/racing/aw-tissue-forward.ts", "src/lib/racing/forward-value.ts"]) {
      assert.ok(!(await readFile(path, "utf8")).includes("aw-tissue-shadow"));
    }
  });
  test("rejects post-off, result evidence, changed fields, unavailable extras and mismatched base inputs", () => {
    const { current, source } = fixture();
    assert.equal(captureAwShadow(source, current, extra(), v1, candidate, off), null);
    assert.equal(captureAwShadow(source, current, new Map(), v1, candidate, now), null);
    current.runners[0]!.officialRating = 71;
    assert.equal(captureAwShadow(source, current, extra(), v1, candidate, now), null);
    current.runners[0]!.officialRating = 70; current.runners[0]!.finishingPosition = 1;
    assert.equal(captureAwShadow(source, current, extra(), v1, candidate, now), null);
    current.runners[0]!.finishingPosition = null; current.runners[1]!.resultStatus = "non_runner";
    assert.equal(captureAwShadow(source, current, extra(), v1, candidate, now), null);
  });
  test("copies existing frozen prices only after prediction, never captures new prices or overwrites snapshots", () => {
    const { source, shadow } = fixture();
    source.prices.early = price(new Date(now.getTime() - 1).toISOString());
    assert.equal(updateAwShadow(shadow, source, []).runners.some(r => r.prices.early), false);
    source.prices.early = price();
    const updated = updateAwShadow(shadow, source, []);
    assert.equal(updated.runners.filter(r => r.prices.early).length, 1);
    source.prices.early = { ...price(), decimalPrice: 20, impliedProbability: .05 };
    const twice = updateAwShadow(updated, source, []);
    assert.equal(twice.runners.find(r => r.runnerId === source.top1)!.prices.early!.snapshot.decimalPrice, 10);
    assert.ok(twice.runners.find(r => r.runnerId !== source.top1)!.prices.early === undefined);
  });
  test("only clean prospective Forward Value snapshots can price a different candidate leader", () => {
    const { shadow } = fixture();
    const fv = { family: "aw", raceId: shadow.raceId, raceDateTime: shadow.scheduledOffAt,
      recordedPreRace: true, captureMode: "live_sync", recordedAt: shadow.capturedAt,
      priceCapturedAt: price().capturedAt, calibratedProbability: .2, capturedDecimalOdds: 10,
      leaderRunnerId: "b", leaderResultStatus: null, settledAt: null, earlyPriceSnapshot: price(),
    } as ForwardValueRecord;
    assert.equal(updateAwShadow(shadow, undefined, [fv]).runners[1]!.prices.early!.snapshot.decimalPrice, 10);
    fv.captureMode = "retrospective_or_imported";
    assert.equal(updateAwShadow(shadow, undefined, [fv]).runners[1]!.prices.early, undefined);
    fv.captureMode = "live_sync"; fv.earlyPriceSnapshot = { ...price(), impliedProbability: NaN };
    assert.equal(updateAwShadow(shadow, undefined, [fv]).runners[1]!.prices.early, undefined);
  });
  test("canonical nonfinishers lose, non-runners void/exclude and dead heats use the divisor", () => {
    const { current, source, shadow } = fixture();
    source.prices.early = price();
    current.runners[0]!.resultStatus = "finished"; current.runners[0]!.finishingPosition = 1;
    current.runners[1]!.resultStatus = "pulled_up";
    const settled = settleAwTissueRace(source, current, off);
    const updated = updateAwShadow(shadow, settled, []), a = updated.runners[0]!;
    a.prices.early ??= { source: "aw_tissue", snapshot: price() };
    assert.equal(cleanShadowValue(updated, a, "early", a.v1Probability)!.profit, 9);
    const b = updated.runners[1]!; b.prices.early = { source: "aw_tissue", snapshot: price() };
    assert.equal(cleanShadowValue(updated, b, "early", b.candidateProbability)!.profit, -1);
    b.outcome = { ...b.outcome!, resultStatus: "non_runner", won: null };
    assert.equal(cleanShadowValue(updated, b, "early", b.v1Probability), null);
    assert.equal(summarizeAwShadow({ ...emptyAwShadow(), races: [updated] }).metrics[0]!.races, 0);
    b.outcome = { ...a.outcome!, won: true, deadHeatDivisor: 2 }; a.outcome!.deadHeatDivisor = 2;
    updated.winners = ["a", "b"];
    assert.equal(cleanShadowValue(updated, a, "early", a.candidateProbability)!.profit, 4.5);
    assert.equal(summarizeAwShadow({ ...emptyAwShadow(), races: [updated] }).metrics[0]!.logLoss, 0);
  });
  test("separates retrospective rows, reports leader changes and cumulative fixed edge bands", () => {
    const { source, shadow } = fixture(); source.prices.early = price();
    const updated = updateAwShadow(shadow, source, []);
    const originalLeader = updated.runners.find(r => r.v1Rank === 1)!;
    originalLeader.candidateRank = 2; updated.runners.find(r => r !== originalLeader)!.candidateRank = 1;
    const retrospective = { ...structuredClone(updated), raceId: "old", captureMode: "retrospective_or_imported" as const };
    const data = { ...emptyAwShadow(), races: [updated, retrospective] }, report = summarizeAwShadow(data);
    assert.equal(report.prospectiveRaces, 1); assert.equal(report.retrospectiveRaces, 1); assert.equal(report.changedTop1.length, 1);
    assert.equal(report.value.find(v => v.stage === "early" && v.model === "candidate" && v.population === "own_rank1")!.pricedCoverage, 0);
    assert.deepEqual(report.value.filter(v => v.stage === "early" && v.model === "v1" && v.population === "all_priced_runners").map(v => v.band), [">0pp", ">=2.5pp", ">=5pp", ">=7.5pp", ">=10pp"]);
    assert.match(renderAwShadowReport(data), /No optimum threshold/);
  });
  test("independent tracker writes are atomic and preserve captured observations under concurrency", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aw-shadow-forward-")), path = join(dir, "shadow.json");
    try {
      const { shadow } = fixture();
      await Promise.all(["one", "two"].map(raceId => mutateAwShadow(data => ({ ...data, races: [...data.races, { ...shadow, raceId }] }), path)));
      assert.equal((await loadAwShadowForward(path)).races.length, 2);
    } finally { await rm(dir, { recursive: true }); }
  });
});

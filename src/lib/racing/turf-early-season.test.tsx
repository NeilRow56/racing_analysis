import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { appendEarlyTurf, initializeEarlyTurf, loadEarlyTurf, mutateEarlyTurf, matchingEarlyTurfCapture } from "./turf-early-season";
import { classifyEarlyTurf, earlyTurfDate, earlyTurfDiagnostics, earlyTurfMarket, seasonalTurfEvidence, type TurfEvidenceRun } from "./turf-early-season-method";
import { summarizeEarlyTurf, earlyTurfOutcome } from "./turf-early-season-metrics";
import { loadTissueGenerationModels, predictTissueGeneration } from "./tissue-generation-model";
import { emptyTissueGeneration, settleTissueGeneration, validGenerationCapture, type GenerationRace } from "./tissue-generation-forward";
import type { TodayRace } from "./todays-racing";
import { EarlyTurfMonitor } from "../../app/racing/research/forward-value/turf-early-season-monitor";
import { EarlyTurfLabel, TurfEarlySeasonLabel } from "../../app/racing/today/turf-early-season-label";
import { loadEarlyTurfInputs } from "./turf-early-season-inputs";

const model = (await loadTissueGenerationModels()).TURF;
const at = "2027-03-01T10:00:00.000Z", now = new Date(at), off = "2027-03-01T14:00:00.000Z";
function book(date = "2027-03-01"): GenerationRace {
  const rows = ["a", "b", "c"].map((runnerId, i) => ({ runnerId, modelInputs: model.baseModel.names.map((n, j) => n.endsWith("_missing") ? 0 : n === "official_rating" ? 80 : n === "best_l3_turf_speed" ? 100 - i * 10 : model.baseModel.means[j]) }));
  const predictions = predictTissueGeneration(model, { family: "TURF", raceId: "race", capturedAt: at, featureNames: model.baseModel.names, runners: rows });
  return { family: "TURF", raceId: `race-${date}`, raceDate: date, course: "York", modelVersion: model.version, modelHash: model.checksum,
    capturedAt: `${date}T10:00:00.000Z`, featureCutoffAt: `${date}T09:59:59.000Z`, scheduledOff: `${date}T14:00:00.000Z`, featureNames: [...model.baseModel.names],
    adjustmentFeatureNames: [...model.adjustment.names], completeMarket: true, marketSource: "sporting_life_median_bookmaker_at_capture_v1",
    runners: predictions.map((p, i) => ({ ...p, horseId: p.runnerId, horseName: p.runnerId, modelInputs: rows[i].modelInputs, capturedPrice: i + 2,
      quotes: [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: null, decimalOdds: i + 2 }], outcome: null })) };
}
function inputs(b = book(), runs: TurfEvidenceRun[] = []) { return new Map(b.runners.map(r => [r.runnerId, { cutoff: b.featureCutoffAt, runs }])); }
function run(date: string, speed: number | null = 100, completed = true): TurfEvidenceRun {
  return { runnerId: date, raceId: date, at: `${date}T12:00:00.000Z`, date, turf: true, completed, officialRating: 80, speed, productionSpeed: speed, performance: speed === null ? null : speed - 20, timed: true };
}
async function state() {
  const dir = await mkdtemp(join(tmpdir(), "early-turf-")), path = join(dir, "monitor.json");
  const data = await initializeEarlyTurf(path, new Date("2026-11-10T10:00:00.000Z"));
  return { dir, path, data };
}
function settled(b: GenerationRace, positions: (number | null)[], statuses = positions.map(() => "finished")) {
  const race = { raceId: b.raceId, actualRunnerCount: statuses.filter(s => s !== "non_runner" && s !== "void").length,
    runners: b.runners.map((r, i) => ({ runnerId: r.runnerId, finishingPosition: positions[i], resultStatus: statuses[i] })) } as TodayRace;
  return settleTissueGeneration({ ...emptyTissueGeneration(), races: [b] }, new Map([[b.raceId, race]]), new Date(Date.parse(b.scheduledOff) + 1));
}

test("armed with zero observations and pending epoch; exclusive initialization", async () => {
  const { dir, path, data } = await state();
  try { assert.equal(data.epoch, null); assert.equal(data.observations.length, 0); assert.deepEqual(await loadEarlyTurf(path), data); await assert.rejects(initializeEarlyTurf(path)); }
  finally { await rm(dir, { recursive: true }); }
});
test("first genuine 2027 capture sets exact epoch; no history, stale, post-off, future or duplicate additions", async () => {
  const { dir, data } = await state();
  try {
    const b = book(), snapshot = structuredClone(b);
    assert.ok(validGenerationCapture(b));
    const next = appendEarlyTurf(data, [b], inputs(), model, now);
    assert.equal(next.epoch, at); assert.equal(next.observations.length, 1); assert.deepEqual(b, snapshot);
    assert.equal(appendEarlyTurf(next, [b], inputs(), model, now).observations.length, 1);
    for (const date of ["2024-03-01", "2025-05-01", "2026-07-31", "2027-02-28", "2027-08-01", "2028-03-01"]) {
      const old = book(date); assert.equal(appendEarlyTurf(data, [old], inputs(old), model, new Date(old.capturedAt)).epoch, null);
    }
    for (const t of [Date.parse(at) - 1, Date.parse(at) + 60001, Date.parse(off)]) assert.equal(appendEarlyTurf(data, [b], inputs(), model, new Date(t)).epoch, null);
    const withResult = structuredClone(b); withResult.runners[0].outcome = settled(b, [1, 2, 3]).races[0].runners[0].outcome;
    assert.equal(appendEarlyTurf(data, [withResult], inputs(), model, now).epoch, null);
    assert.throws(() => appendEarlyTurf(data, [b], new Map(), model, now), /history/);
    assert.ok(earlyTurfDate("2027-07-31"));
  } finally { await rm(dir, { recursive: true }); }
});
test("exact historical form-depth boundaries; both completed count and seasonal speed required", () => {
  const low = seasonalTurfEvidence([]), established = seasonalTurfEvidence([run("2027-01-01"), run("2027-02-01")]);
  for (const [n, expected] of [[0, "VERY LOW"], [1, "LIMITED"], [2, "MIXED"], [3, "ESTABLISHED"], [4, "ESTABLISHED"]] as const)
    assert.equal(classifyEarlyTurf(Array.from({ length: 4 }, (_, i) => i < n ? established : low)), expected);
  assert.equal(classifyEarlyTurf([seasonalTurfEvidence([run("2027-01-01", null), run("2027-02-01", null)])]), "VERY LOW");
  assert.equal(classifyEarlyTurf([seasonalTurfEvidence([run("2027-01-01"), run("2027-02-01", 90, false)])]), "VERY LOW");
  assert.throws(() => classifyEarlyTurf([]));
});
test("eight seasonal flags, latest available vs last-three window, prior partition, frozen attribution and same-OR gap", async () => {
  const b = book(), hs = [run("2027-02-01", null), run("2027-01-20", null), run("2027-01-10", null), run("2027-01-01"), run("2026-07-01"), run("2027-03-02")];
  const d = earlyTurfDiagnostics(b, inputs(b, hs), model);
  assert.equal(d[0].current.starts, 4); assert.equal(d[0].prior.starts, 1); assert.equal(d[0].current.latestSpeed, 100); assert.equal(d[0].current.bestL3Speed, null);
  assert.equal(d[0].evidence, "MEDIUM"); assert.equal(d[0].currentMissingCount, 3); assert.equal(d[0].current.sameOrAvailable, false);
  const rich = earlyTurfDiagnostics(b, inputs(b, [run("2027-01-01"), run("2027-02-01")]), model);
  assert.equal(rich[0].evidence, "HIGH CURRENT-SEASON EVIDENCE"); assert.ok(rich.every(r => r.current.sameOrAvailable));
  const noForm = earlyTurfDiagnostics(b, inputs(), model); assert.equal(noForm[0].evidence, "LOW");
  for (const r of rich) assert.ok(Math.abs(r.score - r.split.current - r.split.prior - r.split.residual) < 1e-10);
  const { dir, data } = await state();
  try {
    const o = appendEarlyTurf(data, [b], inputs(), model, now).observations[0];
    const t1 = o.diagnostics.find(r => r.rank === 1)!, t2 = o.diagnostics.find(r => r.rank === 2)!;
    assert.ok(Math.abs(o.sameOrGapShare! - (t1.sameOrContribution - t2.sameOrContribution) / (t1.score - t2.score)) < 1e-10);
  } finally { await rm(dir, { recursive: true }); }
});
test("market complete/incomplete, normalization, deterministic ties and no price replacement", () => {
  const b = book(), market = earlyTurfMarket(b);
  assert.equal(market.status, "COMPLETE"); assert.equal(market.favourite, "a"); assert.equal(market.secondFavourite, "b");
  assert.ok(Math.abs(market.runners.reduce((s, r) => s + r.probability, 0) - 1) < 1e-12);
  for (const price of [null, 0, 1, NaN, Infinity]) {
    const bad = structuredClone(b); bad.runners[1].capturedPrice = price;
    const m = earlyTurfMarket(bad); assert.equal(m.status, "MARKET INCOMPLETE / UNAVAILABLE"); assert.equal(m.runners.length, 0); assert.equal(m.favourite, null);
  }
  b.runners.forEach(r => { r.capturedPrice = 3; }); assert.equal(earlyTurfMarket(b).secondFavourite, "b");
});
test("canonical settlement, NR excluded without replacement, dead heats, void and pending", async () => {
  const { dir, data } = await state();
  try {
    const b = book(), first = b.runners.find(r => r.rank === 1)!, next = appendEarlyTurf(data, [b], inputs(), model, now);
    const nrIndex = b.runners.indexOf(first), positions = b.runners.map((_, i) => i === nrIndex ? null : 1), statuses = b.runners.map((_, i) => i === nrIndex ? "non_runner" : "finished");
    const result = settled(b, positions, statuses), summary = summarizeEarlyTurf(next, result), row = summary.rows[0];
    assert.equal(row.settled, 1); assert.equal(row.v4.selections[0].eligible, 0); assert.equal(row.v4.selections[0].winners, 0);
    assert.equal(summary.headToHead.length, 1); assert.equal(summary.headToHead[0].v4WinnerRanks.length, 2);
    assert.ok(row.v4.logLoss! > 0); assert.ok(row.v4.brier! >= 0); assert.ok(row.v4.calibrationECE !== null);
    assert.ok(row.v4.meanWinnerRank !== null); assert.equal(row.v4.calibration.reduce((s, b) => s + b.actual, 0), 1);
    assert.equal(earlyTurfOutcome(settled(b, [null, null, null], ["void", "void", "void"]).races[0]), "void");
    assert.equal(earlyTurfOutcome(b), "pending");
    assert.ok(matchingEarlyTurfCapture(next.observations[0], result.races));
    const changed = structuredClone(b); changed.runners[0].capturedPrice = 99; assert.equal(matchingEarlyTurfCapture(next.observations[0], [changed]), undefined);
  } finally { await rm(dir, { recursive: true }); }
});
test("monthly summaries, paired coverage, missing-market V4 retained, unavailable references and UI labels", async () => {
  const { dir, data } = await state();
  try {
    const a = book(), b = book("2027-04-01"); b.completeMarket = false; b.runners.forEach(r => { r.capturedPrice = null; r.quotes = []; });
    let next = appendEarlyTurf(data, [a], inputs(a), model, now); next = appendEarlyTurf(next, [b], inputs(b), model, new Date(b.capturedAt));
    const generation = { ...emptyTissueGeneration(), races: [...settled(a, [1, 2, 3]).races, ...settled(b, [2, 1, 3]).races] };
    const s = summarizeEarlyTurf(next, generation); assert.equal(s.rows[0].races, 2); assert.equal(s.rows[0].v4.settled, 2);
    assert.equal(s.rows[0].market.settled, 1); assert.equal(s.rows[0].pairedV4.settled, 1); assert.equal(s.rows[0].marketCoverage, .5);
    assert.equal(s.monthly.length, 25); assert.equal(s.monthly.find(r => r.month === "2027-04" && r.cohort === "VERY LOW")!.races, 1);
    assert.equal(s.rows[4].races, 2); assert.equal(summarizeEarlyTurf(next, emptyTissueGeneration()).unavailable.length, 2);
    const html = renderToStaticMarkup(<EarlyTurfMonitor data={next} generation={generation} />);
    for (const text of ["2027 EARLY-SEASON TURF", "VERY LOW + LIMITED", "Monthly breakdown", "2027-07", "Difference", "Market coverage"]) assert.ok(html.includes(text));
    for (const classification of ["VERY LOW", "LIMITED", "MIXED", "ESTABLISHED"] as const) assert.ok(renderToStaticMarkup(<EarlyTurfLabel observation={{ ...next.observations[0], classification }} />).includes(`EARLY TURF — ${classification}`));
    assert.equal(await TurfEarlySeasonLabel({ race: { raceDateTime: new Date("2026-11-10"), raceId: "old" } as TodayRace }), null);
  } finally { await rm(dir, { recursive: true }); }
});
test("atomic ledger refuses rewritten metadata/observations; changed methodology and retrospective additions rejected", async () => {
  const { dir, path, data } = await state();
  try {
    await assert.rejects(mutateEarlyTurf(d => ({ ...d, armedAt: at }), path), /rewrite/);
    await assert.rejects(mutateEarlyTurf(d => appendEarlyTurf(d, [book()], inputs(), model, now), path), /retrospective/);
    assert.equal((await loadEarlyTurf(path))!.epoch, null);
    assert.equal((await loadEarlyTurf(path))!.observations.length, 0);
    // A future-dated fixture cannot enter the real writer, even if its pure capture logic passes.
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), data);
    const frozen = appendEarlyTurf(data, [book()], inputs(), model, now);
    await writeFile(path, JSON.stringify(frozen));
    for (const edit of [
      (d: typeof frozen) => { d.observations[0].classification = "MIXED"; },
      (d: typeof frozen) => { d.observations[0].market.runners[0].price = 100; },
      (d: typeof frozen) => { d.observations[0].diagnostics[0].trainer = 100; },
      (d: typeof frozen) => { d.observations = []; d.epoch = null; },
      (d: typeof frozen) => { d.epoch = null; },
    ]) await assert.rejects(mutateEarlyTurf(d => { edit(d); return d; }, path), /rewrite/);
    assert.deepEqual(await loadEarlyTurf(path), frozen);
    frozen.sourceHashes["changed"] = "0".repeat(64);
    await writeFile(path, JSON.stringify(frozen));
    await assert.rejects(mutateEarlyTurf(d => d, path), /methodology changed/);

  } finally { await rm(dir, { recursive: true }); }
});
test("outside-window history adapter performs no database reads", async () => {
  const noConnection = new Proxy({}, { get() { throw new Error("Database accessed outside window"); } }) as Parameters<typeof loadEarlyTurfInputs>[0];
  assert.equal((await loadEarlyTurfInputs(noConnection, [], new Date("2026-11-10T10:00:00Z"))).size, 0);
});

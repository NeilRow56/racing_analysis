import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderToStaticMarkup } from "react-dom/server";
import { RankOneMonitoring } from "@/app/racing/research/forward-value/rank-one-monitoring";
import { ResearchPageLayout } from "@/app/racing/research/forward-value/research-page-layout";
import { calculateHorseMetricsAsOf } from "./horse-metrics";
import { loadFrozenTissueModel, TISSUE_V2_CONFIG, buildTissueForwardRace } from "./tissue-forward";
import { loadJumpTissueModel, predictJumpTissue } from "./jump-tissue-model";
import { loadAwTissueModel, predictAwTissue } from "./aw-tissue-model";
import { workflowSteps } from "../../../scripts/run-research-workflow";
import { capComparison } from "../../../scripts/diagnose-rank-one-price-cap";
import type { TodayMeeting, TodayRace, TodayRunner } from "./todays-racing";
import { appendRankOne, buildRankOneObservations, currentRankOne, emptyRankOne, isWithinRankOneCap, loadRankOne, mutateRankOne, RANK_ONE_CAPS, RANK_ONE_EPOCH, RANK_ONE_SOURCES, runRankOneCycle, settleRankOne, summarizeRankOne, type RankOneFamily, type RankOneModels } from "./rank-one-forward";
const date = "2026-10-17", now = new Date(`${date}T08:00:00Z`), after = new Date(`${date}T18:00:00Z`);
const models: RankOneModels = { turf: await loadFrozenTissueModel(TISSUE_V2_CONFIG.modelPath, TISSUE_V2_CONFIG.modelVersion), jump: await loadJumpTissueModel(), aw: await loadAwTissueModel(), comments: new Map(), awStarts: new Map([["a", 0], ["b", 0], ["c", 0]]) };
function runner(id: string, price: number): TodayRunner {
  return { runnerId: id, runnerSourceId: id, horseId: `horse-${id}`, horseName: `Horse ${id}`, saddleclothNumber: 1, horseAge: 5, horseSex: null, weight: null, weightCarriedLbs: 140, draw: null, jockeyName: null, trainerId: null, trainerName: null, officialRating: 80,
    odds: "1/100", oddsDecimal: "1.01", forecastOdds: "1/100", forecastDecimalOdds: 1.01, bookmakerQuotes: [{ bookmakerId: 1, bookmakerName: "Real Bookmaker", fractionalOdds: null, decimalOdds: price }], resultStatus: null, finishingPosition: null,
    metrics: calculateHorseMetricsAsOf({ runs: [], beforeDateTime: new Date(`${date}T14:00:00Z`) }) };
}
function race(family: RankOneFamily = "HURDLE"): TodayRace { return { raceId: family, sourceId: "sl", scheduledTime: "14:00", raceDateTime: new Date(`${date}T14:00:00Z`), courseCountry: "GB", raceName: family === "HURDLE" ? "Novices Hurdle" : family === "CHASE" ? "Handicap Chase" : "Handicap Stakes", raceClass: "4", raceType: family === "HURDLE" ? "hurdle" : family === "CHASE" ? "chase" : "flat", raceTypeCode: null, distance: "2m", distanceYards: 3520, going: family === "AW" ? "Standard" : "Good", surface: family === "AW" ? "AllWeather" : family === "TURF" ? "Turf" : null, declaredRunnerCount: 3, actualRunnerCount: 3, winningTime: null, runners: [runner("a", 2), runner("b", 4), runner("c", 8)] }; }
function meetings(races: TodayRace[]): TodayMeeting[] { return [{ courseId: "course", courseSourceId: "sl-course", courseName: "Test Course", country: "GB", order: 1, races }]; }
function observations(r = race(), m = models, time = now) { return buildRankOneObservations({ meetings: meetings([r]), raceDate: date, capturedAt: time, models: m }); }
function captured(r = race()) { return appendRankOne(emptyRankOne(), observations(r)); }
function result(r = race(), winnerId = captured(r).observations[0]!.runnerId): TodayRace { let position = 2; return { ...r, winningTime: "4m", runners: r.runners.map(runner => ({ ...runner, oddsDecimal: null, resultStatus: "finished", finishingPosition: runner.runnerId === winnerId ? 1 : position++ })) }; }
function settle(r = race(), res = result(r)) { return settleRankOne(captured(r), new Map([[r.raceId, res]]), after); }
test("all four rank sources match existing production Tissue predictions", () => {
  for (const family of ["TURF", "HURDLE", "CHASE", "AW"] as const) {
    const r = race(family);
    const selected = currentRankOne(r, "Test Course", date, models, now)!;
    const ranks = family === "TURF" ? buildTissueForwardRace({ race: r, course: "Test Course", raceDate: date, model: models.turf, commentsByHorse: models.comments, recordedAt: now, config: TISSUE_V2_CONFIG })!.runners.map(r => ({ runnerId: r.runnerId, rank: r.tissueRank })) : family === "AW" ? predictAwTissue(r, models.awStarts, models.aw).runners : predictJumpTissue(r, models.comments, models.jump).runners;
    assert.equal(selected.family, family);
    assert.equal(selected.runnerId, ranks.filter(r => r.rank === 1).sort((a, b) => a.runnerId.localeCompare(b.runnerId))[0]!.runnerId);
    const row = observations(r)[0]!;
    assert.equal(row.rank, 1);
    assert.equal(row.rankSource, RANK_ONE_SOURCES[family]);
    assert.equal(row.modelHash, selected.modelHash);
  }
});
test("Turf exact rank-1 ties select one stable ID", () => { const m = { ...models, turf: { ...models.turf, model: { ...models.turf.model, weights: models.turf.model.weights.map(() => 0) } } }; const r = race("TURF"); r.runners.reverse(); assert.equal(observations(r, m).length, 1); assert.equal(observations(r, m)[0]!.runnerId, "a"); });
test("first valid median, normalized full-field probability and market rank frozen", () => {
  const r = race();
  const leader = currentRankOne(r, "Test Course", date, models, now)!;
  const runner = r.runners.find(r => r.runnerId === leader.runnerId)!;
  runner.bookmakerQuotes!.push({ bookmakerId: 2, bookmakerName: "Other", fractionalOdds: null, decimalOdds: runner.bookmakerQuotes![0]!.decimalOdds + 2 });
  const data = captured(r), row = data.observations[0]!;
  const p = row.market.medianBookmakerDecimal;
  assert.equal(p, runner.bookmakerQuotes![0]!.decimalOdds + 1);
  assert.equal(row.market.quotes.length, 2);
  assert.equal(row.firstCapturedAt, now.toISOString());
  assert.ok(Math.abs(row.market.normalizedProbability - (1 / p) / row.market.fieldPrices.reduce((s, p) => s + 1 / p.decimalPrice, 0)) < 1e-12);
  const changed = { ...row, runnerId: "changed-leader", firstCapturedAt: new Date(now.getTime() + 60000).toISOString(), market: { ...row.market, medianBookmakerDecimal: 99 } };
  assert.equal(appendRankOne(data, [row, changed]), data);
  assert.deepEqual(data.observations, [row]);
});
test("one race/family/version per batch and repeated sync idempotent", () => { const rows = observations(); const data = appendRankOne(emptyRankOne(), [...rows, ...rows]); assert.equal(data.observations.length, 1); assert.equal(appendRankOne(data, rows), data); });
test("no forecast fallback or partially priced field; invalid and stale quotes do not qualify", () => { for (const price of [NaN, Infinity, 1, 0]) {
  const r = race();
  r.runners[0]!.bookmakerQuotes![0]!.decimalOdds = price;
  assert.deepEqual(observations(r), []);
} const r = race(); r.runners[1]!.bookmakerQuotes = []; assert.deepEqual(observations(r), []); });
test("no retrospective, post-off, result-bearing, duplicate or incomplete field capture", () => {
  assert.deepEqual(observations(race(), models, new Date(RANK_ONE_EPOCH).getTime() > now.getTime() ? new Date(RANK_ONE_EPOCH) : new Date("2026-10-15T08:00:00Z")), []);
  assert.deepEqual(observations(race(), models, after), []);
  assert.deepEqual(observations(result()), []);
  const r = race();
  r.actualRunnerCount = 5;
  assert.deepEqual(observations(r), []);
  r.actualRunnerCount = 3;
  r.runners[1]!.runnerId = r.runners[0]!.runnerId;
  assert.deepEqual(observations(r), []);
});
test("21 and 26 boundaries inclusive; above-cap raw observation retained", () => {
  for (const cap of [21, 26] as const) {
    assert.equal(isWithinRankOneCap(cap, cap), true);
    assert.equal(isWithinRankOneCap(cap + 0.01, cap), false);
    const row = observations()[0]!;
    const above = { ...row, cap, withinCap: false, market: { ...row.market, medianBookmakerDecimal: cap + 1 } };
    const data = appendRankOne(emptyRankOne(), [above]);
    assert.equal(data.observations.length, 1);
    assert.equal(summarizeRankOne(data).find(s => s.family === row.family)!.withinCap.tracked, 0);
  }
  assert.equal(isWithinRankOneCap(999, null), true);
  assert.deepEqual(Object.values(RANK_ONE_CAPS), [null, null, null, null]);
});
test("morning captures; live/after never invoke capture even with completed historic results", async () => {
  let calls = 0;
  const input = { data: emptyRankOne(), raceDate: date, now, loadCapture: async () => { calls++; return { meetings: meetings([race()]), models }; }, loadResults: async () => new Map<string, TodayRace>() };
  const morning = await runRankOneCycle({ ...input, mode: "morning" });
  assert.equal(morning.observations.length, 1);
  assert.equal(calls, 1);
  for (const mode of ["live", "after"] as const) {
    const data = await runRankOneCycle({ ...input, mode });
    assert.equal(data.observations.length, 0);
  }
  assert.equal(calls, 1);
  await runRankOneCycle({ ...input, mode: "morning", raceDate: "2025-01-01" });
  assert.equal(calls, 1);
  for (const mode of ["morning", "live", "after"] as const) {
    const steps = workflowSteps(mode, date);
    assert.equal(steps.some(s => s.script === "rank-one:sync"), mode === "morning");
    assert.equal(steps.some(s => s.script === "rank-one:results"), mode !== "morning");
  }
});
test("canonical frozen-price winner settlement ignores missing SP and freezes outcome", () => {
  const r = race();
  const data = settle(r);
  const row = data.observations[0]!;
  assert.equal(row.outcome?.status, "settled");
  assert.equal(row.outcome?.grossReturn, row.market.medianBookmakerDecimal);
  assert.equal(row.outcome?.profitLoss, row.market.medianBookmakerDecimal - 1);
  assert.equal(settleRankOne(data, new Map([[r.raceId, result(r, "nobody")]]), after), data);
});
test("non-finisher loss, NR and void handling; incomplete results remain pending", () => {
  const r = race();
  const leader = captured(r).observations[0]!.runnerId;
  for (const status of ["pulled_up", "non_runner", "void"]) {
    const res = result(r);
    res.runners = res.runners.map((x, i) => ({ ...x, finishingPosition: x.runnerId === leader ? null : i + 1, resultStatus: x.runnerId === leader ? status : "finished" }));
    // Supply a distinct canonical winner for the started-loss case.
    const other = res.runners.find(x => x.runnerId !== leader)!;
    other.finishingPosition = 1;
    const row = settle(r, res).observations[0]!;
    assert.equal(row.outcome?.status, status === "non_runner" ? "NR" : status === "void" ? "void" : "settled");
    assert.equal(row.outcome?.profitLoss, status === "pulled_up" ? -1 : null);
  }
  const incomplete = result(r);
  incomplete.runners[1]!.resultStatus = null;
  incomplete.runners[1]!.finishingPosition = null;
  assert.equal(settle(r, incomplete).observations[0]!.outcome, null);
});
test("dead heats follow canonical settlement divisor", () => { const r = race(); const res = result(r); res.runners.forEach(x => { x.finishingPosition = 1; }); const row = settle(r, res).observations[0]!; assert.equal(row.outcome?.deadHeatDivisor, 3); assert.equal(row.outcome?.grossReturn, 1 + (row.market.medianBookmakerDecimal - 1) / 3); });
test("family summaries separate settled, pending, void and returns", () => {
  const all = ["TURF", "HURDLE", "CHASE", "AW"] as const;
  const data = appendRankOne(emptyRankOne(), all.flatMap(f => observations(race(f))));
  const settled = settleRankOne(data, new Map(all.map(f => [f, result(race(f))])), after);
  for (const s of summarizeRankOne(settled)) {
    assert.equal(s.tracked, 1);
    assert.equal(s.settled, 1);
    assert.equal(s.winners, 1);
    assert.equal(s.strikeRate, 1);
    assert.ok(s.ae! > 1);
    assert.equal(s.pricedSettled, 1);
  }
});
test("atomic persistence freezes first capture across concurrent writers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rank-one-test-"));
  const path = join(dir, "tracker.json");
  try {
    await Promise.all([mutateRankOne(d => appendRankOne(d, observations()), path), mutateRankOne(d => appendRankOne(d, observations()), path)]);
    const data = await loadRankOne(path);
    assert.equal(data.observations.length, 1);
    const before = await readFile(path, "utf8");
    await mutateRankOne(d => appendRankOne(d, observations()), path);
    assert.equal(await readFile(path, "utf8"), before);
  }
  finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("secondary hierarchy preserved; four compact cards and no VALUE edge", () => {
  const content = <RankOneMonitoring data={captured()} date={date}/>;
  const html = renderToStaticMarkup(<ResearchPageLayout date={date} active={<p>Active</p>} secondary={content}><p>Legacy</p></ResearchPageLayout>);
  assert.ok(html.indexOf('id="secondary-monitoring"') < html.indexOf('id="rank-one-monitoring-heading"'));
  assert.ok(html.indexOf('id="rank-one-monitoring-heading"') < html.indexOf('id="archived-research"'));
  assert.doesNotMatch(html.match(/<details id="secondary-monitoring"[^>]*>/)![0], /\bopen\b/);
  const monitor = renderToStaticMarkup(content);
  for (const family of ["TURF", "HURDLE", "CHASE", "AW"])
    assert.ok(monitor.includes(`${family} RANK 1`));
  for (const text of ["Historical profitability has not been established", "No price cap currently applied.", "Rank source", "Market rank", "Pending"])
    assert.ok(monitor.includes(text));
  assert.doesNotMatch(monitor, /VALUE|edge/i);
});
test("historical fixed-cutoff metrics retain boundaries and removed-cohort outcomes", () => {
  const rows = [21, 21.01, 26, 26.01].map((sp, i) => ({ family: "HURDLE" as const, year: "2025", raceId: String(i), runnerId: String(i), horseName: "Horse", raceDate: "2025-01-01", sp, won: i === 2, probability: 0.1, rank: 1, spProfit: i === 2 ? 25 : -1, qualifyingPrice: null, qualifyingProfit: null }));
  const lower = capComparison(rows, 21), higher = capComparison(rows, 26);
  assert.equal(lower.selections, 1);
  assert.equal(lower.removed.selections, 3);
  assert.equal(lower.removed.winners, 1);
  assert.equal(higher.selections, 3);
  assert.equal(higher.removed.selections, 1);
  assert.equal(higher.winners, 1);
  assert.equal(higher.profitLoss, 23);
  assert.equal(higher.medianPrice, 21.01);
});

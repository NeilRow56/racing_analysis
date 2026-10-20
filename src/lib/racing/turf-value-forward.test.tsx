import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderToStaticMarkup } from "react-dom/server";
import { buildTissueForwardRace, loadFrozenTissueModel, TISSUE_V3_CONFIG } from "./tissue-forward";
import { calculateHorseMetricsAsOf } from "./horse-metrics";
import { appendTurfValue, buildTurfValueRaces, emptyTurfValue, loadTurfValue, mutateTurfValue, settleTurfValue, TURF_VALUE_EPOCH, TURF_VALUE_VERSION, VALUE_FEATURE_NAMES, type TurfValueRace } from "./turf-value-forward";
import { calculateValueMetrics, sortValueRunners, summarizeValueBands, summarizeValueRunners, valueCompetitionRanks, valueMarketRankBand, valueRatioBand, VALUE_MARKET_RANK_BANDS, VALUE_RATIO_BANDS } from "./tissue-value-metrics";
import type { TodayMeeting, TodayRace, TodayRunner } from "./todays-racing";
import { TissueValueMonitoring } from "../../app/racing/research/forward-value/tissue-value-monitoring";
import { buildRankOneObservations, type RankOneModels } from "./rank-one-forward";
import { loadJumpTissueModel } from "./jump-tissue-model";
import { loadAwTissueModel } from "./aw-tissue-model";
import { workflowSteps } from "../../../scripts/run-research-workflow";

const date = "2026-10-21", now = new Date(`${date}T08:00:00Z`), off = new Date(`${date}T14:00:00Z`), after = new Date(`${date}T18:00:00Z`);
const model = await loadFrozenTissueModel(TISSUE_V3_CONFIG.modelPath, TISSUE_V3_CONFIG.modelVersion);
const commentsByHorse = new Map();
function runner(id: string, price: number): TodayRunner {
  return { runnerId: id, runnerSourceId: id, horseId: `horse-${id}`, horseName: `Horse ${id}`, saddleclothNumber: 1, horseAge: 5, horseSex: null,
    weight: null, weightCarriedLbs: 140, draw: null, jockeyName: null, trainerId: null, trainerName: null, officialRating: 80,
    odds: "1/100", oddsDecimal: "1.01", forecastOdds: "1/100", forecastDecimalOdds: 1.01,
    bookmakerQuotes: [{ bookmakerId: null, bookmakerName: "Bookmaker", fractionalOdds: null, decimalOdds: price }],
    resultStatus: null, finishingPosition: null, metrics: calculateHorseMetricsAsOf({ runs: [], beforeDateTime: off }) };
}
function race(): TodayRace {
  return { turfTissueHistoryAsOf: now.toISOString(), raceId: "race", sourceId: "source", scheduledTime: "14:00", raceDateTime: off,
    courseCountry: "GB", raceName: "Turf Handicap", raceClass: "4", raceType: "flat", raceTypeCode: "FLAT", distance: "1m", distanceYards: 1760,
    going: "Good", surface: "Turf", declaredRunnerCount: 3, actualRunnerCount: null, winningTime: null,
    runners: [runner("a", 2), runner("b", 4), runner("c", 8)] };
}
function meetings(r: TodayRace): TodayMeeting[] { return [{ courseId: "course", courseSourceId: "course", courseName: "Course", country: "GB", order: 1, races: [r] }]; }
function capture(r = race(), at = now) { return buildTurfValueRaces({ meetings: meetings(r), raceDate: date, capturedAt: at, model, commentsByHorse }); }
function captured(r = race()) { return appendTurfValue(emptyTurfValue(), capture(r)); }
function result(r = race()): TodayRace { return { ...r, actualRunnerCount: 3, winningTime: "1m 40s", runners: r.runners.map((row, i) => ({ ...row, oddsDecimal: "99", resultStatus: "finished", finishingPosition: i + 1 })) }; }
function frozen(book: TurfValueRace) { return { ...book, runners: book.runners.map(row => ({ ...row, outcome: null })) }; }
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test("captures all eligible runners with exact canonical v3 probabilities and feature lineage", () => {
  const r = race(), books = capture(r); assert.equal(books.length, 1);
  const book = books[0], canonical = buildTissueForwardRace({ race: r, course: "Course", raceDate: date, model, commentsByHorse, recordedAt: now, config: TISSUE_V3_CONFIG })!;
  assert.equal(book.version, TURF_VALUE_VERSION); assert.equal(book.family, "TURF"); assert.equal(book.modelVersion, "tissue_model_v3");
  assert.equal(book.modelChecksum, model.checksum); assert.equal(book.featureCutoffAt, now.toISOString()); assert.equal(book.capturedAt, now.toISOString());
  assert.deepEqual(book.featureNames, VALUE_FEATURE_NAMES); assert.equal(book.runners.length, 3);
  assert.deepEqual(book.runners.map(r => [r.runnerId, r.probability, r.tissueRank, r.modelInputs]), canonical.runners.map(r => [r.runnerId, r.probability, r.tissueRank, r.modelInputs]));
  assert.equal(book.scheduledOff, off.toISOString()); assert.equal(book.declaredRunnerCount, 3);
});
test("first complete bookmaker medians normalize the whole frozen market", () => {
  const r = race(); r.runners[0].bookmakerQuotes!.push({ bookmakerId: 2, bookmakerName: "Other", fractionalOdds: "3/1", decimalOdds: 4 });
  const book = capture(r)[0]; assert.equal(book.runners[0].marketPrice, 3); assert.equal(book.runners[0].quotes.length, 2);
  close(book.marketBookSum, 1/3 + 1/4 + 1/8);
  close(book.runners.reduce((s, x) => s + x.marketProbability, 0), 1);
  for (const row of book.runners) close(row.marketProbability, (1 / row.marketPrice) / book.marketBookSum);
  assert.deepEqual(book.runners.map(r => r.marketRank), [1, 2, 3]);
});
test("freezes fair odds, edge, ratio, expected return and all three alternative ranks", () => {
  const rows = capture()[0].runners;
  for (const row of rows) {
    close(row.fairOdds, 1 / row.probability); close(row.probabilityEdge, row.probability - row.marketProbability);
    close(row.modelMarketRatio, row.probability / row.marketProbability); close(row.expectedReturn, row.probability * row.marketPrice - 1);
  }
  assert.deepEqual(rows.map(r => r.valueRank), [3, 2, 1]);
  assert.deepEqual(rows.map(r => r.probabilityEdgeRank), [3, 2, 1]);
  assert.deepEqual(rows.map(r => r.modelMarketRatioRank), [3, 2, 1]);
  assert.deepEqual(rows.map(r => r.tissueRank), [1, 1, 1]);
});
test("value ordering need not agree with most likely winner ordering", () => {
  const values = [{ runnerId: "favourite", p: .6, d: 1.5, q: .7 }, { runnerId: "outsider", p: .4, d: 4, q: .3 }].map(r => ({ ...r, ...calculateValueMetrics(r.p, r.d, r.q) }));
  assert.deepEqual(valueCompetitionRanks(values.map(r => r.p)), [1, 2]);
  assert.deepEqual(valueCompetitionRanks(values.map(r => r.expectedReturn)), [2, 1]);
});
test("ties use exact competition ranks with stable runner-ID display order", () => {
  assert.deepEqual(valueCompetitionRanks([.4, .4, .2]), [1, 1, 3]);
  const r = race(); r.runners.forEach(row => { row.bookmakerQuotes![0].decimalOdds = 4; });
  r.runners.reverse(); const rows = capture(r)[0].runners;
  assert.deepEqual(rows.map(r => [r.tissueRank, r.marketRank, r.valueRank, r.probabilityEdgeRank, r.modelMarketRatioRank]), Array(3).fill([1, 1, 1, 1, 1]));
  for (const by of ["valueRank", "tissueRank", "marketRank"] as const) assert.deepEqual(sortValueRunners(rows, by).map(r => r.runnerId), ["a", "b", "c"]);
  assert.deepEqual(rows.map(r => r.runnerId), ["c", "b", "a"]);
});
test("ratio band boundaries are fixed and half-open", () => {
  assert.deepEqual([.749, .75, .999, 1, 1.249, 1.25, 1.499, 1.5, 1.999, 2, 3].map(valueRatioBand), [VALUE_RATIO_BANDS[0], VALUE_RATIO_BANDS[1], VALUE_RATIO_BANDS[1], VALUE_RATIO_BANDS[2], VALUE_RATIO_BANDS[2], VALUE_RATIO_BANDS[3], VALUE_RATIO_BANDS[3], VALUE_RATIO_BANDS[4], VALUE_RATIO_BANDS[4], VALUE_RATIO_BANDS[5], VALUE_RATIO_BANDS[5]]);
});
test("market-rank groups use the fixed requested boundaries", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 10, 11, 30].map(valueMarketRankBand), ["1", "2", "3", "4–5", "4–5", "6–10", "6–10", "11+", "11+"]);
});
test("no SP or forecast fallback and no partially priced normalized field", () => {
  for (const quotes of [[], [{ bookmakerId: 1, bookmakerName: null, fractionalOdds: null, decimalOdds: NaN }], [{ bookmakerId: 1, bookmakerName: null, fractionalOdds: null, decimalOdds: 1 }]]) {
    const r = race(); r.runners[1].bookmakerQuotes = quotes; assert.deepEqual(capture(r), []);
  }
  const r = race(); r.runners[1].bookmakerQuotes = undefined; assert.deepEqual(capture(r), []);
});
test("missing quotes can later form the first valid complete capture, then price is frozen", () => {
  const r = race(); r.runners[0].bookmakerQuotes = []; const empty = appendTurfValue(emptyTurfValue(), capture(r)); assert.equal(empty.races.length, 0);
  r.runners[0].bookmakerQuotes = [{ bookmakerId: 1, bookmakerName: null, fractionalOdds: null, decimalOdds: 5 }];
  const data = appendTurfValue(empty, capture(r)); assert.equal(data.races[0].runners[0].marketPrice, 5);
  r.runners[0].bookmakerQuotes![0].decimalOdds = 99; assert.equal(appendTurfValue(data, capture(r)), data);
});
test("no pre-epoch, post-off, historical-date, unbounded-history or incomplete capture", () => {
  const r = race(); assert.deepEqual(capture(r, new Date(TURF_VALUE_EPOCH).getTime() > now.getTime() ? new Date(0) : new Date(new Date(TURF_VALUE_EPOCH).getTime() - 1)), []);
  assert.deepEqual(capture(r, off), []); assert.deepEqual(capture(r, after), []);
  assert.deepEqual(buildTurfValueRaces({ meetings: meetings(r), raceDate: "2026-10-19", capturedAt: now, model, commentsByHorse }), []);
  assert.deepEqual(capture({ ...r, turfTissueHistoryAsOf: undefined }), []);
  assert.deepEqual(capture({ ...r, turfTissueHistoryAsOf: new Date(after).toISOString() }), []);
  assert.deepEqual(capture({ ...r, turfTissueHistoryAsOf: "2026-10-19T22:00:00.000Z" }), []);
  assert.deepEqual(capture({ ...r, declaredRunnerCount: 4, actualRunnerCount: 3 }), []);
  assert.deepEqual(capture({ ...r, winningTime: "1m" }), []);
  const wrongOff = { ...r, raceDateTime: new Date("2026-10-22T14:00:00Z") }; assert.deepEqual(capture(wrongOff), []);
});
test("rejects duplicate runners, target results, AW, jumps and legacy models", () => {
  const duplicate = race(); duplicate.runners[1].runnerId = "a"; assert.deepEqual(capture(duplicate), []);
  const finished = race(); finished.runners[0].finishingPosition = 1; assert.deepEqual(capture(finished), []);
  assert.deepEqual(capture({ ...race(), surface: "AllWeather", going: "Standard" }), []);
  assert.deepEqual(capture({ ...race(), raceType: "hurdle", raceTypeCode: "HURDLE", raceName: "Hurdle" }), []);
  assert.throws(() => buildTurfValueRaces({ meetings: meetings(race()), raceDate: date, capturedAt: now, model: { ...model, version: "tissue_model_v2" }, commentsByHorse }), /version mismatch/);
});
test("known pre-capture non-runners are not eligible, later NRs stay frozen", () => {
  const r = race(); r.runners.push({ ...runner("nr", 10), resultStatus: "non_runner" });
  assert.equal(capture(r)[0].runners.length, 3);
});
test("append clones vectors and quotes, prevents repeated capture and rank/price rewrites", () => {
  const rows = capture(), data = appendTurfValue(emptyTurfValue(), [...rows, ...rows]); assert.equal(data.races.length, 1);
  const initial = JSON.stringify(data); rows[0].runners[0].probability = .99; rows[0].runners[0].modelInputs[0] = 999; rows[0].runners[0].quotes[0].decimalOdds = 99;
  assert.equal(JSON.stringify(data), initial); assert.equal(appendTurfValue(data, capture()), data);
  const invalid = capture(); invalid[0].capturedAt = "2026-10-19T08:00:00.000Z"; assert.equal(appendTurfValue(emptyTurfValue(), invalid).races.length, 0);
});
test("canonical captured-price settlement appends only outcomes and is idempotent", () => {
  const data = captured(), snapshots = data.races.map(frozen), settled = settleTurfValue(data, new Map([["race", result()]]), after);
  assert.deepEqual(settled.races.map(frozen), snapshots); assert.equal(data.races[0].runners[0].outcome, null);
  assert.deepEqual(settled.races[0].runners.map(r => r.outcome?.profitLoss), [1, -1, -1]);
  assert.equal(settled.races[0].runners[0].outcome!.grossReturn, 2); assert.equal(settled.races[0].runners[0].outcome!.winner, true);
  assert.equal(settleTurfValue(settled, new Map([["race", result()]]), after), settled);
});
test("partial or inconsistent results remain pending, without SP dependency", () => {
  const data = captured(), r = result(); r.runners[1].finishingPosition = null; r.runners[1].resultStatus = null;
  assert.equal(settleTurfValue(data, new Map([["race", r]]), after), data);
  assert.equal(settleTurfValue(data, new Map([["race", result()]]), now), data);
  const complete = result(); complete.runners.forEach(r => { r.oddsDecimal = null; });
  assert.ok(settleTurfValue(data, new Map([["race", complete]]), after).races[0].runners.every(r => r.outcome));
  assert.equal(settleTurfValue(data, new Map([["race", { ...result(), actualRunnerCount: 99 }]]), after), data);
  assert.equal(settleTurfValue(data, new Map([["race", { ...result(), runners: result().runners.slice(0, 2) }]]), after), data);
});
test("canonical dead-heat division, non-runner exclusion, voids and nonfinishers", () => {
  const data = captured(), dh = result(); dh.runners[1].finishingPosition = 1;
  assert.deepEqual(settleTurfValue(data, new Map([["race", dh]]), after).races[0].runners.map(r => r.outcome!.profitLoss), [.5, 1.5, -1]);
  const nr = result(); nr.runners[2].resultStatus = "non_runner"; nr.runners[2].finishingPosition = null;
  const settled = settleTurfValue(data, new Map([["race", nr]]), after); assert.equal(settled.races[0].runners[2].outcome!.status, "NR");
  const metrics = summarizeValueRunners(settled.races[0].runners); assert.equal(metrics.runners, 2); close(metrics.modelExpected, 2/3); assert.equal(metrics.nonRunners, 1);
  const voided = result(); voided.runners.forEach(r => { r.resultStatus = "abandoned"; r.finishingPosition = null; });
  assert.ok(settleTurfValue(data, new Map([["race", voided]]), after).races[0].runners.every(r => r.outcome!.status === "void"));
  const pulled = result(); pulled.runners[2].resultStatus = "pulled_up"; pulled.runners[2].finishingPosition = null;
  assert.equal(settleTurfValue(data, new Map([["race", pulled]]), after).races[0].runners[2].outcome!.profitLoss, -1);
});
test("fixed band summaries include losers and all runners without selecting any threshold", () => {
  const rows = settleTurfValue(captured(), new Map([["race", result()]]), after).races[0].runners;
  const summaries = summarizeValueBands(rows), total = summarizeValueRunners(rows);
  assert.equal(total.runners, 3); assert.equal(total.winners, 1); close(total.modelExpected, 1); close(total.marketExpected, 1); close(total.roi!, -1/3);
  assert.deepEqual(summaries.ratio.map(r => r.band), [...VALUE_RATIO_BANDS]); assert.deepEqual(summaries.marketRank.map(r => r.band), [...VALUE_MARKET_RANK_BANDS]);
  assert.equal(summaries.ratio.reduce((s, x) => s + x.runners, 0), 3); assert.equal(summaries.marketRank.reduce((s, x) => s + x.winners, 0), 1);
  assert.equal(summarizeValueRunners(capture()[0].runners).runners, 0); assert.equal(summarizeValueRunners([]).actualModelExpected, null);
});
test("atomic persistence refuses capture edits, removals and outcome rewrites", async () => {
  const directory = await mkdtemp(join(tmpdir(), "turf-value-test-")), path = join(directory, "tracker.json");
  try {
    assert.deepEqual(await loadTurfValue(path), emptyTurfValue());
    await mutateTurfValue(data => appendTurfValue(data, capture()), path);
    const original = await readFile(path, "utf8");
    await assert.rejects(mutateTurfValue(data => { data.races[0].runners[0].probability = .5; return data; }, path), /Cannot rewrite/);
    await assert.rejects(mutateTurfValue(data => ({ ...data, races: [] }), path), /Cannot remove/);
    assert.equal(await readFile(path, "utf8"), original);
    await mutateTurfValue(data => settleTurfValue(data, new Map([["race", result()]]), after), path);
    await assert.rejects(mutateTurfValue(data => { data.races[0].runners[0].outcome = null; return data; }, path), /Cannot rewrite/);
    await mutateTurfValue(data => data, path);
    const bad = JSON.parse(await readFile(path, "utf8")); bad.version = "tissue_model_v2"; await writeFile(path, JSON.stringify(bad));
    await assert.rejects(loadTurfValue(path));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("concurrent writes retain all new race books and deduplicate repeated races", async () => {
  const directory = await mkdtemp(join(tmpdir(), "turf-value-lock-")), path = join(directory, "tracker.json");
  try {
    const a = race(), b = race(); b.raceId = "race-2";
    await Promise.all([mutateTurfValue(data => appendTurfValue(data, capture(a)), path), mutateTurfValue(data => appendTurfValue(data, capture(b)), path)]);
    const loaded = await loadTurfValue(path); assert.equal(loaded.races.length, 2);
    await mutateTurfValue(data => appendTurfValue(data, capture(a)), path); assert.equal((await loadTurfValue(path)).races.length, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("existing Rank 1 capture remains identical before and after all-runner capture", async () => {
  const r = race(), models: RankOneModels = { turf: model, jump: await loadJumpTissueModel(), aw: await loadAwTissueModel(), comments: commentsByHorse, awStarts: new Map() };
  const input = { meetings: meetings(r), raceDate: date, capturedAt: now, models };
  const before = buildRankOneObservations(input); captured(r); assert.deepEqual(buildRankOneObservations(input), before);
  assert.equal(before.length, 1); assert.equal(before[0].rank, 1);
});
test("workflow adds independent fresh capture and settlement without changing Rank 1 stages", () => {
  for (const mode of ["morning", "late"] as const) assert.ok(workflowSteps(mode, date).some(s => s.script === "tissue-value:sync"));
  for (const mode of ["live", "after"] as const) {
    const steps = workflowSteps(mode, date); assert.ok(steps.some(s => s.script === "tissue-value:results")); assert.ok(!steps.some(s => s.script === "tissue-value:sync"));
  }
  assert.ok(!workflowSteps("night", date).some(s => s.script.startsWith("tissue-value:")));
  assert.equal(workflowSteps("morning", date).filter(s => s.script === "rank-one:sync").length, 1);
});
test("Research section labels both ranks, exposes sorting and calibration, retains losing disagreements", () => {
  const data = settleTurfValue(captured(), new Map([["race", result()]]), after);
  const html = renderToStaticMarkup(<TissueValueMonitoring data={data} date={date} />);
  for (const label of ["Tissue Value Monitoring", "Tissue rank", "Value rank", "Market rank", "Large model/market disagreement", "Horse a", "Horse b", "Horse c", "Finished 3", "Actual/model expected", "All capture dates", "Probability edge", "Expected return"]) assert.ok(html.includes(label), label);
  assert.ok(!html.includes("Strong bet")); assert.ok(!html.includes("Recommended bet")); assert.ok(!html.includes("modelInputs"));
  const empty = renderToStaticMarkup(<TissueValueMonitoring data={emptyTurfValue()} date={date} />); assert.ok(empty.includes("No prospective Tissue value captures"));
});

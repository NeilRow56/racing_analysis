import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { VALUE_COHORTS, TURF_VALUE_CONFIG, type ValueCohortConfig } from "./tissue-value-config";
import { appendValueForward, buildValueRace, emptyValueForward, loadValueForward, mutateValueForward, settleValueForward, validValueCapture } from "./tissue-value-forward";
import { frozenValueIndex, type DisplayValueRace } from "./tissue-value-view";
import { frozenPriorCareerRuns, summarizeValueRankV2, valueRankOneDecision, VALUE_RANK_EPOCH, VALUE_RANK_VERSION } from "./value-rank-v2";
import { isTissue1Value1Agreement } from "./tissue-value-agreement";
import { buildNonRedTissueDailyList } from "./non-red-tissue-daily-list";
import type { TodayMeeting, TodayRace, TodayRunner } from "./todays-racing";
import { FrozenValueRankCell } from "../../app/racing/today/tissue-cells";
import { ValueRankV2Monitoring } from "../../app/racing/research/forward-value/value-rank-v2-monitoring";
import { TissueValueRaceTables } from "../../app/racing/research/forward-value/tissue-value-race-tables";

const now = new Date(VALUE_RANK_EPOCH), date = VALUE_RANK_EPOCH.slice(0, 10);
function fixture(price = 35, count: number | null = 7, config: ValueCohortConfig = TURF_VALUE_CONFIG, at = now, tie = false) {
  const runner = (runnerId: string, p: number): TodayRunner => ({ runnerId, horseId: runnerId, horseName: runnerId,
    resultStatus: null, finishingPosition: null, bookmakerQuotes: [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: null, decimalOdds: p }],
  }) as TodayRunner;
  const race: TodayRace = {
    raceId: config.family, sourceId: "source", scheduledTime: "14:00", raceDateTime: new Date(`${date}T14:00:00Z`), courseCountry: "GB",
    raceName: config.family === "HURDLE" ? "Handicap Hurdle" : config.family === "CHASE" ? "Handicap Chase" : "Handicap Stakes",
    raceType: config.family === "HURDLE" ? "hurdle" : config.family === "CHASE" ? "chase" : "flat", raceTypeCode: null,
    raceClass: "4", distance: "2m", distanceYards: 3520, going: config.family === "AW" ? "Standard" : "Good",
    surface: config.family === "AW" ? "ALLWEATHER" : config.family === "TURF" ? "Turf" : null,
    declaredRunnerCount: 2, actualRunnerCount: null, winningTime: null, runners: [runner("leader", price), runner("second", tie ? price : 2)],
  };
  const names = config.featureNames;
  const feature = config.family === "HURDLE" || config.family === "CHASE" ? "log_prior_jump_starts" : "log_prior_runs";
  const inputs = Array<number>(names.length).fill(0);
  inputs[names.indexOf(feature)] = Math.log1p(count ?? 0);
  inputs[names.indexOf(`${feature}_missing`)] = count === null ? 1 : 0;
  const book = buildValueRace({ config, race, course: "Test course", raceDate: date, capturedAt: at, book: {
    modelVersion: config.modelVersion, modelChecksum: "a".repeat(64), scorerVersion: config.scorerVersion,
    featureSchemaVersion: config.featureSchemaVersion, featureNames: names, featureCutoffAt: at.toISOString(),
    runners: race.runners.map((r, i) => ({ runnerId: r.runnerId, probability: tie ? .5 : i === 0 ? .8 : .2, tissueRank: tie && config.tissueTies === "competition" ? 1 : i + 1, modelInputs: [...inputs] })),
  } });
  assert.ok(book, `Expected valid ${config.family} capture`);
  return { book, race, config };
}
function display(book: ReturnType<typeof fixture>["book"]) {
  return frozenValueIndex([{ ...emptyValueForward(VALUE_COHORTS.find(c => c.family === book.family)!), races: [book] }]);
}

for (const [label, price, count, retained, reason] of [
  ["A", 20.99, 15, true, null], ["B", 21, 4, false, "PRIOR_RUNS_0_4"],
  ["C", 21, 5, true, null], ["D", 35, 9, true, null], ["E", 35, 10, false, "PRIOR_RUNS_10_PLUS"],
  ["F", 50.99, 7, true, null], ["G", 51, 20, true, null], ["H", 30, null, false, "PRIOR_RUNS_MISSING"],
] as const) test(`${label}: frozen price ${price}, prior runs ${count} -> ${retained ? "retained" : "no Value 1"}`, () => {
  const { book } = fixture(price, count);
  assert.equal(book.valueRankPolicy!.version, VALUE_RANK_VERSION);
  assert.equal(book.valueRankPolicy!.epoch, VALUE_RANK_EPOCH);
  assert.deepEqual(book.valueRankPolicy!.legacyRankOne, [{ runnerId: "leader", priorCareerRuns: count, retained, rejectionReason: reason }]);
  assert.equal(display(book).get(`${book.raceId}|leader`)!.activeValue1, retained);
});

test("all families use the frozen prior-runs feature and reject missing, invalid, or fractional counts", () => {
  for (const config of VALUE_COHORTS) for (const count of [0, 4, 5, 9, 10, null]) {
    const { book } = fixture(35, count, config);
    const decision = book.valueRankPolicy!.legacyRankOne[0];
    assert.equal(decision.priorCareerRuns, count);
    assert.equal(decision.retained, count === 5 || count === 9);
  }
  for (const count of [NaN, Infinity, -1, 5.5]) assert.equal(valueRankOneDecision("id", 30, count).rejectionReason, "PRIOR_RUNS_MISSING");
  for (const input of [[], [Math.log1p(5.5), 0], [Infinity, 0], [Math.log1p(7), 1]])
    assert.equal(frozenPriorCareerRuns("TURF", ["log_prior_runs", "log_prior_runs_missing"], input), null);
  assert.equal(valueRankOneDecision("id", 20.99, null).retained, true);
  assert.equal(valueRankOneDecision("id", 51, null).retained, true);
});

test("I: rejected leader never promotes Value 2; raw ranks, scores, probabilities and Tissue remain intact", () => {
  const { book } = fixture(35, 10), before = structuredClone(book), index = display(book);
  assert.deepEqual(book.runners.map(r => [r.valueRank, r.tissueRank]), [[1, 1], [2, 2]]);
  assert.equal(index.get(`${book.raceId}|leader`)!.activeValue1, false);
  assert.equal(index.get(`${book.raceId}|second`)!.activeValue1, false);
  const summary = summarizeValueRankV2([book]);
  assert.equal(summary.racesWithValue1, 0); assert.equal(summary.racesWithoutValue1, 1);
  assert.equal(summary.active.tracked, 0); assert.equal(summary.legacyShadow.tracked, 1);
  assert.deepEqual(book, before);
});

test("original competition ties remain ties; the gate is applied independently, never reranking", () => {
  const { book, config } = fixture(35, 10, TURF_VALUE_CONFIG, now, true);
  const feature = config.featureNames.indexOf("log_prior_runs");
  book.runners[1].modelInputs[feature] = Math.log1p(7);
  // Recreate the capture policy using the original full-field ties, not a promotion.
  book.valueRankPolicy!.legacyRankOne[1] = valueRankOneDecision("second", 35, 7);
  assert.equal(validValueCapture(book, config), true);
  assert.deepEqual(book.runners.map(r => r.valueRank), [1, 1]);
  const summary = summarizeValueRankV2([book]);
  assert.equal(summary.racesEvaluated, 1); assert.equal(summary.racesWithValue1, 1);
  assert.equal(summary.active.tracked, 1); assert.equal(summary.legacyShadow.tracked, 2);
  assert.equal(display(book).get(`${book.raceId}|leader`)!.activeValue1, false);
  assert.equal(display(book).get(`${book.raceId}|second`)!.activeValue1, true);
});

test("J: pre-epoch V1 books retain exact captures and do not enter prospective monitoring", async () => {
  const { book, config } = fixture(35, 10, TURF_VALUE_CONFIG, new Date(now.getTime() - 1));
  assert.equal(book.valueRankPolicy, undefined);
  const before = JSON.stringify(book), index = display(book);
  assert.equal(index.get(`${book.raceId}|leader`)!.activeValue1, true);
  assert.equal(index.get(`${book.raceId}|leader`)!.valueSelectionVersion, "VALUE_RANK_V1");
  const summary = summarizeValueRankV2([book]);
  assert.equal(summary.racesEvaluated, 0); assert.equal(summary.legacyShadow.tracked, 0);
  assert.equal(summary.historicalV1.tracked, 1); assert.equal(JSON.stringify(book), before);
  const historical = structuredClone(book);
  historical.valueRankPolicy = fixture().book.valueRankPolicy;
  assert.equal(validValueCapture(historical, config), false, "Cannot backfill V2 onto a historical capture");
  for (const c of VALUE_COHORTS) {
    const saved = await readFile(c.path, "utf8");
    const loaded = await loadValueForward(c);
    display(loaded.races[0]);
    summarizeValueRankV2(loaded.races);
    assert.equal(await readFile(c.path, "utf8"), saved);
  }
});

test("K: Today, T1=V1 and daily-list agreement use V2 active membership; Tissue styling is unchanged", () => {
  const rejected = fixture(35, 10).book, retained = fixture(35, 7).book;
  const no = display(rejected).get(`${rejected.raceId}|leader`)!, yes = display(retained).get(`${retained.raceId}|leader`)!;
  assert.equal(isTissue1Value1Agreement(no), false); assert.equal(isTissue1Value1Agreement(yes), true);
  const render = (row: typeof no, kind: "valueRank" | "tissueRank") => renderToStaticMarkup(<FrozenValueRankCell runner={{ tissueValue: row }} kind={kind} />);
  const hidden = render(no, "valueRank");
  assert.match(hidden, /<span class="font-semibold">—<\/span>/);
  assert.ok(!render(no, "tissueRank").includes(">T1=V1<"));
  assert.ok(render(yes, "tissueRank").includes(">T1=V1<"));
  for (const row of [no, yes]) assert.match(render(row, "tissueRank"), /bg-slate-900 text-white/);
  const meetings = (row: typeof no) => [{ courseName: "Test", races: [{ raceId: "race", scheduledTime: "14:00", runners: [{ runnerId: "leader", horseName: "Leader", tissueValue: row }] }] }] as TodayMeeting[];
  assert.equal(buildNonRedTissueDailyList(meetings(no)).length, 0);
  assert.equal(buildNonRedTissueDailyList(meetings(yes))[0].agreement, true);
  // Current odds and target-race metrics cannot alter the frozen decision.
  const changed = meetings(no); Object.assign(changed[0].races[0].runners[0], { oddsDecimal: "2", metrics: { priorRuns: 7 } });
  assert.equal(buildNonRedTissueDailyList(changed).length, 0);
});

test("L: V1 shadow records original rejected selection and shares unchanged canonical settlement", () => {
  const { book, race } = fixture(35, 10), before = structuredClone(book.valueRankPolicy);
  const result = { ...race, actualRunnerCount: 2, runners: race.runners.map((r, i) => ({ ...r, resultStatus: "finished", finishingPosition: i + 1, oddsDecimal: "2" })) };
  const settled = settleValueForward({ ...emptyValueForward(TURF_VALUE_CONFIG), races: [book] }, new Map([[book.raceId, result]]), new Date(`${date}T18:00:00Z`));
  assert.deepEqual(settled.races[0].valueRankPolicy, before);
  const summary = summarizeValueRankV2(settled.races);
  assert.equal(summary.active.runners, 0); assert.equal(summary.legacyShadow.runners, 1);
  assert.equal(summary.legacyShadow.profitLoss, 34); assert.equal(summary.rejected.profitLoss, 34);
  assert.equal(summary.legacyShadow.winners, 1);
  assert.equal(summary.rejectionReasons.find(r => r.reason === "PRIOR_RUNS_10_PLUS")!.runners, 1);
  assert.equal(summary.targetBand.find(r => r.group.endsWith("10+ prior runs"))!.winners, 1);
});

test("NR/void do not enter stakes; dead-heat returns use the existing canonical settlement", () => {
  for (const status of ["non_runner", "void"] as const) {
    const { book, race } = fixture(35, 7);
    const result = { ...race, actualRunnerCount: 1, runners: race.runners.map((r, i) => ({ ...r,
      resultStatus: i === 0 ? status : "finished", finishingPosition: i === 0 ? null : 1 })) };
    const settled = settleValueForward({ ...emptyValueForward(TURF_VALUE_CONFIG), races: [book] }, new Map([[book.raceId, result]]), new Date(`${date}T18:00:00Z`));
    const summary = summarizeValueRankV2(settled.races);
    assert.equal(summary.active.tracked, 1); assert.equal(summary.active.runners, 0);
    assert.equal(summary.active.profitLoss, null); assert.equal(summary.active.roi, null);
    assert.equal(status === "non_runner" ? summary.active.nonRunners : summary.active.voids, 1);
  }
  const { book, race } = fixture(35, 7);
  const result = { ...race, actualRunnerCount: 2, runners: race.runners.map(r => ({ ...r, resultStatus: "finished", finishingPosition: 1 })) };
  const settled = settleValueForward({ ...emptyValueForward(TURF_VALUE_CONFIG), races: [book] }, new Map([[book.raceId, result]]), new Date(`${date}T18:00:00Z`));
  const summary = summarizeValueRankV2(settled.races);
  assert.equal(summary.active.winners, 1); assert.equal(summary.active.profitLoss, 17);
  assert.equal(summary.active.profitLoss, summary.legacyShadow.profitLoss);
});

test("capture validation and atomic persistence reject tampered decisions and preserve old records", async () => {
  const { book, config } = fixture(), missing = structuredClone(book), changed = structuredClone(book);
  delete missing.valueRankPolicy;
  changed.valueRankPolicy!.legacyRankOne[0].retained = false;
  assert.equal(validValueCapture(missing, config), false); assert.equal(validValueCapture(changed, config), false);
  const directory = await mkdtemp(join(tmpdir(), "value-rank-v2-")), path = join(directory, "value.json");
  try {
    const old = fixture(35, 10, config, new Date(now.getTime() - 1)).book;
    old.raceId = "old";
    await mutateValueForward(config, data => appendValueForward(data, [old], config), path);
    const oldSnapshot = JSON.stringify((await loadValueForward(config, path)).races[0]);
    await mutateValueForward(config, data => appendValueForward(data, [book], config), path);
    const loaded = await loadValueForward(config, path);
    assert.equal(JSON.stringify(loaded.races[0]), oldSnapshot);
    assert.deepEqual(loaded.races[1].valueRankPolicy, book.valueRankPolicy);
    const bytes = await readFile(path, "utf8");
    await assert.rejects(mutateValueForward(config, data => {
      data.races[1].valueRankPolicy!.legacyRankOne[0].priorCareerRuns = 8;
      return data;
    }, path), /Cannot rewrite frozen/);
    assert.equal(await readFile(path, "utf8"), bytes);
    await mutateValueForward(config, data => appendValueForward(data, [fixture(35, 10).book], config), path);
    assert.equal(await readFile(path, "utf8"), bytes, "No recapture of known races");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("prospective monitor separates target-band reasons and excludes historical/pending/NR stakes", () => {
  const books = [fixture(35, 7).book, fixture(35, 4).book, fixture(35, 10).book, fixture(35, null).book, fixture(51, 20).book];
  const summary = summarizeValueRankV2(books);
  assert.equal(summary.racesEvaluated, 5); assert.equal(summary.racesWithValue1, 2); assert.equal(summary.racesWithoutValue1, 3);
  assert.equal(summary.active.tracked, 2); assert.equal(summary.legacyShadow.tracked, 5); assert.equal(summary.rejected.tracked, 3);
  assert.deepEqual(summary.targetBand.map(r => r.tracked), [1, 1, 1, 1]);
  assert.equal(summary.active.runners, 0); assert.equal(summary.active.profitLoss, null);
  const html = renderToStaticMarkup(<ValueRankV2Monitoring races={books as DisplayValueRace[]} />);
  for (const text of [VALUE_RANK_EPOCH, "ACTIVE VALUE 1 V2", "LEGACY VALUE 1 V1 SHADOW", "0–4 prior runs", "10+ prior runs", "Missing prior runs", "Actual/Market"])
    assert.ok(html.includes(text), text);
  const rejected = fixture(35, 10).book;
  const table = renderToStaticMarkup(<TissueValueRaceTables races={[rejected]} date={date} />);
  assert.ok(table.includes("Legacy 1 · rejected"));
});

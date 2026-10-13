import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DailyResearchDashboard } from "@/app/racing/research/forward-value/research-dashboard";
import { buildAwTissueRace, enrichAwTissuePrices, settleAwTissueRace, emptyAwTissueForward, awTissueValueCategory, captureAwTissueRaces } from "./aw-tissue-forward";
import { loadAwTissueModel } from "./aw-tissue-model";
import { buildForwardValueRecord, emptyForwardValueData, enrichForwardValuePriceSnapshots, settleForwardValueRecords, upsertForwardValueRecords, attachTissueValueSnapshots, type FamilyCalibration, type ForwardValueRecord } from "./forward-value";
import { capCategory, TISSUE_VALUE_PRICE_CAP_RULE_EPOCH } from "./tissue-value-price-cap-rule";
import { buildResearchDashboard } from "./research-monitor";
import { renderDailyPositiveTissueRankOneSummary, renderTissueValueResultsSummary, summarizeTissuePositiveEdgeRankOnePerformance, renderAwTurfLongPriceShadowReport } from "./forward-value-summary";
import { emptyJumpTissueForward } from "./jump-tissue-forward";
import { emptyJumpG4ForwardData } from "./jump-g4-forward";
import { TISSUE_V2_CONFIG, type TissueForwardData, type TissueForwardRace } from "./tissue-forward";
import type { TodayRace, TodayRunner, SportingLifeCurrentPrice } from "./todays-racing";

const date = "2026-10-13";
const now = new Date(`${date}T08:00:00Z`);
const late = new Date(`${date}T12:00:00Z`);
const model = await loadAwTissueModel();
const calibration: FamilyCalibration = { family: "turf", ratingVersion: "TPR_S2_V1", calibrationVersion: "TPR_CAL_V1", leaderProbability: .5, gapQuartiles: [], gapBands: [] };
function runner(id: string, price: number | null, rank: number): TodayRunner {
  return { runnerId: id, runnerSourceId: null, horseId: id, horseName: id, saddleclothNumber: null, horseAge: 4, horseSex: null,
    weight: null, weightCarriedLbs: 130, draw: 2, jockeyName: "Jockey", trainerId: null, trainerName: "Trainer", officialRating: 80,
    odds: "100/1", oddsDecimal: "101", forecastOdds: "100/1", forecastDecimalOdds: 101, resultStatus: null, finishingPosition: null,
    metrics: { averageAwSpeedLast3: 100, latestAwSpeedRating: 100, bestAwSpeedLast3: 100, daysSinceLastRun: 20 } as TodayRunner["metrics"],
    trainerMetrics: { trainerPriorWinRate: .2, trainerPriorRuns: 20, trainerPriorWins: 4 },
    jockeyMetrics: { jockeyPriorWinRate: .2, jockeyPriorRuns: 20, jockeyPriorWins: 4 },
    turfPerformanceRating: { version: "TPR_S2_V1", rating: 100 - rank, rawRating: 0, historyDepth: 3, rank, gap: null },
    bookmakerQuotes: price === null ? [] : [{ bookmakerId: 1, bookmakerName: "Book", decimalOdds: price, fractionalOdds: `${price - 1}/1` }] };
}
function card(price: number | null, family: "aw" | "turf", id: string = family): TodayRace {
  return { raceId: id, sourceId: id, scheduledTime: "14:00", raceDateTime: new Date(`${date}T13:00:00Z`), courseCountry: "GB",
    raceName: "Handicap", raceClass: "Class 4", raceType: "Flat", raceTypeCode: "FLAT", distance: "1m", distanceYards: 1760,
    going: family === "aw" ? "Standard" : "Good", surface: family === "aw" ? "ALLWEATHER" : "Turf",
    declaredRunnerCount: 2, actualRunnerCount: null, winningTime: null, runners: [runner(`${id}-a`, price, 1), runner(`${id}-b`, price, 2)] };
}
function aw(price: number | null, id = "aw", capturedAt = now) {
  const race = card(price, "aw", id);
  const record = buildAwTissueRace(race, "Wolverhampton", date, new Map(race.runners.map((r) => [r.runnerId, 3])), model, capturedAt)!;
  return enrichAwTissuePrices(record, race, capturedAt);
}
function turf(price: number | null, id = "turf", capturedAt = now) {
  const race = card(price, "turf", id);
  return buildForwardValueRecord({ family: "turf", raceDate: date, course: "York", race, calibration, recordedAt: capturedAt,
    tissue: { runnerId: `${id}-a`, horseName: `${id}-a`, probability: .5 } })!;
}
function turfRace(record: ForwardValueRecord): TissueForwardRace {
  return { raceId: record.raceId, sourceId: null, raceDate: date, course: "York", raceTime: "13:00", raceName: "Handicap",
    tissueModelVersion: TISSUE_V2_CONFIG.modelVersion, tissueModelChecksum: "hash", recordedAt: record.recordedAt, recordedPreRace: true,
    runners: [{ runnerId: record.tissueRunnerId!, horseId: record.tissueRunnerId!, horseName: record.tissueHorseName!, probability: .5,
      fairDecimalOdds: 2, tissueRank: 1, commentFeatures: [], finishingPosition: record.settledAt ? 1 : null, finalSp: record.settledAt ? 3 : null,
      marketImpliedProbability: null, marketRank: null }], winners: record.settledAt ? [record.tissueHorseName!] : [], settledAt: record.settledAt };
}
function inputs(awRaces = [aw(21)], records = [turf(21)], prices: SportingLifeCurrentPrice[] = []) {
  const turfData: TissueForwardData = { version: TISSUE_V2_CONFIG.forwardVersion, tissueModelVersion: TISSUE_V2_CONFIG.modelVersion,
    forwardStart: TISSUE_V2_CONFIG.forwardStart, races: records.map(turfRace) };
  return { date, prices, turf: turfData, aw: { ...emptyAwTissueForward(), races: awRaces }, ratings: records,
    jump: emptyJumpTissueForward(), g4: emptyJumpG4ForwardData() };
}
function result(price: number, family: "aw" | "turf", id: string, leaderId: string, status = "finished"): TodayRace {
  const race = card(price, family, id);
  race.actualRunnerCount = status === "non_runner" ? 1 : 2;
  race.runners = race.runners.map((r) => ({ ...r, resultStatus: r.runnerId === leaderId ? status : "finished",
    finishingPosition: r.runnerId === leaderId ? status === "finished" ? 1 : null : status === "finished" ? 2 : 1, oddsDecimal: "3" }));
  return race;
}
function settleTurf(record: ForwardValueRecord, status = "finished") {
  return settleForwardValueRecords({ ...emptyForwardValueData(), races: [record] },
    new Map([[record.raceId, result(3, "turf", record.raceId, record.tissueRunnerId!, status)]]), new Date(`${date}T14:00:00Z`)).data.races[0]!;
}

test("AW and Turf exact 21.0 / 21.01 / 26.0 boundaries preserve model probabilities and markers", () => {
  for (const price of [21, 21.01, 26]) {
    const a = aw(price), t = turf(price);
    const category = price === 21 ? "MAIN" : "LONG_PRICE_SHADOW";
    assert.equal(awTissueValueCategory(a), category);
    assert.equal(capCategory(t.tissueValuePriceCapRule), category);
    for (const rule of [a.tissueValuePriceCapRule!, t.tissueValuePriceCapRule!]) {
      assert.equal(rule.epoch, TISSUE_VALUE_PRICE_CAP_RULE_EPOCH);
      assert.equal(rule.captureDateTime, now.toISOString());
      assert.equal(rule.qualification!.qualifyingPrice, price);
      assert.equal(rule.originalValueStatus, true);
      assert.equal(rule.excludedByPriceCap, price > 21);
      assert.ok(rule.modelVersion);
    }
    assert.deepEqual(a.runners.map((r) => r.probability), aw(21).runners.map((r) => r.probability));
    assert.equal(t.tissueProbability, .5);
  }
});

test("missing qualifying prices never use forecasts, SP or latest prices", () => {
  const a = aw(null), t = turf(null);
  const prices: SportingLifeCurrentPrice[] = [a, t].map((record) => ({ raceId: record.raceId,
    runnerId: "top1" in record ? record.top1! : record.tissueRunnerId!, marketPrice: "20/1", marketDecimalOdds: 21,
    bookmakerQuoteCount: 1, forecastPrice: "100/1", forecastDecimalOdds: 101, displayRaceTime: "14:00" }));
  assert.equal(buildResearchDashboard(inputs([a], [t], prices)).horses.length, 0);
  assert.equal(settleTurf(t).tissueValuePriceCapRule!.qualification, null);
  assert.equal(settleAwTissueRace(a, result(3, "aw", a.raceId, a.top1!)).tissueValuePriceCapRule!.qualification, null);
  assert.equal(buildResearchDashboard(inputs([a], [t], prices)).longPriceShadows!.length, 0);
});

test("first qualification and classification remain frozen across stage changes and reruns", () => {
  for (const [first, later] of [[26, 3], [21, 26]]) {
    const a = aw(first), t = turf(first);
    const enrichedA = enrichAwTissuePrices(a, card(later, "aw"), late);
    const data = { ...emptyForwardValueData(), races: [t] };
    const enrichedT = enrichForwardValuePriceSnapshots(data, { family: "turf", capturedAt: late,
      meetings: [{ course: "York", races: [card(later, "turf")] } as never] });
    assert.deepEqual(enrichedA.tissueValuePriceCapRule, a.tissueValuePriceCapRule);
    assert.deepEqual(enrichedT.races[0]!.tissueValuePriceCapRule, t.tissueValuePriceCapRule);
    assert.equal(upsertForwardValueRecords(data, [turf(later)]), data);
    const awData = { ...emptyAwTissueForward(), races: [a] };
    assert.equal(captureAwTissueRaces(awData, [enrichedA]), awData);
    assert.equal(settleTurf(enrichedT.races[0]!).tissueValuePriceCapRule!.qualifyingPriceProfitLoss, first - 1);
    assert.equal(settleAwTissueRace(enrichedA, result(3, "aw", a.raceId, a.top1!)).tissueValuePriceCapRule!.qualifyingPriceProfitLoss, first - 1);
  }
});

test("main UI, Today totals and headline returns exclude shadows; separate grouped UI includes them", () => {
  const a = aw(21, "AW allowed"), shadowA = aw(26, "AW shadow");
  const allowedA = settleAwTissueRace(a, result(3, "aw", a.raceId, a.top1!));
  const settledA = settleAwTissueRace(shadowA, result(3, "aw", shadowA.raceId, shadowA.top1!));
  const allowedT = settleTurf(turf(21, "Turf allowed")), shadowT = settleTurf(turf(26, "Turf shadow"));
  const input = inputs([allowedA, settledA], [allowedT, shadowT]);
  const dashboard = buildResearchDashboard(input);
  assert.equal(dashboard.horses.length, 2);
  assert.equal(dashboard.longPriceShadows!.length, 2);
  assert.deepEqual(dashboard.longPriceShadows!.map((r) => r.profitLoss), [25, 25]);
  const summaries = summarizeTissuePositiveEdgeRankOnePerformance(input.ratings, input);
  assert.equal(summaries[3]!.selections, 2);
  assert.equal(summaries[3]!.profitLoss, 40);
  const html = renderToStaticMarkup(<DailyResearchDashboard dashboard={dashboard} />);
  const main = html.slice(0, html.indexOf('aria-label="Hurdle long-price shadow"'));
  assert.ok(main.includes("AW allowed"));
  assert.ok(main.includes("Turf allowed"));
  assert.ok(!main.includes("AW shadow"));
  assert.ok(!main.includes("Turf shadow"));
  assert.match(main, /AW P\/L \+£20\.00/);
  assert.match(main, /Turf P\/L \+£20\.00/);
  assert.match(html, /AW LONG-PRICE SHADOW/);
  assert.match(html, /TURF LONG-PRICE SHADOW/);
  assert.match(html, /AW shadow/);
  assert.match(html, /Turf shadow/);
  const results = renderTissueValueResultsSummary({ date, records: input.ratings, aw: input.aw });
  assert.match(results, /TOTAL TISSUE VALUE\nSelections: 2\nWinners: 2\nP\/L: £40\.00/);
  assert.match(results, /AW shadow: 1 selections \/ 1 settled \/ 1 winners \/ £1 P\/L £25\.00/);
});

test("today and morning terminal output classify using frozen prices despite later market moves", () => {
  const input = inputs([aw(21, "AW allowed"), aw(26, "AW shadow")], [turf(21, "Turf allowed"), turf(26, "Turf shadow")]);
  const output = renderDailyPositiveTissueRankOneSummary({ ...input, records: input.ratings, currentPrices: [] });
  const main = output.slice(0, output.indexOf("AW / TURF LONG-PRICE SHADOW"));
  assert.match(main, /MAIN VALUE/);
  assert.match(main, /TOTAL TISSUE VALUE\nSelections: 2/);
  assert.ok(!main.includes("AW shadow"));
  assert.ok(!main.includes("Turf shadow"));
  assert.match(output, /TURF \| Turf shadow-a \| 26\.00 \| 50\.0%/);
  assert.match(output, /AW \| AW shadow/);
});

test("shadow canonical settlement independently handles non-finishers, NR and dead heats", () => {
  for (const status of ["pulled_up", "non_runner"]) {
    const a = aw(26);
    const settledA = settleAwTissueRace(a, result(3, "aw", a.raceId, a.top1!, status));
    const t = settleTurf(turf(26), status);
    for (const rule of [settledA.tissueValuePriceCapRule!, t.tissueValuePriceCapRule!]) {
      assert.equal(rule.qualifyingPriceProfitLoss, status === "non_runner" ? 0 : -1);
      assert.equal(rule.qualifyingOutcome, status === "non_runner" ? "VOID" : "LOSS");
    }
    assert.match(renderAwTurfLongPriceShadowReport([t], { ...emptyAwTissueForward(), races: [settledA] }), /1 settled/);
  }
  const t = turf(26), race = result(3, "turf", t.raceId, t.tissueRunnerId!);
  race.runners.forEach((r) => { r.finishingPosition = 1; });
  const settled = settleForwardValueRecords({ ...emptyForwardValueData(), races: [t] }, new Map([[t.raceId, race]])).data.races[0]!;
  assert.equal(settled.tissueValuePriceCapRule!.qualifyingPriceProfitLoss, 12.5);
});

test("pre-cap observations remain unversioned and cannot be reclassified on refresh", () => {
  const before = new Date(new Date(TISSUE_VALUE_PRICE_CAP_RULE_EPOCH).getTime() - 1000);
  const a = aw(26, "aw", before), t = turf(26, "turf", before);
  assert.equal(a.tissueValuePriceCapRule, undefined);
  assert.equal(t.tissueValuePriceCapRule, undefined);
  assert.equal(enrichAwTissuePrices(a, card(21, "aw"), late).tissueValuePriceCapRule, undefined);
  const attached = attachTissueValueSnapshots({ ...emptyForwardValueData(), races: [t] }, new Map());
  assert.equal(attached.races[0], t);
});

test("a nonpositive first price can qualify at a later stored stage without changing the edge threshold", () => {
  const a = aw(1.01), t = turf(1.01);
  assert.equal(a.tissueValuePriceCapRule!.originalValueStatus, false);
  assert.equal(t.tissueValuePriceCapRule!.originalValueStatus, false);
  const qualifiedA = enrichAwTissuePrices(a, card(26, "aw"), late);
  const qualifiedT = enrichForwardValuePriceSnapshots({ ...emptyForwardValueData(), races: [t] }, {
    family: "turf", capturedAt: late, meetings: [{ course: "York", races: [card(26, "turf")] } as never],
  }).races[0]!;
  for (const rule of [qualifiedA.tissueValuePriceCapRule!, qualifiedT.tissueValuePriceCapRule!]) {
    assert.equal(rule.qualification!.stage, "t60");
    assert.equal(rule.qualification!.qualifyingPrice, 26);
    assert.equal(capCategory(rule), "LONG_PRICE_SHADOW");
  }
  assert.equal(buildResearchDashboard(inputs([qualifiedA], [qualifiedT])).longPriceShadows!.length, 2);
});

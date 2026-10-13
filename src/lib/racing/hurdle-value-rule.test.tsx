import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DailyResearchDashboard } from "@/app/racing/research/forward-value/research-dashboard";
import { HurdleLongPriceShadowSection } from "@/app/racing/research/forward-value/hurdle-long-price-shadow";
import { buildJumpTissueRace, captureJumpTissueRaces, emptyJumpTissueForward, enrichJumpTissuePrices, settleJumpTissueRace, currentPositiveJumpTissueRankOneEdges, type JumpTissueRace } from "./jump-tissue-forward";
import { loadJumpTissueModel } from "./jump-tissue-model";
import { HURDLE_VALUE_RULE_EPOCH, HURDLE_VALUE_RULE_VERSION, jumpTissueValueCategory } from "./hurdle-value-rule";
import { hurdleValueRows, renderHurdleValueReport, summarizeHurdleValueRows } from "./hurdle-value-report";
import { buildResearchDashboard } from "./research-monitor";
import { emptyAwTissueForward, currentPositiveAwTissueRankOneEdges, type AwTissueRace } from "./aw-tissue-forward";
import { emptyJumpG4ForwardData } from "./jump-g4-forward";
import { TISSUE_V2_CONFIG, currentPositiveTurfTissueRankOneEdges, type TissueForwardData, type TissueForwardRace } from "./tissue-forward";
import { renderDailyPositiveTissueRankOneSummary, renderTissueValueResultsSummary, summarizeTissuePositiveEdgeRankOnePerformance } from "./forward-value-summary";
import { buildHurdlePair } from "./hurdle-tissue-challenger-forward";
import type { TodayRace, TodayRunner, SportingLifeCurrentPrice } from "./todays-racing";

const date = "2026-10-13";
const capturedAt = new Date(`${date}T08:00:00Z`);
const model = await loadJumpTissueModel();
model.model.weights.fill(0);
function runner(id: string, price: number | null): TodayRunner {
  return { runnerId: id, runnerSourceId: id, horseId: `horse-${id}`, horseName: `Horse ${id}`, saddleclothNumber: 1, horseAge: 6, horseSex: null,
    weight: "11-0", weightCarriedLbs: 154, draw: null, jockeyName: "Jockey", trainerId: "trainer", trainerName: "Trainer", officialRating: 100,
    odds: "1/1", oddsDecimal: "2", resultStatus: null, finishingPosition: null,
    metrics: { priorRuns: 3, latestJumpSpeedRating: 100, bestJumpSpeedLast3: 102, averageJumpSpeedLast3: 101, daysSinceLastRun: 30 } as TodayRunner["metrics"],
    trainerMetrics: { trainerPriorRuns: 20, trainerPriorWins: 4, trainerPriorWinRate: 0.2 },
    jockeyMetrics: { jockeyPriorRuns: 20, jockeyPriorWins: 3, jockeyPriorWinRate: 0.15 },
    forecastOdds: "100/1", forecastDecimalOdds: 101,
    bookmakerQuotes: price === null ? [] : [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: `${price - 1}/1`, decimalOdds: price }] };
}
function card(price: number | null, type = "Hurdle", id = "race"): TodayRace {
  return { raceId: id, sourceId: `source-${id}`, raceDateTime: new Date(`${date}T13:00:00Z`), scheduledTime: "14:00", courseCountry: "GB",
    raceName: `Test ${type}`, raceType: type, raceTypeCode: null, raceClass: "Class 4", distance: "2m", distanceYards: 3520,
    going: "Soft", surface: "Turf", declaredRunnerCount: 2, actualRunnerCount: null, winningTime: null, runners: [runner(`${id}-a`, price), runner(`${id}-b`, price)] };
}
function capture(price: number | null, type = "Hurdle", id = "race") {
  const race = card(price, type, id);
  const record = buildJumpTissueRace({ raceDate: date, course: "Teston", race, model, commentsByHorse: new Map(), recordedAt: capturedAt })!;
  return enrichJumpTissuePrices(record, race, capturedAt);
}
function settled(record: JumpTissueRace, win = true, status: string | null = null) {
  const race = card(3, record.subtype, record.raceId);
  race.actualRunnerCount = status === "non_runner" ? 1 : 2;
  race.runners[0] = { ...race.runners[0]!, finishingPosition: status ? null : win ? 1 : 2, resultStatus: status, oddsDecimal: "3" };
  race.runners[1] = { ...race.runners[1]!, finishingPosition: status || !win ? 1 : 2, oddsDecimal: "3" };
  return settleJumpTissueRace(record, race, new Date(`${date}T14:00:00Z`));
}
const turf: TissueForwardData = { version: TISSUE_V2_CONFIG.forwardVersion, tissueModelVersion: TISSUE_V2_CONFIG.modelVersion,
  forwardStart: TISSUE_V2_CONFIG.forwardStart, forwardStartAt: TISSUE_V2_CONFIG.forwardStartAt, races: [] };
function dashboard(races: JumpTissueRace[], prices: SportingLifeCurrentPrice[] = []) {
  return buildResearchDashboard({ date, prices, turf, jump: { ...emptyJumpTissueForward(), races }, aw: emptyAwTissueForward(), g4: emptyJumpG4ForwardData(), ratings: [] });
}

test("only Hurdle positive-edge rank-1 qualifies for the exact prospective cap boundary", () => {
  for (const [price, category] of [[10, "MAIN"], [15, "MAIN"], [15.01, "LONG_PRICE_SHADOW"], [16, "LONG_PRICE_SHADOW"], [20, "LONG_PRICE_SHADOW"]] as const) {
    const race = capture(price);
    assert.equal(jumpTissueValueCategory(race), category);
    assert.equal(race.hurdleValueRule!.version, HURDLE_VALUE_RULE_VERSION);
    assert.equal(race.hurdleValueRule!.epoch, HURDLE_VALUE_RULE_EPOCH);
    assert.equal(race.hurdleValueRule!.captureDateTime, capturedAt.toISOString());
    assert.equal(race.hurdleValueRule!.modelVersion, "JUMP_TISSUE_V1");
    assert.equal(race.hurdleValueRule!.normalValueCriteriaPassed, true);
    assert.equal(race.hurdleValueRule!.excludedByPriceCap, price > 15);
    assert.equal(race.hurdleValueRule!.qualification!.qualifyingPrice, price);
    assert.equal(currentPositiveJumpTissueRankOneEdges([race]).selections.length, 1);
  }
  const negative = capture(1.5);
  assert.equal(negative.hurdleValueRule!.normalValueCriteriaPassed, false);
  assert.equal(negative.hurdleValueRule!.excludedByPriceCap, false);
  assert.equal(negative.hurdleValueRule!.qualification, null);
});

test("Chase at 16, 20, 21.01 and 30 keeps existing VALUE; raw Turf and AW edge calculations stay uncapped", () => {
  for (const price of [16, 20, 21.01, 30]) {
    const chase = capture(price, "Chase");
    assert.equal(chase.hurdleValueRule, undefined);
    assert.equal(jumpTissueValueCategory(chase), "MAIN");
    assert.equal(dashboard([chase]).horses.length, 1);
    const aw = { ...chase, awDCoverage: { ratingCoverageStatus: "eligible" } } as unknown as AwTissueRace;
    assert.equal(currentPositiveAwTissueRankOneEdges([aw]).selections.length, 1);
    const turfRace: TissueForwardRace = { raceId: "turf", sourceId: null, raceDate: date, course: "Test", raceTime: "14:00", raceName: null,
      tissueModelVersion: TISSUE_V2_CONFIG.modelVersion, tissueModelChecksum: "hash", recordedAt: capturedAt.toISOString(), recordedPreRace: true,
      runners: [{ runnerId: "turf-a", horseId: "horse-a", horseName: "Turf", probability: 0.5, fairDecimalOdds: 2, tissueRank: 1, commentFeatures: [], finishingPosition: null, finalSp: null, marketImpliedProbability: null, marketRank: null }], winners: [], settledAt: null };
    assert.equal(currentPositiveTurfTissueRankOneEdges([turfRace], [{ raceId: "turf", runnerId: "turf-a", marketPrice: `${price - 1}/1`, marketDecimalOdds: price, bookmakerQuoteCount: 1, forecastPrice: null, forecastDecimalOdds: null, displayRaceTime: "14:00" }]).selections.length, 1);
  }
});

test("missing qualifying price cannot use forecast, stored odds, SP or latest-price fallback", () => {
  const race = capture(null);
  assert.equal(race.hurdleValueRule!.qualification, null);
  assert.equal(race.hurdleValueRule!.normalValueCriteriaPassed, null);
  const prices: SportingLifeCurrentPrice[] = [{ raceId: race.raceId, runnerId: race.top1!, marketPrice: "19/1", marketDecimalOdds: 20, bookmakerQuoteCount: 1, forecastPrice: "100/1", forecastDecimalOdds: 101, displayRaceTime: "14:00" }];
  assert.equal(dashboard([race], prices).horses.length, 0);
  assert.equal(hurdleValueRows({ ...emptyJumpTissueForward(), races: [settled(race)] }, prices).length, 0);
});

test("first qualifying snapshot and cap classification freeze across later stage prices and reruns", () => {
  for (const [first, later, expected] of [[20, 10, "LONG_PRICE_SHADOW"], [10, 20, "MAIN"]] as const) {
    const original = capture(first);
    const qualification = structuredClone(original.hurdleValueRule);
    const enriched = enrichJumpTissuePrices(original, card(later), new Date(`${date}T12:30:00Z`));
    assert.equal(enriched.prices.t60!.decimalPrice, later);
    assert.deepEqual(enriched.hurdleValueRule, qualification);
    assert.equal(jumpTissueValueCategory(enriched), expected);
    assert.equal(currentPositiveJumpTissueRankOneEdges([enriched]).selections[0]!.comparison.qualificationPrice.decimalPrice, first);
    const data = captureJumpTissueRaces(emptyJumpTissueForward(), [original]);
    assert.equal(captureJumpTissueRaces(data, [enriched]), data);
    assert.equal(settled(enriched).hurdleValueRule!.qualifyingPriceProfitLoss, first - 1);
  }
});

test("a valid but nonpositive edge does not freeze a selection and can qualify at a later stored stage", () => {
  const record = capture(1.5);
  const qualified = enrichJumpTissuePrices(record, card(20), new Date(`${date}T12:30:00Z`));
  assert.equal(qualified.hurdleValueRule!.qualification!.stage, "t60");
  assert.equal(qualified.hurdleValueRule!.normalValueCriteriaPassed, true);
  assert.equal(jumpTissueValueCategory(qualified), "LONG_PRICE_SHADOW");
});

test("known early results cannot retrospectively create a qualifying-price snapshot", () => {
  const record = capture(null);
  const results = card(20);
  results.actualRunnerCount = 2;
  results.runners[0] = { ...results.runners[0]!, finishingPosition: 1 };
  results.runners[1] = { ...results.runners[1]!, finishingPosition: 2 };
  assert.equal(enrichJumpTissuePrices(record, results, new Date(`${date}T12:30:00Z`)), record);
  assert.equal(record.hurdleValueRule!.qualification, null);
});

test("main UI, Hurdle headline and TODAY P/L exclude shadow while separate UI includes it", () => {
  const main = settled(capture(10, "Hurdle", "Allowed"));
  const shadow = settled(capture(20, "Hurdle", "Shadow"));
  const data = dashboard([main, shadow]);
  assert.equal(data.horses.length, 1);
  assert.equal(data.horses[0]!.signals[0]!.profitLoss, 9);
  const hurdleCard = data.hurdleValueMonitor!;
  assert.equal(hurdleCard.tracked, 1);
  assert.equal(hurdleCard.winners, 1);
  assert.equal(hurdleCard.profitLoss, 9);
  const html = renderToStaticMarkup(<DailyResearchDashboard dashboard={data} />);
  const primary = html.slice(0, html.indexOf('aria-label="Hurdle long-price shadow"'));
  assert.ok(primary.includes("Horse Allowed-a"));
  assert.ok(!primary.includes("Horse Shadow-a"));
  assert.match(primary, /Jump P\/L \+£9\.00/);
  assert.ok(!primary.includes("£28.00"));
  const shadowHtml = renderToStaticMarkup(<HurdleLongPriceShadowSection rows={data.hurdleValues!} date={date} />);
  assert.match(shadowHtml, /Horse Shadow-a/);
  assert.match(shadowHtml, /Research only/);
  assert.match(shadowHtml, /\+£19\.00/);
});

test("canonical shadow settlement retains started non-finisher losses and non-runner voids", () => {
  const shadow = capture(20);
  const loss = settled(shadow, false, "pulled_up");
  assert.equal(loss.hurdleValueRule!.qualifyingPriceProfitLoss, -1);
  assert.equal(settled(shadow, false, "non_runner").hurdleValueRule!.qualifyingPriceProfitLoss, 0);
  const rows = hurdleValueRows({ ...emptyJumpTissueForward(), races: [loss] });
  assert.equal(rows[0]!.outcome, "Loss");
  assert.equal(summarizeHurdleValueRows(rows).roi, -1);
  assert.equal(settleJumpTissueRace(loss, card(5)), loss);
});

test("today/results/cumulative outputs exclude shadow from main totals and report it separately", () => {
  const jump = { ...emptyJumpTissueForward(), races: [settled(capture(15, "Hurdle", "Allowed")), settled(capture(15.01, "Hurdle", "Shadow")), settled(capture(30, "Chase", "Chase"))] };
  const today = renderDailyPositiveTissueRankOneSummary({ date, turf, jump, aw: emptyAwTissueForward(), currentPrices: [] });
  assert.match(today, /TOTAL TISSUE VALUE\nSelections: 2/);
  const mainOutput = today.slice(0, today.indexOf("Hurdle VALUE rule epoch"));
  assert.ok(!mainOutput.includes("Horse Shadow-a"));
  assert.match(today, /HURDLE LONG-PRICE SHADOW/);
  assert.match(today, /Horse: Horse Shadow-a/);
  const performance = summarizeTissuePositiveEdgeRankOnePerformance([], { jump });
  assert.equal(performance.find((row) => row.label === "Jump")!.profitLoss, 43);
  assert.equal(performance.find((row) => row.label === "Combined")!.selections, 2);
  const results = renderTissueValueResultsSummary({ date, jump, aw: emptyAwTissueForward(), records: [] });
  assert.match(results, /TOTAL TISSUE VALUE\nSelections: 2\nWinners: 2\nP\/L: £43\.00/);
  assert.match(results, /HURDLE LONG-PRICE SHADOW/);
});

test("PRE-CAP records remain byte-for-byte intact and are reported outside the main clean Hurdle cohort", () => {
  const post = capture(20);
  const pre = { ...post, recordedAt: "2026-10-12T08:00:00Z", hurdleValueRule: undefined };
  const before = JSON.stringify(pre);
  const data = { ...emptyJumpTissueForward(), races: [pre] };
  assert.equal(jumpTissueValueCategory(pre), "PRE_CAP");
  assert.equal(summarizeTissuePositiveEdgeRankOnePerformance([], { jump: data }).find((row) => row.label === "Jump")!.selections, 0);
  assert.match(renderHurdleValueReport(data), /HURDLE TISSUE VALUE HISTORY \(PRE-CAP\)\nCount: 1/);
  assert.equal(JSON.stringify(pre), before);
  const historicalCard = card(20);
  historicalCard.raceDateTime = new Date("2026-10-12T13:00:00Z");
  const historical = buildJumpTissueRace({ raceDate: "2026-10-12", course: "Teston", race: historicalCard, model, commentsByHorse: new Map(), recordedAt: new Date("2026-10-12T08:00:00Z") })!;
  assert.equal(historical.hurdleValueRule, undefined);
});

test("Excuse-Half paired challenger retains uncapped VALUE above the main Hurdle price cap", () => {
  const pair = buildHurdlePair({ raceDate: date, course: "Teston", race: card(20), model, commentsByHorse: new Map(), recordedAt: capturedAt })!;
  assert.equal(pair.control.hurdleValueRule, undefined);
  assert.equal(pair.challenger.hurdleValueRule, undefined);
  assert.equal(pair.control.valueQualified, true);
  assert.equal(pair.challenger.valueQualified, true);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DailyResearchDashboard, ResearchHistory, summarizeSettledTissueRows } from "./research-dashboard";
import type { ResearchDashboard } from "@/lib/racing/research-monitor";
import { RESEARCH_SIGNALS } from "@/lib/racing/research-monitor";

test("primary monitor is Tissue VALUE first and keeps other research secondary", () => {
  const dashboard: ResearchDashboard = {
    date: "2026-10-09", emptyMessage: null, monitors: [],
    horses: [{ raceId: "race", runnerId: "runner", horseId: "horse", horseName: "Prospective Horse",
      course: "Teston", time: "14:00", sortTime: "", price: 8, priceSource: "imported_card",
      signals: (Object.keys(RESEARCH_SIGNALS) as Array<keyof typeof RESEARCH_SIGNALS>).map(kind => ({
        kind, reason: `${kind} qualification`, context: "Prospective observation", movement: null,
      })),
    }],
  };
  const html = renderToStaticMarkup(<DailyResearchDashboard dashboard={dashboard} />);
  assert.match(html, /Today&#x27;s Tissue VALUE/);
  assert.match(html, /Turf|Jump|AW/);
  assert.match(html, /Research shadows and disagreement signals/);
  assert.match(html, /Also tracked by/);
  assert.match(html, /Model \/ Market Disagreement/);
  assert.match(html, />1 selections</);
  assert.equal(html.match(/Prospective Horse/g)?.length, 1);
  assert.doesNotMatch(html, /rule selections|Saved rule research|Saved rules are retained/i);
});

test("secondary research details link directly to historical saved rules", () => {
  const html = renderToStaticMarkup(<ResearchHistory />);
  assert.match(html, /href="\/racing\/research#saved-rules"/);
  assert.match(html, />Saved rule research<\/a>/);
  assert.match(html, /Saved rules are retained for historical research/);
  assert.doesNotMatch(html, /rule selections/i);
});

test("daily display renders one multi-signal horse, both reasons and unavailable market", () => {
  const dashboard: ResearchDashboard = { date: "2026-10-09", emptyMessage: null, monitors: [], horses: [{ raceId: "race", runnerId: "runner", horseId: "horse", horseName: "Overlap Horse", course: "Teston", time: "14:00", sortTime: "", price: null, priceSource: null,
    signals: [{ kind: "jump_tissue", reason: "Tissue 18.2% · market 12.5% · +5.7pp", context: "Tissue rank #1", movement: "No later snapshot" }, { kind: "jump_g4", reason: "Avg L3 #2 · class drop 4→5 · latest speed 118 > 109", context: "OR #4", movement: null }],
  }] };
  const html = renderToStaticMarkup(<DailyResearchDashboard dashboard={dashboard} />);
  assert.equal(html.match(/Overlap Horse/g)?.length, 1);
  for (const text of ["Tissue VALUE", "Jump", "Jump G4", "class drop", "No later snapshot"]) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /Market unavailable/);
  assert.ok(html.includes("/horses/horse"));
  assert.doesNotMatch(html, /Research status/);
  assert.match(renderToStaticMarkup(<ResearchHistory />), /Closed — weak \/ unstable/);
  assert.match(renderToStaticMarkup(<ResearchHistory />), /Frozen model — prospective monitoring/);
  const priced: ResearchDashboard = { ...dashboard, horses: dashboard.horses.map((horse) => ({ ...horse, price: 8, priceSource: "imported_card" })) };
  assert.match(renderToStaticMarkup(<DailyResearchDashboard dashboard={priced} />), /Latest price/);
});

test("empty signals do not render an empty table or list", () => {
  for (const emptyMessage of ["No research signals today.", "No racecards imported for 2026-10-09."]) {
    const html = renderToStaticMarkup(<DailyResearchDashboard dashboard={{ date: "2026-10-09", emptyMessage, horses: [], monitors: [] }} />);
    assert.ok(html.includes(emptyMessage));
    assert.doesNotMatch(html, /<table|<ul/);
  }
});

test("empty shadow monitor is explicit about its early sample", () => {
  const html = renderToStaticMarkup(<DailyResearchDashboard dashboard={{ date: "2026-10-09", emptyMessage: "No research signals today.", horses: [], monitors: [{ name: "Jump G4", status: "SHADOW", tracked: 0, settled: 0, winners: 0, strike: null, ae: null, roi: null, roiBasis: "final_sp", pricedSettled: 0, cohort: "Prospective G4 qualifiers" }] }} />);
  assert.match(html, /Awaiting results/);
  assert.match(html, /Early sample/);
  assert.match(html, /Final SP ROI/);
  assert.match(html, /Market A\/E/);
  assert.doesNotMatch(html, /proven|profitable|recommended/i);
});

test("monitor labels separate calibration, market A/E and stored-price ROI evidence", () => {
  const dashboard: ResearchDashboard = { date: "2026-10-09", emptyMessage: "No research signals today.", horses: [], monitors: [
    { name: "Turf Tissue", status: "FROZEN", tracked: 295, settled: 267, winners: 37, strike: 37 / 267, ae: 1.05, roi: null, roiBasis: "median", pricedSettled: 0, cohort: "Clean rank-one model observations" },
    { name: "Jump G4", status: "SHADOW", tracked: 12, settled: 10, winners: 2, strike: .2, ae: .9, roi: .12, roiBasis: "final_sp", pricedSettled: 10, cohort: "Prospective G4 qualifiers" },
  ] };
  const html = renderToStaticMarkup(<DailyResearchDashboard dashboard={dashboard} />);
  assert.match(html, /Actual \/ model expected/);
  assert.match(html, /Stored median ROI/);
  assert.match(html, /Insufficient stored-price evidence/);
  assert.match(html, /0 of 267 settled have stored median returns; ROI needs stored prospective market prices/);
  assert.match(html, /Market A\/E/);
  assert.match(html, /Final SP ROI/);
  assert.match(html, /10 of 10 settled have final SP returns/);
});

test("weight shadow displays market A/E and qualifying-median ROI without VALUE labelling", () => {
  const dashboard: ResearchDashboard = { date: "2026-10-09", emptyMessage: null, horses: [{ raceId: "race", runnerId: "runner",
    horseId: "horse", horseName: "Weight Horse", course: "York", time: "14:00", sortTime: "", price: 8, priceSource: "weight_capture",
    signals: [{ kind: "todays_rating_weight", reason: "Today's Rating #1 · 8 lb lighter", context: "Qualifying median 8.00", movement: null }] }],
    monitors: [{ name: "Today's Rating - Lighter Weight", status: "SHADOW", tracked: 2, settled: 1, winners: 1,
      strike: 1, ae: 8, roi: 7, roiBasis: "qualifying_median", pricedSettled: 1, cohort: "Today's Rating #1 · 4+ lb lighter" }] };
  const html = renderToStaticMarkup(<DailyResearchDashboard dashboard={dashboard} />);
  assert.match(html, /SHADOW/);
  assert.match(html, /Market A\/E/);
  assert.match(html, /Qualifying median ROI/);
  assert.match(html, /Weight shadow capture/);
  assert.match(html, /No Tissue VALUE selections today/);
  assert.doesNotMatch(html, /Actual \/ model expected|Final SP ROI/);
});

test("splits pending and settled Tissue VALUE rows with same-day settlement returns", () => {
  const dashboard: ResearchDashboard = {
    date: "2026-10-09",
    emptyMessage: null,
    monitors: [],
    horses: [
      tissueHorse("pending", "13:00", "Pending Pete", { kind: "jump_tissue", result: "pending", outcome: null, profitLoss: null }),
      tissueHorse("winner", "13:30", "Winner Wendy", { kind: "turf_tissue", result: "settled", outcome: "WIN", finishingPosition: 1, profitLoss: 4 }),
      tissueHorse("loser", "14:00", "Loser Lenny", { kind: "jump_tissue", result: "settled", outcome: "LOSS", finishingPosition: 4, profitLoss: -1 }),
      tissueHorse("void", "14:30", "Void Vera", { kind: "aw_tissue", result: "void", outcome: "VOID", finishingPosition: null, resultStatus: "non_runner", profitLoss: 0 }),
    ],
  };
  const html = renderToStaticMarkup(
    <DailyResearchDashboard dashboard={dashboard}>
      <section aria-labelledby="aw-turf-challenger-heading"><h2 id="aw-turf-challenger-heading">AW TURF-ARCHITECTURE CHALLENGER</h2><p>Challenger Choice</p></section>
    </DailyResearchDashboard>,
  );
  const pendingEnd = html.indexOf("Settled Tissue VALUE Today");
  const pendingHtml = html.slice(0, pendingEnd);
  const settledHtml = html.slice(pendingEnd);
  assert.match(pendingHtml, /Pending Pete/);
  assert.doesNotMatch(pendingHtml, /Winner Wendy|Loser Lenny|Void Vera/);
  assert.match(settledHtml, /Winner Wendy/);
  assert.match(settledHtml, /Loser Lenny/);
  assert.match(settledHtml, /Void Vera/);
  assert.match(settledHtml, /Finished 1/);
  assert.match(settledHtml, /Finished 4/);
  assert.match(settledHtml, /WIN/);
  assert.match(settledHtml, /LOSS/);
  assert.match(settledHtml, /VOID/);
  assert.match(settledHtml, /\+£4\.00/);
  assert.match(settledHtml, /-£1\.00/);
  assert.match(settledHtml, /£0\.00/);
  assert.match(settledHtml, /2 bets · 1 winner · £1 P\/L \+£3\.00 · ROI \+150\.0%/);
  assert.match(html, /4 selections \/ 3 settled \/ 1 winners/);
  assert.match(html, /P\/L \+£3\.00/);
  assert.ok(html.indexOf("Settled Tissue VALUE Today") < html.indexOf("AW TURF-ARCHITECTURE CHALLENGER"));
  assert.doesNotMatch(settledHtml.slice(0, settledHtml.indexOf("AW TURF-ARCHITECTURE CHALLENGER")), /Challenger Choice/);
});

test("settled Tissue VALUE summary counts bets, winners and summed positive and negative returns", () => {
  const rows = [
    settledTissueRow("winner", { outcome: "WIN", profitLoss: 9 }),
    settledTissueRow("loser", { outcome: "LOSS", profitLoss: -1 }),
    settledTissueRow("second-loser", { outcome: "LOSS", profitLoss: -1 }),
  ];
  assert.deepEqual(summarizeSettledTissueRows(rows), {
    bets: 3,
    winners: 1,
    profitLoss: 7,
    pricedBets: 3,
    unavailableReturns: 0,
  });
});

test("settled Tissue VALUE summary handles voids and missing qualifying-price returns", () => {
  const rows = [
    settledTissueRow("winner", { outcome: "WIN", profitLoss: 4 }),
    settledTissueRow("missing", { outcome: "LOSS", profitLoss: null }),
    settledTissueRow("nan", { outcome: "LOSS", profitLoss: Number.NaN }),
    settledTissueRow("void", { result: "void", outcome: "VOID", profitLoss: 0 }),
  ];
  assert.deepEqual(summarizeSettledTissueRows(rows), {
    bets: 3,
    winners: 1,
    profitLoss: 4,
    pricedBets: 1,
    unavailableReturns: 2,
  });
});

test("settled Tissue VALUE summary is zeroed when no settled selections exist", () => {
  assert.deepEqual(summarizeSettledTissueRows([]), {
    bets: 0,
    winners: 0,
    profitLoss: 0,
    pricedBets: 0,
    unavailableReturns: 0,
  });
});

test("settled Tissue VALUE heading reports missing returns when all P/L values are missing", () => {
  const dashboard: ResearchDashboard = {
    date: "2026-10-09",
    emptyMessage: null,
    monitors: [],
    horses: [
      tissueHorse("missing-one", "13:30", "Missing One", { kind: "turf_tissue", result: "settled", outcome: "LOSS", finishingPosition: 3, profitLoss: null }),
      tissueHorse("missing-two", "14:00", "Missing Two", { kind: "jump_tissue", result: "settled", outcome: "LOSS", finishingPosition: 4, profitLoss: undefined }),
    ],
  };
  const html = renderToStaticMarkup(<DailyResearchDashboard dashboard={dashboard} />);
  assert.match(html, /2 bets · 0 winners · £1 P\/L £0\.00 · 2 returns unavailable/);
  assert.doesNotMatch(html, /ROI/);
});

test("headline Tissue cards use clean display epoch while historical monitors remain visible", () => {
  const dashboard: ResearchDashboard = {
    date: "2026-10-11",
    emptyMessage: null,
    monitors: [
      { name: "Turf Tissue", status: "FROZEN", tracked: 0, settled: 0, winners: 0, strike: null, ae: null, roi: null, roiBasis: "qualifying_median", pricedSettled: 0, profitLoss: 0, cohort: "Clean priced prospective record from 2026-10-11" },
      { name: "Jump Tissue", status: "MONITORING", tracked: 1, settled: 1, winners: 0, strike: 0, ae: null, roi: -1, roiBasis: "qualifying_median", pricedSettled: 1, profitLoss: -1, cohort: "Clean priced prospective record from 2026-10-11" },
      { name: "AW Tissue", status: "MONITORING", tracked: 1, settled: 1, winners: 1, strike: 1, ae: null, roi: 2, roiBasis: "qualifying_median", pricedSettled: 1, profitLoss: 2, cohort: "Clean priced prospective record from 2026-10-11" },
    ],
    historicalTissueMonitors: [
      { name: "Turf Tissue", status: "FROZEN", tracked: 295, settled: 267, winners: 37, strike: 37 / 267, ae: 1.05, roi: null, roiBasis: "median", pricedSettled: 0, cohort: "Pre clean-price epoch" },
    ],
    horses: [
      tissueHorse("turf-loss", "13:30", "Daily Turf Loss", { kind: "turf_tissue", result: "settled", outcome: "LOSS", finishingPosition: 4, profitLoss: -7 }),
      tissueHorse("turf-missing", "14:00", "Daily Turf Missing", { kind: "turf_tissue", result: "settled", outcome: "LOSS", finishingPosition: 5, profitLoss: null }),
      tissueHorse("jump-win", "14:30", "Daily Jump Win", { kind: "jump_tissue", result: "settled", outcome: "WIN", finishingPosition: 1, profitLoss: 2 }),
      tissueHorse("aw-pending", "18:30", "Daily AW Pending", { kind: "aw_tissue", result: "pending", outcome: null, profitLoss: null }),
    ],
  };

  const html = renderToStaticMarkup(<DailyResearchDashboard dashboard={dashboard} />);

  assert.match(html, /Clean priced prospective record from 11 Oct 2026/);
  assert.match(html, /Turf VALUE/);
  assert.match(html, /0 selections \/ 0 settled \/ 0 winners/);
  assert.match(html, /P\/L £0\.00/);
  assert.match(html, /ROI —/);
  assert.match(html, /Turf P\/L -£7\.00 · 1 return unavailable/);
  assert.match(html, /Jump P\/L \+£2\.00/);
  assert.match(html, /AW P\/L £0\.00/);
  assert.match(html, /Historical Tissue evidence/);
  assert.match(html, /Pre clean-price epoch/);
  assert.match(html, /295 \/ 267/);
  assert.match(html, /Historical ROI is not manufactured/);
});

function tissueHorse(
  id: string,
  time: string,
  horseName: string,
  overrides: Partial<ResearchDashboard["horses"][number]["signals"][number]>,
): ResearchDashboard["horses"][number] {
  return {
    raceId: `${id}-race`,
    runnerId: `${id}-runner`,
    horseId: `${id}-horse`,
    horseName,
    course: "Teston",
    time,
    sortTime: `2026-10-09T${time}:00Z`,
    price: 5,
    priceSource: "stored_snapshot",
    signals: [{
      kind: "jump_tissue",
      reason: "Tissue 25.0% · market 20.0% · +5.0pp",
      context: "Tissue rank #1",
      movement: null,
      tissueProbability: .25,
      marketProbability: .2,
      qualifyingPrice: 5,
      latestPrice: 5,
      result: "pending",
      ...overrides,
    }],
  };
}

function settledTissueRow(
  id: string,
  overrides: Partial<ResearchDashboard["horses"][number]["signals"][number]>,
) {
  const horse = tissueHorse(id, "13:00", id, { result: "settled", ...overrides });
  return { horse, signal: horse.signals[0]! };
}

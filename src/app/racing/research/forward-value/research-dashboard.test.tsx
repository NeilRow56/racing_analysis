import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DailyResearchDashboard, ResearchHistory } from "./research-dashboard";
import type { ResearchDashboard } from "@/lib/racing/research-monitor";

test("daily display renders one multi-signal horse, both reasons and unavailable market", () => {
  const dashboard: ResearchDashboard = { date: "2026-10-09", emptyMessage: null, monitors: [], horses: [{ raceId: "race", runnerId: "runner", horseId: "horse", horseName: "Overlap Horse", course: "Teston", time: "14:00", sortTime: "", price: null, priceSource: null,
    signals: [{ kind: "jump_tissue", reason: "Tissue 18.2% · market 12.5% · +5.7pp", context: "Tissue rank #1", movement: "No later snapshot" }, { kind: "jump_g4", reason: "Avg L3 #2 · class drop 4→5 · latest speed 118 > 109", context: "OR #4", movement: null }],
  }] };
  const html = renderToStaticMarkup(<DailyResearchDashboard dashboard={dashboard} />);
  assert.equal(html.match(/Overlap Horse/g)?.length, 1);
  for (const text of ["VALUE", "SHADOW", "Jump Tissue", "Jump G4", "Market unavailable", "class drop", "No later snapshot"]) assert.ok(html.includes(text));
  assert.ok(html.includes("/horses/horse"));
  assert.doesNotMatch(html, /Research status/);
  assert.match(renderToStaticMarkup(<ResearchHistory />), /Closed — weak \/ unstable/);
  assert.match(renderToStaticMarkup(<ResearchHistory />), /Frozen model — prospective monitoring/);
  const priced: ResearchDashboard = { ...dashboard, horses: dashboard.horses.map((horse) => ({ ...horse, price: 8, priceSource: "imported_card" })) };
  assert.match(renderToStaticMarkup(<DailyResearchDashboard dashboard={priced} />), /Latest imported card/);
  priced.horses[0] = { ...priced.horses[0], priceSource: "g4_capture" };
  assert.match(renderToStaticMarkup(<DailyResearchDashboard dashboard={priced} />), /G4 capture/);
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
  assert.doesNotMatch(html, /VALUE|Actual \/ model expected|Final SP ROI/);
});

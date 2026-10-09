import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DailyResearchDashboard } from "./research-dashboard";
import type { ResearchDashboard } from "@/lib/racing/research-monitor";

test("daily display renders one multi-signal horse, both reasons and unavailable market", () => {
  const dashboard: ResearchDashboard = { date: "2026-10-09", emptyMessage: null, monitors: [], horses: [{ raceId: "race", runnerId: "runner", horseId: "horse", horseName: "Overlap Horse", course: "Teston", time: "14:00", sortTime: "", price: null, priceSource: null,
    signals: [{ kind: "jump_tissue", reason: "Tissue 18.2% · market 12.5% · +5.7pp", context: "Tissue rank #1", movement: "No later snapshot" }, { kind: "jump_g4", reason: "Avg L3 #2 · class drop 4→5 · latest speed 118 > 109", context: "OR #4", movement: null }],
  }] };
  const html = renderToStaticMarkup(<DailyResearchDashboard dashboard={dashboard} />);
  assert.equal(html.match(/Overlap Horse/g)?.length, 1);
  for (const text of ["VALUE", "SHADOW", "Jump Tissue", "Jump G4", "Market unavailable", "class drop", "No later snapshot", "Closed — weak / unstable", "Frozen model — prospective monitoring"]) assert.ok(html.includes(text));
  assert.ok(html.includes("/horses/horse"));
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
  assert.doesNotMatch(html, /proven|profitable|recommended/i);
});

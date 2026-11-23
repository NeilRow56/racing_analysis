import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyTodaysRatingWeightForward, loadTodaysRatingWeightForward } from "@/lib/racing/todays-rating-weight-forward";
import { LighterWeightSummary } from "./lighter-weight-summary";
import { SecondaryResearchMonitoring } from "./research-dashboard";

test("secondary monitoring shows the two bands and all nine winners on separate price bases", async () => {
  const ledger = await loadTodaysRatingWeightForward();
  const data = { ...ledger, observations: ledger.observations.filter(row => row.raceDate <= "2026-11-07") };
  const before = structuredClone(data);
  const html = renderToStaticMarkup(<SecondaryResearchMonitoring weight={data}
    dashboard={{ date: "2026-11-07", emptyMessage: null, horses: [], monitors: [] }} />);
  const [headline, contribution] = html.split("<details");
  assert.match(headline, /4–7 lb lighter/);
  assert.match(headline, /8\+ lb lighter/);
  assert.match(headline, /Combined/);
  const rows = [...headline.matchAll(/<tr><th scope="row"[^>]*>([^<]+)<\/th>(.*?)<\/tr>/g)];
  const values = Object.fromEntries(rows.map(([, label, cells]) => [label, [...cells.matchAll(/<td[^>]*>([^<]+)<\/td>/g)].map(([, value]) => value)]));
  assert.deepEqual(values, {
    "Qualifying selections": ["57", "94", "151"],
    "Settled bets": ["49", "78", "127"],
    "Winners": ["4", "5", "9"],
    "Pending selections": ["6", "6", "12"],
    "Void selections": ["2", "10", "12"],
    "Captured-price stakes": ["47", "76", "123"],
    "Captured-price £1 P/L": ["+£54.00", "−£17.00", "+£37.00"],
    "Captured-price ROI": ["114.89%", "-22.37%", "30.08%"],
    "Final-SP stakes": ["49", "78", "127"],
    "Final-SP £1 P/L": ["+£86.50", "−£42.00", "+£44.50"],
    "Final-SP ROI": ["176.53%", "-53.85%", "35.04%"],
  });
  assert.doesNotMatch(headline, /Craven Force|Callianassa/);
  assert.match(contribution, /Largest winning contribution/);
  assert.match(contribution, /Craven Force · \+£70\.00/);
  assert.match(contribution, /Craven Force · \+£100\.00/);
  assert.match(contribution, /Callianassa · \+£18\.00/);
  assert.match(contribution, /Callianassa · \+£11\.00/);
  assert.deepEqual(data, before);
});

test("an empty ledger shows no data and leaves P/L and ROI unavailable", () => {
  const html = renderToStaticMarkup(<LighterWeightSummary data={emptyTodaysRatingWeightForward()} />);
  assert.match(html, /NO DATA/);
  assert.match(html, /Captured-price £1 P\/L<\/th>(?:<td[^>]*>—<\/td>){3}/);
  assert.match(html, /Final-SP ROI<\/th>(?:<td[^>]*>—<\/td>){3}/);
  assert.doesNotMatch(html, /Largest winning contribution/);
});

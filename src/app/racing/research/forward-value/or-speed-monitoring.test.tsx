import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { loadOrSpeed, OR_SPEED_EPOCH, OR_SPEED_PATH, summarizeOrSpeed } from "@/lib/racing/or-speed-forward";
import { OrSpeedMonitoring } from "./or-speed-monitoring";
import { ResearchPageLayout } from "./research-page-layout";

test("Forward Research displays all ten original cohort summaries exactly without changing prospective data", async () => {
  const ledgerBefore = await readFile(OR_SPEED_PATH, "utf8");
  const data = await loadOrSpeed(), before = structuredClone(data);
  const summary = summarizeOrSpeed(data);
  const monitor = await OrSpeedMonitoring();
  const html = renderToStaticMarkup(<ResearchPageLayout date="2026-11-11" archiveLoaded={false}
    active={<p>Existing active totals</p>} secondary={monitor}><p>Existing archive</p></ResearchPageLayout>);
  const tables = [...html.matchAll(/<tbody>(.*?)<\/tbody>/g)];
  assert.equal(tables.length, 2);
  for (const [index, family] of (["TURF", "AW"] as const).entries()) {
    const rows = [...tables[index][1].matchAll(/<tr>(.*?)<\/tr>/g)];
    assert.equal(rows.length, 5);
    assert.deepEqual(rows.map(row => [...row[1].matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/g)].map(cell => cell[1]
      .replaceAll("&gt;", ">").replaceAll("&amp;", "&"))),
    summary.filter(row => row.family === family).map(row => [row.cohort, String(row.observations), String(row.settled),
      String(row.winners), row.winPercent?.toFixed(1) ?? "—", row.top3Percent?.toFixed(1) ?? "—",
      row.meanNormalizedFinish?.toFixed(3) ?? "—", row.sample]));
  }
  assert.match(html, /OR \+ Best L3 Speed — Prospective Monitoring/);
  assert.ok(html.includes(`Activation: ${OR_SPEED_EPOCH}`));
  assert.match(html, /No historical backfill/);
  assert.match(html, /Cohorts overlap/);
  assert.match(html, /Independent of Value filters, settlement summaries and headline totals/);
  assert.match(html, /Fewer than 50 settled: TOO EARLY · 50–149: EARLY · 150–299: DEVELOPING · 300\+: MEANINGFUL/);
  assert.ok(html.indexOf('id="secondary-monitoring"') < html.indexOf('id="or-speed-monitoring"'));
  assert.ok(html.indexOf('id="or-speed-monitoring"') < html.indexOf('id="archived-research"'));
  assert.doesNotMatch(html, /<form/);
  assert.deepEqual(data, before);
  assert.deepEqual(monitor.props.data, data);
  assert.equal(await readFile(OR_SPEED_PATH, "utf8"), ledgerBefore);
});

test("monitor is independent of Value inputs and leaves other layout sections unchanged", async () => {
  const monitor = await OrSpeedMonitoring();
  const view = (secondary: React.ReactNode, secondaryOpen = false) => renderToStaticMarkup(
    <ResearchPageLayout date="2026-11-11" archiveLoaded secondaryOpen={secondaryOpen}
      active={<p>Original active figures: 123</p>} secondary={secondary}><p>Original archive figures: 456</p></ResearchPageLayout>);
  const original = view(<p>Existing secondary figures: 789</p>);
  const consolidated = view(<><p>Existing secondary figures: 789</p>{monitor}</>);
  const outsideSecondary = (html: string) => html.replace(/<details[^>]*id="secondary-monitoring"[\s\S]*?<\/details>/, "");
  assert.equal(outsideSecondary(consolidated), outsideSecondary(original));
  assert.match(consolidated, /Existing secondary figures: 789/);
  assert.match(view(monitor, true), /<details open="" id="secondary-monitoring"/);
  const source = await readFile("src/app/racing/research/forward-value/forward-value-page.tsx", "utf8");
  assert.match(source, /secondary=\{<><SecondaryResearchMonitoring dashboard=\{dashboard\} \/><OrSpeedMonitoring \/><\/>\}/);
  assert.match(source, /secondaryOpen=\{scalar\(params\?\.monitor\) === "or-speed"\}/);
  assert.doesNotMatch(source, /summarizeOrSpeed|loadOrSpeed/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { profiledServerWork } from "./profiled-server-work";
import { HurdleV3ShadowResearch } from "./hurdle-v3-shadow-monitor";
import { HurdleV3MarketEdgeResearch } from "./hurdle-v3-market-edge-monitor";
import { LowFormHurdleResearch } from "./hurdle-low-form-monitor";
import { TissuePositiveNeutralResearch } from "./tissue-positive-neutral-monitor";
import { EarlyTurfResearch } from "./turf-early-season-monitor";
import { profileRequest } from "@/lib/racing/performance-profile";

test("deferred server work retains its request after the page returns; disabled work preserves fallback", async () => {
  const previous = process.env.RACING_PROFILE, research = process.env.RESEARCH_PROFILE, info = console.info;
  const rows: Array<Record<string, unknown>> = [];
  console.info = (line: string) => { rows.push(JSON.parse(line)); };
  try {
    process.env.RACING_PROFILE = "1"; delete process.env.RESEARCH_PROFILE;
    let calls = 0;
    const element = await profileRequest("page", async () => profiledServerWork("monitor.fixture", async () => { calls++; await Promise.resolve(); return <p>stored fixture</p>; }, <p>fallback</p>));
    const stream = await renderToReadableStream(element);
    await stream.allReady;
    assert.match(await new Response(stream).text(), /stored fixture/);
    assert.equal(calls, 1);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].requestId, rows[1].requestId);
    assert.equal(rows[1].parentSpanId, rows[0].spanId);
    process.env.RACING_PROFILE = "0";
    assert.equal(renderToStaticMarkup(profiledServerWork("disabled", () => { throw Error("must not run"); }, <p>fallback</p>)), "<p>fallback</p>");
    assert.equal(rows.length, 2);

    // Real stored ledger reads only; original and profiled paths must produce identical HTML.
    const monitors = [HurdleV3ShadowResearch, HurdleV3MarketEdgeResearch, LowFormHurdleResearch, TissuePositiveNeutralResearch, EarlyTurfResearch];
    const baseline = await Promise.all(monitors.map(async monitor => renderToStaticMarkup(await monitor())));
    process.env.RACING_PROFILE = "1";
    const enabled = await profileRequest("monitors", () => Promise.all(monitors.map(async monitor => renderToStaticMarkup(await monitor()))));
    assert.deepEqual(enabled, baseline);
    const shadows = rows.filter(row => row.operation === "loadHurdleV3Shadow");
    assert.equal(shadows.length, 3);
    assert.equal(shadows.filter(row => row.repeated).length, 2);
    assert.equal(rows.filter(row => row.operation === "loadTissueGeneration").length, 2);
  } finally {
    console.info = info;
    if (previous === undefined) delete process.env.RACING_PROFILE; else process.env.RACING_PROFILE = previous;
    if (research === undefined) delete process.env.RESEARCH_PROFILE; else process.env.RESEARCH_PROFILE = research;
  }
});

import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import ForwardValuePage from "../src/app/racing/research/forward-value/forward-value-page";

process.env.RESEARCH_PROFILE = "1";
for (const label of ["COLD", "WARM"]) {
  const start = performance.now();
  const page = await ForwardValuePage({ searchParams: Promise.resolve(process.argv.includes("--archive") ? { archive: "1" } : {}) });
  const loaded = performance.now();
  const html = renderToStaticMarkup(page);
  console.info(`${label}: server data ${(loaded - start).toFixed(1)}ms; component render ${(performance.now() - loaded).toFixed(1)}ms; total ${(performance.now() - start).toFixed(1)}ms; HTML ${html.length} chars`);
}

// Optional read-only parity check against the original full Today racecard loader.
if (process.argv.includes("--verify-results")) {
  const { createDbConnection } = await import("../src/db");
  const { loadForwardValueData } = await import("../src/lib/racing/forward-value");
  const { getRacecardRowsForRaceIds, groupTodaysRacingRows } = await import("../src/lib/racing/todays-racing");
  const { todayRaceHasConclusiveResult } = await import("../src/lib/racing/today-race-status");
  const { getResearchCanonicalResultRaceIds } = await import("../src/lib/racing/research-result-status");
  const { db, client } = createDbConnection();
  try {
    const ids = (await loadForwardValueData()).races.map(r => r.raceId);
    const legacy = new Set(groupTodaysRacingRows(await getRacecardRowsForRaceIds(db, ids)).flatMap(m => m.races.filter(todayRaceHasConclusiveResult).map(r => r.raceId)));
    const projected = await getResearchCanonicalResultRaceIds(db, ids);
    assert.deepEqual([...projected].sort(), [...legacy].sort());
    console.info(`Result projection parity: ${projected.size} conclusive races; exact match`);
  } finally { await client.end(); }
}

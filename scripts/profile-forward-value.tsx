import assert from "node:assert/strict";

// Retain the existing command while using the enforced read-only, correlated profiler.
process.argv.splice(2, 0, "forward-value");
await import("./profile-pages");

// Optional read-only parity check against the original full Today racecard loader.
if (!process.exitCode && process.argv.includes("--verify-results")) {
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

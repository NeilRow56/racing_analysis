import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { applicableCurrentPrices, type CurrentPriceOverlay } from "./current-price-overlay";
import { summarizeTodayMarketPrice, type TodayRace, type TodayRunner, type TodayMeeting } from "./todays-racing";
import { TodayMarketOdds, FrozenValueRankCell } from "@/app/racing/today/tissue-cells";

const now = new Date("2026-11-12T09:00:00Z");
function fixture() {
  const runner = { runnerSourceId: "ride", runnerId: "local-ride", horseId: "horse", bookmakerQuotes: [],
    resultStatus: null, finishingPosition: null, tissueGenerationActive: true,
    activeTissue: { probability: .25, rank: 1, modelVersion: "Hurdle V2", completeMarket: false } } as unknown as TodayRunner;
  const race = { raceId: "local", sourceId: "race", raceStage: "PRE_RACE", winningTime: null,
    raceDateTime: new Date("2026-11-12T18:00:00Z"), runners: [runner] } as TodayRace;
  const overlay: CurrentPriceOverlay = { race_id: "local", source_id: "race", retrieved_at: now,
    scheduled_off: race.raceDateTime!, payload: { raceSourceId: "race", raceDate: "2026-11-12", off: "2026-11-12T18:00:00Z", raceStage: "PRE_RACE",
      runners: [{ runnerSourceId: "ride", horseSourceId: "horse", runnerStatus: null, available: true,
        bookmakerOdds: [{ bookmakerId: 1, decimalOddsString: "4.5" }] }] } };
  return { runner, race, overlay };
}

test("overlay prices display separately and never become frozen market evidence", () => {
  const { runner, race, overlay } = fixture();
  const before = JSON.stringify(runner);
  const frozenBefore = renderToStaticMarkup(<FrozenValueRankCell runner={runner} kind="marketRank" />);
  const valueBefore = renderToStaticMarkup(<FrozenValueRankCell runner={runner} kind="valueRank" />);
  const currentBookmakerPrices = applicableCurrentPrices(race, overlay, now)!.get("ride");
  const displayRunner = { ...runner, currentBookmakerPrices };
  const html = renderToStaticMarkup(<TodayMarketOdds runner={displayRunner} />);
  assert.ok(html.includes("Current"));
  assert.ok(html.includes("4.50"));
  assert.ok(html.includes("not frozen morning evidence"));
  assert.equal(renderToStaticMarkup(<FrozenValueRankCell runner={displayRunner} kind="marketRank" />), frozenBefore);
  assert.ok(frozenBefore.includes("No captured bookmaker market"));
  assert.equal(renderToStaticMarkup(<FrozenValueRankCell runner={displayRunner} kind="valueRank" />), valueBefore);
  assert.ok(valueBefore.includes("No captured bookmaker market"));
  assert.equal(summarizeTodayMarketPrice(displayRunner).quoteCount, 0);
  assert.deepEqual(displayRunner.activeTissue, runner.activeTissue);
  assert.equal(JSON.stringify(runner), before);
});

test("original fallback is unchanged", () => {
  const { runner } = fixture();
  assert.ok(!renderToStaticMarkup(<TodayMarketOdds runner={runner} />).includes("Current"));
  runner.bookmakerQuotes = [{ bookmakerId: 1, bookmakerName: "Book", decimalOdds: 3, fractionalOdds: "2/1" }];
  const html = renderToStaticMarkup(<TodayMarketOdds runner={runner} />);
  assert.ok(html.includes("2/1"));
  assert.ok(html.includes("Original imported bookmaker evidence"));
});

test("rejects expired, future, started, unknown and mismatched overlays", () => {
  const changes: ((r: TodayRace, p: CurrentPriceOverlay) => void)[] = [
    r => { r.raceStage = "OFF"; }, r => { r.raceStage = null; },
    r => { r.winningTime = "3m"; }, r => { r.runners[0].finishingPosition = 1; },
    r => { r.runners[0].runnerSourceId = "different"; },
    r => { r.runners[0].resultStatus = "non_runner"; },
    (_, p) => { p.source_id = "different"; }, (_, p) => { p.race_id = "different"; },
    (_, p) => { p.retrieved_at = "2026-11-12T08:54:59Z"; },
    (_, p) => { p.retrieved_at = "2026-11-12T09:00:01Z"; },
    (_, p) => { p.scheduled_off = "invalid"; }, (_, p) => { p.payload = {}; },
  ];
  for (const change of changes) {
    const { race, overlay } = fixture();
    change(race, overlay);
    assert.equal(applicableCurrentPrices(race, overlay, now), null);
  }
  const { race, overlay } = fixture();
  assert.equal(applicableCurrentPrices(race, overlay, new Date("2026-11-12T18:00:00Z")), null);
});

// Opt-in only: the disposable cluster created for scraper/tests/test_today_prices.py.
// Never reads DATABASE_URL or loads .env.local.
(process.env.PRICES_TEST_POSTGRES === "1" ? test : test.skip)("PostgreSQL reader enforces original import, horse identity and pre-off applicability", async () => {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const schema = await import("@/db/schema");
  const { attachCurrentPriceOverlays } = await import("./current-price-overlay");
  const client = postgres({ host: "/tmp/racing-price-test-pg", port: 55439, database: "postgres", user: "neilrowland", ssl: false });
  const connection = { client, db: drizzle(client, { schema }) };
  try {
    const [row] = await connection.client`select r.id, r.race_datetime, p.retrieved_at from races r join race_current_prices p on p.race_id = r.id`;
    assert.ok(row);
    const { race, runner } = fixture();
    race.raceId = row.id;
    race.raceDateTime = new Date(row.race_datetime);
    runner.horseId = "00000000-0000-0000-0000-000000000003";
    const meetings = [{ races: [race] }] as TodayMeeting[];
    const current = new Date();
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(current);
    const read = () => attachCurrentPriceOverlays(connection.db, meetings, date, current);
    const displayed = await read();
    assert.equal(displayed[0].races[0].runners[0].currentBookmakerPrices?.quotes[0].decimalOdds, 4.5);
    assert.deepEqual(meetings[0].races[0].runners[0].bookmakerQuotes, []);
    await connection.client`update horses set source_id = 'mismatch'`;
    assert.equal((await read())[0].races[0].runners[0].currentBookmakerPrices, undefined);
    await connection.client`update horses set source_id = 'horse'`;
    await connection.client`update source_imports set fetched_at = fetched_at + interval '1 second'`;
    assert.equal((await read())[0].races[0].runners[0].currentBookmakerPrices, undefined);
    await connection.client`update source_imports set fetched_at = fetched_at - interval '1 second'`;
    await connection.client`update races set off_time = '09:00'`;
    assert.equal((await read())[0].races[0].runners[0].currentBookmakerPrices, undefined);
    await connection.client`update races set off_time = null`;
  } finally {
    await connection.client.end();
  }
});

test("price feature preserves the original 141 source pins, collection graph and frozen models", { timeout: 30000 }, async () => {
  const { assertEpochSources, loadEpochManifest } = await import("./prospective-epoch-integrity");
  const { buildDependencyProvenance, verifyFrozenEpochModels } = await import("../../../scripts/activate-prospective-epochs");
  const manifest = await loadEpochManifest();
  assert.ok(manifest);
  assert.equal(Object.keys(manifest.sourceHashes).length, 141);
  await assertEpochSources(manifest);
  const current = await buildDependencyProvenance();
  assert.deepEqual(current.sourceHashes, manifest.sourceHashes);
  assert.deepEqual(current.dependencyGraph, manifest.dependencyGraph);
  assert.deepEqual(await verifyFrozenEpochModels(), manifest.models);
  for (const isolated of ["scripts/refresh-today-prices.ts", "src/db/current-prices-schema.ts", "src/lib/racing/current-price-overlay.ts"]) {
    assert.equal(current.sourceHashes[isolated], undefined, isolated);
  }
});

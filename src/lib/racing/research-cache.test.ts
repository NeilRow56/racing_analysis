import type { ValueCohortDisplay } from "./tissue-value-view";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rename, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createResearchCache, researchFileIdentity } from "./research-cache";
import { loadValueForward } from "./tissue-value-forward";
import { VALUE_COHORTS } from "./tissue-value-config";
import { activeValuePerformance } from "./active-value-performance";
import { loadTissueGeneration, summarizeTissueGeneration } from "./tissue-generation-forward";
import { canonicalResearchResultIds, type ResearchResultRow } from "./research-result-status";
import { todayRaceHasConclusiveResult } from "./today-race-status";
import type { TodayRace } from "./todays-racing";

test("source identity detects new files, same-size edits, atomic replacement, deletion and chase snapshots", async () => {
  const directory = await mkdtemp(join(tmpdir(), "research-identity-"));
  try {
    let key = await researchFileIdentity(directory);
    const changed = async () => { const next = await researchFileIdentity(directory); assert.notEqual(next, key); key = next; };
    const path = join(directory, "ledger.json");
    await writeFile(path, "one"); await changed();
    await writeFile(path, "two"); await changed();
    await writeFile(join(directory, "temporary"), "two");
    await rename(join(directory, "temporary"), path); await changed();
    const nested = join(directory, "chase-speed-reliability-shadow-v1");
    await mkdir(nested); await writeFile(join(nested, "snapshot.json"), "{}"); await changed();
    await rm(path); await changed();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("cache coalesces reads, keys database changes, bounds freshness, and retries failures", async () => {
  let calls = 0;
  const cached = createResearchCache<number>();
  const work = async () => ++calls;
  assert.deepEqual(await Promise.all([cached("files:db1", work), cached("files:db1", work)]), [1, 1]);
  assert.equal(await cached("files:db2", work), 2, "Result/NR/card DB identity invalidates");
  assert.equal(await cached("newfiles:db2", work), 3);
  const expired = createResearchCache<number>(0);
  assert.equal(await expired("same", work), 4); assert.equal(await expired("same", work), 5);
  await assert.rejects(cached("failed", async () => { throw new Error("retry"); }));
  assert.equal(await cached("failed", work), 6);
});

test("real Value and Tissue summaries match uncached results and invalidate on capture, settlement and NR updates; archive retained", async () => {
  const directory = await mkdtemp(join(tmpdir(), "research-summary-"));
  try {
    const sources = await Promise.all(VALUE_COHORTS.map(async config => ({ config, data: await loadValueForward(config) })));
    const { config, data: valueSource } = sources.find(s => s.data.races.some(r => r.valueRankPolicy?.legacyRankOne.some(d => d.retained)))!;
    const originalBytes = await readFile(config.path, "utf8");
    const generationSource = await loadTissueGeneration();
    const value = { ...valueSource, races: [structuredClone(valueSource.races.find(r => r.valueRankPolicy?.legacyRankOne.some(d => d.retained))!)] };
    const generation = { ...generationSource, races: [structuredClone(generationSource.races[0])] };
    for (const book of [...value.races, ...generation.races]) for (const runner of book.runners) runner.outcome = null;
    const valuePath = join(directory, "value.json"), tissuePath = join(directory, "generation.json");
    await writeFile(valuePath, JSON.stringify(value)); await writeFile(tissuePath, JSON.stringify(generation));
    const calculate = async () => {
      const [v, t] = await Promise.all([loadValueForward(config, valuePath), loadTissueGeneration(tissuePath)]);
      return { active: activeValuePerformance([v]), tissue: summarizeTissueGeneration(t), archive: v.races };
    };
    const cache = createResearchCache<Awaited<ReturnType<typeof calculate>>>();
    const read = async () => cache(await researchFileIdentity(directory), calculate);
    const initial = await read();
    assert.deepEqual(initial, await calculate()); assert.equal(await read(), initial);
    const extra = structuredClone(value.races[0]); extra.raceId += "-new-capture";
    value.races.push(extra);
    const tissueExtra = structuredClone(generation.races[0]); tissueExtra.raceId += "-new-capture";
    generation.races.push(tissueExtra);
    await writeFile(valuePath, JSON.stringify(value)); await writeFile(tissuePath, JSON.stringify(generation));
    const captured = await read();
    assert.notDeepEqual(captured.active, initial.active); assert.notDeepEqual(captured.tissue, initial.tissue);
    assert.equal(captured.archive.length, 2); assert.deepEqual(captured.archive[0], initial.archive[0]);
    const settledAt = new Date().toISOString();
    for (const book of [...value.races, ...generation.races]) for (const runner of book.runners) runner.outcome = {
      ...( "valueRank" in runner ? { settlementVersion: "canonical_settlement_v2" as const } : {}),
      status: "settled", finishPosition: 1, resultStatus: null, winner: true, deadHeatDivisor: 1,
      grossReturn: 2, profitLoss: 1, settledAt,
    };
    await writeFile(valuePath, JSON.stringify(value)); await writeFile(tissuePath, JSON.stringify(generation));
    const settled = await read();
    assert.deepEqual(settled, await calculate());
    assert.notDeepEqual(settled.active, captured.active); assert.notDeepEqual(settled.tissue, captured.tissue);
    for (const book of [...value.races, ...generation.races]) for (const runner of book.runners) Object.assign(runner.outcome!, {
      status: "NR", finishPosition: null, resultStatus: "non_runner", winner: null, grossReturn: null, profitLoss: null,
    });
    await writeFile(valuePath, JSON.stringify(value)); await writeFile(tissuePath, JSON.stringify(generation));
    const nr = await read(); assert.deepEqual(nr, await calculate());
    assert.notDeepEqual(nr.active, settled.active); assert.notDeepEqual(nr.tissue, settled.tissue);
    assert.equal(await readFile(config.path, "utf8"), originalBytes, "Source research ledger untouched");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("settlement projection matches Today conclusive-result semantics for pending, winners, incomplete, NR and void", () => {
  const row: ResearchResultRow = { raceId: "r", winningTime: "1m", finishingPosition: 1, resultStatus: null, oddsDecimal: "2.00" };
  for (const rows of [
    [row], [{ ...row, winningTime: " " }], [{ ...row, finishingPosition: 2 }],
    [row, { ...row, finishingPosition: null, oddsDecimal: null }],
    [row, { ...row, finishingPosition: null, resultStatus: "non_runner", oddsDecimal: null }],
    [row, { ...row, finishingPosition: null, resultStatus: "pulled_up" }],
    [row, { ...row, finishingPosition: null, resultStatus: "void", oddsDecimal: null }],
  ]) {
    const race = { winningTime: rows[0].winningTime, runners: rows } as unknown as TodayRace;
    assert.equal(canonicalResearchResultIds(rows).has("r"), todayRaceHasConclusiveResult(race));
  }
});

test("active cohort ships identical precomputed family summaries without historical runner payloads; archive still available", async () => {
  const { TissueValueMonitoring } = await import("../../app/racing/research/forward-value/tissue-value-monitoring");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const cohorts = await Promise.all(VALUE_COHORTS.map(async config => ({ config, data: await loadValueForward(config) })));
  const active = TissueValueMonitoring({ cohorts, date: "2026-11-06", includeArchive: false });
  const archive = TissueValueMonitoring({ cohorts, date: "2026-11-06", includeArchive: true });
  assert.ok(active.props.cohorts.every((c: ValueCohortDisplay) => c.races.length === 0));
  assert.ok(archive.props.cohorts.some((c: ValueCohortDisplay) => c.races.length > 0));
  assert.deepEqual(active.props.summaries, archive.props.summaries);
  assert.deepEqual(active.props.totals, archive.props.totals);
  for (const family of ["ALL", "TURF", "AW", "HURDLE", "CHASE"]) {
    const races = archive.props.cohorts.filter((c: ValueCohortDisplay) => c.available && (family === "ALL" || c.family === family)).flatMap((c: ValueCohortDisplay) => c.races);
    const { summarizeValueRankV2 } = await import("./value-rank-v2");
    assert.deepEqual(active.props.summaries[family].valueRank, summarizeValueRankV2(races));
  }
  const activeHtml = renderToStaticMarkup(active);
  assert.match(activeHtml, /Load original frozen Value observations/);
  assert.match(activeHtml, /PRICE ABOVE 67.00/);
  assert.match(renderToStaticMarkup(archive), /Sort runners by/);
});

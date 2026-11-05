import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { VALUE_COHORTS } from "@/lib/racing/tissue-value-config";
import { loadValueForward } from "@/lib/racing/tissue-value-forward";
import { loadTissueGeneration, type GenerationRace } from "@/lib/racing/tissue-generation-forward";
import { GENERATION_MODEL_HASHES } from "@/lib/racing/tissue-generation-config";
import { GENERATION_MODEL_VERSIONS } from "@/lib/racing/tissue-generation-model";
import { selectActiveResearchCaptures } from "./active-tissue-captures";
import { ActiveTissueRaceTables } from "./active-tissue-race-tables";
import { TissueValueMonitoring } from "./tissue-value-monitoring";

const date = "2026-11-05", now = new Date(`${date}T12:00:00Z`);
const cohorts = await Promise.all(VALUE_COHORTS.map(async config => ({ config, data: await loadValueForward(config) })));
const generation = await loadTissueGeneration();
const hurdle = generation.races.find(r => r.raceDate === date && r.course === "Clonmel" && r.scheduledOff.includes("12:50"))!;
const old = cohorts.flatMap(c => c.data.races).find(r => r.raceId === hurdle.raceId)!;
const select = (books: GenerationRace[], at = now) => selectActiveResearchCaptures(cohorts, { ...generation, races: books }, date, at);

test("A: Clonmel selects the existing later HURDLE_TISSUE_V2 whole book instead of 05:36 JUMP_TISSUE_V1", () => {
  assert.equal(old.modelVersion, "JUMP_TISSUE_V1");
  assert.ok(old.capturedAt.startsWith(`${date}T05:36:`));
  const selected = select([hurdle]).find(r => r.raceId === hurdle.raceId)!;
  assert.equal(selected.modelVersion, "HURDLE_TISSUE_V2");
  assert.equal(selected.capturedAt, hurdle.capturedAt);
  assert.deepEqual(selected.runners.map(r => r.runnerId), hurdle.runners.map(r => r.runnerId));
  for (const row of selected.runners) {
    const source = hurdle.runners.find(r => r.runnerId === row.runnerId)!;
    assert.equal(row.probability, source.probability);
    assert.equal(row.tissueRank, source.rank);
    assert.equal(row.marketPrice, source.capturedPrice);
    assert.equal(row.marketRank, 1 + hurdle.runners.filter(r => r.capturedPrice! < source.capturedPrice!).length);
  }
  const html = renderToStaticMarkup(<ActiveTissueRaceTables races={[selected]} date={date} />);
  assert.ok(html.includes("HURDLE_TISSUE_V2"));
  assert.ok(!html.includes("JUMP_TISSUE_V1"));
  assert.ok(!html.includes("05:36"));
});

test("B: archive still renders the original 05:36 observation without rewriting inputs or ledgers", async () => {
  const paths = [...VALUE_COHORTS.map(c => c.path), "data/research/tissue-generation-forward-2026-11.json"];
  const beforeFiles = await Promise.all(paths.map(p => readFile(p, "utf8")));
  const before = JSON.stringify({ cohorts, generation });
  select(generation.races);
  const html = renderToStaticMarkup(<TissueValueMonitoring cohorts={cohorts} date={date} />);
  assert.ok(html.includes("Archive · original frozen Value observations"));
  assert.ok(html.includes("Captured 05:36 London time"));
  assert.ok(html.includes("JUMP_TISSUE_V1"));
  assert.equal(JSON.stringify({ cohorts, generation }), before);
  assert.deepEqual(await Promise.all(paths.map(p => readFile(p, "utf8"))), beforeFiles);
});

test("C/D: newest valid pre-off wins independent of order, including after the race; post-off and future clocks are excluded", () => {
  const earlier = { ...structuredClone(hurdle), capturedAt: `${date}T09:00:00.000Z`, featureCutoffAt: `${date}T09:00:00.000Z` };
  const latest = { ...structuredClone(hurdle), capturedAt: `${date}T12:49:00.000Z` };
  const atOff = { ...structuredClone(hurdle), capturedAt: hurdle.scheduledOff };
  const postOff = { ...structuredClone(hurdle), capturedAt: `${date}T12:51:00.000Z` };
  for (const books of [[latest, earlier, atOff, postOff], [postOff, atOff, earlier, latest]]) {
    assert.equal(select(books, new Date(`${date}T14:00:00Z`)).find(r => r.raceId === hurdle.raceId)!.capturedAt, latest.capturedAt);
    assert.equal(select(books).find(r => r.raceId === hurdle.raceId)!.capturedAt, earlier.capturedAt);
  }
  const invalid = { ...latest, modelHash: "0".repeat(64) };
  assert.equal(select([earlier, invalid]).find(r => r.raceId === hurdle.raceId)!.capturedAt, earlier.capturedAt);
});

test("E: all families select their later new-generation model, including CHASE_TISSUE_V2", () => {
  for (const family of ["TURF", "AW", "HURDLE", "CHASE"] as const) {
    // No Turf meeting is captured on this date; use a frozen-book fixture for its selection contract.
    const source: GenerationRace = generation.races.find(r => r.raceDate === date && r.family === family)
      ?? { ...structuredClone(hurdle), family, modelVersion: GENERATION_MODEL_VERSIONS[family], modelHash: GENERATION_MODEL_HASHES[family] };
    const earlier = { ...structuredClone(source), capturedAt: `${date}T08:00:00.000Z`, featureCutoffAt: `${date}T08:00:00.000Z` };
    const selected = select([source, earlier]).find(r => r.raceId === source.raceId)!;
    assert.equal(selected.modelVersion, GENERATION_MODEL_VERSIONS[family]);
    assert.equal(selected.capturedAt, source.capturedAt);
  }
});

test("legacy pre-off fallback is retained when no valid new book exists; other dates are excluded", () => {
  assert.equal(select([]).find(r => r.raceId === old.raceId)!.capturedAt, old.capturedAt);
  assert.deepEqual(selectActiveResearchCaptures(cohorts, generation, "2099-01-01", now), []);
});

test("incomplete-market capture keeps current Tissue without borrowing old prices, ranks or withdrawn runners", () => {
  const incomplete = { ...structuredClone(hurdle), completeMarket: false };
  incomplete.runners.forEach(r => { r.capturedPrice = null; });
  incomplete.runners[0].quotes = [];
  const selected = select([incomplete]).find(r => r.raceId === hurdle.raceId)!;
  assert.equal(selected.modelVersion, "HURDLE_TISSUE_V2");
  assert.ok(selected.runners.every(r => r.marketPrice === null && r.marketRank === null));
});

test("Research route wires active selection separately from the unchanged Value-cohort monitor", async () => {
  const source = await readFile("src/app/racing/research/forward-value/forward-value-page.tsx", "utf8");
  assert.ok(source.includes("<ActiveTissueRaceTables races={selectActiveResearchCaptures(valueCohorts, generation, raceDate)}"));
  assert.ok(source.includes("<TissueValueMonitoring cohorts={valueCohorts} date={raceDate}"));
});

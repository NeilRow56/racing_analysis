import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { shadowMeetings, shadowNow } from "@/lib/racing/context-weight-shadow.fixtures";
import { loadTissueGenerationModels } from "@/lib/racing/tissue-generation-model";
import { GENERATION_FEATURES } from "@/lib/racing/tissue-generation-features";
import type { GenerationRace } from "@/lib/racing/tissue-generation-forward";
import { buildHurdleV3Shadow } from "@/lib/racing/hurdle-v3-shadow";
import { hurdleV3ParticipantPrior, type HurdleV3ShadowInput } from "@/lib/racing/hurdle-v3-shadow-inputs";
import { buildTissueDailyWatchList } from "@/lib/racing/tissue-daily-watch-list";
import { FrozenRacecardRanks } from "./tissue-cells";
import { HurdleModelComparison } from "./hurdle-model-comparison";

async function fixture() {
  const model = (await loadTissueGenerationModels()).HURDLE;
  const book: GenerationRace = {
    family: "HURDLE", modelVersion: model.version, modelHash: model.checksum, raceId: "test-hurdle",
    raceDate: shadowNow.toISOString().slice(0, 10), course: "Fixture", capturedAt: shadowNow.toISOString(),
    featureCutoffAt: shadowNow.toISOString(), scheduledOff: new Date(shadowNow.getTime() + 3600000).toISOString(),
    featureNames: model.baseModel.names, adjustmentFeatureNames: GENERATION_FEATURES.HURDLE,
    completeMarket: false, marketSource: "sporting_life_median_bookmaker_at_capture_v1",
    runners: ["a", "b", "c"].map((id, i) => ({ runnerId: id, horseId: id, horseName: `Horse ${id}`,
      probability: [.5, .3, .2][i], rank: i + 1, modelInputs: [...model.baseModel.means],
      adjustmentInputs: [...model.adjustment.means], capturedPrice: null, quotes: [], outcome: null })),
  };
  const meetings = shadowMeetings(book), race = meetings[0].races[0];
  race.raceType = "Hurdle"; race.raceName = "Fixture Hurdle";
  race.runners.forEach((r, i) => { r.horseName = book.runners[i].horseName; });
  const participant = hurdleV3ParticipantPrior([], book.capturedAt);
  const inputs = new Map<string, HurdleV3ShadowInput>(book.runners.map(r => [r.runnerId, {
    target: { runnerId: r.runnerId, raceId: book.raceId, cutoff: book.featureCutoffAt, scheduledOff: book.scheduledOff,
      officialRating: null, age: null, weightLbs: null, trainer: participant.prior, jockey: participant.prior },
    history: [], participantAudit: { trainer: participant.audit, jockey: participant.audit },
  }]));
  const shadow = (await buildHurdleV3Shadow(book, inputs, shadowNow))!;
  assert.ok(shadow);
  return { race, meetings, shadow };
}

test("Hurdles show both model labels and original ranks even when selections agree", async () => {
  const { race, shadow } = await fixture();
  shadow.runners.forEach(r => { r.official.rank = race.runners.find(live => live.runnerId === r.target.runnerId)!.activeTissue!.rank; });
  const html = renderToStaticMarkup(<HurdleModelComparison race={race} shadow={shadow} />);
  assert.match(html, /V2:/); assert.match(html, /V3 SHADOW:/);
  for (const rank of [1, 2]) {
    const name = race.runners.find(r => r.activeTissue?.rank === rank)!.horseName;
    assert.equal(html.split(`T${rank} ${name}`).length - 1, 2);
  }
  assert.match(html, /text-xs text-slate-500/);
});

test("official V3 ranks display independently of V2 and LED counterfactual", async () => {
  const { race, shadow } = await fixture();
  const html = renderToStaticMarkup(<HurdleModelComparison race={race} shadow={shadow} />);
  for (const rank of [1, 2]) {
    const id = shadow.runners.find(r => r.official.rank === rank)!.target.runnerId;
    assert.ok(html.includes(`T${rank} ${race.runners.find(r => r.runnerId === id)!.horseName}`));
  }
  shadow.runners.forEach(r => { r.ledCounterfactual.rank = 999; });
  assert.equal(renderToStaticMarkup(<HurdleModelComparison race={race} shadow={shadow} />), html);
});

test("missing or mismatched shadows stay unavailable; other race codes show nothing", async () => {
  const { race, shadow } = await fixture();
  for (const book of [undefined, { ...shadow, raceId: "wrong-race" },
    { ...shadow, production: { ...shadow.production, runners: shadow.production.runners.map(r => ({ ...r, horseId: "wrong-horse" })) } }]) {
    const html = renderToStaticMarkup(<HurdleModelComparison race={race} shadow={book} />);
    assert.match(html, /V2:/); assert.match(html, /V3 SHADOW:/);
    assert.match(html, /T1 Unavailable/); assert.match(html, /No matching prospective shadow capture/);
  }
  for (const raceType of ["Chase", "Flat", "NH Flat"]) {
    assert.equal(renderToStaticMarkup(<HurdleModelComparison race={{ ...race, raceType, raceName: `${raceType} race` }} shadow={shadow} />), "");
  }
});

test("comparison preserves production display, watch membership and frozen NR positions", async () => {
  const { race, meetings, shadow } = await fixture();
  const top = race.runners.find(r => r.activeTissue?.rank === 1)!;
  top.resultStatus = "non_runner";
  const before = structuredClone({ race, shadow });
  const badges = race.runners.map(r => renderToStaticMarkup(<FrozenRacecardRanks runner={r} />));
  const watch = buildTissueDailyWatchList(meetings);
  const html = renderToStaticMarkup(<HurdleModelComparison race={race} shadow={shadow} />);
  assert.ok(html.includes(`T1 ${top.horseName} (NR · frozen selection)`));
  assert.deepEqual({ race, shadow }, before);
  assert.deepEqual(buildTissueDailyWatchList(meetings), watch);
  assert.deepEqual(race.runners.map(r => renderToStaticMarkup(<FrozenRacecardRanks runner={r} />)), badges);
});

test("Today loads the shadow after production sync and passes it only to the comparison", async () => {
  const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
  assert.equal((page.match(/loadHurdleV3Shadow\(\)/g) ?? []).length, 1);
  assert.ok(page.indexOf("const hurdleShadow =") > page.indexOf("syncTissueGeneration(connection"));
  assert.match(page, /<HurdleModelComparison race=\{race\} shadow=\{hurdleShadow\} \/>/);
  assert.doesNotMatch(page.slice(page.indexOf("<RunnerTable")), /hurdleShadow/);
});

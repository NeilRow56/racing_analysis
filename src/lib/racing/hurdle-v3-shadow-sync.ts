import { pendingEpochShadowRaceIds, settleEpochShadow } from "./prospective-epoch-collection";
import type { createDbConnection } from "@/db";
import type { TodayMeeting, TodayRace } from "./todays-racing";
import type { GenerationRace } from "./tissue-generation-forward";
import { loadHurdleV3ShadowInputs, type HurdleV3ShadowInput } from "./hurdle-v3-shadow-inputs";
import { appendHurdleV3Shadows, assertHurdleV3ShadowPins, buildHurdleV3Shadow, loadHurdleV3Shadow, mutateHurdleV3Shadow, settleHurdleV3Shadows, type HurdleV3ShadowObservation } from "./hurdle-v3-shadow";

export async function prepareHurdleV3Shadow(connection: ReturnType<typeof createDbConnection>, meetings: TodayMeeting[], cutoff: Date): Promise<Map<string, HurdleV3ShadowInput>> {
  try {
    const data = await loadHurdleV3Shadow();
    if (!data || cutoff.toISOString() < data.armedAt) return new Map();
    const known = new Set(data.observations.map(o => o.raceId));
    const eligible = meetings.map(m => ({ ...m, races: m.races.filter(r => !known.has(r.raceId)) }));
    await assertHurdleV3ShadowPins(data);
    return await loadHurdleV3ShadowInputs(connection, eligible, cutoff);
  } catch (e) { console.error("Hurdle V3 shadow input preparation unavailable; production unchanged", e); return new Map(); }
}
/** Only the fresh books accepted by this invocation's production writer are passed here. */
export async function syncHurdleV3Shadow(accepted: GenerationRace[], inputs: ReadonlyMap<string, HurdleV3ShadowInput>, results: ReadonlyMap<string, TodayRace>) {
  const data = await loadHurdleV3Shadow(); if (!data) return;
  const candidates: HurdleV3ShadowObservation[] = [];
  if (accepted.some(r => r.family === "HURDLE")) {
    await assertHurdleV3ShadowPins(data);
    for (const book of accepted) {
      const observation = await buildHurdleV3Shadow(book, inputs);
      if (observation) candidates.push(observation);
    }
  }
  // Lock acquisition rechecks real time. Crossing off skips the pair, with no reconstruction later.
  return mutateHurdleV3Shadow(latest => settleHurdleV3Shadows(appendHurdleV3Shadows(latest, candidates), results));
}
export async function settleHurdleV3ShadowResults(results: ReadonlyMap<string, TodayRace>, now = new Date()) {
  try { await settleEpochShadow(results, now); }
  catch (error) { console.error("New Shadow epoch settlement unavailable; original route retained", error); }
  if (!await loadHurdleV3Shadow()) return;
  return mutateHurdleV3Shadow(data => settleHurdleV3Shadows(data, results, now));
}
export async function pendingHurdleV3ShadowRaceIds() {
  const original = loadHurdleV3Shadow().then(data => data?.observations
    .filter(o => o.production.runners.some(r => r.outcome === null)).map(o => o.raceId) ?? [])
    .catch(error => { console.error("Original Shadow pending lookup unavailable", error); return []; });
  const current = pendingEpochShadowRaceIds()
    .catch(error => { console.error("New Shadow epoch pending lookup unavailable", error); return []; });
  return [...new Set((await Promise.all([original, current])).flat())];
}

import type { createDbConnection } from "@/db";
import { EPOCHS } from "./prospective-epoch-config";
import { requireCollectionEpoch, requireCollectionEpochSync } from "./prospective-epoch-integrity";
import { appendPositiveNeutral, loadPositiveNeutral, mutatePositiveNeutral } from "./tissue-positive-neutral";
import { appendHurdleV3Shadows, assertHurdleV3ShadowPins, buildHurdleV3Shadow, loadHurdleV3Shadow, mutateHurdleV3Shadow, settleHurdleV3Shadows, type HurdleV3ShadowObservation } from "./hurdle-v3-shadow";
import { appendHurdleMarketEdges, loadHurdleMarketEdge, mutateHurdleMarketEdge } from "./hurdle-v3-market-edge";
import { loadHurdleV3Challenger } from "./hurdle-v3-challenger-model";
import { loadHurdleV3ShadowInputs, type HurdleV3ShadowInput } from "./hurdle-v3-shadow-inputs";
import type { GenerationRace } from "./tissue-generation-forward";
import type { TodayMeeting, TodayRace } from "./todays-racing";

export async function prepareEpochShadow(connection: ReturnType<typeof createDbConnection>, meetings: TodayMeeting[], cutoff: Date): Promise<Map<string, HurdleV3ShadowInput>> {
  try {
    const data = await loadHurdleV3Shadow(EPOCHS.shadow.ledger);
    if (!data || cutoff.toISOString() < data.armedAt) return new Map();
    await requireCollectionEpoch(data.armedAt); await assertHurdleV3ShadowPins(data);
    const known = new Set(data.observations.map(o => o.raceId));
    return await loadHurdleV3ShadowInputs(connection, meetings.map(m => ({ ...m, races: m.races.filter(r => !known.has(r.raceId)) })), cutoff);
  } catch (error) { console.error("New Shadow epoch inputs blocked; production unchanged", error); return new Map(); }
}
/** Called only with books accepted by this production invocation. No ledger replay. */
export async function collectEpochPositiveNeutral(fresh: readonly GenerationRace[]) {
  if (!fresh.length || !await loadPositiveNeutral(EPOCHS.positiveNeutral.ledger)) return;
  return mutatePositiveNeutral(data => {
    requireCollectionEpochSync(data.armedAt);
    return appendPositiveNeutral(data, fresh);
  }, EPOCHS.positiveNeutral.ledger);
}
/** Pair only observations appended while holding this invocation's Shadow lock. */
export async function collectEpochShadow(accepted: GenerationRace[], inputs: ReadonlyMap<string, HurdleV3ShadowInput>) {
  if (!accepted.length || !await loadHurdleV3Shadow(EPOCHS.shadow.ledger)) return;
  const model = await loadHurdleV3Challenger();
  // Never derive 'fresh' by racing a before/after read of a shared ledger.
  const fresh: HurdleV3ShadowObservation[] = [];
  await mutateHurdleV3Shadow(async data => {
    await requireCollectionEpoch(data.armedAt); await assertHurdleV3ShadowPins(data);
    const candidates = [];
    for (const book of accepted) {
      const observation = await buildHurdleV3Shadow(book, inputs);
      if (observation) candidates.push(observation);
    }
    const after = appendHurdleV3Shadows(data, candidates);
    fresh.push(...after.observations.slice(data.observations.length));
    return after;
  }, EPOCHS.shadow.ledger);
  if (!fresh.length || !await loadHurdleMarketEdge(EPOCHS.marketEdge.ledger)) return;
  return mutateHurdleMarketEdge(data => {
    requireCollectionEpochSync(data.armedAt);
    return appendHurdleMarketEdges(data, fresh, model);
  }, EPOCHS.marketEdge.ledger);
}
/** Settlement remains independent of capture pin checks and never appends captures. */
export async function settleEpochShadow(results: ReadonlyMap<string, TodayRace>, now = new Date()) {
  if (!await loadHurdleV3Shadow(EPOCHS.shadow.ledger)) return;
  return mutateHurdleV3Shadow(data => settleHurdleV3Shadows(data, results, now), EPOCHS.shadow.ledger);
}
export async function pendingEpochShadowRaceIds() {
  return (await loadHurdleV3Shadow(EPOCHS.shadow.ledger))?.observations.filter(o => o.production.runners.some(r => r.outcome === null)).map(o => o.raceId) ?? [];
}

import { loadTissueGenerationModels } from "./tissue-generation-model";
import type { GenerationRace } from "./tissue-generation-forward";
import type { TodayRace } from "./todays-racing";
import { appendContextWeightShadow, buildContextWeightShadow, loadContextWeightShadow, mutateContextWeightShadow, settleContextWeightShadow } from "./context-weight-shadow-forward";

/** Shadow I/O and model failures cannot reject or replace an already completed production result. */
export async function contextShadowAfterProduction<T>(production: T, task: () => Promise<unknown>, onError = (error: unknown) => console.error("Context-weight shadow unavailable; production unchanged", error)): Promise<T> {
  try { await task(); } catch (error) { try { onError(error); } catch { /* Logging must also fail open. */ } }
  return production;
}
export async function syncContextWeightShadow(additions: GenerationRace[], results: ReadonlyMap<string, TodayRace>) {
  const relevant = additions.filter(r => r.family === "AW" || r.family === "TURF");
  const models = relevant.length ? await loadTissueGenerationModels() : null;
  // Append re-checks the clock after calculation and lock acquisition; crossing off time rejects the book.
  const candidates = relevant.flatMap(book => {
    const observation = buildContextWeightShadow(book, models![book.family]);
    return observation ? [observation] : [];
  });
  return mutateContextWeightShadow(data => settleContextWeightShadow(appendContextWeightShadow(data, candidates), results));
}
export async function pendingContextWeightShadowRaceIds(path?: string): Promise<string[]> {
  try { return [...new Set((await loadContextWeightShadow(path)).observations.filter(r => r.production.runners.some(x => x.outcome === null)).map(r => r.raceId))]; }
  catch (error) { console.error("Unable to read pending context shadows; production unchanged", error); return []; }
}

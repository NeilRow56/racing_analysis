/** Display-only adapters expose read/validation timings without touching source-pinned readers.
 * The original composite readers remain the disabled path; enabled reads retain their order.
 */
import { loadHurdleV3Shadow } from "./hurdle-v3-shadow";
import { loadHurdleMarketEdge, loadHurdleMarketEdgeContext as originalEdge } from "./hurdle-v3-market-edge";
import { loadLowForm, loadLowFormContext as originalLowForm } from "./hurdle-low-form";
import { loadPositiveNeutral, loadPositiveNeutralContext as originalPositive } from "./tissue-positive-neutral";
import { loadEarlyTurf, loadEarlyTurfContext as originalEarly } from "./turf-early-season";
import { loadTissueGeneration } from "./tissue-generation-forward";
import { profileCall, profilingEnabled } from "./performance-profile";

export async function loadHurdleMarketEdgeContext() {
  if (!profilingEnabled()) return originalEdge();
  const [data, shadows] = await Promise.all([profileCall("loadHurdleMarketEdge", loadHurdleMarketEdge), profileCall("loadHurdleV3Shadow", loadHurdleV3Shadow)]);
  return { data, shadows };
}
export async function loadLowFormContext() {
  if (!profilingEnabled()) return originalLowForm();
  const [data, shadows] = await Promise.all([profileCall("loadLowForm", loadLowForm), profileCall("loadHurdleV3Shadow", loadHurdleV3Shadow)]);
  return { data, shadows };
}
export async function loadPositiveNeutralContext() {
  if (!profilingEnabled()) return originalPositive();
  const [data, generation] = await Promise.all([profileCall("loadPositiveNeutral", loadPositiveNeutral), profileCall("loadTissueGeneration", loadTissueGeneration)]);
  return { data, generation };
}
export async function loadEarlyTurfContext() {
  if (!profilingEnabled()) return originalEarly();
  const [data, generation] = await Promise.all([profileCall("loadEarlyTurf", loadEarlyTurf), profileCall("loadTissueGeneration", loadTissueGeneration)]);
  return { data, generation };
}

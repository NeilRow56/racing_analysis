import { hurdleV3PriorHistory, type HurdleV3Prior, type HurdleV3Target } from "./hurdle-v3-challenger-features";

// Separate observational counterfactual. Never passed to the official V3 scorer.
export const HURDLE_V3_LED_SHADOW_LOGIT = 0.3512845775499634;
export const HURDLE_V3_PU_OBSERVATION_LOGIT = -0.44950262613334757;
export const HURDLE_V3_TAG_VERSION = "hurdle_last3_starts_led_max_decay90_expiry180_latest_pu30_v1";
export function hurdleV3ShadowTags(target: HurdleV3Target, history: readonly HurdleV3Prior[]) {
  const prior = hurdleV3PriorHistory(target, history), last3 = prior.slice(0, 3);
  const evidence = last3.map(run => {
    const ageDays = (Date.parse(target.cutoff) - Date.parse(run.at)) / 86400000;
    const led = /\b(?:led|made all|made virtually all)\b/i.test(run.comment ?? "");
    return { runnerId: run.runnerId, ageDays, led, decayed: led && ageDays <= 180 ? 2 ** (-ageDays / 90) : 0 };
  });
  const latestDays = prior[0] ? (Date.parse(target.cutoff) - Date.parse(prior[0].at)) / 86400000 : null;
  const pu = prior.find(r => r.resultStatus === "pulled_up");
  const ledDecay = Math.max(0, ...evidence.map(r => r.decayed));
  return { latestLed: evidence[0]?.led ?? false, anyLast3Led: evidence.some(r => r.led),
    last3LedCount: evidence.filter(r => r.led).length, ledDecay, ledPresent: ledDecay > 0,
    ledAddedLogit: HURDLE_V3_LED_SHADOW_LOGIT * ledDecay,
    latestPU: prior[0]?.resultStatus === "pulled_up", last2PU: prior.slice(0, 2).some(r => r.resultStatus === "pulled_up"),
    recentPU: prior[0]?.resultStatus === "pulled_up" && latestDays !== null && latestDays <= 30,
    latestHurdleDays: latestDays, latestPUDays: pu ? (Date.parse(target.cutoff) - Date.parse(pu.at)) / 86400000 : null, evidence };
}

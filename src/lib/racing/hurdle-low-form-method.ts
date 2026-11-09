import type { HurdleV3ShadowObservation } from "./hurdle-v3-shadow";
import type { HurdleV3ChallengerModel } from "./hurdle-v3-challenger-model";
import { hurdleV3PriorHistory } from "./hurdle-v3-challenger-features";

export const LOW_FORM_VERSION = "HURDLE_LOW_FORM_PROSPECTIVE_V1";
export const FORM_COHORTS = ["VERY LOW FORM", "LIMITED FORM", "MIXED FORM", "ESTABLISHED FORM"] as const;
export type FormCohort = typeof FORM_COHORTS[number];
type Runner = HurdleV3ShadowObservation["runners"][number];
export function hurdleFormEvidence(r: Runner) {
  const history = hurdleV3PriorHistory(r.target, r.history);
  const starts = history.length, completed = history.filter(h => h.finishingPosition !== null).length;
  const established = starts >= 3 && completed >= 2 && r.raw.best_l3_hurdle_speed !== null;
  const recentComment = history.some(h => Boolean(h.comment?.trim()) &&
    (Date.parse(r.target.cutoff) - Date.parse(h.at)) / 86400000 <= 180);
  const substantive = [r.raw.official_rating !== null, r.raw.latest_hurdle_speed !== null,
    r.raw.best_l3_hurdle_speed !== null, r.raw.average_l3_hurdle_speed !== null, starts > 0, starts > 0, recentComment].filter(Boolean).length;
  return { starts, completed, established, evidence: established && substantive >= 6 ? "HIGH" as const : starts > 0 && substantive >= 3 ? "MEDIUM" as const : "LOW" as const };
}
/** Exact historical early-season audit order, including the 50/50 established tie. */
export function classifyHurdleForm(runners: readonly Runner[]): FormCohort {
  if (!runners.length) throw new Error("Empty Hurdle field");
  const evidence = runners.map(hurdleFormEvidence), n = evidence.length;
  const established = evidence.filter(r => r.established).length;
  return established / n >= .5 ? "ESTABLISHED FORM" : evidence.filter(r => r.starts === 0).length / n >= .5 ? "VERY LOW FORM" : established / n < .25 ? "LIMITED FORM" : "MIXED FORM";
}
/** Attribution of the already frozen raw vector; no second scoring pass. Missing flags stay in Missingness. */
export function hurdleConnectionDependence(r: Runner, artifact: HurdleV3ChallengerModel) {
  const m = artifact.model;
  const contributions = m.names.map((name, i) => ({ name, value: m.weights[i] * ((r.raw[name] ?? m.means[i]) - m.means[i]) / m.scales[i] }));
  const trainer = contributions.filter(c => c.name.includes("trainer") && !c.name.includes("missing"));
  const jockey = contributions.filter(c => c.name.includes("jockey") && !c.name.includes("missing"));
  const sum = (cs: typeof contributions) => cs.reduce((s, c) => s + c.value, 0);
  const positive = contributions.reduce((s, c) => s + Math.max(0, c.value), 0);
  return { runnerId: r.target.runnerId, rank: r.official.rank, trainer: sum(trainer), jockey: sum(jockey), combined: sum(trainer) + sum(jockey),
    positiveShare: positive ? [...trainer, ...jockey].reduce((s, c) => s + Math.max(0, c.value), 0) / positive : null,
    ...hurdleFormEvidence(r) };
}
export function captureHurdleMarket(o: HurdleV3ShadowObservation) {
  const book = o.production;
  if (!book.completeMarket || Date.parse(book.capturedAt) >= Date.parse(book.scheduledOff) ||
    book.runners.some(r => r.capturedPrice === null || !Number.isFinite(r.capturedPrice) || r.capturedPrice <= 1)) {
    return { status: "MARKET UNAVAILABLE / INCOMPLETE" as const, capturedAt: book.capturedAt, source: book.marketSource, runners: [], favourite: null, secondFavourite: null };
  }
  const sorted = [...book.runners].sort((a, b) => a.capturedPrice! - b.capturedPrice! || a.runnerId.localeCompare(b.runnerId));
  const total = sorted.reduce((s, r) => s + 1 / r.capturedPrice!, 0);
  return { status: "COMPLETE" as const, capturedAt: book.capturedAt, source: book.marketSource,
    runners: sorted.map((r, i) => ({ runnerId: r.runnerId, price: r.capturedPrice!, probability: (1 / r.capturedPrice!) / total, rank: i + 1 })),
    favourite: sorted[0].runnerId, secondFavourite: sorted[1].runnerId };
}
export function hurdleMonitoringMonth(date: string) { return date.slice(0, 7); }

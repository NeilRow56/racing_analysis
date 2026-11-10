import type { GenerationRace } from "./tissue-generation-forward";
import type { TissueGenerationModel } from "./tissue-generation-model";

export const EARLY_TURF_VERSION = "TURF_2027_EARLY_SEASON_V1";
export const EARLY_TURF_COHORTS = ["VERY LOW", "LIMITED", "MIXED", "ESTABLISHED"] as const;
export type EarlyTurfCohort = typeof EARLY_TURF_COHORTS[number];
export const earlyTurfDate = (date: string) => date >= "2027-03-01" && date <= "2027-07-31";
export type TurfEvidenceRun = { runnerId: string; raceId: string; at: string; date: string; turf: boolean; completed: boolean;
  officialRating: number | null; speed: number | null; productionSpeed: number | null; performance: number | null; timed: boolean };
export type TurfEvidenceInput = { cutoff: string; runs: TurfEvidenceRun[] };
const mean = (xs: number[]) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
const numbers = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);
export function seasonalTurfEvidence(runs: readonly TurfEvidenceRun[]) {
  const last3 = runs.slice(0, 3), speeds = numbers(last3.map(r => r.speed));
  return { starts: runs.length, completed: runs.filter(r => r.completed).length,
    latestSpeed: runs.find(r => r.speed !== null)?.speed ?? null, bestL3Speed: speeds.length ? Math.max(...speeds) : null,
    averageL3Speed: mean(speeds), orAvailable: runs.some(r => r.officialRating !== null),
    surfaceHistoryAvailable: runs.some(r => r.completed), sameOrAvailable: false };
}
export function classifyEarlyTurf(evidence: readonly ReturnType<typeof seasonalTurfEvidence>[]): EarlyTurfCohort {
  if (!evidence.length) throw new Error("Empty Turf field");
  const fraction = evidence.filter(r => r.completed >= 2 && r.bestL3Speed !== null).length / evidence.length;
  return EARLY_TURF_COHORTS[fraction < .25 ? 0 : fraction < .5 ? 1 : fraction < .75 ? 2 : 3];
}
export function earlyTurfMarket(book: GenerationRace) {
  const complete = book.completeMarket && book.runners.length >= 2 && book.capturedAt < book.scheduledOff &&
    book.runners.every(r => r.capturedPrice !== null && Number.isFinite(r.capturedPrice) && r.capturedPrice > 1);
  const sorted = complete ? [...book.runners].sort((a, b) => a.capturedPrice! - b.capturedPrice! || a.runnerId.localeCompare(b.runnerId)) : [];
  const total = sorted.reduce((s, r) => s + 1 / r.capturedPrice!, 0);
  return { status: complete ? "COMPLETE" as const : "MARKET INCOMPLETE / UNAVAILABLE" as const, completeMarket: complete,
    capturedAt: book.capturedAt, source: book.marketSource, favourite: complete ? sorted[0].runnerId : null, secondFavourite: complete ? sorted[1].runnerId : null,
    runners: sorted.map((r, i) => ({ runnerId: r.runnerId, price: r.capturedPrice!, probability: (1 / r.capturedPrice!) / total, rank: i + 1 })) };
}
/** Attribution only: consume the existing frozen vectors, never generate another prediction. */
export function earlyTurfDiagnostics(book: GenerationRace, inputs: ReadonlyMap<string, TurfEvidenceInput>, model: TissueGenerationModel) {
  if (JSON.stringify(book.featureNames) !== JSON.stringify(model.baseModel.names) || JSON.stringify(book.adjustmentFeatureNames) !== JSON.stringify(model.adjustment.names)) throw new Error("Turf diagnostic feature mismatch");
  const numeric = (r: GenerationRace["runners"][number], name: string) => {
    const i = book.featureNames.indexOf(name), missing = book.featureNames.indexOf(`${name}_missing`);
    return i < 0 || missing >= 0 && r.modelInputs[missing] === 1 ? null : r.modelInputs[i];
  };
  const rows = book.runners.map(r => {
    const input = inputs.get(r.runnerId);
    if (!input || input.cutoff !== book.featureCutoffAt) throw new Error("Missing as-of Turf history");
    const history = input.runs.filter(h => h.raceId !== book.raceId && h.at < book.featureCutoffAt).sort((a, b) => b.at.localeCompare(a.at) || a.runnerId.localeCompare(b.runnerId));
    const turf = history.filter(h => h.turf), current = seasonalTurfEvidence(turf.filter(h => h.date.startsWith("2027"))), prior = seasonalTurfEvidence(turf.filter(h => h.date < "2027"));
    const components = [model.baseModel, model.adjustment].flatMap((m, block) => m.names.map((name, i) => {
      const raw = (block ? r.adjustmentInputs : r.modelInputs)[i];
      return { name, raw, contribution: (raw - m.means[i]) / m.scales[i] * m.weights[i] };
    }));
    const contribution = (pattern: RegExp) => components.filter(c => pattern.test(c.name)).reduce((s, c) => s + c.contribution, 0);
    const positive = components.reduce((s, c) => s + Math.max(0, c.contribution), 0);
    const connections = components.filter(c => /^(trainer_prior_rate|log_trainer_prior_runs|jockey_prior_rate|log_jockey_prior_runs)$/.test(c.name));
    const split = { current: 0, prior: 0, residual: 0, currentSpeed: 0, priorSpeed: 0, currentPerformance: 0, priorPerformance: 0, priorPositive: 0 };
    for (const c of components) {
      let sources: TurfEvidenceRun[] = [];
      const speed = /^(latest|best_l3|avg_l3)_turf_speed$/.test(c.name);
      const performance = /^(latest|best_l3|avg_l3)_(performance|todays_rating)$/.test(c.name);
      if ((speed || performance) && numeric(r, c.name) !== null) {
        const value = (h: TurfEvidenceRun) => speed ? h.productionSpeed : h.performance;
        const timed = history.filter(h => h.timed);
        sources = c.name.startsWith("latest_") ? timed.filter(h => value(h) !== null).slice(0, 1) : timed.slice(0, 3).filter(h => value(h) !== null);
        if (c.name.startsWith("best_") && sources.length) sources = [sources.reduce((a, b) => value(a)! >= value(b)! ? a : b)];
      }
      if (!sources.length) { split.residual += c.contribution; continue; }
      const fraction = sources.filter(h => h.date.startsWith("2027")).length / sources.length;
      split.current += c.contribution * fraction; split.prior += c.contribution * (1 - fraction);
      split.priorPositive += Math.max(0, c.contribution) * (1 - fraction);
      split[speed ? "currentSpeed" : "currentPerformance"] += c.contribution * fraction;
      split[speed ? "priorSpeed" : "priorPerformance"] += c.contribution * (1 - fraction);
    }
    const trainer = contribution(/^(trainer_prior_rate|log_trainer_prior_runs)$/), jockey = contribution(/^(jockey_prior_rate|log_jockey_prior_runs)$/);
    return { runnerId: r.runnerId, rank: r.rank, current, prior, history, targetOr: numeric(r, "official_rating"),
      trainer, jockey, combinedTrainerJockey: trainer + jockey,
      trainerJockeyPositiveShare: positive ? connections.reduce((s, c) => s + Math.max(0, c.contribution), 0) / positive : null,
      sameOrRaw: r.adjustmentInputs[book.adjustmentFeatureNames.indexOf("same_or_speed_gap")], sameOrContribution: contribution(/^same_or_speed_gap$/),
      missingIndicatorCount: components.filter(c => c.name.endsWith("_missing") && c.raw === 1).length,
      missingnessContribution: contribution(/_missing$/), split, priorCarryover: positive > 0 && split.priorPositive / positive > .5,
      score: components.reduce((s, c) => s + c.contribution, 0) };
  });
  return rows.map(r => {
    const same = (partition: "current" | "prior") => r[partition].bestL3Speed !== null && r.targetOr !== null && rows.some(p => p.runnerId !== r.runnerId && p.targetOr === r.targetOr && p[partition].bestL3Speed !== null);
    const current = { ...r.current, sameOrAvailable: same("current") }, prior = { ...r.prior, sameOrAvailable: same("prior") };
    const flags = [current.starts > 0, current.completed > 0, current.latestSpeed !== null, current.bestL3Speed !== null, current.averageL3Speed !== null, current.orAvailable, current.sameOrAvailable, current.surfaceHistoryAvailable];
    const available = flags.filter(Boolean).length;
    return { ...r, current, prior, currentAvailability: flags, currentMissingCount: 8 - available,
      evidence: available / 8 >= .75 ? "HIGH CURRENT-SEASON EVIDENCE" as const : available / 8 >= .4 ? "MEDIUM" as const : "LOW" as const };
  });
}

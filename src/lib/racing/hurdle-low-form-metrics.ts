import type { HurdleV3ShadowData, HurdleV3ShadowObservation } from "./hurdle-v3-shadow";
import { hurdleShadowOutcome, summarizeHurdleV3Shadow } from "./hurdle-v3-shadow-metrics";
import { matchingLowFormShadow, type LowFormData, type LowFormObservation } from "./hurdle-low-form";
import { hurdleMonitoringMonth, type FormCohort } from "./hurdle-low-form-method";

type Pair = { observation: LowFormObservation; shadow: HurdleV3ShadowObservation };
function quality(pairs: Pair[], model: "V2" | "V3" | "MARKET", template: HurdleV3ShadowData | null) {
  const eligible = model === "MARKET" ? pairs.filter(p => p.observation.market.status === "COMPLETE") : pairs;
  const observations = eligible.map(({ observation, shadow }) => model !== "MARKET" ? shadow : ({ ...shadow,
    production: { ...shadow.production, runners: shadow.production.runners.map(r => {
      const market = observation.market.runners.find(m => m.runnerId === r.runnerId)!;
      return { ...r, probability: market.probability, rank: market.rank };
    }) } }));
  const summary = summarizeHurdleV3Shadow(template ? { ...template, observations } : null);
  return { ...summary.rows[model === "V3" ? 1 : 0], model, pending: summary.pendingRaces, void: summary.voidRaces };
}
function headToHead(pair: Pair, template: HurdleV3ShadowData | null) {
  const { observation: o, shadow: s } = pair;
  if (o.market.status !== "COMPLETE" || hurdleShadowOutcome(s) !== "settled") return null;
  const winners = s.production.runners.filter(r => r.outcome?.winner).map(r => r.runnerId);
  const v3Ranks = winners.map(id => s.runners.find(r => r.target.runnerId === id)!.official.rank);
  const marketRanks = winners.map(id => o.market.runners.find(r => r.runnerId === id)!.rank);
  const v3 = quality([pair], "V3", template), market = quality([pair], "MARKET", template);
  const classify = (delta: number) => Math.abs(delta) <= 1e-12 ? "SAME" as const : delta < 0 ? "V3 BETTER" as const : "MARKET BETTER" as const;
  const rankDelta = v3Ranks.reduce((a, b) => a + b, 0) - marketRanks.reduce((a, b) => a + b, 0);
  const lossDelta = v3.logLoss! - market.logLoss!;
  const v3Hit = v3Ranks.some(r => r <= 2), marketHit = marketRanks.some(r => r <= 2);
  return { raceId: o.raceId, classification: o.classification, month: hurdleMonitoringMonth(o.raceDate), v3WinnerRanks: v3Ranks, marketWinnerRanks: marketRanks,
    v3LogLoss: v3.logLoss!, marketLogLoss: market.logLoss!, winnerRankVerdict: classify(rankDelta), logLossVerdict: classify(lossDelta),
    verdict: classify(Math.abs(lossDelta) > 1e-12 ? lossDelta : rankDelta), marketOnlyTop2: marketHit && !v3Hit, v3OnlyTop2: v3Hit && !marketHit };
}
export function summarizeLowForm(data: LowFormData | null, shadows: HurdleV3ShadowData | null) {
  const pairs: Pair[] = [], unavailable: string[] = [];
  for (const observation of data?.observations ?? []) {
    const shadow = matchingLowFormShadow(observation, shadows?.observations ?? []);
    if (shadow) pairs.push({ observation, shadow }); else unavailable.push(observation.raceId);
  }
  const cohorts = ["VERY LOW FORM", "LIMITED FORM", "MIXED FORM", "VERY LOW + LIMITED"] as const;
  const inCohort = (classification: FormCohort, cohort: typeof cohorts[number]) => cohort === "VERY LOW + LIMITED" ? classification === "VERY LOW FORM" || classification === "LIMITED FORM" : classification === cohort;
  const row = (cohort: typeof cohorts[number], month?: string) => {
    const captured = (data?.observations ?? []).filter(o => inCohort(o.classification, cohort) && (!month || hurdleMonitoringMonth(o.raceDate) === month));
    const selected = pairs.filter(p => captured.some(o => o.raceId === p.observation.raceId));
    const matched = selected.filter(p => p.observation.market.status === "COMPLETE");
    const v3 = quality(selected, "V3", shadows), market = quality(matched, "MARKET", shadows);
    return { cohort, month, races: captured.length, settled: v3.racesSettled, marketUnavailable: captured.filter(o => o.market.status !== "COMPLETE").length,
      sourceUnavailable: captured.length - selected.length, v3, market, v2: quality(selected, "V2", shadows),
      pairedV3: quality(matched, "V3", shadows), headToHead: matched.map(p => headToHead(p, shadows)).filter(x => x !== null) };
  };
  const armed = data?.armedAt.slice(0, 10) ?? "2026-11-09", year = Number(armed.slice(0, 4)), season = Number(armed.slice(5, 7)) === 1 ? year - 1 : year;
  const months = [...new Set([`${season}-10`, `${season}-11`, `${season}-12`, `${season + 1}-01`, ...pairs.map(p => hurdleMonitoringMonth(p.observation.raceDate))])].sort();
  return { rows: cohorts.map(c => row(c)), monthly: months.flatMap(month => cohorts.map(c => row(c, month))),
    unavailable, established: pairs.filter(p => p.observation.classification === "ESTABLISHED FORM").length };
}

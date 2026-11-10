import type { GenerationData, GenerationRace } from "./tissue-generation-forward";
import { matchingEarlyTurfCapture, type EarlyTurfData, type EarlyTurfObservation } from "./turf-early-season";
import { EARLY_TURF_COHORTS, type EarlyTurfCohort } from "./turf-early-season-method";

type Pair = { observation: EarlyTurfObservation; book: GenerationRace };
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const mean = (xs: number[]) => xs.length ? sum(xs) / xs.length : null;
export function earlyTurfOutcome(book: GenerationRace) {
  if (book.runners.some(r => r.outcome === null)) return "pending";
  return book.runners.some(r => r.outcome?.status === "settled" && r.outcome.winner) ? "settled" : "void";
}
function quality(pairs: Pair[], market = false) {
  const bins = Array.from({ length: 10 }, (_, i) => ({ lower: i / 10, upper: (i + 1) / 10, n: 0, probability: 0, actual: 0 }));
  const picks = [1, 2, "TOP2"].map(rank => ({ rank, winners: 0, eligible: 0, actualCredit: 0, expected: 0 }));
  const losses: number[] = [], briers: number[] = [], winnerRanks: number[] = [];
  for (const { observation: o, book: b } of pairs.filter(p => earlyTurfOutcome(p.book) === "settled")) {
    const all = market ? o.market.runners : b.runners;
    const starters = b.runners.filter(r => r.outcome!.status === "settled"), wins = starters.filter(r => r.outcome!.winner), credit = 1 / wins.length;
    const active = all.filter(r => starters.some(s => s.runnerId === r.runnerId)), total = sum(active.map(r => r.probability));
    const probabilities = new Map(active.map(r => [r.runnerId, r.probability / total]));
    losses.push(-sum(wins.map(r => Math.log(Math.max(1e-300, probabilities.get(r.runnerId)!)) * credit)));
    briers.push(sum(active.map(r => (probabilities.get(r.runnerId)! - (wins.some(w => w.runnerId === r.runnerId) ? credit : 0)) ** 2)));
    winnerRanks.push(sum(wins.map(w => all.find(r => r.runnerId === w.runnerId)!.rank)) / wins.length);
    for (const r of active) {
      const p = probabilities.get(r.runnerId)!, bin = bins[Math.min(9, Math.floor(p * 10))];
      bin.n++; bin.probability += p; bin.actual += wins.some(w => w.runnerId === r.runnerId) ? credit : 0;
    }
    for (const pick of picks) {
      const selected = active.filter(r => pick.rank === "TOP2" ? r.rank <= 2 : r.rank === pick.rank);
      if (!selected.length) continue;
      pick.eligible++; pick.winners += Number(selected.some(r => wins.some(w => w.runnerId === r.runnerId)));
      pick.actualCredit += sum(selected.map(r => wins.some(w => w.runnerId === r.runnerId) ? credit : 0));
      pick.expected += sum(selected.map(r => probabilities.get(r.runnerId)!));
    }
  }
  const n = sum(bins.map(b => b.n));
  return { races: pairs.length, settled: losses.length, pending: pairs.filter(p => earlyTurfOutcome(p.book) === "pending").length,
    void: pairs.filter(p => earlyTurfOutcome(p.book) === "void").length, logLoss: mean(losses), brier: mean(briers), meanWinnerRank: mean(winnerRanks),
    calibrationECE: n ? sum(bins.map(b => Math.abs(b.probability - b.actual))) / n : null,
    calibration: bins.map(b => ({ ...b, meanProbability: b.n ? b.probability / b.n : null, winRate: b.n ? b.actual / b.n : null })), selections: picks };
}
function headToHead(p: Pair) {
  if (earlyTurfOutcome(p.book) !== "settled" || !p.observation.market.completeMarket) return null;
  const v4 = quality([p]), market = quality([p], true), winners = p.book.runners.filter(r => r.outcome?.winner);
  const v4Ranks = winners.map(r => r.rank), marketRanks = winners.map(r => p.observation.market.runners.find(m => m.runnerId === r.runnerId)!.rank);
  const delta = v4.logLoss! - market.logLoss!, v4Top2 = v4Ranks.some(r => r <= 2), marketTop2 = marketRanks.some(r => r <= 2);
  return { raceId: p.book.raceId, month: p.book.raceDate.slice(0, 7), cohort: p.observation.classification,
    v4WinnerRanks: v4Ranks, marketWinnerRanks: marketRanks, v4LogLoss: v4.logLoss!, marketLogLoss: market.logLoss!,
    verdict: Math.abs(delta) <= 1e-12 ? "SAME / INCONCLUSIVE" : delta < 0 ? "V4 BETTER" : "MARKET BETTER",
    marketOnlyTop2: marketTop2 && !v4Top2, v4OnlyTop2: v4Top2 && !marketTop2 };
}
export function summarizeEarlyTurf(data: EarlyTurfData | null, generation: GenerationData) {
  const pairs: Pair[] = [], unavailable: string[] = [];
  for (const observation of data?.observations ?? []) {
    const book = matchingEarlyTurfCapture(observation, generation.races);
    if (book) pairs.push({ observation, book }); else unavailable.push(observation.raceId);
  }
  const cohorts = [...EARLY_TURF_COHORTS, "VERY LOW + LIMITED"] as const;
  const inCohort = (c: EarlyTurfCohort, cohort: typeof cohorts[number]) => cohort === "VERY LOW + LIMITED" ? c === "VERY LOW" || c === "LIMITED" : c === cohort;
  const row = (cohort: typeof cohorts[number], month?: string) => {
    const captures = (data?.observations ?? []).filter(o => inCohort(o.classification, cohort) && (!month || o.raceDate.startsWith(month)));
    const selected = pairs.filter(p => captures.some(o => o.raceId === p.book.raceId)), matched = selected.filter(p => p.observation.market.completeMarket);
    const v4 = quality(selected), pairedV4 = quality(matched), market = quality(matched, true);
    return { cohort, month, races: captures.length, settled: v4.settled, v4, pairedV4, market,
      logLossDifference: pairedV4.logLoss !== null && market.logLoss !== null ? pairedV4.logLoss - market.logLoss : null,
      marketCoverage: captures.length ? captures.filter(o => o.market.completeMarket).length / captures.length : null,
      marketUnavailable: captures.filter(o => !o.market.completeMarket).length, sourceUnavailable: captures.length - selected.length };
  };
  return { rows: cohorts.map(c => row(c)), monthly: ["03", "04", "05", "06", "07"].flatMap(m => cohorts.map(c => row(c, `2027-${m}`))),
    unavailable, headToHead: pairs.map(headToHead).filter(p => p !== null) };
}

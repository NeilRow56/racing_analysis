import type { HurdleV3ShadowData, HurdleV3ShadowObservation } from "./hurdle-v3-shadow";
import { hurdleShadowComparison, hurdleShadowOutcome, summarizeHurdleV3Shadow } from "./hurdle-v3-shadow-metrics";
import { matchingMarketEdgeShadow, type HurdleMarketEdgeData, type HurdleMarketEdgeObservation } from "./hurdle-v3-market-edge";
import { EDGE_BANDS, MARKET_RANK_BANDS } from "./hurdle-v3-market-edge-method";
import { FORM_COHORTS } from "./hurdle-low-form-method";

type Pair = { observation: HurdleMarketEdgeObservation; shadow: HurdleV3ShadowObservation };
const mean = (xs: number[]) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
function marketShadow({ observation: o, shadow: s }: Pair): HurdleV3ShadowObservation {
  const order = [...o.runners].sort((a, b) => b.marketProbability! - a.marketProbability! || a.runnerId.localeCompare(b.runnerId));
  return { ...s, production: { ...s.production, runners: s.production.runners.map(r => ({ ...r,
    probability: o.runners.find(p => p.runnerId === r.runnerId)!.marketProbability!, rank: order.findIndex(p => p.runnerId === r.runnerId) + 1 })) } };
}
export function summarizeHurdleMarketEdge(data: HurdleMarketEdgeData | null, shadows: HurdleV3ShadowData | null) {
  const observations = data?.observations ?? [];
  const pairs: Pair[] = [], unavailable: string[] = [];
  for (const observation of observations) {
    const shadow = matchingMarketEdgeShadow(observation, shadows?.observations ?? []);
    if (shadow) pairs.push({ observation, shadow }); else unavailable.push(observation.raceId);
  }
  const row = (label: string, pickRank: 1 | 2, select: (o: HurdleMarketEdgeObservation) => boolean) => {
    const captured = observations.filter(select), selected = pairs.filter(p => select(p.observation));
    const settled = selected.filter(p => hurdleShadowOutcome(p.shadow) === "settled");
    const eligible = settled.filter(p => p.shadow.production.runners.find(r => r.runnerId === p.observation.runners.find(r => r.v3Rank === pickRank)!.runnerId)?.outcome?.status === "settled");
    const quality = summarizeHurdleV3Shadow(shadows ? { ...shadows, observations: eligible.map(p => p.shadow) } : null);
    const market = summarizeHurdleV3Shadow(shadows ? { ...shadows, observations: eligible.map(marketShadow) } : null).rows[0];
    const v3 = quality.rows[1], picks = v3.selections.find(s => s.rank === pickRank)!;
    return { label, pickRank, captured: captured.length, matched: selected.length, sourceUnavailable: captured.length - selected.length,
      settled: picks.eligible, settledRaces: settled.length, pending: selected.filter(p => hurdleShadowOutcome(p.shadow) === "pending").length,
      voidRaces: selected.filter(p => hurdleShadowOutcome(p.shadow) === "void").length, nonRunnerSelections: settled.length - eligible.length,
      winners: picks.winners, strikeRate: picks.strikeRate, expected: picks.expected, actualCredit: picks.actualCredit, actualModel: picks.actualModel,
      logLoss: v3.logLoss, brier: v3.brier, calibrationECE: v3.calibrationECE, calibrationBins: v3.bins,
      averageMarketRank: mean(captured.map(o => o.runners.find(r => r.v3Rank === pickRank)!.marketRank).filter((r): r is number => r !== null)),
      marketLogLoss: market.logLoss, marketTop1WinnerRate: market.selections[0].strikeRate, marketTop1Eligible: market.selections[0].eligible,
      v2Top2: quality.rows[0].selections.find(s => s.rank === "TOP2")!, v3Top2: v3.selections.find(s => s.rank === "TOP2")! };
  };
  const inBand = (rank: 1 | 2, band: typeof EDGE_BANDS[number]) => (o: HurdleMarketEdgeObservation) => o.completeMarket && o.runners.find(r => r.v3Rank === rank)!.edgeBand === band;
  const large = inBand(1, "LARGE POSITIVE"), t1 = EDGE_BANDS.map(b => row(b, 1, inBand(1, b))), t2 = EDGE_BANDS.map(b => row(b, 2, inBand(2, b)));
  const speed = (["LOW SPEED EVIDENCE", "ESTABLISHED SPEED EVIDENCE"] as const).map(e => row(e, 1, o => large(o) && o.runners.find(r => r.v3Rank === 1)!.speedEvidence === e));
  const marketRank = MARKET_RANK_BANDS.map(b => row(b, 1, o => large(o) && o.runners.find(r => r.v3Rank === 1)!.marketRankBand === b));
  const form = FORM_COHORTS.map(f => row(f, 1, o => large(o) && o.form === f));
  const references = observations.filter(large).map(o => {
    const s = pairs.find(p => p.observation === o)?.shadow, c = s ? hurdleShadowComparison(s) : null, settled = s && hurdleShadowOutcome(s) === "settled";
    return { raceId: o.raceId, date: o.raceDate, course: o.course, v3Horse: o.runners.find(r => r.v3Rank === 1)!.horseName,
      v2RankOfV3T1: o.runners.find(r => r.v3Rank === 1)!.v2Rank, v2T1: o.v2T1, v2T2: o.v2T2, v3T1: o.v3T1, v3T2: o.v3T2,
      marketFavourite: o.marketFavourite, marketSecondFavourite: o.marketSecondFavourite,
      v2Top2Winner: settled ? c!.winnerIds.some(id => c!.v2.slice(0, 2).includes(id)) : null,
      v3Top2Winner: settled ? c!.winnerIds.some(id => c!.v3.slice(0, 2).includes(id)) : null };
  });
  return { captured: observations.length, marketUnavailable: observations.filter(o => !o.completeMarket).length, sourceUnavailable: unavailable,
    headline: t1[3], t1, t2, speed, marketRank, form, references };
}

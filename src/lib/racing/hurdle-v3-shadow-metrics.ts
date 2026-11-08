import type { HurdleV3ShadowData, HurdleV3ShadowObservation } from "./hurdle-v3-shadow";

type Model = "V2" | "V3" | "LED";
const sum = (x: number[]) => x.reduce((s, v) => s + v, 0);
const mean = (x: number[]) => x.length ? sum(x) / x.length : null;
export function hurdleShadowBook(o: HurdleV3ShadowObservation, model: Model) {
  return model === "V2" ? o.production.runners : o.runners.map(r => model === "V3" ? r.official : r.ledCounterfactual);
}
export function hurdleShadowOutcome(o: HurdleV3ShadowObservation) {
  if (o.production.runners.some(r => r.outcome === null)) return "pending";
  return o.production.runners.some(r => r.outcome?.status === "settled" && r.outcome.winner) ? "settled" : "void";
}
export function hurdleShadowComparison(o: HurdleV3ShadowObservation) {
  const order = (model: Model) => [...hurdleShadowBook(o, model)].sort((a, b) => a.rank - b.rank).map(r => r.runnerId);
  const v2 = order("V2"), v3 = order("V3"), led = order("LED"), winnerIds = o.production.runners.filter(r => r.outcome?.winner).map(r => r.runnerId);
  const ranks = (ids: string[]) => winnerIds.map(id => ids.indexOf(id) + 1);
  const v2Ranks = ranks(v2), v3Ranks = ranks(v3), d = winnerIds.length ? sum(v2Ranks) - sum(v3Ranks) : 0;
  return { v2, v3, led, winnerIds, v2WinnerRanks: v2Ranks, v3WinnerRanks: v3Ranks,
    top2Differs: v2.slice(0, 2).some(id => !v3.slice(0, 2).includes(id)),
    orderingDiffers: v2.some((id, i) => id !== v3[i]),
    v2OnlyHit: winnerIds.some(id => v2.slice(0, 2).includes(id)) && !winnerIds.some(id => v3.slice(0, 2).includes(id)),
    v3OnlyHit: winnerIds.some(id => v3.slice(0, 2).includes(id)) && !winnerIds.some(id => v2.slice(0, 2).includes(id)),
    better: !winnerIds.length ? null : d > 0 ? "V3" : d < 0 ? "V2" : "same",
    v3MissedLedWinners: winnerIds.filter(id => !v3.slice(0, 2).includes(id) && o.runners.find(r => r.target.runnerId === id)!.tags.ledPresent),
    ledRecoveredWinners: winnerIds.filter(id => !v3.slice(0, 2).includes(id) && led.slice(0, 2).includes(id)),
    ledChangedT1: led[0] !== v3[0], ledChangedT2: led[1] !== v3[1],
    ledChangedTop2: led.slice(0, 2).some(id => !v3.slice(0, 2).includes(id)) };
}
export function summarizeHurdleV3Shadow(data: HurdleV3ShadowData | null) {
  const observations = data?.observations ?? [], settled = observations.filter(o => hurdleShadowOutcome(o) === "settled");
  const rows = (["V2", "V3"] as const).map(model => {
    const bins = Array.from({ length: 10 }, (_, i) => ({ lower: i / 10, upper: (i + 1) / 10, n: 0, probability: 0, actual: 0 }));
    const losses: number[] = [], briers: number[] = [];
    const picks = [1, 2, "TOP2"].map(rank => ({ rank, eligible: 0, winners: 0, actualCredit: 0, expected: 0 }));
    for (const o of settled) {
      const starters = o.production.runners.filter(r => r.outcome!.status === "settled"), ids = new Set(starters.map(r => r.runnerId));
      const all = hurdleShadowBook(o, model), active = all.filter(r => ids.has(r.runnerId)), total = sum(active.map(r => r.probability));
      const wins = starters.filter(r => r.outcome!.winner), credit = 1 / wins.length;
      const probabilities = new Map(active.map(r => [r.runnerId, r.probability / total]));
      losses.push(-sum(wins.map(r => Math.log(Math.max(probabilities.get(r.runnerId)!, 1e-300)) * credit)));
      briers.push(sum(active.map(r => (probabilities.get(r.runnerId)! - (wins.some(w => w.runnerId === r.runnerId) ? credit : 0)) ** 2)));
      for (const r of active) {
        const p = probabilities.get(r.runnerId)!, b = bins[Math.min(9, Math.floor(p * 10))];
        b.n++; b.probability += p; b.actual += wins.some(w => w.runnerId === r.runnerId) ? credit : 0;
      }
      for (const pick of picks) {
        // Frozen T1/T2 remain the selections. A subsequently void runner is excluded, never a loss or replacement.
        const selected = all.filter(r => ids.has(r.runnerId) && (pick.rank === "TOP2" ? r.rank <= 2 : r.rank === pick.rank));
        if (!selected.length) continue;
        pick.eligible++; pick.winners += Number(selected.some(r => wins.some(w => w.runnerId === r.runnerId)));
        pick.actualCredit += sum(selected.map(r => wins.some(w => w.runnerId === r.runnerId) ? credit : 0));
        pick.expected += sum(selected.map(r => probabilities.get(r.runnerId)!));
      }
    }
    const n = sum(bins.map(b => b.n));
    return { model, racesCaptured: observations.length, racesSettled: settled.length,
      logLoss: mean(losses), brier: mean(briers), calibrationECE: n ? sum(bins.map(b => Math.abs(b.probability - b.actual))) / n : null,
      bins: bins.map(b => ({ ...b, meanProbability: b.n ? b.probability / b.n : null, winRate: b.n ? b.actual / b.n : null })),
      selections: picks.map(p => ({ ...p, strikeRate: p.eligible ? p.winners / p.eligible : null, actualModel: p.expected ? p.actualCredit / p.expected : null })) };
  });
  const comparisons = settled.map(hurdleShadowComparison), disagreements = comparisons.filter(c => c.orderingDiffers);
  return { rows, racesCaptured: observations.length, racesSettled: settled.length, voidRaces: observations.filter(o => hurdleShadowOutcome(o) === "void").length,
    pendingRaces: observations.filter(o => hurdleShadowOutcome(o) === "pending").length,
    headToHead: { v2Better: comparisons.filter(c => c.better === "V2").length, v3Better: comparisons.filter(c => c.better === "V3").length,
      same: comparisons.filter(c => c.better === "same").length, disagreements: disagreements.length,
      v2Only: comparisons.filter(c => c.v2OnlyHit).length, v3Only: comparisons.filter(c => c.v3OnlyHit).length },
    led: { v3MissedTaggedWinners: sum(comparisons.map(c => c.v3MissedLedWinners.length)), recoveredWinners: sum(comparisons.map(c => c.ledRecoveredWinners.length)),
      changedT1: observations.map(hurdleShadowComparison).filter(c => c.ledChangedT1).length,
      changedT2: observations.map(hurdleShadowComparison).filter(c => c.ledChangedT2).length,
      changedTop2: observations.map(hurdleShadowComparison).filter(c => c.ledChangedTop2).length } };
}

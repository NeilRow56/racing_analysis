import type { JumpSpeedReliability } from "./jump-speed-reliability";
import { tissueProspectiveMetrics, type ProspectiveTissueObservation } from "./tissue-prospective-summary";
import { isTissueTop2SpeedRankWatch } from "./tissue-speed-rank-watch";
import { VALUE_RATIO_BANDS, valueRatioBand } from "./tissue-value-metrics";

export const CHASE_SPEED_RELIABILITY_DECLARED = "2026-10-28T09:35:43.000Z";
export const CHASE_SPEED_RELIABILITY_EPOCH = CHASE_SPEED_RELIABILITY_DECLARED;
export type ChaseSpeedState = {
  runnerId: string;
  reliability: JumpSpeedReliability | null;
  handicap: boolean | null;
  orRank: number | null;
  marketRank: number | null;
  modelMarketRatio: number | null;
};
export type ChaseSpeedObservation = ProspectiveTissueObservation & Partial<ChaseSpeedState>;
const groups = ["HIGH", "MEDIUM", "LOW", "MEDIUM/LOW"] as const;
type Group = typeof groups[number];
function matches(row: ChaseSpeedObservation, group: Group) {
  return group === "MEDIUM/LOW" ? row.reliability?.level === "MEDIUM" || row.reliability?.level === "LOW" : row.reliability?.level === group;
}
function metrics(rows: ChaseSpeedObservation[]) {
  const m = tissueProspectiveMetrics(rows);
  return { ...m, meanTissueProbability: m.settled ? m.modelExpected / m.settled : null };
}
const band = (n: number | null | undefined, cuts: number[], labels: string[]) => n == null || !Number.isFinite(n) ? "MISSING" : labels[cuts.findIndex(c => n < c) < 0 ? cuts.length : cuts.findIndex(c => n < c)];
export function summarizeChaseSpeedReliability(observations: ChaseSpeedObservation[], priceObservations: ChaseSpeedObservation[] = []) {
  const scope = (rows: ChaseSpeedObservation[]) => rows.filter(r => r.family === "CHASE" && (r.tissueRank === 1 || r.tissueRank === 2));
  const model = scope(observations), prices = scope(priceObservations);
  const period = (r: ChaseSpeedObservation) => !r.capturedAt || !Number.isFinite(Date.parse(r.capturedAt)) ? "UNKNOWN" : Date.parse(r.capturedAt) < Date.parse(CHASE_SPEED_RELIABILITY_DECLARED) ? "PRE" : "POST";
  return (["POST", "PRE", "UNKNOWN"] as const).map(phase => {
    const p = model.filter(r => period(r) === phase), q = prices.filter(r => period(r) === phase);
    const paired = (predicate: (r: ChaseSpeedObservation) => boolean) => ({ ...metrics(p.filter(predicate)), price: metrics(q.filter(predicate)) });
    const context = (name: string, labels: readonly string[], key: (r: ChaseSpeedObservation) => string) => ({ name,
      rows: (["HIGH", "MEDIUM/LOW"] as const).flatMap(group => labels.map(label => ({ group, label, ...paired(r => matches(r, group) && key(r) === label) }))),
    });
    return { phase, unavailable: p.filter(r => !r.reliability).length, priceUnavailable: q.filter(r => !r.reliability).length,
      ranks: ([1, 2, "TOP_2"] as const).map(rank => ({ rank, rows: groups.map(group => ({ group, ...paired(r => matches(r, group) && (rank === "TOP_2" || r.tissueRank === rank)) })) })),
      contexts: [
        context("Best L3 watch", ["NON-WATCH", "WATCH", "MISSING"], r => r.bestL3SpeedRank == null ? "MISSING" : isTissueTop2SpeedRankWatch(r) ? "WATCH" : "NON-WATCH"),
        context("Handicap", ["HANDICAP", "NON-HANDICAP", "MISSING"], r => r.handicap == null ? "MISSING" : r.handicap ? "HANDICAP" : "NON-HANDICAP"),
        context("OR rank", ["1", "2-3", "4+", "MISSING"], r => band(r.orRank, [2, 4], ["1", "2-3", "4+"])),
        context("Market rank", ["1-2", "3-5", "6-10", "11+", "MISSING"], r => band(r.marketRank, [3, 6, 11], ["1-2", "3-5", "6-10", "11+"])),
        context("Tissue probability", ["<10%", "10-<15%", "15-<20%", "20-<30%", "30%+"], r => band(r.probability, [.1, .15, .2, .3], ["<10%", "10-<15%", "15-<20%", "20-<30%", "30%+"])),
        context("Model/market ratio", [...VALUE_RATIO_BANDS, "MISSING"], r => r.modelMarketRatio == null || !Number.isFinite(r.modelMarketRatio) ? "MISSING" : valueRatioBand(r.modelMarketRatio)),
      ],
    };
  });
}

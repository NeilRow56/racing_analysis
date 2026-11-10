import type { GenerationData } from "./tissue-generation-forward";
import { matchingPositiveNeutralCapture, type PositiveNeutralData, type PositiveNeutralObservation, type PositiveNeutralSelection } from "./tissue-positive-neutral";
import { BADGE_PRICE_BANDS, POSITIVE_EDGE_BANDS } from "./tissue-positive-neutral-method";
import { TISSUE_VALUE_FAMILIES, type TissueValueFamily, type ValueOutcome } from "./tissue-value-metrics";

type Family = TissueValueFamily | "ALL";
type Row = { observation: PositiveNeutralObservation; selection: PositiveNeutralSelection; matched: boolean; outcome: ValueOutcome | null };
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0), mean = (xs: number[]) => xs.length ? sum(xs) / xs.length : null;
function metrics(rows: Row[]) {
  const settled = rows.filter(r => r.outcome?.status === "settled"), winners = settled.filter(r => r.outcome!.winner).length;
  const credit = (r: Row) => r.outcome!.winner ? 1 / r.outcome!.deadHeatDivisor : 0;
  const expected = sum(settled.map(r => r.selection.probability)), actualCredit = sum(settled.map(credit));
  const priced = settled.filter(r => r.selection.price !== null && r.outcome!.profitLoss !== null && Number.isFinite(r.outcome!.profitLoss));
  const profitLoss = priced.length ? sum(priced.map(r => r.outcome!.profitLoss!)) : null;
  return { captured: rows.length, races: new Set(rows.map(r => r.observation.raceId)).size, settled: settled.length, winners,
    strikeRate: settled.length ? winners / settled.length : null, expected, actualCredit, actualModel: expected ? actualCredit / expected : null,
    priceObservations: priced.length, profitLoss, roi: profitLoss === null ? null : profitLoss / priced.length,
    logLoss: mean(settled.map(r => { const p = Math.max(1e-15, Math.min(1 - 1e-15, r.selection.probability)), y = credit(r); return -y * Math.log(p) - (1 - y) * Math.log1p(-p); })),
    brier: mean(settled.map(r => (r.selection.probability - credit(r)) ** 2)),
    averageMarketRank: mean(rows.map(r => r.selection.marketRank).filter((x): x is number => x !== null)),
    averageEdgePP: mean(rows.map(r => r.selection.edgePP).filter((x): x is number => x !== null)),
    pending: rows.filter(r => r.matched && r.outcome === null).length, nonRunners: rows.filter(r => r.outcome?.status === "NR").length,
    void: rows.filter(r => r.outcome?.status === "void").length, sourceUnavailable: rows.filter(r => !r.matched).length };
}
export function summarizePositiveNeutral(data: PositiveNeutralData | null, generation: GenerationData | null) {
  const rows: Row[] = (data?.observations ?? []).flatMap(observation => {
    const source = matchingPositiveNeutralCapture(observation, generation?.races ?? []);
    return observation.selections.map(selection => ({ observation, selection, matched: source !== undefined, outcome: source?.runners.find(r => r.runnerId === selection.runnerId)?.outcome ?? null }));
  });
  const families: Family[] = ["ALL", ...TISSUE_VALUE_FAMILIES];
  const choose = (family: Family, rank: 1 | 2 | "TOP2", filter: (r: Row) => boolean) => rows.filter(r => (family === "ALL" || r.observation.family === family) && (rank === "TOP2" || r.selection.tissueRank === rank) && filter(r));
  const included = (r: Row) => r.selection.included;
  const cohorts = families.flatMap(family => ([1, 2] as const).flatMap(rank => (["POSITIVE", "NEUTRAL", "POSITIVE + NEUTRAL"] as const).map(badge => ({ family, rank, badge,
    ...metrics(choose(family, rank, r => badge === "POSITIVE + NEUTRAL" ? included(r) : r.selection.badgeState === badge)) }))));
  const headline = families.map(family => ({ family, t1: cohorts.find(r => r.family === family && r.rank === 1 && r.badge === "POSITIVE + NEUTRAL")!,
    t2: cohorts.find(r => r.family === family && r.rank === 2 && r.badge === "POSITIVE + NEUTRAL")! }));
  const top2 = families.map(family => ({ family, rank: "TOP2" as const, ...metrics(choose(family, "TOP2", included)) }));
  const negative = families.flatMap(family => ([1, 2] as const).map(rank => ({ family, rank, ...metrics(choose(family, rank, r => r.selection.badgeState === "NEGATIVE")) })));
  const edge = families.flatMap(family => ([1, 2] as const).flatMap(rank => POSITIVE_EDGE_BANDS.map(band => ({ family, rank, band,
    ...metrics(choose(family, rank, r => r.selection.badgeState === "POSITIVE" && r.selection.edgeBand === band)) }))));
  const price = families.flatMap(family => ([1, 2] as const).flatMap(rank => BADGE_PRICE_BANDS.map(band => ({ family, rank, band,
    ...metrics(choose(family, rank, r => included(r) && r.selection.priceBand === band)) }))));
  const comparisons = families.flatMap(family => ([1, 2] as const).map(rank => {
    const all = metrics(choose(family, rank, () => true)), filtered = metrics(choose(family, rank, included));
    const delta = (key: "strikeRate" | "actualModel" | "roi" | "logLoss" | "averageMarketRank") => all[key] === null || filtered[key] === null ? null : filtered[key]! - all[key]!;
    return { family, rank, all, filtered, difference: { strikeRate: delta("strikeRate"), actualModel: delta("actualModel"), roi: delta("roi"), logLoss: delta("logLoss"), averageMarketRank: delta("averageMarketRank") },
      fallback: metrics(choose(family, rank, r => r.selection.badgeState === "FALLBACK")) };
  }));
  return { capturedRaces: data?.observations.length ?? 0, includedSelections: rows.filter(included).length, fallbackSelections: rows.filter(r => r.selection.badgeState === "FALLBACK").length,
    unavailableRaces: [...new Set(rows.filter(r => !r.matched).map(r => r.observation.raceId))], headline, cohorts, top2, negative, edge, price, comparisons };
}

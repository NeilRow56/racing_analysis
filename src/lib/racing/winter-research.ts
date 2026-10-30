import { tissueProspectiveMetrics, type ProspectiveTissueObservation } from "./tissue-prospective-summary";
import { isTissueTop2SpeedRankWatch } from "./tissue-speed-rank-watch";
import { isLongerPriceTissueTop2 } from "./longer-price-tissue-watch";
import type { ChaseSpeedObservation } from "./chase-speed-reliability-shadow";
import type { HurdleRecencyObservation } from "./hurdle-recency-forward";

export const WINTER_FAMILIES = ["AW", "HURDLE", "CHASE"] as const;
export const WINTER_STATUSES = { AW: "KEEP", HURDLE: "KEEP", CHASE: "INVESTIGATE" } as const;
export const WINTER_QUESTIONS = [
  ["RED WATCH", "Does Best L3 Speed rank 2–3 continue to underperform its complement?"],
  ["CHASE SPEED RELIABILITY", "Does Chase MEDIUM/LOW reliability continue to underperform HIGH reliability?"],
  ["HURDLE RECENCY", "Does latest-run PU/non-completion remain weaker than recent completion?"],
] as const;

export type WinterObservation = ChaseSpeedObservation & {
  scheduledOff: string;
  handicapFrozen: boolean | null;
  orFrozen: number | null;
  recency: Pick<HurdleRecencyObservation, "features" | "flags"> | null;
};
type Predicate = (row: WinterObservation) => boolean;
export type WinterPeriod = { label: string; start: string; end?: string };
// Frozen off-time boundaries from the 30 October season-transition diagnostic.
// Never recompute quantiles as the sample grows. The final block remains open.
export const WINTER_RECENT_BLOCK = { label: "Q4 · 27 Oct 15:40 UTC onward", start: "2026-10-27T15:40:00.000Z" };
export const CHASE_WINTER_PERIODS: WinterPeriod[] = [
  { label: "20–26 Oct", start: "2026-10-20T00:00:00.000Z", end: "2026-10-27T00:00:00.000Z" },
  { label: "27 Oct–2 Nov (review week 2)", start: "2026-10-27T00:00:00.000Z", end: "2026-11-03T00:00:00.000Z" },
  { label: "Q1 · before 22 Oct 15:53", start: "2026-10-20T00:00:00.000Z", end: "2026-10-22T15:53:00.000Z" },
  { label: "Q2 · 22 Oct 15:53–25 Oct 12:32", start: "2026-10-22T15:53:00.000Z", end: "2026-10-25T12:32:00.000Z" },
  { label: "Q3 · 25 Oct 12:32–27 Oct 15:31", start: "2026-10-25T12:32:00.000Z", end: "2026-10-27T15:31:00.000Z" },
  { label: "Q4 · 27 Oct 15:31 onward", start: "2026-10-27T15:31:00.000Z" },
  { label: "First half · before 25 Oct 12:32", start: "2026-10-20T00:00:00.000Z", end: "2026-10-25T12:32:00.000Z" },
  { label: "Second half · 25 Oct 12:32 onward", start: "2026-10-25T12:32:00.000Z" },
];
export const AW_WINTER_PERIODS: WinterPeriod[] = [
  { label: "First half · before 26 Oct 16:30 UTC", start: "2026-10-20T00:00:00.000Z", end: "2026-10-26T16:30:00.000Z" },
  { label: "Second half · 26 Oct 16:30 UTC onward", start: "2026-10-26T16:30:00.000Z" },
];
export const inWinterPeriod = (row: WinterObservation, period: WinterPeriod) =>
  row.scheduledOff >= period.start && (!period.end || row.scheduledOff < period.end);
const high: Predicate = r => r.reliability?.level === "HIGH";
const mediumLow: Predicate = r => r.reliability?.level === "MEDIUM" || r.reliability?.level === "LOW";
const genuinePrice: Predicate = r => r.capturedPrice !== null && Number.isFinite(r.capturedPrice) && r.capturedPrice > 1;

export function summarizeWinterResearch(observations: WinterObservation[], priceObservations: WinterObservation[]) {
  const scope = (rows: WinterObservation[]) => rows.filter(r => WINTER_FAMILIES.some(f => f === r.family) &&
    (r.tissueRank === 1 || r.tissueRank === 2) && r.scheduledOff >= "2026-10-20T00:00:00.000Z");
  const primary = scope(observations), prices = scope(priceObservations).filter(genuinePrice);
  const metrics = (rows: ProspectiveTissueObservation[]) => tissueProspectiveMetrics(rows);
  const pair = (label: string, predicate: Predicate, priceOnly = false) => ({ label,
    ...metrics((priceOnly ? prices : primary).filter(predicate)), price: metrics(prices.filter(predicate)), priceOnly,
  });
  const familyRows = (family: typeof WINTER_FAMILIES[number], groups: readonly (readonly [string, Predicate])[]) =>
    groups.map(([label, predicate]) => pair(label, r => r.family === family && predicate(r)));
  const rankGroups = [["Tissue Rank 1", (r: WinterObservation) => r.tissueRank === 1],
    ["Tissue Rank 2", (r: WinterObservation) => r.tissueRank === 2]] as const;
  const redGroups = [["PALE RED", isTissueTop2SpeedRankWatch], ["NON-RED", (r: WinterObservation) => !isTissueTop2SpeedRankWatch(r)]] as const;
  const red = (period?: WinterPeriod) => [...WINTER_FAMILIES, "ALL" as const].flatMap(family => redGroups.map(([label, predicate]) =>
    pair(`${family === "ALL" ? "All winter families" : family} · ${label}`, r => (family === "ALL" || r.family === family) && predicate(r) && (!period || inWinterPeriod(r, period)))));
  return {
    cards: WINTER_FAMILIES.map(family => ({ ...pair(family, r => r.family === family), status: WINTER_STATUSES[family] })),
    red: red(), recentRed: red(WINTER_RECENT_BLOCK),
    chaseReliability: familyRows("CHASE", [["HIGH", high], ["MEDIUM", r => r.reliability?.level === "MEDIUM"],
      ["LOW", r => r.reliability?.level === "LOW"], ["MEDIUM/LOW", mediumLow], ["Unclassified reliability", r => !r.reliability]]),
    chaseRank: familyRows("CHASE", rankGroups),
    chaseRaceType: familyRows("CHASE", [["Handicap", r => r.handicapFrozen === true], ["Non-handicap", r => r.handicapFrozen === false], ["Race type missing", r => r.handicapFrozen === null]]),
    chaseOr: familyRows("CHASE", [["OR rank 1", r => r.orFrozen === 1], ["OR ranks 2–3", r => r.orFrozen === 2 || r.orFrozen === 3],
      ["OR rank 4+", r => r.orFrozen !== null && r.orFrozen >= 4], ["OR missing", r => r.orFrozen === null]]),
    chaseChronology: CHASE_WINTER_PERIODS.map(period => ({ ...pair(period.label, r => r.family === "CHASE" && inWinterPeriod(r, period)),
      high: metrics(primary.filter(r => r.family === "CHASE" && inWinterPeriod(r, period) && high(r))),
      mediumLow: metrics(primary.filter(r => r.family === "CHASE" && inWinterPeriod(r, period) && mediumLow(r))),
    })),
    aw: [...familyRows("AW", [...rankGroups, ...redGroups]),
      pair("Longer-price >6.00 · Value cohort", r => r.family === "AW" && isLongerPriceTissueTop2(r), true),
      pair("Shorter-price ≤6.00 · Value cohort", r => r.family === "AW" && r.capturedPrice! <= 6, true)],
    awChronology: AW_WINTER_PERIODS.map(period => pair(period.label, r => r.family === "AW" && inWinterPeriod(r, period))),
    hurdle: familyRows("HURDLE", [...rankGroups, ...redGroups,
      ["Recent completer (≤30 days)", r => r.recency?.flags.RECENT_COMPLETER === true],
      ["Latest-run PU", r => r.recency?.flags.LATEST_RUN_PU === true],
      ["Latest-run non-completer (includes PU)", r => r.recency?.features.latestRunCompleted === false],
      ["Recency unclassified", r => r.recency === null]]),
    longerPrice: WINTER_FAMILIES.map(family => pair(family, r => r.family === family && isLongerPriceTissueTop2(r), true)),
    missingSpeed: WINTER_FAMILIES.map(family => pair(family, r => r.family === family && r.bestL3SpeedRank == null)),
  };
}
export type WinterResearchSummary = ReturnType<typeof summarizeWinterResearch>;

import { type TissueInputReliability } from "./tissue-input-reliability";
import { summarizeProspectiveTissue, type ProspectiveTissueObservation } from "./tissue-prospective-summary";
import { isTissueTop2SpeedRankWatch } from "./tissue-speed-rank-watch";

export const TISSUE_RELIABILITY_LEVELS = ["GOOD", "CAUTION", "UNKNOWN"] as const;
export const tissueReliabilityLevel = (row: ProspectiveTissueObservation): TissueInputReliability["level"] => row.inputReliability?.level ?? "UNKNOWN";
const isTop2 = (row: ProspectiveTissueObservation) => row.tissueRank === 1 || row.tissueRank === 2;

export function summarizeTissueInputReliability(rows: ProspectiveTissueObservation[]) {
  return TISSUE_RELIABILITY_LEVELS.map(level => ({ level,
    ranks: summarizeProspectiveTissue(rows.filter(row => tissueReliabilityLevel(row) === level)),
  }));
}

export function summarizeTissueReliabilityInteraction(rows: ProspectiveTissueObservation[]) {
  return ([false, true] as const).flatMap(watch => TISSUE_RELIABILITY_LEVELS.map(level => ({ watch, level,
    ranks: summarizeProspectiveTissue(rows.filter(row => isTissueTop2SpeedRankWatch(row) === watch && tissueReliabilityLevel(row) === level)),
  })));
}

/** Median of distinct captured race books, independent of outcomes/settlement.
 * Whole races and equal clocks stay together. Missing clocks remain explicit.
 * Each cohort owns its own boundary; never join Value clocks into primary books.
 */
export function summarizeTissueReliabilityChronology(rows: ProspectiveTissueObservation[]) {
  const top2 = rows.filter(isTop2);
  const books = new Map<string, string>();
  for (const row of top2) {
    if (!row.raceId || !row.capturedAt || !Number.isFinite(Date.parse(row.capturedAt))) continue;
    const key = `${row.family}|${row.raceId}`, previous = books.get(key);
    if (previous && previous !== row.capturedAt) throw new Error("Inconsistent prospective race capture clocks");
    books.set(key, row.capturedAt);
  }
  const clocks = [...books.values()].sort((a, b) => Date.parse(a) - Date.parse(b));
  const boundary = clocks.length ? clocks[Math.floor(clocks.length / 2)] : null;
  return { boundary, windows: (["EARLIER HALF", "LATER HALF", "UNKNOWN CAPTURE TIME"] as const).map(window => ({ window,
    groups: summarizeTissueInputReliability(top2.filter(row => {
      const known = !!row.raceId && !!row.capturedAt && Number.isFinite(Date.parse(row.capturedAt));
      if (window === "UNKNOWN CAPTURE TIME") return !known;
      if (!known || !boundary) return false;
      return window === "EARLIER HALF" ? Date.parse(row.capturedAt!) < Date.parse(boundary) : Date.parse(row.capturedAt!) >= Date.parse(boundary);
    })),
  })) };
}

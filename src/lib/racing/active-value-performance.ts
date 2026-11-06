import { latestPreOffCaptures } from "./frozen-capture-selection";
import type { TissueValueData } from "./tissue-value-forward";
import { frozenValueIndex } from "./tissue-value-view";
import { summarizeValueRunners, TISSUE_VALUE_FAMILIES } from "./tissue-value-metrics";
import { isActiveValueOne, VALUE_RANK_EPOCH, VALUE_RANK_VERSION } from "./value-rank-v2";

/** Exactly the latest whole Value books used by Today. No extra market/research eligibility filter. */
export function activeValuePerformance(datasets: TissueValueData[]) {
  const index = frozenValueIndex(datasets);
  const books = latestPreOffCaptures(datasets.flatMap(d => d.races));
  const leaders = books.flatMap(book => book.runners.filter(r => r.valueRank === 1).map(runner => {
    const display = index.get(`${book.raceId}|${runner.runnerId}`)!;
    const v2 = book.capturedAt >= VALUE_RANK_EPOCH && display.valueSelectionVersion === VALUE_RANK_VERSION;
    return { raceId: book.raceId, runnerId: runner.runnerId, date: book.raceDate, time: book.scheduledOff.slice(11, 16),
      course: book.course, family: book.family, horse: runner.horseName, capturedAt: book.capturedAt,
      priorCareerRuns: display.valueRankDecision?.priorCareerRuns ?? null,
      rejectionReason: display.valueRankDecision?.rejectionReason ?? null,
      version: display.valueSelectionVersion!, active: isActiveValueOne(display), v2,
      includedInResearch: v2,
      researchReason: v2 ? "Included: frozen post-epoch V2 policy" : `Pre-epoch V1 capture (${book.capturedAt}); no frozen V2 policy`,
      runner };
  })).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.runnerId.localeCompare(b.runnerId));
  const prospective = leaders.filter(r => r.v2);
  const active = prospective.filter(r => r.active);
  return { leaders, active,
    families: [...TISSUE_VALUE_FAMILIES, "ALL" as const].map(family => ({ family,
      ...summarizeValueRunners(active.filter(r => family === "ALL" || r.family === family).map(r => r.runner)) })),
    legacyShadow: summarizeValueRunners(prospective.map(r => r.runner)),
    rejected: summarizeValueRunners(prospective.filter(r => !r.active).map(r => r.runner)),
  };
}

/** Daily totals use exactly the same latest-book V2 membership as the cumulative summary. */
export function activeValueDay(performance: ReturnType<typeof activeValuePerformance>, date: string) {
  const rows = performance.active.filter(r => r.date === date);
  return { rows, summary: summarizeValueRunners(rows.map(r => r.runner)),
    rejected: performance.leaders.filter(r => r.date === date && r.v2 && !r.active) };
}

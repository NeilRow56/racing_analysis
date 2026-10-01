import type { TodayRunner } from "@/lib/racing/todays-racing";
import { formatTodayTprRankGap } from "@/lib/racing/todays-racing";
import {
  MIN_RACE_RATED_RUNNERS, MIN_RACE_RATING_COVERAGE,
  TPR_RATING_COVERAGE_GUARD_VERSION, TPR_RATING_COVERAGE_GUARD_IMPLEMENTED_AT,
  type RatingCoverage,
} from "@/lib/racing/rating-coverage";

export function TurfPerformanceRatingCell({ coverage, runner }: { coverage?: RatingCoverage; runner: Pick<TodayRunner, "turfPerformanceRating" | "tprConfidence"> }) {
  const rating = runner.turfPerformanceRating;
  if (!rating) return <span className="text-slate-400">—</span>;
  const context = runner.tprConfidence;
  const insufficientCoverage = coverage?.ratingCoverageStatus === "insufficient_coverage";
  const coverageTitle = coverage ? `Rated ${coverage.ratedRunnerCount}/${coverage.activeRunnerCount}; guard ${TPR_RATING_COVERAGE_GUARD_VERSION}, implemented ${TPR_RATING_COVERAGE_GUARD_IMPLEMENTED_AT}; requires at least ${MIN_RACE_RATED_RUNNERS} rated runners and ${(MIN_RACE_RATING_COVERAGE * 100).toFixed(0)}% coverage.` : undefined;
  return (
    <div className="space-y-0.5">
      <div className="font-semibold text-slate-900">TPR {Math.round(rating.rating)}</div>
      <div className={insufficientCoverage ? "text-xs font-medium text-amber-700" : "text-xs text-slate-600"} title={insufficientCoverage ? coverageTitle : undefined}>
        {insufficientCoverage ? "Insufficient race coverage" : formatTodayTprRankGap(rating.rank, rating.gap)}
      </div>
      {rating.isCrossSurfaceFallback ? <div className="text-xs font-medium text-sky-700">{rating.historyDepth}-run AW fallback</div> : context ? (
        <>
          <div className="text-xs text-slate-600">{context.historyDepthLabel}</div>
          {context.limitedHistory ? <div className="text-xs text-amber-700">Limited history</div> : null}
          {context.staleTurfEvidence ? (
            <div className="text-xs text-amber-700" title={`${context.daysSinceUsableTurfRun} days since the most recent usable Turf run (${context.latestUsableTurfRunDateTime?.slice(0, 10)}).`}>Stale Turf evidence</div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

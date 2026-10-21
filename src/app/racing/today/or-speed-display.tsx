import { finite, formatSpeedEdge, type ComparableRunner } from "@/lib/racing/or-speed-comparison";
export { sameOrSpeedEdges, sameOrAwSpeedEdges, officialRatingRanks } from "@/lib/racing/or-speed-comparison";

export const BEST_L3_AW_HELP = "Best L3 is the horse's best All-Weather Speed figure from its last three eligible All-Weather runs.";

export const BEST_L3_TURF_HELP = "Best L3 is the horse's best Turf Speed figure from its last three eligible Turf runs.";

export function OrSpeedCell({ runner, speedEdge, orRank, family = "turf" }: {
  runner: Pick<ComparableRunner, "officialRating" | "metrics">;
  speedEdge?: number;
  orRank?: number;
  family?: "turf" | "all_weather";
}) {
  const speed = family === "all_weather" ? runner.metrics?.bestAwSpeedLast3 : runner.metrics?.bestTurfSpeedLast3;
  const hasEdge = finite(runner.officialRating) && finite(speed) && finite(speedEdge) && speedEdge > 0;
  const formattedEdge = hasEdge ? formatSpeedEdge(speedEdge) : "";
  const topOr = finite(orRank) && Number.isInteger(orRank) && orRank >= 1 && orRank <= 3;
  return (
    <div className="space-y-0.5">
      <div className="whitespace-nowrap font-semibold text-slate-900" title={family === "all_weather" ? BEST_L3_AW_HELP : BEST_L3_TURF_HELP}>
        OR {display(runner.officialRating)} · Best L3 {display(speed)}
      </div>
      {hasEdge ? (
        <span
          className={topOr
            ? "inline-block border border-emerald-200 bg-emerald-50 px-1 text-[10px] font-semibold text-emerald-800"
            : "inline-block border border-slate-200 px-1 text-[10px] text-slate-600"}
          title={`Best L3 Speed advantage over the next-highest Speed runner in this race with the same Official Rating: ${formattedEdge} points.${topOr ? ` This horse is also in the top three by Official Rating (OR rank ${orRank}${orRank === 1 ? "; shares the highest OR in this race" : ""}).` : ""} Descriptive comparison; Speed supplements OR independently.`}
        >
          Speed edge +{formattedEdge}
        </span>
      ) : null}
    </div>
  );
}

function display(value: number | null | undefined): string {
  if (!finite(value)) return "—";
  // Keep floating-point figures compact without rounding a positive gap to zero.
  const rounded = Number(value.toFixed(2));
  return String(rounded === 0 && value !== 0 ? Number(value.toPrecision(2)) : rounded);
}

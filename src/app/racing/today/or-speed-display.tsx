import { finite, formatSpeedEdge, type ComparableRunner } from "@/lib/racing/or-speed-comparison";
export { sameOrSpeedEdges, sameOrAwSpeedEdges, officialRatingRanks } from "@/lib/racing/or-speed-comparison";

export const BEST_L3_AW_HELP = "Best L3 is the highest All-Weather Speed figure available in the horse's last three eligible prior runs, across surfaces.";
export const BEST_L3_TURF_HELP = "Best L3 is the highest Turf Speed figure available in the horse's last three eligible prior runs, across surfaces.";

type Family = "turf" | "all_weather";
const helpControl = "relative cursor-pointer list-none rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 [&::-webkit-details-marker]:hidden";
const awTissueHelp = "AW Tissue V3 uses a separate gap against the average of the measured same-OR peers in its frozen field. Its negative same-OR Speed coefficient means a larger positive model gap lowers that part of the score. Tissue rank uses the full score.";

function InfoMark() {
  return <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold normal-case">i</span>;
}

export function OrSpeedColumnHelp({ family }: { family: Family }) {
  const speedHelp = family === "all_weather" ? BEST_L3_AW_HELP : BEST_L3_TURF_HELP;
  return <details>
    <summary className={`${helpControl} flex min-h-6 items-center gap-1`}>
      OR + Speed <InfoMark />
      <span className="sr-only">. How the same-OR comparison works</span>
    </summary>
    <div className="mt-1 space-y-2 rounded border border-slate-200 bg-white p-2 text-[11px] leading-4 font-normal normal-case text-slate-700">
      <p>{speedHelp}</p>
      <p>The outright fastest horse at each Official Rating is compared with the next-fastest measured horse at that exact rating. Plus means higher. Minus would mean lower. The badge only shows positive leads, rounded to two decimals. Ties for fastest or fewer than two usable figures leave it blank.</p>
      <p>OR rank is one plus the number of horses with a higher Official Rating, including horses without a Speed figure. Ties share a rank. Green marks the top three OR ranks.</p>
      <p>Withdrawn horses still on the displayed card can count toward the comparison and OR rank. Frozen Tissue inputs keep the field recorded at capture.</p>
      {family === "all_weather" && <p>{awTissueHelp}</p>}
      <p>The displayed gap describes past Speed. Winning probability and betting value are separate measures.</p>
    </div>
  </details>;
}

export function OrSpeedCell({ runner, speedEdge, orRank, family = "turf" }: {
  runner: Pick<ComparableRunner, "officialRating" | "metrics">;
  speedEdge?: number;
  orRank?: number;
  family?: Family;
}) {
  const speed = family === "all_weather" ? runner.metrics?.bestAwSpeedLast3 : runner.metrics?.bestTurfSpeedLast3;
  const hasEdge = finite(runner.officialRating) && finite(speed) && finite(speedEdge) && speedEdge > 0;
  const ranked = finite(orRank) && Number.isInteger(orRank) && orRank >= 1;
  const topOr = ranked && orRank <= 3;
  return (
    <div className="space-y-0.5">
      <div className="whitespace-nowrap font-semibold text-slate-900" title={family === "all_weather" ? BEST_L3_AW_HELP : BEST_L3_TURF_HELP}>
        OR {display(runner.officialRating)} · Best L3 {display(speed)}
      </div>
      {hasEdge && (
        <details>
          <summary className={`${helpControl} inline-flex min-h-6 max-w-full items-center gap-1 border px-1 text-[10px] ${topOr
            ? "border-emerald-200 bg-emerald-50 font-semibold text-emerald-800"
            : "border-slate-200 text-slate-600"}`}>
            <span>Speed vs same OR <span className="whitespace-nowrap">+{formatSpeedEdge(speedEdge)}</span></span>
            <InfoMark />
            <span className="sr-only">. Show comparison details</span>
          </summary>
          <div className="mt-1 space-y-1.5 rounded border border-slate-200 bg-white p-2 text-[11px] leading-4 text-slate-700">
            <dl className="space-y-1">
              <div><dt>Horse Best L3</dt><dd className="font-semibold tabular-nums">{display(speed)}</dd></div>
              <div><dt>Next-fastest at OR {runner.officialRating}</dt><dd className="font-semibold tabular-nums">{display(speed - speedEdge)}</dd></div>
              <div><dt>Difference</dt><dd className="font-semibold tabular-nums">+{formatSpeedEdge(speedEdge)} points</dd></div>
            </dl>
            <p>The gap uses unrounded figures.</p>
            {ranked && <p>OR rank {orRank} in this field{topOr ? " · top three by Official Rating" : ""}.</p>}
            {family === "all_weather" && <p>AW Tissue V3 compares with the peer average. Its negative same-OR Speed coefficient makes a larger model gap lower this part of the score.</p>}
          </div>
        </details>
      )}
    </div>
  );
}

function display(value: number | null | undefined): string {
  if (!finite(value)) return "—";
  const rounded = Number(value.toFixed(2));
  return String(rounded === 0 && value !== 0 ? Number(value.toPrecision(2)) : rounded);
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { createDbConnection } from "@/db";
import {
  getHorseForm,
  summarizeHorseForm,
  type HorseFormRun,
} from "@/lib/horse-form";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    horseId: string;
  }>;
};

export default async function HorsePage({ params }: PageProps) {
  const { horseId } = await params;
  let connection: ReturnType<typeof createDbConnection> | null = null;

  try {
    connection = createDbConnection();
    const form = await getHorseForm(connection.db, horseId);
    await connection.client.end();
    connection = null;

    if (!form) {
      notFound();
    }

    const summary = summarizeHorseForm(form.runs);
    const rprChange = difference(summary.latestRpr, summary.previousRpr);
    const tsChange = difference(summary.latestTs, summary.previousTs);
    const rprVsOr = difference(summary.latestRpr, summary.latestOr);

    return (
      <main className="min-h-full bg-stone-50 px-6 py-10 text-slate-950">
        <section className="mx-auto w-full max-w-6xl">
          <Link
            className="text-sm font-medium text-emerald-700 hover:text-emerald-900"
            href="/"
          >
            Back to races
          </Link>

          <header className="mt-6 border-b border-slate-200 pb-6">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-emerald-700">
              Horse form
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-normal">
              {form.horse.displayName}
            </h1>
            <p className="mt-4 text-sm leading-6 text-slate-700">
              {recordedRunText(summary.runs)}
              {form.horse.source === "racing-post" && form.horse.sourceId
                ? ` Racing Post horse ID ${form.horse.sourceId}.`
                : ""}
            </p>
          </header>

          <section className="mt-8">
            <h2 className="text-xl font-semibold">Summary</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <SummaryMetric label="Runs" value={summary.runs} />
              <SummaryMetric label="Wins" value={summary.wins} />
              <SummaryMetric label="Places" value={summary.places} />
              <SummaryMetric
                label="Win %"
                value={formatPercent(summary.winPercent)}
              />
              <SummaryMetric label="Latest RPR" value={summary.latestRpr} />
              <SummaryMetric label="Best RPR" value={summary.bestRpr} />
              <SummaryMetric
                label="Average RPR"
                value={formatDecimal(summary.averageRpr)}
              />
              <SummaryMetric label="Latest TS" value={summary.latestTs} />
              <SummaryMetric label="Best TS" value={summary.bestTs} />
              <SummaryMetric
                label="Average TS"
                value={formatDecimal(summary.averageTs)}
              />
            </dl>
            <p className="mt-3 text-xs leading-5 text-slate-600">
              Places are recorded finishing positions 1 to 3 in the current
              local dataset.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold">Comparison Signals</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <SummaryMetric
                label="Latest RPR vs previous"
                value={formatDifference(rprChange)}
              />
              <SummaryMetric
                label="Latest TS vs previous"
                value={formatDifference(tsChange)}
              />
              <SummaryMetric
                label="Latest RPR vs latest OR"
                value={formatDifference(rprVsOr)}
              />
            </dl>
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-semibold">Recorded Runs</h2>
            {form.runs.length === 0 ? (
              <p className="mt-4 text-sm leading-6 text-slate-700">
                No recorded runs are available in the current local dataset.
              </p>
            ) : (
              <FormTable runs={form.runs} />
            )}
          </section>
        </section>
      </main>
    );
  } finally {
    if (connection) {
      await connection.client.end();
    }
  }
}

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: number | string | null;
}) {
  return (
    <div className="border-t border-slate-200 pt-3">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value ?? "-"}</dd>
    </div>
  );
}

function FormTable({ runs }: { runs: HorseFormRun[] }) {
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[1120px] text-left text-sm">
        <thead className="border-b border-slate-200 text-slate-600">
          <tr>
            <th className="py-2 pr-4 font-medium">Date</th>
            <th className="py-2 pr-4 font-medium">Course</th>
            <th className="py-2 pr-4 font-medium">Race</th>
            <th className="py-2 pr-4 font-medium">Type/Class</th>
            <th className="py-2 pr-4 font-medium">Distance</th>
            <th className="py-2 pr-4 font-medium">Going</th>
            <th className="py-2 pr-4 font-medium">Outcome</th>
            <th className="py-2 pr-4 font-medium">Runners</th>
            <th className="py-2 pr-4 font-medium">Weight</th>
            <th className="py-2 pr-4 font-medium">Draw</th>
            <th className="py-2 pr-4 font-medium">SP</th>
            <th className="py-2 pr-4 font-medium">OR</th>
            <th className="py-2 pr-4 font-medium">Speed</th>
            <th className="py-2 pr-4 font-medium">RPR</th>
            <th className="py-2 pr-4 font-medium">TS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {runs.map((run) => (
            <tr key={run.runnerId} className="align-top">
              <td className="py-3 pr-4">{run.raceDate}</td>
              <td className="py-3 pr-4">{run.courseName}</td>
              <td className="py-3 pr-4">
                <p className="font-medium">{run.raceTitle ?? "Untitled race"}</p>
                {run.runnerComment ? (
                  <p className="mt-2 max-w-lg text-xs leading-5 text-slate-600">
                    {run.runnerComment}
                  </p>
                ) : null}
                {run.jockeyName || run.trainerName ? (
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {[run.jockeyName, run.trainerName].filter(Boolean).join(" / ")}
                  </p>
                ) : null}
              </td>
              <td className="py-3 pr-4">
                {[run.raceTypeCode, run.raceClass ? `Class ${run.raceClass}` : null]
                  .filter(Boolean)
                  .join(" / ") || "-"}
              </td>
              <td className="py-3 pr-4">{run.distance ?? "-"}</td>
              <td className="py-3 pr-4">{run.going ?? "-"}</td>
              <td className="py-3 pr-4">{formatOutcome(run)}</td>
              <td className="py-3 pr-4">{run.runnerCount ?? "-"}</td>
              <td className="py-3 pr-4">{run.carriedWeight ?? "-"}</td>
              <td className="py-3 pr-4">{run.draw ?? "-"}</td>
              <td className="py-3 pr-4">{run.startingPrice ?? "-"}</td>
              <td className="py-3 pr-4">{run.officialRating ?? "-"}</td>
              <td className="py-3 pr-4" title={jumpSpeedTitle(run)}>
                {formatJumpSpeed(run)}
              </td>
              <td className="py-3 pr-4">{run.racingPostRating ?? "-"}</td>
              <td className="py-3 pr-4">{run.topspeedRating ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function recordedRunText(runs: number): string {
  if (runs === 1) {
    return "1 recorded run in the current local dataset.";
  }
  return `${runs} recorded runs in the current local dataset.`;
}

function formatOutcome(run: HorseFormRun): string {
  if (run.finishingPosition !== null) {
    return String(run.finishingPosition);
  }
  return run.resultStatus ?? run.outcomeCode ?? "-";
}

function formatJumpSpeed(run: HorseFormRun): string {
  const rating = run.jumpSpeedRating;
  if (!rating || rating.method === "unavailable") {
    return "-";
  }
  if (rating.rating === null) {
    return "-";
  }
  return Math.round(rating.rating).toString();
}

function jumpSpeedTitle(run: HorseFormRun): string | undefined {
  const rating = run.jumpSpeedRating;
  if (!rating) {
    return undefined;
  }
  if (rating.method === "unavailable") {
    return rating.withheldReason ? `Not rated: ${formatReason(rating.withheldReason)}` : "Not rated";
  }
  if (rating.method === "withheld") {
    return rating.withheldReason ? `Not rated: ${formatReason(rating.withheldReason)}` : "Not rated";
  }
  return `${rating.method === "same_day" ? "Same-day" : "Base"} / ${rating.confidence} confidence`;
}

function formatReason(reason: string): string {
  if (reason === "beaten_distance_gt_75_lengths") {
    return "beaten >75L";
  }
  if (reason === "not_jump_race") {
    return "not a jump race";
  }
  if (reason === "insufficient_timing_or_standard") {
    return "insufficient timing or standard";
  }
  return reason.replaceAll("_", " ");
}

function formatPercent(value: number | null): string | null {
  return value === null ? null : `${value.toFixed(1)}%`;
}

function formatDecimal(value: number | null): string | null {
  return value === null ? null : value.toFixed(1);
}

function difference(
  latest: number | null,
  comparison: number | null,
): number | null {
  if (latest === null || comparison === null) {
    return null;
  }
  return latest - comparison;
}

function formatDifference(value: number | null): string | null {
  if (value === null) {
    return null;
  }
  return value > 0 ? `+${value}` : String(value);
}

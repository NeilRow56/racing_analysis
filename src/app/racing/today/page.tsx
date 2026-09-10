import Link from "next/link";
import { createDbConnection } from "@/db";
import {
  formatRaceTimeForDisplay,
  getTodaysRacingData,
  isJumpRaceForDisplay,
  racingPageTitle,
  resolveRacingDate,
  type TodayMeeting,
  type TodayRace,
  type TodayRunner,
} from "@/lib/racing/todays-racing";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    date?: string;
  }>;
};

export default async function TodaysRacingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { raceDate, invalidDateParam } = resolveRacingDate({
    dateParam: params?.date,
  });
  let connection: ReturnType<typeof createDbConnection> | null = null;

  try {
    connection = createDbConnection();
    const data = await getTodaysRacingData(connection.db, raceDate);
    await connection.client.end();
    connection = null;

    return (
      <main className="min-h-full bg-stone-50 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
        <section className="mx-auto w-full max-w-7xl">
          <header className="border-b border-slate-200 pb-5">
            <Link
              className="text-sm font-medium text-emerald-700 hover:text-emerald-900"
              href="/"
            >
              Back to races
            </Link>
            <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
                  {racingPageTitle({ raceDate })}
                </h1>
                <p className="mt-2 text-lg text-slate-700">{data.displayDate}</p>
                {invalidDateParam ? (
                  <p className="mt-2 text-sm text-amber-700">
                    Ignoring invalid date parameter: {invalidDateParam}
                  </p>
                ) : null}
              </div>
              {data.refreshedAt ? (
                <p className="text-sm text-slate-600">
                  Racecard data last refreshed:{" "}
                  {formatFreshnessTime(data.refreshedAt)}
                </p>
              ) : null}
            </div>
          </header>

          {data.status === "empty" ? (
            <p className="mt-8 text-sm leading-6 text-slate-700">
              {data.message}
            </p>
          ) : (
            <TodaysRacing meetings={data.meetings} />
          )}
        </section>
      </main>
    );
  } finally {
    if (connection) {
      await connection.client.end();
    }
  }
}

function TodaysRacing({ meetings }: { meetings: TodayMeeting[] }) {
  return (
    <>
      <nav
        aria-label="Meetings"
        className="sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-stone-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      >
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
          {meetings.map((meeting) => (
            <a
              className="shrink-0 border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-emerald-700 hover:text-emerald-800"
              href={`#meeting-${meeting.courseId}`}
              key={meeting.courseId}
            >
              {meeting.courseName}
            </a>
          ))}
        </div>
      </nav>

      <div className="mt-8 space-y-10">
        {meetings.map((meeting) => (
          <MeetingSection key={meeting.courseId} meeting={meeting} />
        ))}
      </div>
    </>
  );
}

function MeetingSection({ meeting }: { meeting: TodayMeeting }) {
  return (
    <section id={`meeting-${meeting.courseId}`} className="scroll-mt-16">
      <div className="flex items-baseline gap-3 border-b border-slate-300 pb-3">
        <h2 className="text-2xl font-semibold tracking-normal">
          {meeting.courseName}
        </h2>
        {meeting.country ? (
          <span className="text-sm font-medium text-slate-500">
            {formatCountry(meeting.country)}
          </span>
        ) : null}
      </div>

      <div className="mt-5 space-y-8">
        {meeting.races.map((race) => (
          <RaceBlock key={race.raceId} race={race} />
        ))}
      </div>
    </section>
  );
}

function RaceBlock({ race }: { race: TodayRace }) {
  const isJumpRace = isJumpRaceForDisplay(race);
  const completed = isCompletedRace(race);

  return (
    <section className="border-b border-slate-200 pb-7">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <time className="text-lg font-semibold">
              {formatRaceTimeForDisplay(race)}
            </time>
            {completed ? (
              <span className="border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                Result
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 text-base font-semibold leading-6">
            {race.raceName ?? "Untitled race"}
          </h3>
        </div>
        <RaceMeta race={race} />
      </header>

      <RunnerTable isJumpRace={isJumpRace} runners={race.runners} />
    </section>
  );
}

function RaceMeta({ race }: { race: TodayRace }) {
  const fields = [
    race.raceClass ? `Class ${race.raceClass}` : null,
    race.raceType,
    race.distance,
    race.going,
    race.raceTypeCode,
    race.declaredRunnerCount !== null
      ? `${race.declaredRunnerCount} declared`
      : null,
  ].filter(Boolean);

  return (
    <dl className="flex max-w-4xl flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 lg:justify-end">
      {fields.map((field) => (
        <div key={field} className="whitespace-nowrap">
          <dd>{field}</dd>
        </div>
      ))}
    </dl>
  );
}

function RunnerTable({
  isJumpRace,
  runners,
}: {
  isJumpRace: boolean;
  runners: TodayRunner[];
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[1180px] table-fixed text-left text-sm">
        <thead className="border-y border-slate-200 text-xs uppercase text-slate-500">
          <tr>
            <th className="w-14 py-2 pr-3 font-medium">No.</th>
            <th className="w-56 py-2 pr-3 font-medium">Horse</th>
            <th className="w-14 py-2 pr-3 font-medium">Age</th>
            <th className="w-20 py-2 pr-3 font-medium">Wgt</th>
            <th className="w-16 py-2 pr-3 font-medium">
              {isJumpRace ? "-" : "Draw"}
            </th>
            <th className="w-36 py-2 pr-3 font-medium">Jockey</th>
            <th className="w-40 py-2 pr-3 font-medium">Trainer</th>
            <th className="w-14 py-2 pr-3 font-medium">OR</th>
            <th className="w-16 py-2 pr-3 font-medium">Latest Speed</th>
            <th className="w-16 py-2 pr-3 font-medium">Prev Speed</th>
            <th className="w-16 py-2 pr-3 font-medium">Best L3</th>
            <th className="w-16 py-2 pr-3 font-medium">Days</th>
            <th className="w-20 py-2 pr-3 font-medium">Odds</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {runners.map((runner) => (
            <RunnerRow
              isJumpRace={isJumpRace}
              key={runner.runnerId}
              runner={runner}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunnerRow({
  isJumpRace,
  runner,
}: {
  isJumpRace: boolean;
  runner: TodayRunner;
}) {
  const nonRunner = runner.resultStatus === "non_runner";

  return (
    <tr
      className={
        nonRunner ? "bg-slate-100 text-slate-500 line-through" : "align-top"
      }
    >
      <td className="py-3 pr-3">{runner.saddleclothNumber ?? "-"}</td>
      <td className="py-3 pr-3">
        <div className="flex items-center gap-2">
          <Link
            className="font-medium text-emerald-800 hover:text-emerald-950 hover:underline"
            href={`/horses/${runner.horseId}`}
          >
            {runner.horseName}
          </Link>
          {nonRunner ? (
            <span className="border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-600 no-underline">
              NR
            </span>
          ) : null}
        </div>
      </td>
      <td className="py-3 pr-3">{runner.horseAge ?? "-"}</td>
      <td className="py-3 pr-3">{runner.weight ?? "-"}</td>
      <td className="py-3 pr-3">
        {isJumpRace ? "-" : runner.draw ?? "-"}
      </td>
      <td className="py-3 pr-3">{runner.jockeyName ?? "-"}</td>
      <td className="py-3 pr-3">{runner.trainerName ?? "-"}</td>
      <td className="py-3 pr-3">{runner.officialRating ?? "-"}</td>
      <td className="py-3 pr-3">
        {isJumpRace ? formatRating(runner.metrics?.latestJumpSpeedRating) : "-"}
      </td>
      <td className="py-3 pr-3">
        {isJumpRace
          ? formatRating(runner.metrics?.previousJumpSpeedRating)
          : "-"}
      </td>
      <td className="py-3 pr-3">
        {isJumpRace ? formatRating(runner.metrics?.bestJumpSpeedLast3) : "-"}
      </td>
      <td className="py-3 pr-3">
        {runner.metrics?.daysSinceLastRun ?? "-"}
      </td>
      <td className="py-3 pr-3">{runner.odds ?? "-"}</td>
    </tr>
  );
}

function formatFreshnessTime(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatRating(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : Math.round(value).toString();
}

function formatCountry(value: string): string {
  if (value === "Eire" || value === "IRE") {
    return "Ireland";
  }
  if (value === "ENG") {
    return "England";
  }
  if (value === "SCO") {
    return "Scotland";
  }
  if (value === "WAL") {
    return "Wales";
  }
  return value;
}

function isCompletedRace(race: TodayRace): boolean {
  return Boolean(
    race.winningTime ||
      race.actualRunnerCount !== null ||
      race.runners.some((runner) => runner.finishingPosition !== null),
  );
}

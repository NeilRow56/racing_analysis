import Link from "next/link";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { createDbConnection } from "@/db";
import {
  courses,
  horses,
  jockeys,
  raceRunners,
  races,
  trainers,
} from "@/db/schema";
import {
  getTargetRunnerMetricsForDate,
  type TargetRunnerMetrics,
} from "@/lib/racing/horse-metrics";

export const dynamic = "force-dynamic";

type RunnerView = {
  horseId: string;
  saddleclothNumber: number | null;
  finishingPosition: number | null;
  finishingStatus: string | null;
  resultStatus: string | null;
  runnerComment: string | null;
  horseName: string;
  trainerName: string | null;
  jockeyName: string | null;
  draw: number | null;
  weight: string | null;
  startingPrice: string | null;
  officialRating: number | null;
  racingPostRating: number | null;
  topspeedRating: number | null;
};

type RaceView = {
  source: string | null;
  sourceId: string | null;
  raceName: string | null;
  raceDate: string;
  scheduledTime: string | null;
  offTime: string | null;
  courseName: string;
  going: string | null;
  distance: string | null;
  raceClass: string | null;
  raceTypeCode: string | null;
  actualRunnerCount: number | null;
  winningTime: string | null;
  runners: RunnerView[];
};

type RaceSummaryView = {
  sourceId: string | null;
  raceDate: string;
  scheduledTime: string | null;
  courseName: string;
  raceName: string | null;
  distance: string | null;
  going: string | null;
  raceClass: string | null;
  actualRunnerCount: number | null;
  winningTime: string | null;
};

type PageData =
  | {
      status: "connected";
      raceCount: number;
      runnerCount: number;
      importedRaces: RaceView[];
      sportingLifeWeek: RaceSummaryView[];
      sportingLifeRaces: RaceView[];
      smokeRace: RaceView | null;
      octoberProofRunners: TargetRunnerMetrics[];
    }
  | {
      status: "unavailable";
      message: string;
    };

async function getPageData(): Promise<PageData> {
  let connection: ReturnType<typeof createDbConnection> | null = null;

  try {
    connection = createDbConnection();
    const { client, db } = connection;

    const [raceTotal] = await db.select({ value: count() }).from(races);
    const [runnerTotal] = await db.select({ value: count() }).from(raceRunners);

    const [importedRaces, sportingLifeWeek, sportingLifeRaces, smokeRace] =
      await Promise.all([
      getRacingPostDayRaces(db, "2020-10-01"),
      getSportingLifeWeekRaces(db),
      getSourceDayRaces(db, "sporting_life", "2020-09-13"),
      getRaceWithRunners({
        db,
        source: "smoke-test",
        sourceId: "race-fictional-meadow-2026-01-01-1400",
      }),
    ]);
    const octoberProofRunners = (
      await getTargetRunnerMetricsForDate(db, "2020-10-01")
    ).filter((runner) => runner.metrics.priorRuns > 0);

    await client.end();
    connection = null;

    return {
      status: "connected",
      raceCount: raceTotal.value,
      runnerCount: runnerTotal.value,
      importedRaces,
      sportingLifeWeek,
      sportingLifeRaces,
      smokeRace,
      octoberProofRunners,
    };
  } catch (error) {
    if (connection) {
      await connection.client.end();
    }

    return {
      status: "unavailable",
      message:
        error instanceof Error
          ? error.message
          : "The database connection could not be checked.",
    };
  }
}

async function getRaceWithRunners({
  db,
  source,
  sourceId,
}: {
  db: ReturnType<typeof createDbConnection>["db"];
  source: string;
  sourceId: string;
}): Promise<RaceView | null> {
  const raceRows = await db
    .select({
      id: races.id,
      source: races.source,
      sourceId: races.sourceId,
      raceName: races.raceName,
      raceDate: races.raceDate,
      scheduledTime: races.scheduledTime,
      offTime: races.offTime,
      courseName: courses.displayName,
      going: races.going,
      distance: races.distance,
      raceClass: races.raceClass,
      raceTypeCode: races.raceTypeCode,
      actualRunnerCount: races.actualRunnerCount,
      winningTime: races.winningTime,
    })
    .from(races)
    .innerJoin(courses, eq(races.courseId, courses.id))
    .where(and(eq(races.source, source), eq(races.sourceId, sourceId)))
    .limit(1);

  const race = raceRows[0];
  if (!race) {
    return null;
  }

  const runners = await db
    .select({
      saddleclothNumber: raceRunners.saddleclothNumber,
      finishingPosition: raceRunners.finishingPosition,
      finishingStatus: raceRunners.finishingStatus,
      resultStatus: raceRunners.resultStatus,
      runnerComment: raceRunners.runnerComment,
      horseId: horses.id,
      horseName: horses.displayName,
      trainerName: trainers.displayName,
      jockeyName: jockeys.displayName,
      draw: raceRunners.draw,
      weight: raceRunners.weight,
      startingPrice: raceRunners.startingPrice,
      officialRating: raceRunners.officialRating,
      racingPostRating: raceRunners.racingPostRating,
      topspeedRating: raceRunners.topspeedRating,
    })
    .from(raceRunners)
    .innerJoin(horses, eq(raceRunners.horseId, horses.id))
    .leftJoin(trainers, eq(raceRunners.trainerId, trainers.id))
    .leftJoin(jockeys, eq(raceRunners.jockeyId, jockeys.id))
    .where(eq(raceRunners.raceId, race.id))
    .orderBy(
      sql`case when ${raceRunners.finishingPosition} is null then 9999 else ${raceRunners.finishingPosition} end`,
      asc(raceRunners.sourceId),
    );

  return { ...race, runners };
}

async function getRacingPostDayRaces(
  db: ReturnType<typeof createDbConnection>["db"],
  raceDate: string,
): Promise<RaceView[]> {
  return getSourceDayRaces(db, "racing-post", raceDate);
}

async function getSourceDayRaces(
  db: ReturnType<typeof createDbConnection>["db"],
  source: string,
  raceDate: string,
): Promise<RaceView[]> {
  const raceRows = await db
    .select({
      sourceId: races.sourceId,
    })
    .from(races)
    .where(and(eq(races.source, source), eq(races.raceDate, raceDate)))
    .orderBy(asc(races.scheduledTime), asc(races.sourceId));

  const dayRaces = await Promise.all(
    raceRows
      .filter((race): race is { sourceId: string } => race.sourceId !== null)
      .map((race) =>
        getRaceWithRunners({
          db,
          source,
          sourceId: race.sourceId,
        }),
      ),
  );

  return dayRaces.filter((race): race is RaceView => race !== null);
}

async function getSportingLifeWeekRaces(
  db: ReturnType<typeof createDbConnection>["db"],
): Promise<RaceSummaryView[]> {
  return db
    .select({
      sourceId: races.sourceId,
      raceDate: races.raceDate,
      scheduledTime: races.scheduledTime,
      courseName: courses.displayName,
      raceName: races.raceName,
      distance: races.distance,
      going: races.going,
      raceClass: races.raceClass,
      actualRunnerCount: races.actualRunnerCount,
      winningTime: races.winningTime,
    })
    .from(races)
    .innerJoin(courses, eq(races.courseId, courses.id))
    .where(
      and(
        eq(races.source, "sporting_life"),
        sql`${races.raceDate} between '2020-09-07' and '2020-09-13'`,
      ),
    )
    .orderBy(asc(races.raceDate), asc(races.scheduledTime), asc(races.sourceId));
}

export default async function Home() {
  const data = await getPageData();

  return (
    <main className="min-h-full bg-stone-50 px-6 py-12 text-slate-950">
      <section className="mx-auto w-full max-w-5xl">
        <p className="mb-4 text-sm font-medium uppercase tracking-[0.16em] text-emerald-700">
          Personal horse-racing analysis
        </p>
        <h1 className="text-4xl font-semibold tracking-normal sm:text-5xl">
          Racing Analysis
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-700">
          The application foundation is ready. This page now proves one real
          Racing Post results can travel from raw extraction into PostgreSQL and
          back through Drizzle into Next.js.
        </p>

        {data.status === "unavailable" ? (
          <DatabaseUnavailable message={data.message} />
        ) : (
          <DatabaseConnected data={data} />
        )}
      </section>
    </main>
  );
}

function DatabaseUnavailable({ message }: { message: string }) {
  return (
    <section className="mt-10 border-t border-slate-200 pt-8">
      <h2 className="text-xl font-semibold">Database Status</h2>
      <p className="mt-4 text-sm font-medium text-amber-700">
        Database unavailable
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
        {message}
      </p>
    </section>
  );
}

function DatabaseConnected({
  data,
}: {
  data: Extract<PageData, { status: "connected" }>;
}) {
  return (
    <section className="mt-10 border-t border-slate-200 pt-8">
      <h2 className="text-xl font-semibold">Database Status</h2>
      <p className="mt-4 text-sm font-medium text-emerald-700">
        PostgreSQL connected through Drizzle
      </p>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-slate-600">Races</dt>
          <dd className="text-2xl font-semibold">{data.raceCount}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-600">Runners</dt>
          <dd className="text-2xl font-semibold">{data.runnerCount}</dd>
        </div>
      </dl>

      <RaceSection
        emptyMessage="Run bun run rp:import-day to import the one-date Racing Post sample."
        heading="Imported Racing Post Races"
        races={data.importedRaces}
      />
      <RaceSection
        emptyMessage="Run bun run sl:import-day to import the 2020-09-13 Sporting Life proof day."
        heading="Sporting Life 2020-09-13 Proof Day"
        races={data.sportingLifeRaces}
      />
      <SportingLifeWeekSection races={data.sportingLifeWeek} />
      <OctoberProofSection runners={data.octoberProofRunners} />
      <RaceSection
        emptyMessage="Run bun run db:seed to restore the fictional smoke-test race."
        heading="Synthetic Smoke-Test Race"
        races={data.smokeRace ? [data.smokeRace] : []}
      />
    </section>
  );
}

function SportingLifeWeekSection({ races }: { races: RaceSummaryView[] }) {
  if (races.length === 0) {
    return null;
  }

  return (
    <section className="mt-10 border-t border-slate-200 pt-8">
      <h3 className="text-lg font-semibold">Sporting Life Week Summary</h3>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-600">
            <tr>
              <th className="py-2 pr-4 font-medium">Date</th>
              <th className="py-2 pr-4 font-medium">Time</th>
              <th className="py-2 pr-4 font-medium">Course</th>
              <th className="py-2 pr-4 font-medium">Race</th>
              <th className="py-2 pr-4 font-medium">Distance</th>
              <th className="py-2 pr-4 font-medium">Going</th>
              <th className="py-2 pr-4 font-medium">Class</th>
              <th className="py-2 pr-4 font-medium">Runners</th>
              <th className="py-2 pr-4 font-medium">Winning time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {races.map((race) => (
              <tr key={race.sourceId ?? `${race.raceDate}-${race.raceName}`}>
                <td className="py-3 pr-4">{race.raceDate}</td>
                <td className="py-3 pr-4">{race.scheduledTime ?? "-"}</td>
                <td className="py-3 pr-4">{race.courseName}</td>
                <td className="py-3 pr-4">{race.raceName ?? "Untitled race"}</td>
                <td className="py-3 pr-4">{race.distance ?? "-"}</td>
                <td className="py-3 pr-4">{race.going ?? "-"}</td>
                <td className="py-3 pr-4">{race.raceClass ?? "-"}</td>
                <td className="py-3 pr-4">{race.actualRunnerCount ?? "-"}</td>
                <td className="py-3 pr-4">{race.winningTime ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OctoberProofSection({ runners }: { runners: TargetRunnerMetrics[] }) {
  return (
    <section className="mt-10 border-t border-slate-200 pt-8">
      <h3 className="text-lg font-semibold">1 October Prior-Form Proof</h3>
      <p className="mt-3 text-sm leading-6 text-slate-700">
        {runners.length} runners have prior recorded form before their 1 October
        race time.
      </p>
      {runners.length ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2 pr-4 font-medium">Horse</th>
                <th className="py-2 pr-4 font-medium">Race</th>
                <th className="py-2 pr-4 font-medium">Runs</th>
                <th className="py-2 pr-4 font-medium">Wins</th>
                <th className="py-2 pr-4 font-medium">Latest RPR</th>
                <th className="py-2 pr-4 font-medium">Best RPR L3</th>
                <th className="py-2 pr-4 font-medium">Latest TS</th>
                <th className="py-2 pr-4 font-medium">Best TS L3</th>
                <th className="py-2 pr-4 font-medium">Latest OR</th>
                <th className="py-2 pr-4 font-medium">RPR - OR</th>
                <th className="py-2 pr-4 font-medium">Days</th>
                <th className="py-2 pr-4 font-medium">Course</th>
                <th className="py-2 pr-4 font-medium">Distance</th>
                <th className="py-2 pr-4 font-medium">Going</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {runners.map(({ target, metrics }) => (
                <tr key={target.runnerId}>
                  <td className="py-3 pr-4 font-medium">
                    <Link
                      className="text-emerald-800 hover:text-emerald-950 hover:underline"
                      href={`/horses/${target.horseId}`}
                    >
                      {target.horseName}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    {target.scheduledTime ? `${target.scheduledTime} ` : ""}
                    {target.courseName}
                    <span className="block text-xs leading-5 text-slate-500">
                      {target.raceName ?? "Untitled race"}
                    </span>
                  </td>
                  <td className="py-3 pr-4">{metrics.priorRuns}</td>
                  <td className="py-3 pr-4">{metrics.priorWins}</td>
                  <td className="py-3 pr-4">{metrics.latestRpr ?? "-"}</td>
                  <td className="py-3 pr-4">{metrics.bestRprLast3 ?? "-"}</td>
                  <td className="py-3 pr-4">{metrics.latestTs ?? "-"}</td>
                  <td className="py-3 pr-4">{metrics.bestTsLast3 ?? "-"}</td>
                  <td className="py-3 pr-4">{metrics.latestOr ?? "-"}</td>
                  <td className="py-3 pr-4">
                    {formatSigned(metrics.latestRprMinusLatestOr)}
                  </td>
                  <td className="py-3 pr-4">
                    {metrics.daysSinceLastRun ?? "-"}
                  </td>
                  <td className="py-3 pr-4">
                    {formatRecord(
                      metrics.runsAtCourse,
                      metrics.winsAtCourse,
                      metrics.placesAtCourse,
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {formatRecord(
                      metrics.runsAtExactDistance,
                      metrics.winsAtExactDistance,
                      metrics.placesAtExactDistance,
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {formatRecord(
                      metrics.runsOnGoing,
                      metrics.winsOnGoing,
                      metrics.placesOnGoing,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function formatSigned(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return value > 0 ? `+${value}` : String(value);
}

function formatRecord(
  runs: number | null,
  wins: number | null,
  places: number | null,
): string {
  if (runs === null || wins === null || places === null) {
    return "-";
  }
  return `${wins}-${places}-${runs}`;
}

function formatSource(source: string): string {
  return source
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function RaceSection({
  emptyMessage,
  heading,
  races,
}: {
  emptyMessage: string;
  heading: string;
  races: RaceView[];
}) {
  if (races.length === 0) {
    return (
      <section className="mt-10">
        <h3 className="text-lg font-semibold">{heading}</h3>
        <p className="mt-3 text-sm leading-6 text-slate-700">{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className="mt-10">
      <h3 className="text-lg font-semibold">{heading}</h3>
      <div className="mt-5 space-y-6">
        {races.map((race) => (
          <details
            className="border-t border-slate-200 pt-5"
            key={race.sourceId ?? `${race.raceDate}-${race.raceName}`}
            open={races.length <= 3}
          >
            <summary className="cursor-pointer text-base font-semibold">
              {race.scheduledTime ? `${race.scheduledTime} ` : ""}
              {race.courseName}: {race.raceName ?? "Untitled race"}
            </summary>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              {race.source ? `${formatSource(race.source)} source, ` : ""}
              {race.raceDate}
              {race.offTime ? `, off ${race.offTime}` : ""}
              {race.distance ? `, ${race.distance}` : ""}
              {race.going ? `, ${race.going}` : ""}
              {race.raceClass ? `, class ${race.raceClass}` : ""}
              {race.raceTypeCode ? `, type ${race.raceTypeCode}` : ""}
              {race.winningTime ? `, winning time ${race.winningTime}` : ""}
              {race.actualRunnerCount ? `, ${race.actualRunnerCount} runners` : ""}
            </p>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Pos</th>
                    <th className="py-2 pr-4 font-medium">Outcome</th>
                    <th className="py-2 pr-4 font-medium">No</th>
                    <th className="py-2 pr-4 font-medium">Horse</th>
                    <th className="py-2 pr-4 font-medium">Trainer</th>
                    <th className="py-2 pr-4 font-medium">Jockey</th>
                    <th className="py-2 pr-4 font-medium">Draw</th>
                    <th className="py-2 pr-4 font-medium">Weight</th>
                    <th className="py-2 pr-4 font-medium">SP</th>
                    <th className="py-2 pr-4 font-medium">OR</th>
                    <th className="py-2 pr-4 font-medium">RPR</th>
                    <th className="py-2 pr-4 font-medium">TS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {race.runners.map((runner) => (
                    <tr key={`${runner.saddleclothNumber}-${runner.horseName}`}>
                      <td className="py-3 pr-4">
                        {runner.finishingPosition ??
                          runner.finishingStatus ??
                          "-"}
                      </td>
                      <td className="py-3 pr-4">
                        {runner.resultStatus ?? runner.finishingStatus ?? "-"}
                      </td>
                      <td className="py-3 pr-4">
                        {runner.saddleclothNumber ?? "-"}
                      </td>
                      <td className="py-3 pr-4 font-medium">
                        <Link
                          className="text-emerald-800 hover:text-emerald-950 hover:underline"
                          href={`/horses/${runner.horseId}`}
                        >
                          {runner.horseName}
                        </Link>
                        {runner.runnerComment ? (
                          <p className="mt-1 max-w-md text-xs font-normal leading-5 text-slate-600">
                            {runner.runnerComment}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4">{runner.trainerName ?? "-"}</td>
                      <td className="py-3 pr-4">{runner.jockeyName ?? "-"}</td>
                      <td className="py-3 pr-4">{runner.draw ?? "-"}</td>
                      <td className="py-3 pr-4">{runner.weight ?? "-"}</td>
                      <td className="py-3 pr-4">
                        {runner.startingPrice ?? "-"}
                      </td>
                      <td className="py-3 pr-4">
                        {runner.officialRating ?? "-"}
                      </td>
                      <td className="py-3 pr-4">
                        {runner.racingPostRating ?? "-"}
                      </td>
                      <td className="py-3 pr-4">
                        {runner.topspeedRating ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

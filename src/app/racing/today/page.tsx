import Link from "next/link";
import { createDbConnection } from "@/db";
import { listSavedResearchRulesWithDb } from "@/lib/racing/saved-research-rules";
import { refreshEligibleTodaySelectionResults } from "@/lib/racing/today-result-refresh";
import {
  attachFrozenRuleMatchesToToday,
  buildTodayRuleSelections,
  summarizeTodayFrozenRuleMatches,
  type TodayFrozenRuleMatchSummary,
  type TodayRuleSelections,
} from "@/lib/racing/today-rule-matches";
import {
  formatRaceTimeForDisplay,
  getTodaysRacingData,
  isAllWeatherRaceForDisplay,
  isJumpRaceForDisplay,
  isOrdinaryFlatTurfRaceForDisplay,
  racingPageTitle,
  resolveRacingDate,
  type TodayMeeting,
  type TodayRace,
  type TodayRunner,
} from "@/lib/racing/todays-racing";
import { todayRaceStatusLabel } from "@/lib/racing/today-race-status";
import { refreshTodaySelectionResultsAction } from "./actions";
import { RefreshResultsButton } from "./refresh-results-button";

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
    let data = await getTodaysRacingData(connection.db, raceDate);
    const savedRules = await listSavedResearchRulesWithDb(connection.db);
    const attachMatches = () => data.status === "ok"
      ? {
          ...data,
          meetings: attachFrozenRuleMatchesToToday(data.meetings, savedRules, raceDate),
        }
      : data;
    let displayData = attachMatches();
    if (displayData.status === "ok") {
      const refreshSummary = await refreshEligibleTodaySelectionResults(
        displayData.meetings,
        raceDate,
      );
      if (refreshSummary.imported > 0) {
        data = await getTodaysRacingData(connection.db, raceDate);
        displayData = attachMatches();
      }
    }
    await connection.client.end();
    connection = null;
    const frozenRulesChecked = savedRules.filter((rule) => rule.status === "frozen").length;
    const matchSummary = summarizeTodayFrozenRuleMatches(
      displayData.status === "ok" ? displayData.meetings : [],
      frozenRulesChecked,
    );

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
                <p className="mt-2 text-lg text-slate-700">{displayData.displayDate}</p>
                {invalidDateParam ? (
                  <p className="mt-2 text-sm text-amber-700">
                    Ignoring invalid date parameter: {invalidDateParam}
                  </p>
                ) : null}
              </div>
              {displayData.refreshedAt ? (
                <p className="text-sm text-slate-600">
                  Racecard data last refreshed:{" "}
                  {formatFreshnessTime(displayData.refreshedAt)}
                </p>
              ) : null}
            </div>
          </header>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <FrozenRuleMatchSummary summary={matchSummary} />
            <form action={refreshTodaySelectionResultsAction} className="mt-4 sm:mt-0">
              <input name="raceDate" type="hidden" value={raceDate} />
              <RefreshResultsButton />
            </form>
          </div>

          {displayData.status === "empty" ? (
            <p className="mt-8 text-sm leading-6 text-slate-700">
              {displayData.message}
            </p>
          ) : (
            <TodaysRacing meetings={displayData.meetings} />
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

function FrozenRuleMatchSummary({ summary }: { summary: TodayFrozenRuleMatchSummary }) {
  return (
    <div className="mt-4 text-sm text-slate-600">
      <span>
        Frozen rules checked: {summary.frozenRulesChecked} · Matches today: {summary.matchingRunners}
      </span>
      {summary.ruleMatches > summary.matchingRunners ? (
        <span> · Rule matches: {summary.ruleMatches}</span>
      ) : null}
      {summary.frozenRulesChecked === 0 ? (
        <span className="ml-2 text-slate-500">Save and freeze a Research rule to enable Today matching.</span>
      ) : null}
    </div>
  );
}

function TodaysRacing({ meetings }: { meetings: TodayMeeting[] }) {
  const ruleSelections = buildTodayRuleSelections(meetings);

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
      <TodayRuleSelectionsTable selections={ruleSelections} />
    </>
  );
}

function TodayRuleSelectionsTable({ selections }: { selections: TodayRuleSelections }) {
  return (
    <section className="mt-10 border-t border-slate-300 pt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-normal">Today&apos;s rule selections</h2>
          <p className="mt-1 text-sm text-slate-600">
            Rule selections today: {selections.summary.selections}
            {selections.summary.selections > 0 ? (
              <>
                {" "}· Settled: {selections.summary.settled} · Daily P/L:{" "}
                {formatProfitLoss(selections.summary.profitLoss)}
              </>
            ) : null}
          </p>
        </div>
      </div>

      {selections.rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">No frozen-rule selections today.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-y border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3 font-medium">Time</th>
                <th className="py-2 pr-3 font-medium">Course</th>
                <th className="py-2 pr-3 font-medium">Horse</th>
                <th className="py-2 pr-3 font-medium">Rule</th>
                <th className="py-2 pr-3 font-medium">Odds</th>
                <th className="py-2 pr-3 font-medium">Result</th>
                <th className="py-2 pr-3 font-medium">£1 P/L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {selections.rows.map((selection) => (
                <tr key={`${selection.raceId}:${selection.runnerId}`}>
                  <td className="py-2 pr-3">{formatRaceTimeForDisplay(selection)}</td>
                  <td className="py-2 pr-3">{selection.courseName}</td>
                  <td className="py-2 pr-3">
                    <Link
                      className="font-medium text-emerald-800 hover:text-emerald-950 hover:underline"
                      href={`/horses/${selection.horseId}`}
                    >
                      {selection.horseName}
                    </Link>
                    {selection.raceName ? (
                      <div className="mt-0.5 max-w-xs truncate text-xs text-slate-500">
                        {selection.raceName}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="max-w-xs text-slate-700">
                      {selection.ruleNames.join("; ")}
                    </div>
                  </td>
                  <td className="py-2 pr-3">{selection.odds ?? "-"}</td>
                  <td className="py-2 pr-3">{selection.result}</td>
                  <td className="py-2 pr-3">
                    {selection.settlement
                      ? formatProfitLoss(selection.settlement.profitLoss)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
  const isAllWeatherRace = isAllWeatherRaceForDisplay(race);
  const isTurfRace = isOrdinaryFlatTurfRaceForDisplay(race);
  const statusLabel = todayRaceStatusLabel(race);

  return (
    <section className="border-b border-slate-200 pb-7">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <time className="text-lg font-semibold">
              {formatRaceTimeForDisplay(race)}
            </time>
            {statusLabel ? (
              <span className="border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                {statusLabel}
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 text-base font-semibold leading-6">
            {race.raceName ?? "Untitled race"}
          </h3>
        </div>
        <RaceMeta race={race} />
      </header>

      <RunnerTable
        isAllWeatherRace={isAllWeatherRace}
        isJumpRace={isJumpRace}
        isTurfRace={isTurfRace}
        runners={race.runners}
      />
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
  isAllWeatherRace,
  isJumpRace,
  isTurfRace,
  runners,
}: {
  isAllWeatherRace: boolean;
  isJumpRace: boolean;
  isTurfRace: boolean;
  runners: TodayRunner[];
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[1260px] table-fixed text-left text-sm">
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
            <th
              className="w-20 py-2 pr-3 font-medium"
              title="Latest historical performance adjusted for today's weight."
            >
              Today&apos;s Rating
            </th>
            <th className="w-16 py-2 pr-3 font-medium">Days</th>
            <th className="w-20 py-2 pr-3 font-medium">Odds</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {runners.map((runner) => (
            <RunnerRow
              isAllWeatherRace={isAllWeatherRace}
              isJumpRace={isJumpRace}
              isTurfRace={isTurfRace}
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
  isAllWeatherRace,
  isJumpRace,
  isTurfRace,
  runner,
}: {
  isAllWeatherRace: boolean;
  isJumpRace: boolean;
  isTurfRace: boolean;
  runner: TodayRunner;
}) {
  const nonRunner = runner.resultStatus === "non_runner";
  const speedMetrics = speedMetricValues({
    isAllWeatherRace,
    isJumpRace,
    isTurfRace,
    metrics: runner.metrics,
  });
  const todaysRating = todaysRatingValue({
    isAllWeatherRace,
    isJumpRace,
    isTurfRace,
    metrics: runner.metrics,
  });

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
        <SavedRuleMatches matches={runner.savedRuleMatches ?? []} />
      </td>
      <td className="py-3 pr-3">{runner.horseAge ?? "-"}</td>
      <td className="py-3 pr-3">{runner.weight ?? "-"}</td>
      <td className="py-3 pr-3">
        {isJumpRace ? "-" : runner.draw ?? "-"}
      </td>
      <td className="py-3 pr-3">{runner.jockeyName ?? "-"}</td>
      <td className="py-3 pr-3">{runner.trainerName ?? "-"}</td>
      <td className="py-3 pr-3">{runner.officialRating ?? "-"}</td>
      <td className="py-3 pr-3">{formatRating(speedMetrics.latest)}</td>
      <td className="py-3 pr-3">{formatRating(speedMetrics.previous)}</td>
      <td className="py-3 pr-3">{formatRating(speedMetrics.bestLast3)}</td>
      <td className="py-3 pr-3">{formatRating(todaysRating)}</td>
      <td className="py-3 pr-3">
        {runner.metrics?.daysSinceLastRun ?? "-"}
      </td>
      <td className="py-3 pr-3">{runner.odds ?? "-"}</td>
    </tr>
  );
}

function SavedRuleMatches({ matches }: { matches: NonNullable<TodayRunner["savedRuleMatches"]> }) {
  if (matches.length === 0) {
    return null;
  }

  const label = matches.length === 1 ? "Saved rule match" : `${matches.length} saved rule matches`;
  return (
    <details className="mt-2 max-w-sm text-xs no-underline">
      <summary className="cursor-pointer font-semibold text-emerald-800">{label}</summary>
      <div className="mt-2 space-y-2 border border-emerald-100 bg-emerald-50 p-2 text-slate-700">
        {matches.map((match) => (
          <div key={match.ruleId}>
            <div className="font-semibold text-slate-900">{match.ruleName}</div>
            <div className="mt-1 font-medium text-amber-800">Development rule — not holdout validated</div>
            <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
              <RuleEvidence label="Selections" value={match.development.selections} />
              <RuleEvidence label="Winners" value={match.development.winners} />
              <RuleEvidence label="Strike" value={formatPercent(match.development.strikeRate)} />
              <RuleEvidence label="ROI" value={formatPercent(match.development.roiPercentage)} />
              <RuleEvidence label="P/L" value={formatMoney(match.development.profitLoss)} />
              <RuleEvidence label="Max losing run" value={match.development.maxConsecutiveLosers} />
            </dl>
          </div>
        ))}
      </div>
    </details>
  );
}

function RuleEvidence({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function todaysRatingValue({
  isAllWeatherRace,
  isJumpRace,
  isTurfRace,
  metrics,
}: {
  isAllWeatherRace: boolean;
  isJumpRace: boolean;
  isTurfRace: boolean;
  metrics: TodayRunner["metrics"];
}): number | null | undefined {
  if (isJumpRace) {
    return metrics?.latestJumpTodaysRating;
  }
  if (isAllWeatherRace) {
    return metrics?.latestAwTodaysRating;
  }
  if (isTurfRace) {
    return metrics?.latestTurfTodaysRating;
  }
  return metrics?.latestTodaysRating;
}

function speedMetricValues({
  isAllWeatherRace,
  isJumpRace,
  isTurfRace,
  metrics,
}: {
  isAllWeatherRace: boolean;
  isJumpRace: boolean;
  isTurfRace: boolean;
  metrics: TodayRunner["metrics"];
}): {
  latest: number | null | undefined;
  previous: number | null | undefined;
  bestLast3: number | null | undefined;
} {
  if (isJumpRace) {
    return {
      latest: metrics?.latestJumpSpeedRating,
      previous: metrics?.previousJumpSpeedRating,
      bestLast3: metrics?.bestJumpSpeedLast3,
    };
  }
  if (isAllWeatherRace) {
    return {
      latest: metrics?.latestAwSpeedRating,
      previous: metrics?.previousAwSpeedRating,
      bestLast3: metrics?.bestAwSpeedLast3,
    };
  }
  if (isTurfRace) {
    return {
      latest: metrics?.latestTurfSpeedRating,
      previous: metrics?.previousTurfSpeedRating,
      bestLast3: metrics?.bestTurfSpeedLast3,
    };
  }
  return {
    latest: null,
    previous: null,
    bestLast3: null,
  };
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

function formatPercent(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(1)}%`;
}

function formatMoney(value: number | null): string {
  if (value === null) return "-";
  return value < 0 ? `-£${Math.abs(value).toFixed(2)}` : `£${value.toFixed(2)}`;
}

function formatProfitLoss(value: number): string {
  if (value < 0) {
    return `-£${Math.abs(value).toFixed(2)}`;
  }
  return `+£${value.toFixed(2)}`;
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

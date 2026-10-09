import Link from "next/link";
import { createDbConnection } from "@/db";
import { syncAwForwardComparisons } from "@/lib/racing/aw-forward-comparisons";
import { listSavedResearchRulesWithDb } from "@/lib/racing/saved-research-rules";
import { parseResearchRule } from "@/lib/racing/research-rule";
import { refreshEligibleTodaySelectionResults } from "@/lib/racing/today-result-refresh";
import {
  attachFrozenRuleMatchesToToday,
  summarizeTodayFrozenRuleMatches,
  type TodayFrozenRuleMatchSummary,
  type TodayTrainerCohortsByRule,
} from "@/lib/racing/today-rule-matches";
import { getTrainerCohortForRule, trainerCohortYearFromDate } from "@/lib/racing/trainer-cohorts";
import {
  saveTurfPerformanceRatingShadowSnapshots,
  saveTurfPerformanceRatingSnapshots,
  summarizeTurfPerformanceShadowSnapshots,
  type TurfPerformanceShadowSummary,
} from "@/lib/racing/turf-performance-rating-snapshots";
import { GOING_FORM_TERMS, type GoingFormTerm } from "@/lib/racing/going-form";
import {
  type AwRatingCoverage,
  AW_D_RATING_COVERAGE_GUARD_VERSION,
  AW_D_RATING_COVERAGE_GUARD_IMPLEMENTED_AT,
  AW_D_MIN_RATED_RUNNERS,
  AW_D_MIN_RATING_COVERAGE,
} from "@/lib/racing/aw-performance-rating";
import {
  MIN_RACE_RATED_RUNNERS,
  MIN_RACE_RATING_COVERAGE,
  JPR_A_RATING_COVERAGE_GUARD_IMPLEMENTED_AT,
  JPR_A_RATING_COVERAGE_GUARD_VERSION,
  type RatingCoverage,
} from "@/lib/racing/rating-coverage";
import {
  formatRaceTimeForDisplay,
  getTodaysRacingData,
  isAllWeatherRaceForDisplay,
  isJumpRaceForDisplay,
  isOrdinaryFlatTurfRaceForDisplay,
  racingPageTitle,
  resolveRacingDate,
  summarizeTodayMarketPrice,
  type TodayMeeting,
  type TodayRace,
  type TodayRunner,
} from "@/lib/racing/todays-racing";
import { todayRaceStatusLabel } from "@/lib/racing/today-race-status";
import { enrichTodayForwardTrackerResults } from "@/lib/racing/tpr-timewise-forward-settlement";
import { loadTrackerData } from "../../../../scripts/diagnose-tpr-vs-timewise-forward";
import { refreshTodaySelectionResultsAction } from "./actions";
import { RefreshResultsButton } from "./refresh-results-button";
import { SpeedDisplayValue, TodaySpeedDisplay } from "./speed-display";
import { TurfPerformanceRatingCell } from "./tpr-display";
import { syncAwTissueMeetings } from "@/lib/racing/aw-tissue-sync";
import { attachAwTissueToMeetings } from "@/lib/racing/aw-tissue-forward";
import { syncJumpTissueMeetings } from "@/lib/racing/jump-tissue-sync";
import { attachJumpTissueToMeetings } from "@/lib/racing/jump-tissue-forward";
import { SavedRuleResearchNote } from "../research/saved-rule-research-note";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    date?: string;
  }>;
};

export default async function TodaysRacingPage({ searchParams }: PageProps) {
  const requestStartedAt = new Date();
  const params = await searchParams;
  const { raceDate, invalidDateParam } = resolveRacingDate({
    dateParam: params?.date,
  });
  let connection: ReturnType<typeof createDbConnection> | null = null;

  try {
    connection = createDbConnection();
    const savedRulesPromise = listSavedResearchRulesWithDb(connection.db);
    const trainerCohortsPromise = savedRulesPromise.then((rules) =>
      resolveTodayTrainerCohorts(
        connection!.db,
        rules,
        raceDate,
      ),
    );
    const [initialData, savedRules, initialTrackerData, trainerCohortsByRule] = await Promise.all([
      getTodaysRacingData(connection.db, raceDate),
      savedRulesPromise,
      loadTrackerData(),
      trainerCohortsPromise,
    ]);
    let data = initialData;
    let shadowSummary: TurfPerformanceShadowSummary | null = null;
    const attachMatches = () => data.status === "ok"
      ? {
          ...data,
          meetings: attachFrozenRuleMatchesToToday(data.meetings, savedRules, raceDate, trainerCohortsByRule),
        }
      : data;
    let displayData = attachMatches();
    if (displayData.status === "ok") {
      await Promise.all([
        saveTurfPerformanceRatingSnapshots(connection.db, displayData.meetings, raceDate),
        saveTurfPerformanceRatingShadowSnapshots(connection.db, displayData.meetings, raceDate),
      ]);
      const refreshSummary = await refreshEligibleTodaySelectionResults(
        displayData.meetings,
        raceDate,
      );
      if (refreshSummary.imported > 0) {
        data = await getTodaysRacingData(connection.db, raceDate);
        displayData = attachMatches();
      }
      if (displayData.status === "ok") {
        shadowSummary = await summarizeTurfPerformanceShadowSnapshots(connection.db, raceDate);
      }
    }
    if (displayData.status === "ok") {
      const awTissue = await syncAwTissueMeetings(connection, displayData.meetings, raceDate);
      const jumpTissue = await syncJumpTissueMeetings(connection, displayData.meetings, raceDate);
      displayData = { ...displayData, meetings: attachJumpTissueToMeetings(attachAwTissueToMeetings(displayData.meetings, awTissue), jumpTissue) };
    }
    await connection.client.end();
    connection = null;
    const frozenRulesChecked = savedRules.filter((rule) => rule.status === "frozen").length;
    const matchSummary = summarizeTodayFrozenRuleMatches(
      displayData.status === "ok" ? displayData.meetings : [],
      frozenRulesChecked,
    );
    if (displayData.status === "ok") {
      await Promise.all([
        syncAwForwardComparisons(displayData.meetings, raceDate, requestStartedAt),
        enrichTodayForwardTrackerResults(displayData.meetings, raceDate, initialTrackerData),
      ]);
    }

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
          <div className="mt-4 flex justify-end">
            <form action={refreshTodaySelectionResultsAction}>
              <input name="raceDate" type="hidden" value={raceDate} />
              <RefreshResultsButton />
            </form>
          </div>

          {displayData.status === "empty" ? (
            <p className="mt-8 text-sm leading-6 text-slate-700">
              {displayData.message}
            </p>
          ) : (
            <TodaysRacing
              meetings={displayData.meetings}
              shadowSummary={shadowSummary}
            />
          )}
          <details className="mt-8 border-t border-slate-200 py-4">
            <summary className="cursor-pointer text-sm font-semibold">Details / research</summary>
            <div className="mt-4">
              <Link href="/racing/research#saved-rules" className="text-sm text-slate-600 hover:text-emerald-800 hover:underline">
                Saved rule research
              </Link>
              <SavedRuleResearchNote />
              <FrozenRuleMatchSummary summary={matchSummary} />
            </div>
          </details>
        </section>
      </main>
    );
  } finally {
    if (connection) {
      await connection.client.end();
    }
  }
}

async function resolveTodayTrainerCohorts(
  db: ReturnType<typeof createDbConnection>["db"],
  savedRules: Awaited<ReturnType<typeof listSavedResearchRulesWithDb>>,
  raceDate: string,
): Promise<TodayTrainerCohortsByRule> {
  const cohortYear = trainerCohortYearFromDate(raceDate);
  const entries = await Promise.all(
    savedRules
      .filter((savedRule) => savedRule.status === "frozen")
      .map(async (savedRule) => {
        const rule = parseResearchRule(JSON.stringify(savedRule.canonicalRule));
        if (!rule?.runner.trainerCohort) {
          return [savedRule.id, null] as const;
        }
        return [savedRule.id, await getTrainerCohortForRule(db, rule, cohortYear)] as const;
      }),
  );
  return new Map(entries);
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
        <span className="ml-2 text-slate-500">No frozen research rules.</span>
      ) : null}
    </div>
  );
}

function TodaysRacing({
  meetings,
  shadowSummary,
}: {
  meetings: TodayMeeting[];
  shadowSummary: TurfPerformanceShadowSummary | null;
}) {
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

      <TodaySpeedDisplay>
        <div className="mt-4 space-y-10">
          <p className="max-w-4xl text-sm leading-6 text-slate-600">
            TPR is an experimental Turf Performance Rating based on recent RPR/Topspeed, class and weight.
            It is being forward-tested and is not a betting recommendation.
          </p>
          {shadowSummary ? (
            <p className="max-w-4xl text-sm leading-6 text-slate-600">
              W50 shadow: {shadowSummary.turfRacesChecked} Turf races checked ·{" "}
              {shadowSummary.agreements} agreements · {shadowSummary.disagreements} disagreements
              {shadowSummary.settledDisagreementRaces > 0 ? (
                <>
                  {" "}· settled disagreements {shadowSummary.settledDisagreementRaces}
                  {" "}· W50 winners {shadowSummary.w50DisagreementWinners}
                  {" "}· W100 winners {shadowSummary.w100DisagreementWinners}
                </>
              ) : null}
            </p>
          ) : null}
          {meetings.map((meeting) => (
            <MeetingSection
              key={meeting.courseId}
              meeting={meeting}
            />
          ))}
        </div>
      </TodaySpeedDisplay>
    </>
  );
}

function MeetingSection({ meeting }: {
  meeting: TodayMeeting;
}) {
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
          <RaceBlock
            key={race.raceId}
            race={race}
          />
        ))}
      </div>
    </section>
  );
}

function RaceBlock({ race }: {
  race: TodayRace;
}) {
  const isJumpRace = isJumpRaceForDisplay(race);
  const isAllWeatherRace = isAllWeatherRaceForDisplay(race);
  const isTurfRace = isOrdinaryFlatTurfRaceForDisplay(race);
  const statusLabel = todayRaceStatusLabel(race);
  const awDCoverage = isAllWeatherRace ? race.awRatingCoverage?.awD : undefined;
  const tprCoverage = isTurfRace ? race.tprRatingCoverage : undefined;
  const jprACoverage = isJumpRace ? race.jumpRatingCoverage?.jprA : undefined;
  const jumpTissueCoverage = isJumpRace ? race.jumpTissueCoverage : undefined;

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
          {awDCoverage ? (
            <p className="mt-1 text-xs font-medium text-slate-600">
              AW-D rated: {awDCoverage.ratedRunnerCount}/{awDCoverage.activeRunnerCount}
              {awDCoverage.ratingCoverageStatus === "insufficient_coverage" ? (
                <> · Insufficient race coverage</>
              ) : null}
            </p>
          ) : null}
          {tprCoverage ? (
            <p className="mt-1 text-xs font-medium text-slate-600">
              TPR rated: {tprCoverage.ratedRunnerCount}/{tprCoverage.activeRunnerCount}
              {tprCoverage.ratingCoverageStatus === "insufficient_coverage" ? (
                <> · Insufficient race coverage</>
              ) : null}
            </p>
          ) : null}
          {jprACoverage ? (
            <p className="mt-1 text-xs font-medium text-slate-600">
              JPR-A rated: {jprACoverage.ratedRunnerCount}/{jprACoverage.activeRunnerCount}
              {jprACoverage.ratingCoverageStatus === "insufficient_coverage" ? (
                <> · Insufficient race coverage</>
              ) : null}
            </p>
          ) : null}
          {jumpTissueCoverage ? (
            <p className="mt-1 text-xs font-medium text-slate-600">
              Jump Tissue predicted: {jumpTissueCoverage.predictedRunnerCount}/{jumpTissueCoverage.activeRunnerCount}
              {" "}({(jumpTissueCoverage.predictionCoverage * 100).toFixed(0)}%)
            </p>
          ) : null}
        </div>
        <RaceMeta race={race} />
      </header>
      {race.turfPerformanceShadow?.agreement === false && race.turfPerformanceShadow.w50HorseName ? (
        <p className="mt-2 text-sm font-medium text-amber-700">
          W50 differs: {race.turfPerformanceShadow.w50HorseName}
        </p>
      ) : null}

      <RunnerTable
        isAllWeatherRace={isAllWeatherRace}
        awDCoverage={awDCoverage}
        jprACoverage={jprACoverage}
        tprCoverage={tprCoverage}
        isJumpRace={isJumpRace}
        isTurfRace={isTurfRace}
        runners={race.runners}
      />
      {/* TODO: The retired manual-comparator slot may host another prospective test later. */}
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
  awDCoverage,
  jprACoverage,
  tprCoverage,
  isJumpRace,
  isTurfRace,
  runners,
}: {
  isAllWeatherRace: boolean;
  awDCoverage?: AwRatingCoverage;
  jprACoverage?: RatingCoverage;
  tprCoverage?: RatingCoverage;
  isJumpRace: boolean;
  isTurfRace: boolean;
  runners: TodayRunner[];
}) {
  return (
    <div className="mt-4 overflow-x-auto" data-testid="runner-table-scroll">
      <table className="w-full min-w-[1120px] table-fixed text-left text-xs">
        <thead className="border-y border-slate-200 text-[10px] uppercase text-slate-500">
          <tr>
            <th className="w-10 px-1.5 py-1.5 font-medium">No.</th>
            <th className="w-40 px-1.5 py-1.5 font-medium">Horse</th>
            <th className="w-9 px-1.5 py-1.5 font-medium">Age</th>
            <th className="w-14 px-1.5 py-1.5 font-medium">Wgt</th>
            <th className="w-10 px-1.5 py-1.5 font-medium">
              {isJumpRace ? "-" : "Draw"}
            </th>
            <th className="w-24 px-1.5 py-1.5 font-medium">Jockey</th>
            <th className="w-28 px-1.5 py-1.5 font-medium">Trainer</th>
            <th className="w-10 px-1.5 py-1.5 font-medium">OR</th>
            {(isTurfRace || isJumpRace) ? (
              <th
                className="w-20 px-1.5 py-1.5 font-medium"
                title="Previous 1st or 2nd finishes on going containing these terms."
              >
                Going form
              </th>
            ) : null}
            <th className="w-16 px-1.5 py-1.5 font-medium">Speed</th>
            <th
              className="w-[72px] px-1.5 py-1.5 font-medium"
              title="Latest historical performance adjusted for today's weight."
            >
              Today&apos;s Rating
            </th>
            {isJumpRace ? (
              <th
                className="w-28 px-1.5 py-1.5 font-medium"
                title="Frozen JPR-A diagnostic: equal average of Average Jump Speed L3 rank and Trainer prior strike-rate rank."
              >
                JPR-A diag.
              </th>
            ) : null}
            {isJumpRace ? <th className="w-24 px-1.5 py-1.5 font-medium">Jump Tissue (diagnostic)</th> : null}
            {isAllWeatherRace ? (
              <th
                className="w-28 px-1.5 py-1.5 font-medium"
                title="Frozen AW-D diagnostic: equal average of Average AW Speed L3, Trainer prior strike-rate, and Jockey prior strike-rate ranks."
              >
                AW-D diag.
              </th>
            ) : null}
            {isAllWeatherRace ? <th className="w-24 px-1.5 py-1.5 font-medium">AW Tissue (diagnostic)</th> : null}
            {isTurfRace ? (
              <th
                className="w-24 px-1.5 py-1.5 font-medium"
                title="Experimental Turf Performance Rating. Diagnostic forward test only."
              >
                Turf TPR
              </th>
            ) : null}
            <th className="w-11 px-1.5 py-1.5 font-medium">Days</th>
            <th className="w-20 px-1.5 py-1.5 font-medium">Odds</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {runners.map((runner) => (
            <RunnerRow
              isAllWeatherRace={isAllWeatherRace}
              awDCoverage={awDCoverage}
              jprACoverage={jprACoverage}
              tprCoverage={tprCoverage}
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
  awDCoverage,
  jprACoverage,
  tprCoverage,
  isJumpRace,
  isTurfRace,
  runner,
}: {
  isAllWeatherRace: boolean;
  awDCoverage?: AwRatingCoverage;
  jprACoverage?: RatingCoverage;
  tprCoverage?: RatingCoverage;
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
      <td className="px-1.5 py-2">{runner.saddleclothNumber ?? "-"}</td>
      <td className="px-1.5 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <Link
            className="break-words font-medium leading-4 text-emerald-800 hover:text-emerald-950 hover:underline"
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
      <td className="px-1.5 py-2">{runner.horseAge ?? "-"}</td>
      <td className="px-1.5 py-2">{runner.weight ?? "-"}</td>
      <td className="px-1.5 py-2">
        {isJumpRace ? "-" : runner.draw ?? "-"}
      </td>
      <td className="break-words px-1.5 py-2 leading-4">{runner.jockeyName ?? "-"}</td>
      <td className="break-words px-1.5 py-2 leading-4">{runner.trainerName ?? "-"}</td>
      <td className="px-1.5 py-2">{runner.officialRating ?? "-"}</td>
      {(isTurfRace || isJumpRace) ? (
        <td className="px-1.5 py-2">
          <GoingFormCell runner={runner} />
        </td>
      ) : null}
      <td className="px-1.5 py-2">
        <SpeedDisplayValue values={speedMetrics} />
      </td>
      <td className="px-1.5 py-2">{formatRating(todaysRating)}</td>
      {isJumpRace ? (
        <td className="px-1.5 py-2">
          <JumpRatingCell coverage={jprACoverage} runner={runner} />
        </td>
      ) : null}
      {isJumpRace ? <td className="px-1.5 py-2"><JumpTissueCell runner={runner} /></td> : null}
      {isAllWeatherRace ? (
        <td className="px-1.5 py-2">
          <AwRatingCell coverage={awDCoverage} runner={runner} />
        </td>
      ) : null}
      {isAllWeatherRace ? <td className="px-1.5 py-2"><AwTissueCell runner={runner} /></td> : null}
      {isTurfRace ? (
        <td className="px-1.5 py-2">
          <TurfPerformanceRatingCell coverage={tprCoverage} runner={runner} />
        </td>
      ) : null}
      <td className="px-1.5 py-2">
        {runner.metrics?.daysSinceLastRun ?? "-"}
      </td>
      <td className="px-1.5 py-2"><TodayMarketOdds runner={runner} /></td>
    </tr>
  );
}

export function AwTissueCell({ runner }: { runner: TodayRunner }) {
  const prediction = runner.awTissue;
  if (!prediction?.predictionAvailable || prediction.probability === null) return <span title={prediction?.unavailableReason ?? "No prospective capture"}>-</span>;
  return <div className="tabular-nums">
    <span className="font-semibold">{(prediction.probability * 100).toFixed(1)}%</span>
    <span className="ml-1 text-slate-600">#{prediction.rank}</span>
    {prediction.zeroHistoryRunner ? <div className="text-[10px] text-slate-500">0 prior AW starts</div> : null}
  </div>;
}

export function JumpTissueCell({ runner }: { runner: TodayRunner }) {
  const prediction = runner.jumpTissue;
  if (!prediction?.predictionAvailable || prediction.probability === null) return <span title={prediction?.unavailableReason ?? "No prospective capture"}>-</span>;
  return <div className="tabular-nums">
    <span className="font-semibold">{(prediction.probability * 100).toFixed(1)}%</span>
    <span className="ml-1 text-slate-600">#{prediction.rank}</span>
    <div className="text-[10px] text-slate-500">
      JPR-A {runner.jumpRating?.jprA?.rank ? `#${runner.jumpRating.jprA.rank}` : "-"}
    </div>
    {prediction.historyBucket !== "unknown" ? <div className="text-[10px] text-slate-500">{prediction.historyBucket.replace("_", "+")} prior Jump</div> : null}
  </div>;
}

export function TodayMarketOdds({ runner }: { runner: TodayRunner }) {
  const market = summarizeTodayMarketPrice(runner);
  const forecast = market.forecastOdds
    ? `${market.forecastOdds}${market.forecastDecimalOdds === null ? "" : ` (${market.forecastDecimalOdds.toFixed(2)})`}`
    : "-";
  if (market.medianDecimalOdds === null) {
    return (
      <span className="text-slate-400" title={`No market quote. Forecast: ${forecast}`}>
        -
      </span>
    );
  }
  const median = market.medianFractionalOdds ?? market.medianDecimalOdds.toFixed(2);
  const best = market.bestFractionalOdds ?? market.bestDecimalOdds?.toFixed(2) ?? "-";
  const providers = market.bestBookmakerNames.length ? ` ${market.bestBookmakerNames.join(" / ")}` : "";
  const quotes = market.quotes.map((quote) =>
    `${quote.bookmakerName ?? quote.bookmakerId ?? "Unknown"}: ${quote.fractionalOdds ?? quote.decimalOdds.toFixed(2)} (${quote.decimalOdds.toFixed(2)})`
  ).join("\n");
  const title = [
    `Median market: ${median} (${market.medianDecimalOdds.toFixed(2)}), ${market.quoteCount} quotes`,
    `Best: ${best}${providers}`,
    `Forecast: ${forecast}`,
    quotes,
  ].filter(Boolean).join("\n");
  return (
    <div className="leading-4" title={title}>
      <div className="font-semibold text-slate-900">{median}</div>
      <div className="truncate text-[10px] text-slate-500">Best {best}</div>
    </div>
  );
}

function JumpRatingCell({ coverage, runner }: { coverage?: RatingCoverage; runner: TodayRunner }) {
  const rating = runner.jumpRating?.jprA;
  if (!rating) return <span className="text-slate-400">—</span>;
  const insufficientCoverage = coverage?.ratingCoverageStatus === "insufficient_coverage";
  return (
    <div className="space-y-0.5">
      <div className="font-semibold text-slate-900">JPR-A {rating.score.toFixed(1)}</div>
      <div
        className={insufficientCoverage ? "text-xs font-medium text-amber-700" : "text-xs text-slate-600"}
        title={insufficientCoverage ? coverageTitle(coverage, JPR_A_RATING_COVERAGE_GUARD_VERSION, JPR_A_RATING_COVERAGE_GUARD_IMPLEMENTED_AT) : undefined}
      >
        {insufficientCoverage ? "Insufficient race coverage" : `Rank ${rating.rank}`}
      </div>
    </div>
  );
}

function AwRatingCell({ coverage, runner }: { coverage?: AwRatingCoverage; runner: TodayRunner }) {
  const rating = runner.awRating?.awD;
  if (!rating) return <span className="text-slate-400">—</span>;
  const insufficientCoverage = coverage?.ratingCoverageStatus === "insufficient_coverage";
  return (
    <div className="space-y-0.5">
      <div className="font-semibold text-slate-900">AW-D {rating.score.toFixed(1)}</div>
      <div
        className={insufficientCoverage ? "text-xs font-medium text-amber-700" : "text-xs text-slate-600"}
        title={insufficientCoverage
          ? `Rated ${coverage.ratedRunnerCount}/${coverage.activeRunnerCount}; guard ${AW_D_RATING_COVERAGE_GUARD_VERSION}, implemented ${AW_D_RATING_COVERAGE_GUARD_IMPLEMENTED_AT}; requires at least ${AW_D_MIN_RATED_RUNNERS} rated runners and ${(AW_D_MIN_RATING_COVERAGE * 100).toFixed(0)}% coverage.`
          : undefined}
      >
        {insufficientCoverage ? "Insufficient race coverage" : `Rank ${rating.rank}`}
      </div>
    </div>
  );
}

function GoingFormCell({ runner }: { runner: TodayRunner }) {
  const labels = GOING_FORM_TERMS
    .filter((term) => runner.goingForm?.[term])
    .map(goingFormLabel);

  return (
    <span
      className={labels.length > 0 ? "text-slate-700" : "text-slate-400"}
      title="Previous 1st or 2nd finishes on going containing these terms."
    >
      {labels.length > 0 ? labels.join(" · ") : "—"}
    </span>
  );
}

function goingFormLabel(term: GoingFormTerm): string {
  return term[0]!.toUpperCase() + term.slice(1);
}

function coverageTitle(coverage: RatingCoverage, version: string, implementedAt: string) {
  return `Rated ${coverage.ratedRunnerCount}/${coverage.activeRunnerCount}; guard ${version}, implemented ${implementedAt}; requires at least ${MIN_RACE_RATED_RUNNERS} rated runners and ${(MIN_RACE_RATING_COVERAGE * 100).toFixed(0)}% coverage.`;
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
            <div className="mt-1 text-slate-600">Historical research only</div>
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

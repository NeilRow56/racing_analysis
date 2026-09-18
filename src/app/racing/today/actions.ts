"use server";

import { revalidatePath } from "next/cache";
import { createDbConnection } from "@/db";
import { syncAwForwardComparisons } from "@/lib/racing/aw-forward-comparisons";
import { listSavedResearchRulesWithDb } from "@/lib/racing/saved-research-rules";
import { parseResearchRule } from "@/lib/racing/research-rule";
import {
  attachFrozenRuleMatchesToToday,
  type TodayTrainerCohortsByRule,
} from "@/lib/racing/today-rule-matches";
import { refreshEligibleTodaySelectionResults } from "@/lib/racing/today-result-refresh";
import { getTrainerCohortForRule, trainerCohortYearFromDate } from "@/lib/racing/trainer-cohorts";
import {
  getTodaysRacingData,
  isValidRacingDate,
} from "@/lib/racing/todays-racing";
import {
  buildTodayForwardInput,
  isTimewiseEligibleRace,
  TIMEWISE_NON_RUNNER_VALUE,
  timewiseTimingForSave,
} from "@/lib/racing/tpr-timewise-forward-context";
import { enrichTodayForwardTrackerResults } from "@/lib/racing/tpr-timewise-forward-settlement";
import {
  createRecord,
  forwardRaceKey,
  loadTrackerData,
  saveTrackerRace,
} from "../../../../scripts/diagnose-tpr-vs-timewise-forward";

export async function refreshTodaySelectionResultsAction(formData: FormData) {
  const raceDateValue = formData.get("raceDate");
  const raceDate = typeof raceDateValue === "string" && isValidRacingDate(raceDateValue)
    ? raceDateValue
    : undefined;
  let connection: ReturnType<typeof createDbConnection> | null = null;

  try {
    connection = createDbConnection();
    const data = await getTodaysRacingData(connection.db, raceDate);
    if (data.status === "ok") {
      const savedRules = await listSavedResearchRulesWithDb(connection.db);
      const trainerCohortsByRule = await resolveTodayTrainerCohorts(
        connection.db,
        savedRules,
        data.raceDate,
      );
      const meetings = attachFrozenRuleMatchesToToday(
        data.meetings,
        savedRules,
        data.raceDate,
        trainerCohortsByRule,
      );
      await syncAwForwardComparisons(meetings, data.raceDate);
      const refreshSummary = await refreshEligibleTodaySelectionResults(meetings, data.raceDate, {
        forceRetry: true,
      });
      if (refreshSummary.imported > 0) {
        const refreshed = await getTodaysRacingData(connection.db, data.raceDate);
        if (refreshed.status === "ok") {
          await syncAwForwardComparisons(refreshed.meetings, data.raceDate);
          await enrichTodayForwardTrackerResults(refreshed.meetings, data.raceDate);
        }
      } else {
        await syncAwForwardComparisons(data.meetings, data.raceDate);
        await enrichTodayForwardTrackerResults(data.meetings, data.raceDate);
      }
    }
  } finally {
    if (connection) {
      await connection.client.end();
    }
  }

  revalidatePath("/racing/today");
}

export async function saveTimewiseComparisonAction(formData: FormData) {
  const raceDate = requiredFormValue(formData, "raceDate");
  const raceId = requiredFormValue(formData, "raceId");
  const timewiseRank1RunnerId = requiredFormValue(formData, "timewiseRank1RunnerId");
  const timewiseRank2RunnerId = requiredFormValue(formData, "timewiseRank2RunnerId");
  if (!isValidRacingDate(raceDate)) throw new Error("Invalid race date.");
  if (timewiseRank1RunnerId === timewiseRank2RunnerId && timewiseRank1RunnerId !== TIMEWISE_NON_RUNNER_VALUE) throw new Error("Timewise rank 1 and rank 2 must differ.");

  const connection = createDbConnection();
  try {
    const data = await getTodaysRacingData(connection.db, raceDate);
    if (data.status !== "ok") throw new Error("Racecard is not available.");
    const meeting = data.meetings.find((value) => value.races.some((race) => race.raceId === raceId));
    const race = meeting?.races.find((value) => value.raceId === raceId);
    if (!meeting || !race || !isTimewiseEligibleRace(race)) throw new Error("Timewise tracking is available for Turf and All Weather races only.");
    const timewiseRank1NonRunner = timewiseRank1RunnerId === TIMEWISE_NON_RUNNER_VALUE;
    const timewiseRank2NonRunner = timewiseRank2RunnerId === TIMEWISE_NON_RUNNER_VALUE;
    const timewiseRank1 = timewiseRank1NonRunner ? null : race.runners.find((runner) => runner.runnerId === timewiseRank1RunnerId);
    const timewiseRank2 = timewiseRank2NonRunner ? null : race.runners.find((runner) => runner.runnerId === timewiseRank2RunnerId);
    if ((!timewiseRank1NonRunner && !timewiseRank1) || (!timewiseRank2NonRunner && !timewiseRank2)) throw new Error("Select runners from this race.");

    const input = buildTodayForwardInput({
      course: meeting.courseName,
      race,
      raceDate,
      timewiseRank1: timewiseRank1?.horseName ?? null,
      timewiseRank1NonRunner,
      timewiseRank2: timewiseRank2?.horseName ?? null,
      timewiseRank2NonRunner,
    });
    const trackerData = await loadTrackerData();
    const existing = trackerData.races.find((record) => forwardRaceKey(record) === forwardRaceKey(input));
    await saveTrackerRace(createRecord({
      ...input,
      ...timewiseTimingForSave(existing, race.raceDateTime),
    }), true);
  } finally {
    await connection.client.end();
  }

  revalidatePath(`/racing/today?date=${raceDate}`);
}

function requiredFormValue(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value) throw new Error(`Missing ${name}.`);
  return value;
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

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
import type { TimewiseSaveContext } from "@/lib/racing/timewise-save";
import { saveTimewiseComparison } from "@/lib/racing/timewise-save";
import { enrichTodayForwardTrackerResults } from "@/lib/racing/tpr-timewise-forward-settlement";

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

export async function saveTimewiseComparisonAction(
  context: TimewiseSaveContext,
  formData: FormData,
) {
  return saveTimewiseComparison({
    context,
    formData,
    onTiming: (timing) => console.info("TIMEWISE_SAVE_TIMING", {
      raceDate: context.raceDate,
      raceId: context.raceId,
      ...roundedTiming(timing),
    }),
  });
}

function roundedTiming(timing: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(timing).map(([name, duration]) => [name, Math.round(duration * 10) / 10]),
  );
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

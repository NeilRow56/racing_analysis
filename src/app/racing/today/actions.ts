"use server";

import { revalidatePath } from "next/cache";
import { createDbConnection } from "@/db";
import { listSavedResearchRulesWithDb } from "@/lib/racing/saved-research-rules";
import { parseResearchRule } from "@/lib/racing/research-rule";
import {
  attachFrozenRuleMatchesToToday,
  type TodayTrainerCohortsByRule,
} from "@/lib/racing/today-rule-matches";
import { refreshEligibleTodaySelectionResults } from "@/lib/racing/today-result-refresh";
import { getTrainerCohortForRule } from "@/lib/racing/trainer-cohorts";
import {
  getTodaysRacingData,
  isValidRacingDate,
} from "@/lib/racing/todays-racing";

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
      await refreshEligibleTodaySelectionResults(meetings, data.raceDate, {
        forceRetry: true,
      });
    }
  } finally {
    if (connection) {
      await connection.client.end();
    }
  }

  revalidatePath("/racing/today");
}

async function resolveTodayTrainerCohorts(
  db: ReturnType<typeof createDbConnection>["db"],
  savedRules: Awaited<ReturnType<typeof listSavedResearchRulesWithDb>>,
  raceDate: string,
): Promise<TodayTrainerCohortsByRule> {
  const cohortYear = Number(raceDate.slice(0, 4));
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

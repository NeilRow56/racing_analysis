"use server";

import { revalidatePath } from "next/cache";
import { createDbConnection } from "@/db";
import { listSavedResearchRulesWithDb } from "@/lib/racing/saved-research-rules";
import {
  attachFrozenRuleMatchesToToday,
} from "@/lib/racing/today-rule-matches";
import { refreshEligibleTodaySelectionResults } from "@/lib/racing/today-result-refresh";
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
      const meetings = attachFrozenRuleMatchesToToday(
        data.meetings,
        savedRules,
        data.raceDate,
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

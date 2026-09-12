import { eq, isNotNull } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { savedResearchRules } from "@/db/schema";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import { HOLDOUT_YEAR } from "@/lib/racing/research-holdout";
import {
  holdoutSnapshotWithActualCoverage,
  savedResearchRuleFromRow,
} from "@/lib/racing/saved-research-rules";

async function main() {
  const { client, db } = createDbConnection();
  try {
    const rows = await db
      .select()
      .from(savedResearchRules)
      .where(isNotNull(savedResearchRules.holdoutSnapshot));
    let updated = 0;
    for (const row of rows) {
      const rule = savedResearchRuleFromRow(row);
      const snapshot = rule.holdoutSnapshot;
      if (!snapshot || snapshot.holdoutYear !== HOLDOUT_YEAR) {
        continue;
      }
      const cached = await loadLatestBacktestFeatureCacheForYear({
        year: HOLDOUT_YEAR,
        family: rule.family,
      });
      if (!cached?.actualCoverage) {
        console.warn(`Skipping ${rule.id}: compatible 2026 holdout cache with dated rows was not found.`);
        continue;
      }
      const corrected = holdoutSnapshotWithActualCoverage(snapshot, cached.actualCoverage, {
        from: cached.manifest.from,
        to: cached.manifest.to,
      });
      if (JSON.stringify(corrected) === JSON.stringify(snapshot)) {
        continue;
      }
      await db.update(savedResearchRules)
        .set({
          holdoutSnapshot: corrected,
          updatedAt: new Date(),
        })
        .where(eq(savedResearchRules.id, rule.id));
      updated += 1;
      console.log(`${rule.name}: ${snapshot.holdoutFrom} to ${snapshot.holdoutTo} -> ${corrected.holdoutFrom} to ${corrected.holdoutTo}`);
    }
    console.log(`Updated ${updated} holdout snapshot${updated === 1 ? "" : "s"}.`);
  } finally {
    await client.end();
  }
}

void main();

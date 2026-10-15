import { readFile, writeFile } from "node:fs/promises";
import { calculateJumpRaceRatings } from "@/lib/racing/jump-performance-rating";
import { settleSelection } from "@/lib/racing/backtest";
import type { HistoricalPreRaceFeatureRow, HistoricalPostRaceOutcome } from "@/lib/racing/historical-target-metrics";

async function summarize(root: string) {
  const result: Record<string, unknown> = {};
  for (const year of ["2025", "2026"]) {
    const dir = `${root}/backtest_features_v4-sporting_life-jump-${year}-01-01-${year}-12-31`;
    const features = (await readFile(`${dir}/features.ndjson`, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as HistoricalPreRaceFeatureRow);
    const outcomes = new Map((await readFile(`${dir}/outcomes.ndjson`, "utf8")).trim().split("\n").map((line) => {
      const row = JSON.parse(line) as HistoricalPostRaceOutcome; return [row.targetRunnerId, row] as const;
    }));
    const groups = new Map<string, HistoricalPreRaceFeatureRow[]>();
    for (const row of features) groups.set(row.targetRaceId, [...(groups.get(row.targetRaceId) ?? []), row]);
    const stats = { jprA: { selections: 0, winners: 0, profitLoss: 0, expected: 0 }, jprB: { selections: 0, winners: 0, profitLoss: 0, expected: 0 } };
    for (const field of groups.values()) {
      const ratings = calculateJumpRaceRatings(field.map((f) => ({ runnerId: f.targetRunnerId, resultStatus: outcomes.get(f.targetRunnerId)!.resultStatus, averageJumpSpeedLast3: f.averageJumpSpeedLast3, trainerPriorStrikeRate: f.trainerPriorWinRate, officialRating: f.officialRating })));
      const active = field.filter((f) => outcomes.get(f.targetRunnerId)!.resultStatus !== "non_runner");
      const rated = active.filter((f) => ratings.get(f.targetRunnerId)?.jprA != null).length;
      if (rated < 2 || rated / active.length < 0.2) continue;
      for (const f of active) for (const kind of ["jprA", "jprB"] as const) {
        if (ratings.get(f.targetRunnerId)?.[kind]?.rank !== 1) continue;
        const outcome = outcomes.get(f.targetRunnerId)!;
        const settlement = settleSelection(outcome);
        if (!settlement) continue;
        const s = stats[kind]; s.selections++; s.winners += outcome.won === true ? 1 : 0;
        s.profitLoss += settlement.profitLoss; s.expected += 1 / settlement.settlementOddsDecimal;
      }
    }
    result[year] = Object.fromEntries(Object.entries(stats).map(([kind, s]) => [kind, { ...s, roi: s.profitLoss / s.selections, ae: s.winners / s.expected }]));
  }
  return result;
}
await writeFile("/tmp/jump-repair-jpr-summary.json", JSON.stringify({ note: "Fixed original target populations/outcomes; rank-1 unit stakes including ties, standard JPR-A field coverage eligibility applied to both summaries. Research only; no prospective captures.", before: await summarize("/tmp/jump-repair-baseline-cache"), after: await summarize("/tmp/jump-repair-clean-matched-cache") }, null, 2) + "\n");

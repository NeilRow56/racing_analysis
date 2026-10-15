import { readFile, writeFile } from "node:fs/promises";
import { winningTimeCorrections } from "@/lib/racing/winning-time-corrections";
import { jumpWinningTimeReviews, type JumpTimingContext } from "@/lib/racing/jump-winning-time-references";
import { sanityCheckWinningTime } from "@/lib/racing/speed-research";

type SourceRace = { id: string; source_id: string; course_id: string; course: string; race_date: string; race_datetime: string | null; race_name: string | null; race_type: string | null; distance_yards: number | null; winning_time: string | null };
const source = JSON.parse(await readFile("/tmp/jump-winning-time-distribution-before.json", "utf8")) as { races: SourceRace[] };
// Restore original Newcastle source time for the counterfactual: already repaired on entry.
const originals = source.races.map((r) => ({ ...r, winning_time: winningTimeCorrections.find((c) => c.sourceId === r.source_id)?.original ?? r.winning_time }));
const row = (r: SourceRace): JumpTimingContext => ({ raceId: r.id, courseId: r.course_id, distanceYards: r.distance_yards, winningTime: r.winning_time, raceName: r.race_name, raceType: r.race_type });
const groups = new Map<string, SourceRace[]>();
for (const race of originals) {
  const k = `${race.course_id}:${race.distance_yards}`;
  groups.set(k, [...(groups.get(k) ?? []), race]);
}
const results = originals.filter((r) => r.race_date >= "2025-01-01" && r.race_date <= "2026-12-31").map((r) => {
  const cutoff = r.race_datetime ? new Date(r.race_datetime).getTime() : NaN;
  const peers = (groups.get(`${r.course_id}:${r.distance_yards}`) ?? []).filter((p) => p.id === r.id || (p.race_datetime && new Date(p.race_datetime).getTime() <= cutoff));
  const review = jumpWinningTimeReviews(peers.map(row)).get(r.id)!;
  return { sourceId: r.source_id, course: r.course, date: r.race_date, raceName: r.race_name, originalTime: r.winning_time, genericUsable: sanityCheckWinningTime(row(r)).usableSeconds !== null, knownConfirmed: winningTimeCorrections.some((c) => c.sourceId === r.source_id), ...review };
});
const summary = (minimumPeers: number) => {
  const eligible = results.filter((r) => r.genericUsable && r.sampleSize >= minimumPeers);
  const flagged = results.filter((r) => r.shouldWithhold && r.sampleSize >= minimumPeers);
  return { minimumPeers, totalRaces: results.length, eligibleRaces: eligible.length, flaggedRaces: flagged.length,
    confirmedCaught: flagged.filter((r) => r.knownConfirmed), confirmedMissed: results.filter((r) => r.knownConfirmed && !flagged.includes(r)),
    nonConfirmedFlagged: flagged.filter((r) => !r.knownConfirmed), flagged };
};
const report = { rule: "same-course/exact-distance/subtype, AWT-title isolation; chronological leave-one-out median/MAD; faster than -15% and <-4 robust sigma, slower than +35% and >6 robust sigma; sigma floor 2% of median; minimum 5 peers", primary: summary(5), alternative: summary(10),
  notes: ["Original source-time counterfactual including Newcastle, with original peer times available through each race cutoff. Not an in-sample comparison to future standards.", "Known errors missed for insufficient comparable peers remain repaired by independent-source corrections. Unknown flags require human review, not automatic source replacement.", "5 versus 10 peers is the sole alternative: five admits modest comparable samples without rejecting on sample sparsity alone."], results };
await writeFile("/tmp/jump-winning-time-guard-backtest.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ primary: { eligible: report.primary.eligibleRaces, flagged: report.primary.flaggedRaces, caught: report.primary.confirmedCaught.map((r) => r.sourceId), missed: report.primary.confirmedMissed.map((r) => r.sourceId), other: report.primary.nonConfirmedFlagged.map((r) => r.sourceId) }, alternative: { flagged: report.alternative.flaggedRaces, caught: report.alternative.confirmedCaught.length } }, null, 2));

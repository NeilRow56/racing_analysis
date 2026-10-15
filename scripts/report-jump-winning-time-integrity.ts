import { readFile, writeFile } from "node:fs/promises";
import { classifyJumpRaceSubtype, type JumpSpeedRating } from "@/lib/racing/jump-speed-rating";
import { parseWinningTimeSeconds } from "@/lib/racing/speed-research";
import { reviewJumpWinningTime } from "@/lib/racing/jump-winning-time-integrity";

type Race = { id: string; source_id: string; race_date: string; course_id: string; course: string; race_name: string; race_type: string; distance: string; distance_yards: number; going: string; winning_time: string; runners: { id: string; horse: string; horse_id: string; finishing_position: number | null; speed?: JumpSpeedRating }[] };
const data = JSON.parse(await readFile("/tmp/jump-winning-time-audit-before-ratings.json", "utf8")) as { races: Race[]; totalRaces: number; totalRunners: number };
const subtype = (race: Race) => classifyJumpRaceSubtype({ raceName: race.race_name, raceType: race.race_type });
const diagnosticRows = data.races.map((race) => {
  const actual = parseWinningTimeSeconds(race.winning_time);
  const peers = data.races.filter((p) => p.id !== race.id && p.course_id === race.course_id && p.distance_yards === race.distance_yards && subtype(p) === subtype(race))
    .map((p) => parseWinningTimeSeconds(p.winning_time)).filter((n): n is number => n !== null);
  const winner = race.runners.find((r) => r.finishing_position === 1);
  const rating = winner?.speed;
  return { sourceId: race.source_id, raceId: race.id, date: race.race_date, course: race.course, race: race.race_name, distance: race.distance, distanceYards: race.distance_yards, type: subtype(race), going: race.going,
    storedWinningTime: race.winning_time, winningSeconds: actual, averageYardsPerSecond: actual === null ? null : race.distance_yards / actual,
    productionStandardSeconds: actual === null || rating?.baseRating == null ? null : actual + (rating.baseRating - 100) * (race.distance_yards / 220) / 37.76,
    productionStandardSampleSize: rating?.standardSampleSize ?? null, winnerBaseRating: rating?.baseRating ?? null, winnerRating: rating?.rating ?? null,
    runnersGE160: race.runners.filter((r) => (r.speed?.rating ?? -Infinity) >= 160).length,
    runnersGE180: race.runners.filter((r) => (r.speed?.rating ?? -Infinity) >= 180).length,
    runnersGE200: race.runners.filter((r) => (r.speed?.rating ?? -Infinity) >= 200).length,
    usableFinishers: race.runners.filter((r) => r.speed?.rating != null).map((r) => ({ horse: r.horse, runnerId: r.id, rating: r.speed!.rating })),
    guardDiagnostic: reviewJumpWinningTime(actual ?? NaN, peers),
  };
});
await writeFile("/tmp/jump-winning-time-race-diagnostics.json", JSON.stringify({ scope: "Stored 2025/2026 Sporting Life timed Jump races. Production ratings use shared full-batch cutoff; robust diagnostic peers are leave-one-out same course/distance/subtype within audited years. This is a retrospective audit, not a prospective capture.", totalRaces: data.totalRaces, totalRunners: data.totalRunners,
  coverage: { from: data.races.map((r) => r.race_date).sort()[0], to: data.races.map((r) => r.race_date).sort().at(-1) },
  thresholds: [160, 180, 200].map((threshold) => ({ threshold, races: diagnosticRows.filter((r) => r[`runnersGE${threshold}` as "runnersGE160"] > 0).length, runners: diagnosticRows.reduce((n, r) => n + r[`runnersGE${threshold}` as "runnersGE160"], 0) })),
  races: diagnosticRows.filter((r) => r.runnersGE160 > 0 || r.guardDiagnostic.reason.startsWith("extreme_time")),
}, null, 2) + "\n");
console.log("Saved race-level diagnostics, threshold counts and robust time-review flags");

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { winningTimeCorrections } from "@/lib/racing/winning-time-corrections";
import { jumpWinningTimeReviews, type JumpTimingContext } from "@/lib/racing/jump-winning-time-references";
import { JUMP_WINNING_TIME_GUARD_VERSION, MISSING_MINUTE_POLICY } from "@/lib/racing/jump-winning-time-integrity";
import { parseWinningTimeSeconds, sanityCheckWinningTime } from "@/lib/racing/speed-research";

type Race = { id: string; source_id: string; course_id: string; course: string; race_date: string; race_datetime: string | null; race_name: string | null; race_type: string | null; distance_yards: number | null; winning_time: string | null };
// Read-only source snapshots from the completed repair audit; no DB writes or cache rebuilds.
const inputPath = process.argv[2] ?? "/tmp/jump-winning-time-distribution-source-after.json";
const sourceText = await readFile(inputPath, "utf8");
const source = JSON.parse(sourceText) as { races: Race[] };
const corrections = new Map(winningTimeCorrections.map((c) => [c.sourceId, c]));
const originals = source.races.map((r) => ({ ...r, winning_time: corrections.get(r.source_id)?.original ?? r.winning_time }));
const context = (r: Race): JumpTimingContext => ({ raceId: r.id, courseId: r.course_id, distanceYards: r.distance_yards, winningTime: r.winning_time, raceName: r.race_name, raceType: r.race_type });
function evaluate(races: Race[]) {
  const groups = new Map<string, Race[]>();
  for (const r of races) {
    const key = `${r.course_id}:${r.distance_yards}`;
    const group = groups.get(key) ?? [];
    group.push(r); groups.set(key, group);
  }
  return races.filter((r) => r.race_date >= "2025-01-01" && r.race_date <= "2026-12-31").map((r) => {
    const cutoff = r.race_datetime ? new Date(r.race_datetime).getTime() : NaN;
    const peers = (groups.get(`${r.course_id}:${r.distance_yards}`) ?? []).filter((p) => p.id === r.id || (p.race_datetime !== null && new Date(p.race_datetime).getTime() <= cutoff));
    const review = jumpWinningTimeReviews(peers.map(context)).get(r.id)!;
    return { sourceId: r.source_id, date: r.race_date, course: r.course, raceName: r.race_name, storedTime: r.winning_time,
      knownConfirmed: corrections.has(r.source_id), genericUsable: sanityCheckWinningTime(context(r)).usableSeconds !== null, ...review };
  });
}
const results = evaluate(originals);
const currentResults = evaluate(source.races);
const irishCourses = new Set(["Gowran Park", "Killarney", "Thurles", "Navan", "Ballinrobe"]);
const confirmed = winningTimeCorrections.map((c) => {
  const r = results.find((r) => r.sourceId === c.sourceId);
  assert.ok(r, `Missing confirmed race ${c.sourceId}`);
  return { sourceId: c.sourceId, sourceRace: c.raceName, date: c.raceDate, course: c.course,
    country: irishCourses.has(c.course) ? "IRE" : "GB", originalBadTime: c.original, correctedTime: c.corrected,
    differenceSeconds: Number((parseWinningTimeSeconds(c.corrected)! - parseWinningTimeSeconds(c.original)!).toFixed(2)),
    existingGuardCaught: r.genericShouldWithhold, missingMinuteGuardCaught: r.missingMinute.classification === "LIKELY_MISSING_MINUTE", combinedGuardCaught: r.shouldWithhold,
    sampleSize: r.sampleSize, standardSeconds: r.standardSeconds, diagnostic: r.missingMinute, independentSource: c.independentSource };
});
const missingFlags = results.filter((r) => r.missingMinute.classification === "LIKELY_MISSING_MINUTE");
const otherFlags = missingFlags.filter((r) => !r.knownConfirmed);
const wexford = results.find((r) => r.sourceId === "858143");
assert.ok(wexford, "Missing Wexford review case");
const summary = {
  totalRacesChecked: results.length, usableStoredTimes: results.filter((r) => r.genericUsable).length,
  exactReferenceEligible: results.filter((r) => r.genericUsable && r.sampleSize >= MISSING_MINUTE_POLICY.minimumPeers).length,
  totalFlagged: missingFlags.length, knownConfirmedErrorsCaught: confirmed.filter((r) => r.missingMinuteGuardCaught).length,
  otherRacesFlagged: otherFlags.length, proportionFlagged: missingFlags.length / results.length,
  existingGuardCaught: confirmed.filter((r) => r.existingGuardCaught).length,
  combinedGuardCaught: confirmed.filter((r) => r.combinedGuardCaught).length,
};
const currentFlags = currentResults.filter((r) => r.missingMinute.classification === "LIKELY_MISSING_MINUTE");
const report = {
  generatedAt: new Date().toISOString(), guardVersion: JUMP_WINNING_TIME_GUARD_VERSION, policy: MISSING_MINUTE_POLICY,
  source: { path: inputPath, sha256: createHash("sha256").update(sourceText).digest("hex"), totalReferenceRaces: source.races.length,
    earliestChecked: results.map((r) => r.date).sort()[0], latestChecked: results.map((r) => r.date).sort().at(-1) },
  method: "Chronological leave-one-out same course/exact distance/Jump subtype with AWT-title isolation; original pre-repair values restored for all ten errors, including peer values. No future peers. No new distance fallback. Caller-supplied production cutoffs remain unchanged.",
  confirmed, summary, otherFlags,
  currentStoredTimes: { totalRacesChecked: currentResults.length, totalFlagged: currentFlags.length, knownConfirmedFlagged: currentFlags.filter((r) => r.knownConfirmed).length, otherRacesFlagged: currentFlags.filter((r) => !r.knownConfirmed).length, proportionFlagged: currentFlags.length / currentResults.length, flagged: currentFlags },
  sparseReferenceCases: results.filter((r) => r.sampleSize < 5 && (r.knownConfirmed || r.missingMinute.classification === "LIKELY_MISSING_MINUTE")),
  wexford: { ...wexford, storedSeconds: parseWinningTimeSeconds(wexford.storedTime),
    priorAuditReportedIndependentTime: "4m 2.40s", priorAuditDifferenceSeconds: 0, trustedReplacement: null,
    referenceDeficitSeconds: wexford.missingMinute.deficitSeconds,
    classification: "Unconfirmed timing anomaly; does not fit the targeted +60s pattern; generic guard withholds. No repair.",
    evidence: "/tmp/jump-winning-time-integrity-audit.md; /tmp/jump-winning-time-repair-final.md (prior audit evidence, not newly corroborated)" },
  recommendation: "KEEP",
  limitations: ["These are retrospective detection checks, not independent false-positive adjudication. All non-confirmed flags require source review.",
    "Nine corrections are +60 to +60.88 seconds; Plumpton is -119.45 seconds and belongs to the generic slow-time guard.",
    "Two exact peers permit a targeted diagnostic, not source-error confirmation. One peer is insufficient; no supported fallback exists in the integrity references.",
    "This snapshot covers stored timed Sporting Life Jump races through its latest date, not the unobserved remainder of 2026. Chronological references may differ from a full-batch production cutoff.",
    "Known repaired times, raw payloads, frozen records, models, caps and settlement are untouched. Guard version invalidates incompatible Jump cache reads; this script does not rebuild caches."],
};
const yes = (v: boolean) => v ? "yes" : "no";
const table = ["| Source race | Course / country | Original | Corrected | Difference (s) | Generic | Missing minute | Combined | Peers |", "|---|---|---|---|---:|---|---|---|---:|",
  ...confirmed.map((r) => `| ${r.sourceId} ${r.date} ${r.sourceRace} | ${r.course} / ${r.country} | ${r.originalBadTime} | ${r.correctedTime} | ${r.differenceSeconds.toFixed(2)} | ${yes(r.existingGuardCaught)} | ${yes(r.missingMinuteGuardCaught)} | ${yes(r.combinedGuardCaught)} | ${r.sampleSize} |`)];
const md = ["# Jump missing-minute integrity check", "", "## Confirmed Error Pattern", "Nine confirmed fast errors fit a missing-minute pattern. Plumpton is a separate slow-time error; the assumption that all ten are +60s errors is incorrect.", "", "## Difference in Seconds", ...table, "", "## Existing Guard Coverage", `${summary.existingGuardCaught} / 10, unchanged generic median/MAD thresholds and five-peer minimum.`, "", "## Missing-Minute Guard Coverage", `${summary.knownConfirmedErrorsCaught} / 10. Policy: ${JSON.stringify(MISSING_MINUTE_POLICY)}. Candidate = stored + 60; this is a diagnostic, never a replacement time. Absolute and relative improvement plus candidate robust plausibility must all pass. The 45–85s reference deficit window tolerates ordinary standard-versus-corroborated-time differences.`, "", "## Combined Coverage", `${summary.combinedGuardCaught} / 10.`, "", "## False Positives", `${summary.totalRacesChecked} timed races checked; ${summary.usableStoredTimes} usable; ${summary.exactReferenceEligible} with at least two exact peers. ${summary.totalFlagged} missing-minute flags; ${summary.knownConfirmedErrorsCaught} known errors; ${summary.otherRacesFlagged} non-confirmed flags; ${(summary.proportionFlagged * 100).toFixed(3)}% flagged. These other flags are unconfirmed review candidates, not established errors or proven false positives.`,
  `Current corrected-value replay: ${currentResults.length} races checked, ${currentFlags.length} flags (${(report.currentStoredTimes.proportionFlagged * 100).toFixed(3)}%), ${report.currentStoredTimes.knownConfirmedFlagged} repaired races flagged, ${report.currentStoredTimes.otherRacesFlagged} unconfirmed flags.`,
  ...otherFlags.map((r) => `- ${r.sourceId}: ${r.date} ${r.course}, ${r.raceName}; stored ${r.storedTime}; reference ${r.standardSeconds?.toFixed(2)}s (${r.sampleSize} peers); +60 residual ${r.missingMinute.candidateResidualSeconds?.toFixed(2)}s; REVIEW.`), "", "## Sparse Reference Cases", ...report.sparseReferenceCases.map((r) => `- ${r.sourceId} ${r.course}: ${r.sampleSize} exact peers; ${r.missingMinute.classification}; generic ${yes(r.genericShouldWithhold)}.`),
  "No nearby-distance or broader-course fallback is supported by the current integrity infrastructure. None was added. Navan's one-peer case remains uncovered. Killarney also remains uncovered: +60s is still 24.10s fast (3.66 robust deviations) against its tight two-peer reference. Doncaster fails the 40s improvement minimum and Ballinrobe fails candidate robust plausibility; both are caught by the generic guard. Independent repairs remain necessary.", "", "## Wexford", `Stored ${wexford.storedTime} (${report.wexford.storedSeconds}s). Prior audit reports Irishracing repeating the same time: difference 0s, no trusted replacement. Chronological reference ${wexford.standardSeconds}s; deficit ${wexford.missingMinute.deficitSeconds?.toFixed(2)}s; stored +60 = ${wexford.missingMinute.candidatePlus60}s; residual ${wexford.missingMinute.candidateResidualSeconds?.toFixed(2)}s. Missing-minute rule: ${wexford.missingMinute.classification}. ${report.wexford.classification}`, "", "## Recommendation", "KEEP the secondary withholding diagnostic, alongside the generic guard. Manually corroborate all new flags; never add 60 seconds automatically. Retain the two-peer minimum and leave unsupported sparse cases to review.", "", report.method, ...report.limitations.map((s) => `- ${s}`), "", `Input: ${inputPath}; SHA-256 ${report.source.sha256}; stored race dates ${report.source.earliestChecked} through ${report.source.latestChecked}.`, ""];
await writeFile("/tmp/jump-missing-minute-integrity-check.json", JSON.stringify(report, null, 2) + "\n");
await writeFile("/tmp/jump-missing-minute-integrity-check.md", md.join("\n"));
console.log(`CONFIRMED ERRORS:\n${confirmed.length}\n\nEXISTING GUARD CAUGHT:\n${summary.existingGuardCaught} / 10\n\nMISSING-MINUTE GUARD CAUGHT:\n${summary.knownConfirmedErrorsCaught} / 10\n\nCOMBINED GUARD CAUGHT:\n${summary.combinedGuardCaught} / 10\n\nOTHER 2025/2026 RACES FLAGGED:\n${otherFlags.length}\n\nWEXFORD:\n${report.wexford.classification}\n\nRecommended action:\n${report.recommendation}`);
console.table(otherFlags.map((r) => ({ sourceId: r.sourceId, date: r.date, course: r.course, storedTime: r.storedTime, peers: r.sampleSize, standard: r.standardSeconds, classification: "REVIEW (unconfirmed)" })));

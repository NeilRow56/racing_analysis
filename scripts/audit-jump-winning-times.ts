import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { getJumpSpeedRatingsForRunners } from "@/lib/racing/jump-speed-ratings";
import { isJumpRace } from "@/lib/racing/jump-speed-rating";
import { getTodaysRacingData, type TodayRace } from "@/lib/racing/todays-racing";
import { loadJumpTissueModel, predictJumpTissue } from "@/lib/racing/jump-tissue-model";
import { loadJumpTissueCommentsForRaces } from "@/lib/racing/jump-tissue-sync";
import { summarizeBookmakerMarket } from "@/lib/racing/forward-value";
import { NEWCASTLE_WINNING_TIME_CORRECTION, validateNewcastleCorrection } from "@/lib/racing/jump-winning-time-integrity";

const connection = createDbConnection();
const { client, db } = connection;
const phase = process.argv[2] ?? "before";
if (!["before", "repair", "after"].includes(phase)) throw new Error("Usage: audit-jump-winning-times.ts <before|repair|after>");
const save = (path: string, value: unknown) => writeFile(path, JSON.stringify(value, null, 2) + "\n", phase === "before" ? { flag: "wx" } : {});
async function hashes() {
  const files = (await readdir("data/research")).filter((name) => /forward|tracker/.test(name) && name.endsWith(".json"));
  return Object.fromEntries(await Promise.all(files.map(async (name) => [name, createHash("sha256").update(await readFile(`data/research/${name}`)).digest("hex")])));
}
async function current() {
  const today = await getTodaysRacingData(db, "2026-10-14", { raceFilter: (race) => race.runners.some((r) => r.horseName === "Josh The Boss") });
  if (today.status !== "ok") return today;
  const meeting = today.meetings.find((m) => m.races.some((r) => r.runners.some((h) => h.horseName === "Josh The Boss")))!;
  const race = meeting.races.find((r) => r.runners.some((h) => h.horseName === "Josh The Boss"))!;
  const comments = await loadJumpTissueCommentsForRaces(client, [race]);
  const book = predictJumpTissue(race, comments, await loadJumpTissueModel());
  const runner = race.runners.find((r) => r.horseName === "Josh The Boss")!;
  const prediction = book.runners.find((r) => r.runnerId === runner.runnerId)!;
  const market = summarizeBookmakerMarket(runner.bookmakerQuotes);
  return { course: meeting.courseName, race, book, josh: { runner, prediction, market,
    currentTissuePositiveEdge: prediction.probability !== null && market.impliedProbability !== null ? prediction.probability > market.impliedProbability : null,
    g4Components: g4(race, runner.runnerId),
  } };
}
function g4(race: TodayRace, runnerId: string) {
  const runner = race.runners.find((r) => r.runnerId === runnerId)!;
  const rated = race.runners.filter((r) => r.resultStatus !== "non_runner" && r.metrics?.averageJumpSpeedLast3 != null);
  const avg = runner.metrics?.averageJumpSpeedLast3 ?? null;
  return { averageL3Rank: avg === null ? null : 1 + rated.filter((r) => r.metrics!.averageJumpSpeedLast3! > avg).length,
    latest: runner.metrics?.latestJumpSpeedRating, previous: runner.metrics?.previousJumpSpeedRating, currentClass: race.raceClass };
}
try {
  if (phase === "repair") {
    const before = JSON.parse(await readFile("/tmp/newcastle-904023-speed-repair-before.json", "utf8"));
    const provenance = { ...NEWCASTLE_WINNING_TIME_CORRECTION, raceId: before.race.id,
      independentSource: "https://www.racingpost.com/results/37/newcastle/2026-02-21/911617",
      rawPayloadPreserved: true, authoritativeField: "races.winning_time", appliedAt: new Date().toISOString() };
    await writeFile("data/research/newcastle-904023-winning-time-correction.json", JSON.stringify(provenance, null, 2) + "\n", { flag: "wx" });
    await client.begin(async (tx) => {
      const locked = await tx`select * from races where id=${before.race.id} for update`;
      const row = locked[0]!;
      const corrected = validateNewcastleCorrection({ source: row.source, source_id: row.source_id, race_date: row.race_date, winning_time: row.winning_time });
      const updated = await tx`update races set winning_time=${corrected} where id=${before.race.id} and winning_time=${NEWCASTLE_WINNING_TIME_CORRECTION.original} returning *`;
      if (updated.length !== 1) throw new Error("Expected exactly one race update");
      for (const key of Object.keys(row)) if (key !== "winning_time" && JSON.stringify(row[key]) !== JSON.stringify(updated[0]![key])) throw new Error(`Unexpected change to ${key}`);
      const raw = await tx`select * from source_imports where source='sporting_life' and source_id='904023'`;
      if (JSON.stringify(raw) !== JSON.stringify(before.sourceImports)) throw new Error("Raw payload changed");
    });
    console.log("Repaired exactly one authoritative winning_time; raw source unchanged");
  }
  const race = (await client`select r.*, c.display_name as course from races r join courses c on c.id=r.course_id where r.source='sporting_life' and r.source_id='904023'`)[0]!;
  const runners = await client`select rr.*, h.display_name as horse from race_runners rr join horses h on h.id=rr.horse_id where rr.race_id=${race.id} order by rr.finishing_position nulls last`;
  const ratings = await getJumpSpeedRatingsForRunners(db, runners.map((r) => String(r.id)));
  const sourceImports = await client`select * from source_imports where source='sporting_life' and source_id='904023'`;
  const state = { race, runners: runners.map((r) => ({ ...r, jumpSpeed: ratings.get(String(r.id)) })), sourceImports,
    current: await current(), prospectiveHashes: await hashes(), storedJumpMetricTables: [], note: "No stored Jump speed metric table; derived on read. Backtest caches inventoried separately." };
  if (phase !== "before") {
    const before = JSON.parse(await readFile("/tmp/newcastle-904023-speed-repair-before.json", "utf8"));
    const drift = Object.keys(before.prospectiveHashes).filter((name) => state.prospectiveHashes[name] !== before.prospectiveHashes[name]);
    if (drift.length) console.log(`Concurrent tracker file drift detected (this script never writes trackers): ${drift.join(", ")}`);
    if (JSON.stringify(sourceImports) !== JSON.stringify(before.sourceImports)) throw new Error("Raw imports changed during audit");
    for (const old of before.runners) {
      const original = { ...old }; delete original.jumpSpeed;
      const now = runners.find((r) => r.id === old.id);
      if (JSON.stringify(original) !== JSON.stringify(now)) throw new Error(`Runner source data changed: ${old.id}`);
    }
    for (const key of Object.keys(before.race)) if (key !== "winning_time" && JSON.stringify(before.race[key]) !== JSON.stringify(race[key])) throw new Error(`Race metadata changed: ${key}`);
    console.log(`Verified: all runner fields, race metadata and raw imports unchanged; ${Object.keys(state.prospectiveHashes).length - drift.length} tracker hashes still match initial snapshot`);
  }
  await save(`/tmp/newcastle-904023-speed-repair-${phase === "repair" ? "after" : phase === "after" ? "verified" : phase}.json`, state);
  console.log(JSON.stringify({ race, runners: runners.map((r) => ({ horse: r.horse, speed: ratings.get(String(r.id)) })), current: state.current }, null, 2));
  if (phase === "before") {
    console.log("Computing all 2025/2026 Jump ratings, grouped by source race...");
    const all = await client`select r.*, c.display_name as course from races r join courses c on c.id=r.course_id where r.source='sporting_life' and r.race_date between '2025-01-01' and '2026-12-31' and r.winning_time is not null`;
    const jumps = all.filter((r) => isJumpRace({ raceName: String(r.race_name ?? ''), raceType: String(r.race_type ?? '') }));
    const ids = jumps.map((r) => r.id);
    const allRunners = await client`select rr.id, rr.race_id, rr.horse_id, rr.finishing_position, rr.result_status, h.display_name as horse from race_runners rr join horses h on h.id=rr.horse_id where rr.race_id in ${client(ids)}`;
    const allRatings = await getJumpSpeedRatingsForRunners(db, allRunners.map((r) => String(r.id)));
    const grouped = new Map<string, unknown[]>();
    for (const r of allRunners) grouped.set(String(r.race_id), [...(grouped.get(String(r.race_id)) ?? []), { ...r, speed: allRatings.get(String(r.id)) }]);
    await save("/tmp/jump-winning-time-audit-before-ratings.json", { races: jumps.map((r) => ({ ...r, runners: grouped.get(String(r.id)) ?? [] })), totalRaces: jumps.length, totalRunners: allRunners.length });
    console.log(`Saved ${jumps.length} races / ${allRunners.length} runners`);
  }
} finally { await client.end(); }

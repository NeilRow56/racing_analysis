import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { winningTimeCorrections, correctedWinningTime } from "@/lib/racing/winning-time-corrections";
import { getJumpSpeedRatingsForRunners } from "@/lib/racing/jump-speed-ratings";
import { isJumpRace } from "@/lib/racing/jump-speed-rating";
import { calculateWeightAdjustedPerformance } from "@/lib/racing/weight-performance";

const mode = process.argv[2];
if (!["before", "repair", "source-after", "after"].includes(mode)) throw new Error("Expected before|repair|source-after|after");
const connection = createDbConnection();
const { client, db } = connection;
async function frozenHashes() {
  const names = (await readdir("data/research")).filter((n) => /forward|tracker|model/.test(n) && n.endsWith(".json"));
  return Object.fromEntries(await Promise.all(names.map(async (n) => [n, createHash("sha256").update(await readFile(`data/research/${n}`)).digest("hex")])));
}
try {
  const ids = winningTimeCorrections.map((c) => c.sourceId);
  console.table(winningTimeCorrections.map((c) => ({ sourceId: c.sourceId, date: c.raceDate, course: c.course, original: c.original, corrected: c.corrected })));
  if (mode === "repair") {
    const before = JSON.parse(await readFile("/tmp/jump-winning-time-repairs-before.json", "utf8"));
    const appliedAt = new Date().toISOString();
    const applied = await client.begin(async (tx) => {
      const locked = await tx`select * from races where source='sporting_life' and source_id in ${tx(ids)} order by source_id for update`;
      assert.equal(locked.length, 10);
      const results = [];
      for (const row of locked) {
        const old = before.races.find((r: { source_id: string }) => r.source_id === row.source_id);
        assert.deepEqual(row, old);
        const corrected = correctedWinningTime(row.source_id, row.race_date, row.winning_time);
        if (row.winning_time === corrected) { results.push({ sourceId: row.source_id, status: "already_repaired", verifiedAt: appliedAt, originalCorrectionRecord: "data/research/newcastle-904023-winning-time-correction.json" }); continue; }
        const updated = await tx`update races set winning_time=${corrected} where id=${row.id} and winning_time=${row.winning_time} returning *`;
        assert.equal(updated.length, 1);
        assert.deepEqual(updated[0], { ...row, winning_time: corrected });
        results.push({ sourceId: row.source_id, status: "repaired_now", appliedAt });
      }
      const raw = await tx`select * from source_imports where source='sporting_life' and source_id in ${tx(ids)} order by source_id, source_type`;
      assert.deepEqual(raw, before.rawImports);
      return results;
    });
    await writeFile("data/corrections/jump-winning-time-repairs-applied.json", JSON.stringify({ version: "jump_winning_time_corrections_v1", applied }, null, 2) + "\n");
    console.log(JSON.stringify(applied, null, 2));
  } else {
    const races = await client`select * from races where source='sporting_life' and source_id in ${client(ids)} order by source_id`;
    const rawImports = await client`select * from source_imports where source='sporting_life' and source_id in ${client(ids)} order by source_id, source_type`;
    const runners = await client`select rr.*, h.display_name as horse from race_runners rr join races r on r.id=rr.race_id join horses h on h.id=rr.horse_id where r.source='sporting_life' and r.source_id in ${client(ids)} order by rr.id`;
    const speeds = await getJumpSpeedRatingsForRunners(db, runners.map((r) => String(r.id)), { calculationCutoffDateTime: new Date("2026-10-15T00:00:00Z") });
    const snapshots = runners.map((r) => ({ ...r, jumpSpeed: speeds.get(String(r.id)), todaysRatingInputs: { weightCarriedLb: r.weight_carried_lbs, historicalPerformance: calculateWeightAdjustedPerformance({ rawSpeedRating: speeds.get(String(r.id))?.rating ?? null, weightCarriedLb: r.weight_carried_lbs }) } }));
    const frozen = await frozenHashes();
    const state = { generatedAt: new Date().toISOString(), races, rawImports, runners: snapshots, frozen };
    if (mode !== "before") {
      const before = JSON.parse(await readFile("/tmp/jump-winning-time-repairs-before.json", "utf8"));
      assert.deepEqual(rawImports, before.rawImports);
      for (const race of races) assert.deepEqual(race, { ...before.races.find((r: { id: string }) => r.id === race.id), winning_time: correctedWinningTime(race.source_id, race.race_date, race.winning_time) });
      for (const runner of runners) {
        const old = { ...before.runners.find((r: { id: string }) => r.id === runner.id) };
        delete old.jumpSpeed; delete old.todaysRatingInputs;
        assert.deepEqual(runner, old);
      }
      const drift = Object.keys(frozen).filter((n) => frozen[n] !== before.frozen[n]);
      console.log(`Tracker/model hash drift (script never writes these): ${drift.join(", ") || "none"}`);
    }
    await writeFile(`/tmp/jump-winning-time-repairs-${mode}.json`, JSON.stringify(state, null, 2) + "\n", { flag: "wx" });
    const all = await client`select r.*, c.display_name as course from races r join courses c on c.id=r.course_id where r.source='sporting_life' and r.winning_time is not null and r.race_date <= '2026-10-15'`;
    const jumps = all.filter((r) => isJumpRace({ raceName: r.race_name, raceType: r.race_type }));
    const rows = await client`select rr.id, rr.race_id, rr.horse_id, rr.finishing_position, rr.result_status, h.display_name as horse from race_runners rr join races r on r.id=rr.race_id join horses h on h.id=rr.horse_id where r.source='sporting_life' and r.race_date between '2025-01-01' and '2026-12-31' and r.winning_time is not null`;
    const jumpIds = new Set(jumps.map((r) => r.id));
    const targets = rows.filter((r) => jumpIds.has(r.race_id));
    const ratings = await getJumpSpeedRatingsForRunners(db, targets.map((r) => String(r.id)), { calculationCutoffDateTime: new Date("2026-10-15T00:00:00Z") });
    await writeFile(`/tmp/jump-winning-time-distribution-${mode}.json`, JSON.stringify({ races: jumps, runners: targets.map((r) => ({ ...r, speed: ratings.get(String(r.id)) })) }) + "\n", { flag: "wx" });
    console.log(`Saved ${mode}: ${races.length} confirmed race snapshots; ${targets.length} distribution runners`);
  }
} finally { await client.end(); }

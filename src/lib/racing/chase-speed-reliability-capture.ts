import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { classifyJumpRaceSubtype } from "./jump-speed-rating";
import { classifyHandicapStatus } from "./research-rule";
import { descendingRanks } from "./descending-ranks";
import { CHASE_SPEED_RELIABILITY_EPOCH, type ChaseSpeedState } from "./chase-speed-reliability-shadow";
import type { TodayRace } from "./todays-racing";
import type { ProspectiveTissueObservation } from "./tissue-prospective-summary";

export const CHASE_SPEED_SNAPSHOT_DIRECTORY = "data/research/chase-speed-reliability-shadow-v1";
export type ChaseSpeedSnapshot = { cohort: "primary" | "price"; raceId: string; capturedAt: string; frozenAt: string; runners: ChaseSpeedState[] };
const identity = (s: Pick<ChaseSpeedSnapshot, "cohort" | "raceId" | "capturedAt">) => `${s.cohort}|${s.raceId}|${s.capturedAt}`;
/** Called only for a newly accepted book while its existing tracker lock is held. Never reconstruct old captures. */
export async function freezeChaseSpeedState(input: {
  cohort: ChaseSpeedSnapshot["cohort"]; raceId: string; capturedAt: string; race: TodayRace;
  featureNames: readonly string[]; runners: readonly { runnerId: string; modelInputs?: readonly number[] | null; marketRank?: number; modelMarketRatio?: number; rank?: number | null; tissueRank?: number | null }[];
}, directory = CHASE_SPEED_SNAPSHOT_DIRECTORY, now = new Date()) {
  const at = Date.parse(input.capturedAt);
  if (classifyJumpRaceSubtype(input.race) !== "chase" || !Number.isFinite(now.getTime()) || !Number.isFinite(at) || at < Date.parse(CHASE_SPEED_RELIABILITY_EPOCH) || !input.race.raceDateTime || now >= input.race.raceDateTime || at > now.getTime() || now.getTime() - at > 60_000) return;
  const value = (r: typeof input.runners[number], name: string) => {
    const i = input.featureNames.indexOf(name), missing = input.featureNames.indexOf(`${name}_missing`);
    return i < 0 || r.modelInputs?.length !== input.featureNames.length || (missing >= 0 && r.modelInputs[missing] !== 0) || !Number.isFinite(r.modelInputs[i]) ? null : r.modelInputs[i];
  };
  const ranks = descendingRanks(input.runners, r => value(r, "official_rating"));
  const snapshot: ChaseSpeedSnapshot = { cohort: input.cohort, raceId: input.raceId, capturedAt: input.capturedAt, frozenAt: now.toISOString(),
    runners: input.runners.filter(r => (r.tissueRank ?? r.rank) === 1 || (r.tissueRank ?? r.rank) === 2).map(r => {
      const metrics = input.race.runners.find(t => t.runnerId === r.runnerId)?.metrics;
      const handicap = classifyHandicapStatus({ raceName: null, raceType: input.race.raceType, raceTypeCode: input.race.raceTypeCode });
      return { runnerId: r.runnerId, reliability: metrics?.jumpSpeedReliability ?? null,
        handicap: handicap === "handicap" ? true : handicap === "non_handicap" ? false : null, orRank: ranks.get(r.runnerId) ?? null,
        marketRank: r.marketRank ?? null, modelMarketRatio: r.modelMarketRatio ?? null };
    }) };
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${createHash("sha256").update(identity(snapshot)).digest("hex")}.json`);
  // Caller holds the cohort's lock; retries retain the first frozen state.
  try { await readFile(path); return; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(snapshot) + "\n");
  await rename(temporary, path);
}
export async function loadChaseSpeedSnapshots(directory = CHASE_SPEED_SNAPSHOT_DIRECTORY): Promise<ChaseSpeedSnapshot[]> {
  try { return await Promise.all((await readdir(directory)).filter(f => f.endsWith(".json")).sort().map(async f => JSON.parse(await readFile(join(directory, f), "utf8")) as ChaseSpeedSnapshot)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
export function attachChaseSpeedState(rows: ProspectiveTissueObservation[], snapshots: ChaseSpeedSnapshot[], cohort: ChaseSpeedSnapshot["cohort"]) {
  const states = new Map(snapshots.filter(s => s.cohort === cohort).flatMap(s => s.runners.map(r => [`${identity(s)}|${r.runnerId}`, r] as const)));
  return rows.map(r => ({ ...r, ...states.get(`${cohort}|${r.raceId}|${r.capturedAt}|${r.runnerId}`) }));
}

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { TodayMeeting, TodayRace, TodayRunner } from "./todays-racing";
import { isAllWeatherRaceForDisplay } from "./todays-racing";

export const AW_FORWARD_VERSION = "aw_forward_comparisons_v1";
export const AW_FORWARD_START_DATE = "2026-09-18";
export const AW_FORWARD_DATA_PATH = "data/research/aw-forward-comparisons.json";

export const AW_COMPARISONS = [
  { id: "wolverhampton_sprint_draw_1_3", label: "Wolverhampton sprint - Draw 1-3", course: "Wolverhampton", distance: "sprint", drawMin: 1, drawMax: 3 },
  { id: "wolverhampton_sprint_draw_1_3_speed_rank_1", label: "Wolverhampton sprint - Draw 1-3 + Best L3 Speed rank 1", course: "Wolverhampton", distance: "sprint", drawMin: 1, drawMax: 3, speedRankMax: 1 },
  { id: "wolverhampton_sprint_draw_1_3_speed_top_2", label: "Wolverhampton sprint - Draw 1-3 + Best L3 Speed top 2", course: "Wolverhampton", distance: "sprint", drawMin: 1, drawMax: 3, speedRankMax: 2 },
  { id: "wolverhampton_sprint_draw_7_plus", label: "Wolverhampton sprint - Draw 7+", course: "Wolverhampton", distance: "sprint", drawMin: 7 },
  { id: "newcastle_middle_distance_low_draw", label: "Newcastle middle distance - low draw", course: "Newcastle", distance: "middle distance", drawMin: 1, drawMax: 3 },
  { id: "kempton_middle_distance_low_draw", label: "Kempton middle distance - low draw", course: "Kempton", distance: "middle distance", drawMin: 1, drawMax: 3 },
  { id: "southwell_staying_low_draw", label: "Southwell staying - low draw", course: "Southwell", distance: "staying", drawMin: 1, drawMax: 3 },
] as const;

export type AwComparisonId = (typeof AW_COMPARISONS)[number]["id"];

export type AwForwardRecord = {
  key: string;
  raceKey: string;
  runnerKey: string;
  raceDate: string;
  course: string;
  raceTime: string;
  scheduledAt: string;
  distanceYards: number;
  fieldSize: number;
  draw: number;
  horse: string;
  bestL3Speed: number | null;
  bestL3SpeedRank: number | null;
  comparisonIds: AwComparisonId[];
  recordedAt: string;
  recordedPreRace: boolean;
  finishingPosition: number | null;
  won: boolean | null;
  finalSp: number | null;
  capped20Return: number | null;
  uncappedReturn: number | null;
  settledAt: string | null;
};

export type AwForwardData = { version: typeof AW_FORWARD_VERSION; records: AwForwardRecord[] };

export type AwComparisonSummary = {
  id: AwComparisonId;
  label: string;
  races: number;
  selections: number;
  pending: number;
  settled: number;
  winners: number;
  strike: number | null;
  uncappedRoi: number | null;
  capped20Roi: number | null;
  ae: number | null;
  averageWinningSp: number | null;
};

export function awDistanceBand(yards: number | null) {
  return yards === null ? "unknown" : yards <= 1320 ? "sprint" : yards <= 1760 ? "mile-ish" : yards <= 2640 ? "middle distance" : "staying";
}

export function bestL3SpeedRanks(runners: TodayRunner[]) {
  const ranked = runners
    .filter((runner) => runner.resultStatus !== "non_runner" && runner.metrics?.bestAwSpeedLast3 !== null && runner.metrics?.bestAwSpeedLast3 !== undefined)
    .map((runner) => ({ id: runner.runnerId, value: runner.metrics!.bestAwSpeedLast3! }))
    .sort((left, right) => right.value - left.value || left.id.localeCompare(right.id));
  const result = new Map<string, number>();
  let priorValue: number | null = null;
  let priorRank = 0;
  ranked.forEach((item, index) => {
    const rank = item.value === priorValue ? priorRank : index + 1;
    result.set(item.id, rank);
    priorValue = item.value;
    priorRank = rank;
  });
  return result;
}

export function comparisonIdsFor(input: { course: string; distanceYards: number; draw: number; bestL3SpeedRank: number | null }): AwComparisonId[] {
  const band = awDistanceBand(input.distanceYards);
  return AW_COMPARISONS.filter((definition) =>
    definition.course === input.course &&
    definition.distance === band &&
    input.draw >= definition.drawMin &&
    (!("drawMax" in definition) || input.draw <= definition.drawMax) &&
    (!("speedRankMax" in definition) || (input.bestL3SpeedRank !== null && input.bestL3SpeedRank <= definition.speedRankMax))
  ).map((definition) => definition.id);
}

export function buildAwForwardRecords(meetings: TodayMeeting[], raceDate: string, recordedAt = new Date()) {
  if (raceDate < AW_FORWARD_START_DATE) return [];
  const records: AwForwardRecord[] = [];
  for (const meeting of meetings) for (const race of meeting.races) {
    if (!isAllWeatherRaceForDisplay({ ...race, courseName: meeting.courseName, courseSourceId: meeting.courseSourceId })) continue;
    if (!race.raceDateTime || recordedAt >= race.raceDateTime || race.distanceYards === null) continue;
    const ranks = bestL3SpeedRanks(race.runners);
    const fieldSize = race.actualRunnerCount ?? race.declaredRunnerCount ?? race.runners.filter((runner) => runner.resultStatus !== "non_runner").length;
    for (const runner of race.runners) {
      if (runner.resultStatus === "non_runner" || runner.draw === null) continue;
      const rank = ranks.get(runner.runnerId) ?? null;
      const comparisonIds = comparisonIdsFor({ course: meeting.courseName, distanceYards: race.distanceYards, draw: runner.draw, bestL3SpeedRank: rank });
      if (!comparisonIds.length) continue;
      records.push(createRecord(meeting, race, runner, raceDate, fieldSize, rank, comparisonIds, recordedAt));
    }
  }
  return records;
}

function createRecord(meeting: TodayMeeting, race: TodayRace, runner: TodayRunner, raceDate: string, fieldSize: number, rank: number | null, comparisonIds: AwComparisonId[], recordedAt: Date): AwForwardRecord {
  return {
    key: `${race.raceId}|${runner.runnerId}`,
    raceKey: race.raceId,
    runnerKey: runner.runnerId,
    raceDate,
    course: meeting.courseName,
    raceTime: race.scheduledTime?.slice(0, 5) ?? race.raceDateTime!.toISOString().slice(11, 16),
    scheduledAt: race.raceDateTime!.toISOString(),
    distanceYards: race.distanceYards!,
    fieldSize,
    draw: runner.draw!,
    horse: runner.horseName,
    bestL3Speed: runner.metrics?.bestAwSpeedLast3 ?? null,
    bestL3SpeedRank: rank,
    comparisonIds,
    recordedAt: recordedAt.toISOString(),
    recordedPreRace: recordedAt < race.raceDateTime!,
    finishingPosition: null,
    won: null,
    finalSp: null,
    capped20Return: null,
    uncappedReturn: null,
    settledAt: null,
  };
}

export function upsertAwForwardRecords(data: AwForwardData, incoming: AwForwardRecord[]): AwForwardData {
  const records = new Map(data.records.map((record) => [record.key, record]));
  for (const record of incoming) if (!records.has(record.key)) records.set(record.key, record);
  return { version: AW_FORWARD_VERSION, records: [...records.values()].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.key.localeCompare(b.key)) };
}

export function settleAwForwardRecords(data: AwForwardData, meetings: TodayMeeting[], settledAt = new Date()): AwForwardData {
  const runners = new Map<string, TodayRunner>();
  for (const meeting of meetings) for (const race of meeting.races) for (const runner of race.runners) runners.set(`${race.raceId}|${runner.runnerId}`, runner);
  return {
    version: AW_FORWARD_VERSION,
    records: data.records.map((record) => {
      const runner = runners.get(record.key);
      const finalSp = decimalOdds(runner?.oddsDecimal ?? null);
      if (!runner || runner.resultStatus === "non_runner" || runner.finishingPosition === null || finalSp === null) return record;
      const won = runner.finishingPosition === 1;
      const capped20Return = won ? Math.min(finalSp, 21) : 0;
      const uncappedReturn = won ? finalSp : 0;
      if (record.finishingPosition === runner.finishingPosition && record.won === won && record.finalSp === finalSp && record.capped20Return === capped20Return && record.uncappedReturn === uncappedReturn) return record;
      return { ...record, finishingPosition: runner.finishingPosition, won, finalSp, capped20Return, uncappedReturn, settledAt: settledAt.toISOString() };
    }),
  };
}

export function summarizeAwForward(data: AwForwardData, clean = true): AwComparisonSummary[] {
  const source = data.records.filter((record) => record.recordedPreRace === clean);
  return AW_COMPARISONS.map((definition) => {
    const records = source.filter((record) => record.comparisonIds.includes(definition.id));
    const settled = records.filter((record) => record.finalSp !== null && record.won !== null);
    const winners = settled.filter((record) => record.won);
    const expected = settled.reduce((sum, record) => sum + 1 / record.finalSp!, 0);
    return {
      id: definition.id,
      label: definition.label,
      races: new Set(records.map((record) => record.raceKey)).size,
      selections: records.length,
      pending: records.length - settled.length,
      settled: settled.length,
      winners: winners.length,
      strike: ratio(winners.length, settled.length),
      uncappedRoi: ratio(settled.reduce((sum, record) => sum + record.uncappedReturn!, 0) - settled.length, settled.length),
      capped20Roi: ratio(settled.reduce((sum, record) => sum + record.capped20Return!, 0) - settled.length, settled.length),
      ae: ratio(winners.length, expected),
      averageWinningSp: ratio(winners.reduce((sum, record) => sum + record.finalSp!, 0), winners.length),
    };
  });
}

export function renderAwForwardReport(data: AwForwardData) {
  const clean = summarizeAwForward(data, true);
  const backfilled = summarizeAwForward(data, false);
  const lines = ["# AW Forward Comparisons", "", `Forward start: ${AW_FORWARD_START_DATE}. Best L3 Speed uses the AW family field \`bestAwSpeedLast3\`; ranks use race-local competition ranking, higher first.`, "", "## Clean pre-race sample", "", table(clean)];
  if (data.records.some((record) => !record.recordedPreRace)) lines.push("", "## Post-race/backfilled (excluded)", "", table(backfilled));
  const byId = new Map(clean.map((item) => [item.id, item]));
  const baseline = byId.get("wolverhampton_sprint_draw_1_3")!;
  lines.push("", "## Wolverhampton comparison", "", "Incremental values are descriptive only; no population is selected as a winner.", "", "| Comparison | Strike vs Draw 1-3 | A/E vs Draw 1-3 |", "|---|---:|---:|");
  for (const id of ["wolverhampton_sprint_draw_1_3_speed_rank_1", "wolverhampton_sprint_draw_1_3_speed_top_2", "wolverhampton_sprint_draw_7_plus"] as AwComparisonId[]) {
    const item = byId.get(id)!;
    lines.push(`| ${item.label} | ${difference(item.strike, baseline.strike, true)} | ${difference(item.ae, baseline.ae)} |`);
  }
  lines.push("", `Clean records: ${data.records.filter((record) => record.recordedPreRace).length}; pending: ${data.records.filter((record) => record.recordedPreRace && record.finalSp === null).length}; post-race/backfilled: ${data.records.filter((record) => !record.recordedPreRace).length}.`, "");
  return lines.join("\n");
}

function table(items: AwComparisonSummary[]) {
  return ["| Comparison | Races | Selections | Pending | Settled | Winners | Strike | ROI | ROI cap 20/1 | A/E | Avg winner SP |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|", ...items.map((item) => `| ${item.label} | ${item.races} | ${item.selections} | ${item.pending} | ${item.settled} | ${item.winners} | ${percent(item.strike)} | ${percent(item.uncappedRoi)} | ${percent(item.capped20Roi)} | ${number(item.ae)} | ${number(item.averageWinningSp)} |`)].join("\n");
}

export async function loadAwForwardData(path = AW_FORWARD_DATA_PATH): Promise<AwForwardData> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as AwForwardData;
    if (value.version !== AW_FORWARD_VERSION || !Array.isArray(value.records)) throw new Error(`Unsupported AW forward data in ${path}`);
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: AW_FORWARD_VERSION, records: [] };
    throw error;
  }
}

export async function syncAwForwardComparisons(meetings: TodayMeeting[], raceDate: string, now = new Date(), path = AW_FORWARD_DATA_PATH) {
  const existing = await loadAwForwardData(path);
  const captured = upsertAwForwardRecords(existing, buildAwForwardRecords(meetings, raceDate, now));
  const settled = settleAwForwardRecords(captured, meetings, now);
  if (JSON.stringify(settled) !== JSON.stringify(existing)) await writeAwForwardData(settled, path);
  return settled;
}

export async function writeAwForwardData(data: AwForwardData, path = AW_FORWARD_DATA_PATH) {
  await mkdir(dirname(resolve(path)), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

function decimalOdds(value: string | null) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 1 ? parsed : null; }
function ratio(numerator: number, denominator: number) { return denominator > 0 ? numerator / denominator : null; }
function percent(value: number | null) { return value === null ? "-" : `${(value * 100).toFixed(1)}%`; }
function number(value: number | null) { return value === null ? "-" : value.toFixed(3); }
function difference(value: number | null, baseline: number | null, percentage = false) { return value === null || baseline === null ? "-" : percentage ? `${((value - baseline) * 100).toFixed(1)}pp` : (value - baseline).toFixed(3); }

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TodayMeeting, TodayRace } from "./todays-racing";

const execFileAsync = promisify(execFile);

export const RESULT_REFRESH_BUFFER_MINUTES = 10;
export const RESULT_REFRESH_RETRY_MINUTES = 15;

export type EligibleResultRefreshRace = {
  race: TodayRace;
  courseName: string;
  resultUrl: string;
};

export type TodayResultRefreshOutcome = {
  raceId: string;
  sourceId: string;
  status: "imported" | "not_ready" | "failed";
  message: string | null;
};

export type TodayResultRefreshSummary = {
  eligible: number;
  attempted: number;
  imported: number;
  notReady: number;
  failed: number;
  outcomes: TodayResultRefreshOutcome[];
};

type RefreshRaceResult = (
  race: EligibleResultRefreshRace,
) => Promise<TodayResultRefreshOutcome>;

const recentResultChecks = new Map<string, Date>();

export function clearTodayResultRefreshChecksForTest() {
  recentResultChecks.clear();
}

export function getEligibleResultRefreshRaces(
  meetings: TodayMeeting[],
  raceDate: string,
  options: {
    now?: Date;
    forceRetry?: boolean;
  } = {},
): EligibleResultRefreshRace[] {
  const now = options.now ?? new Date();
  const eligible: EligibleResultRefreshRace[] = [];

  for (const meeting of meetings) {
    for (const race of meeting.races) {
      if (!raceHasFrozenRuleSelection(race) ||
          todayRaceHasStoredResult(race) ||
          !race.sourceId ||
          !isPastRefreshBuffer(race, raceDate, now) ||
          (!options.forceRetry && checkedRecently(race.sourceId, now))) {
        continue;
      }
      eligible.push({
        race,
        courseName: meeting.courseName,
        resultUrl: sportingLifeResultUrl(raceDate, meeting.courseName, race),
      });
    }
  }

  return eligible;
}

export async function refreshEligibleTodaySelectionResults(
  meetings: TodayMeeting[],
  raceDate: string,
  options: {
    now?: Date;
    forceRetry?: boolean;
    refreshRaceResult?: RefreshRaceResult;
  } = {},
): Promise<TodayResultRefreshSummary> {
  const now = options.now ?? new Date();
  const refreshRaceResult = options.refreshRaceResult ?? refreshSportingLifeRaceResult;
  const eligible = getEligibleResultRefreshRaces(meetings, raceDate, {
    now,
    forceRetry: options.forceRetry,
  });
  const outcomes: TodayResultRefreshOutcome[] = [];

  for (const race of eligible) {
    markChecked(race.race.sourceId!, now);
    try {
      const outcome = await refreshRaceResult(race);
      if (outcome.status === "failed") {
        logRefreshFailure(outcome.sourceId, outcome.message);
      }
      outcomes.push(outcome);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcomes.push({
        raceId: race.race.raceId,
        sourceId: race.race.sourceId!,
        status: "failed",
        message,
      });
      logRefreshFailure(race.race.sourceId!, message);
    }
  }

  return {
    eligible: eligible.length,
    attempted: outcomes.length,
    imported: outcomes.filter((outcome) => outcome.status === "imported").length,
    notReady: outcomes.filter((outcome) => outcome.status === "not_ready").length,
    failed: outcomes.filter((outcome) => outcome.status === "failed").length,
    outcomes,
  };
}

export async function refreshSportingLifeRaceResult(
  race: EligibleResultRefreshRace,
): Promise<TodayResultRefreshOutcome> {
  const pythonPath = "scraper/.venv/bin/python";
  const scriptPath = "scraper/scripts/refresh_sporting_life_race_result.py";
  const { stdout } = await execFileAsync(
    pythonPath,
    [
      scriptPath,
      "--url",
      race.resultUrl,
      "--race-id",
      race.race.sourceId!,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      timeout: 45_000,
      maxBuffer: 1024 * 1024,
    },
  );
  const result = parseRefreshScriptOutput(stdout);
  return {
    raceId: race.race.raceId,
    sourceId: race.race.sourceId!,
    status: result.status,
    message: result.message,
  };
}

function logRefreshFailure(sourceId: string, message: string | null) {
  console.warn(
    `Today result refresh failed for Sporting Life race ${sourceId}: ${message ?? "unknown error"}`,
  );
}

function parseRefreshScriptOutput(stdout: string): {
  status: TodayResultRefreshOutcome["status"];
  message: string | null;
} {
  const line = stdout
    .split(/\r?\n/)
    .find((value) => value.startsWith("REFRESH_RESULT "));
  if (!line) {
    return { status: "failed", message: "refresh script did not report a result" };
  }
  const parsed = JSON.parse(line.slice("REFRESH_RESULT ".length)) as {
    status?: string;
    message?: string | null;
  };
  if (parsed.status === "imported" || parsed.status === "not_ready") {
    return { status: parsed.status, message: parsed.message ?? null };
  }
  return { status: "failed", message: parsed.message ?? "unexpected refresh script status" };
}

function raceHasFrozenRuleSelection(race: TodayRace): boolean {
  return race.runners.some((runner) => (runner.savedRuleMatches?.length ?? 0) > 0);
}

function todayRaceHasStoredResult(race: TodayRace): boolean {
  return Boolean(
    nonBlank(race.winningTime) ||
      race.actualRunnerCount !== null ||
      race.runners.some((runner) =>
        runner.finishingPosition !== null ||
        Boolean(runner.resultStatus && runner.resultStatus !== "non_runner"),
      ),
  );
}

function isPastRefreshBuffer(race: TodayRace, raceDate: string, now: Date): boolean {
  const scheduledAt = race.raceDateTime ?? dateTimeFromRaceDateAndScheduledTime(
    raceDate,
    race.scheduledTime,
  );
  if (!scheduledAt) {
    return false;
  }
  return now.getTime() >= scheduledAt.getTime() + RESULT_REFRESH_BUFFER_MINUTES * 60_000;
}

function checkedRecently(sourceId: string, now: Date): boolean {
  const checkedAt = recentResultChecks.get(sourceId);
  if (!checkedAt) {
    return false;
  }
  return now.getTime() - checkedAt.getTime() < RESULT_REFRESH_RETRY_MINUTES * 60_000;
}

function markChecked(sourceId: string, now: Date) {
  recentResultChecks.set(sourceId, now);
}

function dateTimeFromRaceDateAndScheduledTime(
  raceDate: string,
  scheduledTime: string | null,
): Date | null {
  if (!scheduledTime) {
    return null;
  }
  const [hour, minute] = scheduledTime.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }
  return new Date(`${raceDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`);
}

function sportingLifeResultUrl(
  raceDate: string,
  courseName: string,
  race: TodayRace,
): string {
  return `https://www.sportinglife.com/racing/results/${raceDate}/${slugify(courseName)}/${race.sourceId}/${slugify(race.raceName ?? "race")}`;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "race";
}

function nonBlank(value: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

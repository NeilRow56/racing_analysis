import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  TRAINER_COHORT_MIN_SETTLED_RUNNERS,
  resolveTrainerCohortFromStandings,
  trainerCohortRule,
  type TrainerCohortStandingInput,
} from "./trainer-cohorts";

describe("trainer cohorts", () => {
  test("2025 cohort uses only 2024 races and excludes current-year leakage", () => {
    const cohort = resolveTrainerCohortFromStandings({
      rows: [
        ...runs("trainer-a", "A Trainer", "turf_flat", "2024-01-01", 60, 12),
        ...runs("trainer-b", "B Trainer", "turf_flat", "2024-01-01", 60, 10),
        ...runs("trainer-future", "Future Trainer", "turf_flat", "2025-01-01", 60, 60),
      ],
      definition: trainerCohortRule(10),
      family: "turf_flat",
      cohortYear: 2025,
    });

    assert.equal(cohort.referenceYear, 2024);
    assert.deepEqual(cohort.members.map((member) => member.trainerId), ["trainer-a", "trainer-b"]);
  });

  test("2026 cohort uses 2025 races and resolves a new member list", () => {
    const cohort = resolveTrainerCohortFromStandings({
      rows: [
        ...runs("trainer-2024", "Old Trainer", "jump", "2024-01-01", 60, 30),
        ...runs("trainer-2025", "New Trainer", "jump", "2025-01-01", 60, 20),
      ],
      definition: trainerCohortRule(10),
      family: "jump",
      cohortYear: 2026,
    });

    assert.equal(cohort.referenceYear, 2025);
    assert.deepEqual(cohort.members.map((member) => member.trainerId), ["trainer-2025"]);
  });

  test("ranking is family-specific with minimum runners and deterministic tie-breaks", () => {
    const cohort = resolveTrainerCohortFromStandings({
      rows: [
        ...runs("trainer-low-runs", "Low Runs", "jump", "2024-01-01", TRAINER_COHORT_MIN_SETTLED_RUNNERS - 1, 40),
        ...runs("trainer-aw", "AW Trainer", "all_weather_flat", "2024-01-01", 80, 80),
        ...runs("trainer-b", "B Trainer", "jump", "2024-01-01", 70, 20),
        ...runs("trainer-a", "A Trainer", "jump", "2024-01-01", 80, 20),
        ...runs("trainer-c", "C Trainer", "jump", "2024-01-01", 80, 18),
      ],
      definition: trainerCohortRule(10),
      family: "jump",
      cohortYear: 2025,
    });

    assert.deepEqual(
      cohort.members.map((member) => [member.rank, member.trainerId, member.priorYearRuns, member.priorYearWins]),
      [
        [1, "trainer-a", 80, 20],
        [2, "trainer-b", 70, 20],
        [3, "trainer-c", 80, 18],
      ],
    );
  });

  test("Top 10/20/30 membership uses stable trainer IDs", () => {
    const rows = Array.from({ length: 35 }, (_, index) =>
      runs(`trainer-${String(index + 1).padStart(2, "0")}`, `Trainer ${index + 1}`, "turf_flat", "2024-01-01", 55, 35 - index),
    ).flat();

    assert.equal(resolveTrainerCohortFromStandings({
      rows,
      definition: trainerCohortRule(10),
      family: "turf_flat",
      cohortYear: 2025,
    }).members.length, 10);
    assert.equal(resolveTrainerCohortFromStandings({
      rows,
      definition: trainerCohortRule(20),
      family: "turf_flat",
      cohortYear: 2025,
    }).members.length, 20);
    assert.equal(resolveTrainerCohortFromStandings({
      rows,
      definition: trainerCohortRule(30),
      family: "turf_flat",
      cohortYear: 2025,
    }).members.at(-1)?.trainerId, "trainer-30");
  });
});

function runs(
  trainerId: string,
  trainerName: string,
  family: TrainerCohortStandingInput["family"],
  raceDate: string,
  runCount: number,
  winCount: number,
): TrainerCohortStandingInput[] {
  return Array.from({ length: runCount }, (_, index) => ({
    trainerId,
    trainerName,
    family,
    raceDate,
    finishingPosition: index < winCount ? 1 : 2,
    resultStatus: "finished",
  }));
}

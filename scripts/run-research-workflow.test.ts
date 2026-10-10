import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  isValidDate,
  localDateString,
  nextLocalDateString,
  parseArgs,
  previousLocalDateString,
  runWorkflow,
  workflowSteps,
} from "./run-research-workflow";

const originalLog = console.log;
const originalError = console.error;

beforeEach(() => {
  console.log = () => undefined;
  console.error = () => undefined;
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
});

function commandLinesFor(mode: "night" | "morning" | "live" | "late" | "after", date = "2026-10-09") {
  return workflowSteps(mode, date).map((step) => [step.script, ...(step.args ?? [])].join(" "));
}

describe("research workflow wrapper", () => {
  test("runs the morning workflow commands in order", async () => {
    const calls: string[] = [];

    const result = await runWorkflow({ mode: "morning", date: "2026-10-09" }, async (step) => {
      calls.push([step.script, ...(step.args ?? [])].join(" "));
      return 0;
    });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(calls, [
      "sl:import-racecards 2026-10-09 --request-delay-seconds 2",
      "tpr:sync 2026-10-09",
      "tissue:sync 2026-10-09",
      "todays-rating-weight:sync 2026-10-09",
      "jump-rating:sync 2026-10-09",
      "jump-tissue:sync 2026-10-09",
      "jump-g4:sync 2026-10-09",
      "aw-rating:sync 2026-10-09",
      "aw-tissue:sync 2026-10-09",
      "aw-pair:sync 2026-10-09",
      "sync:aw-shadow 2026-10-09",
      "disagreement:morning 2026-10-09",
      "value:today 2026-10-09",
      "aw-pair:compact 2026-10-09",
    ]);
  });

  test("runs the after workflow as result import plus settlement only", async () => {
    const calls: string[] = [];

    const result = await runWorkflow({ mode: "after", date: "2026-10-09" }, async (step) => {
      calls.push([step.script, ...(step.args ?? [])].join(" "));
      return 0;
    });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(calls, [
      "sl:import-day 2026-10-09 --request-delay-seconds 2",
      "research:settle 2026-10-09",
      "value:results 2026-10-09",
      "aw-pair:results 2026-10-09",
    ]);
    assert.doesNotMatch(calls.join("\n"), /sl:import-racecards|:sync|disagreement:/);
  });

  test("runs the live workflow as a result-only refresh for today", async () => {
    assert.deepEqual(parseArgs(["--mode", "live"], new Date(2026, 9, 9, 15)), {
      mode: "live",
      date: "2026-10-09",
    });
    assert.deepEqual(commandLinesFor("live"), [
      "sl:import-day 2026-10-09 --request-delay-seconds 2",
      "research:settle 2026-10-09",
      "value:today 2026-10-09",
      "jump-g4:today 2026-10-09",
      "todays-rating-weight:today 2026-10-09",
      "aw-pair:compact 2026-10-09",
    ]);
    assert.doesNotMatch(commandLinesFor("live").join("\n"), /:sync|disagreement:/);
  });

  test("passes an explicit live date through the result refresh", () => {
    assert.deepEqual(parseArgs(["--mode", "live", "2026-11-14"]), {
      mode: "live",
      date: "2026-11-14",
    });
    assert.ok(commandLinesFor("live", "2026-11-14").every((line) => line.includes("2026-11-14")));
  });

  test("runs the night workflow for tomorrow with only next-day card capture", () => {
    assert.deepEqual(parseArgs(["--mode", "night"], new Date(2026, 9, 9, 20)), {
      mode: "night",
      date: "2026-10-10",
    });
    assert.deepEqual(commandLinesFor("night", "2026-10-10"), [
      "sl:import-racecards 2026-10-10 --request-delay-seconds 2 --skip-existing-racecards",
      "disagreement:night 2026-10-10",
    ]);
    assert.equal(nextLocalDateString(new Date(2026, 11, 31)), "2027-01-01");
  });

  test("runs the late workflow for today with only price refresh capture", () => {
    assert.deepEqual(parseArgs(["--mode", "late"], new Date(2026, 9, 9, 11)), {
      mode: "late",
      date: "2026-10-09",
    });
    assert.deepEqual(commandLinesFor("late"), [
      "sl:import-racecards 2026-10-09 --request-delay-seconds 2",
      "disagreement:late 2026-10-09",
    ]);
  });

  test("passes an explicit YYYY-MM-DD override through every stage", () => {
    assert.deepEqual(parseArgs(["--mode", "morning", "2026-11-14"]), {
      mode: "morning",
      date: "2026-11-14",
    });
    assert.ok(commandLinesFor("morning", "2026-11-14").every((line) => line.includes("2026-11-14")));
    assert.ok(commandLinesFor("after", "2026-11-14").every((line) => line.includes("2026-11-14")));
  });

  test("resolves the default date from local Date fields", () => {
    const localDate = new Date(2026, 0, 5, 23, 59, 59);

    assert.equal(localDateString(localDate), "2026-01-05");
    assert.deepEqual(parseArgs(["--mode", "morning"], localDate), {
      mode: "morning",
      date: "2026-01-05",
    });
  });

  test("after defaults to yesterday in local Date fields", () => {
    const localDate = new Date(2026, 0, 1, 6, 0, 0);

    assert.equal(previousLocalDateString(localDate), "2025-12-31");
    assert.deepEqual(parseArgs(["--mode", "after"], localDate), {
      mode: "after",
      date: "2025-12-31",
    });
  });

  test("after respects an explicit date exactly", () => {
    assert.deepEqual(parseArgs(["--mode", "after", "2026-10-10"], new Date(2026, 9, 11, 6)), {
      mode: "after",
      date: "2026-10-10",
    });
  });

  test("rejects invalid dates before workflow stages are built or run", () => {
    for (const value of ["2026-13-01", "2026-02-30", "20261009", "not-a-date"]) {
      assert.equal(isValidDate(value), false);
      assert.throws(
        () => parseArgs(["--mode", "morning", value]),
        new RegExp(`Invalid date "${value}"`),
      );
    }
  });

  test("stops on a non-zero stage, returns non-zero, and identifies the failed stage", async () => {
    const calls: string[] = [];

    const result = await runWorkflow({ mode: "morning", date: "2026-10-09" }, async (step) => {
      calls.push(step.script);
      return step.script === "jump-tissue:sync" ? 7 : 0;
    });

    assert.equal(result.exitCode, 7);
    assert.equal(result.failed?.step.script, "jump-tissue:sync");
    assert.equal(result.failed?.exitCode, 7);
    assert.deepEqual(calls, [
      "sl:import-racecards",
      "tpr:sync",
      "tissue:sync",
      "todays-rating-weight:sync",
      "jump-rating:sync",
      "jump-tissue:sync",
    ]);
  });

  test("treats a zero-exit no-racecards child as success and continues", async () => {
    const calls: string[] = [];
    const childOutput: string[] = [];

    const result = await runWorkflow({ mode: "morning", date: "2026-10-09" }, async (step) => {
      calls.push(step.script);
      if (step.script === "sl:import-racecards") childOutput.push("No racecards found for 2026-10-09");
      return 0;
    });

    assert.equal(result.exitCode, 0);
    assert.equal(childOutput[0], "No racecards found for 2026-10-09");
    assert.deepEqual(calls, workflowSteps("morning", "2026-10-09").map((step) => step.script));
  });
});

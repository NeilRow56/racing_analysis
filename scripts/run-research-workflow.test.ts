import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  isValidDate,
  localDateString,
  nextLocalDateString,
  parseArgs,
  previousLocalDateString,
  runWorkflow,
  isNextDayCardsUnavailable,
  workflowSteps,
} from "./run-research-workflow";

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  console.log = () => undefined;
  console.error = () => undefined;
  console.warn = () => undefined;
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
  console.warn = originalWarn;
});

function commandLinesFor(mode: "night" | "morning" | "live" | "late" | "after", date = "2026-10-09") {
  return workflowSteps(mode, date).map((step) => [step.script, ...(step.args ?? [])].join(" "));
}

describe("research workflow wrapper", () => {
  const timeout = { exitCode: 1, output: "REQUEST_RETRY attempt=1 status=network\nREQUEST_FAILED url=https://www.sportinglife.com/racing/racecards\nTimeoutError: The read operation timed out\nerror: script \"sl:import-racecards\" exited with code 1" };
  const storedCards = { date: "2026-10-09", races: 7, meetings: 1, runners: 65, usable: true };

  test("successful refresh retains normal stages and never checks fallback cards", async () => {
    const calls: string[] = [];
    const result = await runWorkflow({ mode: "morning", date: storedCards.date }, async (step) => {
      assert.equal(step.env, undefined);
      calls.push(step.script);
      return { exitCode: 0, output: "RACECARD_IMPORTED" };
    }, async () => { throw new Error("Fallback checker must not run"); });
    assert.equal(result.exitCode, 0);
    assert.equal(result.existingCards, undefined);
    assert.equal(calls.length, workflowSteps("morning", storedCards.date).length);
  });

  test("network failure uses validated same-date cards, warns, and continues without a market refresh", async () => {
    const logs: string[] = [];
    console.log = (...args) => logs.push(args.join(" "));
    console.warn = (...args) => logs.push(args.join(" "));
    const calls: string[] = [];
    const result = await runWorkflow({ mode: "morning", date: storedCards.date }, async (step) => {
      calls.push(step.script);
      if (calls.length === 1) { assert.equal(step.env, undefined); return timeout; }
      assert.deepEqual(step.env, { RESEARCH_EXISTING_CARDS_DATE: storedCards.date });
      return 0;
    }, async (date) => { assert.equal(date, storedCards.date); return storedCards; });
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.existingCards, storedCards);
    assert.deepEqual(calls, workflowSteps("morning", storedCards.date).map((step) => step.script));
    assert.equal(calls.filter((script) => script === "sl:import-racecards").length, 1);
    assert.match(logs.join("\n"), /RACECARD_REFRESH_FAILED_USING_EXISTING date=2026-10-09 races=7 meetings=1 runners=65/);
    assert.match(logs.join("\n"), /No new market snapshot/);
    assert.match(logs.join("\n"), /Racecards:\nUSING EXISTING LOCAL CARDS - Sporting Life refresh failed/);
    assert.ok(logs.findIndex((line) => line.startsWith("Racecards:")) > logs.findIndex((line) => line.includes("AW Turf-architecture challenger")));
  });

  test("network failure without usable exact-date cards remains a hard failure", async () => {
    for (const status of [{ ...storedCards, usable: false, races: 0, meetings: 0, runners: 0 }, { ...storedCards, date: "2026-10-08" }]) {
      let calls = 0;
      const result = await runWorkflow({ mode: "morning", date: storedCards.date }, async () => { calls++; return timeout; }, async () => status);
      assert.equal(result.exitCode, 1);
      assert.equal(result.failed?.step.script, "sl:import-racecards");
      assert.equal(calls, 1);
    }
  });

  test("integrity and unknown failures never consult stored cards", async () => {
    for (const output of ["RuntimeError: Sporting Life racecard index returned races for a different date", "REQUEST_FAILED url=https://www.sportinglife.com/racing/racecards\nJSONDecodeError: malformed", "REQUEST_RETRY attempt=1 status=network\nValueError: target-date validation failed", "unknown error"]) {
      let calls = 0;
      const result = await runWorkflow({ mode: "morning", date: storedCards.date }, async () => { calls++; return { exitCode: 1, output }; }, async () => { throw new Error("Integrity failure must not use fallback"); });
      assert.equal(result.exitCode, 1);
      assert.equal(calls, 1);
    }
  });

  test("network fallback is confined to morning acquisition", async () => {
    for (const mode of ["night", "late", "live", "after"] as const) {
      const result = await runWorkflow({ mode, date: storedCards.date }, async () => timeout, async () => { throw new Error("Only morning may use fallback"); });
      assert.equal(result.exitCode, 1);
    }
  });

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
      "value:today 2026-10-09",
      "aw-pair:challenger 2026-10-09",
    ]);
    assert.doesNotMatch(calls.join("\n"), /disagreement:/);
  });

  test("manual model-disagreement commands remain available outside the morning workflow", () => {
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<string, string>;
    assert.equal(scripts["disagreement:today"], "bun run scripts/track-model-disagreement.ts today");
    assert.equal(scripts["disagreement:summary"], "bun run scripts/track-model-disagreement.ts summary");
    assert.equal(scripts["disagreement:night"], "bun run scripts/track-model-disagreement.ts night");
    assert.equal(scripts["disagreement:morning"], "bun run scripts/track-model-disagreement.ts morning");
    assert.equal(scripts["disagreement:late"], "bun run scripts/track-model-disagreement.ts late");
    assert.equal(scripts["disagreement:sync"], "bun run scripts/track-model-disagreement.ts sync");
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
      "aw-pair:challenger 2026-10-09",
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
      "aw-pair:challenger 2026-10-09",
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

  test("runs the night workflow for tomorrow with only next-day card and first-price capture", () => {
    assert.deepEqual(parseArgs(["--mode", "night"], new Date(2026, 9, 9, 20)), {
      mode: "night",
      date: "2026-10-10",
    });
    assert.deepEqual(commandLinesFor("night", "2026-10-10"), [
      "sl:import-racecards 2026-10-10 --request-delay-seconds 2 --skip-existing-racecards",
    ]);
    assert.doesNotMatch(commandLinesFor("night", "2026-10-10").join("\n"), /disagreement:|track-model-disagreement|sl:import-day|research:settle|backfill/i);
    assert.equal(nextLocalDateString(new Date(2026, 11, 31)), "2027-01-01");
  });

  test("night workflow preserves stored racecard prices by only running the importer", async () => {
    const calls: string[] = [];
    const result = await runWorkflow({ mode: "night", date: "2026-10-10" }, async (step) => {
      calls.push([step.script, ...(step.args ?? [])].join(" "));
      assert.equal(step.env, undefined);
      return { exitCode: 0, output: "RACECARDS_IMPORTED races=30 runners=319 bookmaker_prices=319" };
    });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(calls, ["sl:import-racecards 2026-10-10 --request-delay-seconds 2 --skip-existing-racecards"]);
  });

  test("night workflow exits cleanly when next-day cards are unavailable and does not fallback to today", async () => {
    let fallbackChecked = false;
    const calls: string[] = [];
    const result = await runWorkflow({ mode: "night", date: "2026-10-11" }, async (step) => {
      calls.push(step.script);
      return { exitCode: 0, output: "NO_UK_IRE_RACECARDS date=2026-10-11\nDISCOVERED_RACES=0" };
    }, async () => {
      fallbackChecked = true;
      return storedCards;
    });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(calls, ["sl:import-racecards"]);
    assert.equal(fallbackChecked, false);
    assert.equal(isNextDayCardsUnavailable("NO_UK_IRE_RACECARDS date=2026-10-11", "2026-10-11"), true);
    assert.equal(isNextDayCardsUnavailable("NO_UK_IRE_RACECARDS date=2026-10-10", "2026-10-11"), false);
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

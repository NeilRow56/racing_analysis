import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

describe("Today Timewise save action", () => {
  test("delegates to the canonical locked save and returns its updated state", async () => {
    const source = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
    const saveAction = source.split("export async function saveTimewiseComparisonAction")[1]
      ?.split("function roundedTiming")[0] ?? "";
    assert.match(saveAction, /return saveTimewiseComparison/);
  });

  test("does not reload or revalidate Today from a manual save", async () => {
    const source = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
    const saveAction = source.split("export async function saveTimewiseComparisonAction")[1]
      ?.split("function roundedTiming")[0] ?? "";
    assert.doesNotMatch(saveAction, /getTodaysRacingData/);
    assert.doesNotMatch(saveAction, /refreshEligibleTodaySelectionResults/);
    assert.doesNotMatch(saveAction, /enrichTodayForwardTrackerResults/);
    assert.doesNotMatch(saveAction, /revalidatePath|refresh\(/);
  });

  test("client row updates from the action result without router refresh", async () => {
    const source = await readFile(new URL("./timewise-comparison-form.tsx", import.meta.url), "utf8");
    assert.match(source, /const result = await action\(formData\)/);
    assert.match(source, /setSummary/);
    assert.match(source, /setMessage\("Saved"\)/);
    assert.doesNotMatch(source, /router\.refresh|revalidatePath/);
  });
});

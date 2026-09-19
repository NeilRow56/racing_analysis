import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

describe("Today Timewise save action", () => {
  test("reloads and upserts inside the serialized tracker mutation", async () => {
    const source = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
    const mutation = source.match(/await mutateTrackerData\(\(trackerData\) => \{[\s\S]*?\n    \}\);/)?.[0] ?? "";
    assert.match(mutation, /trackerData\.races\.find/);
    assert.match(mutation, /timewiseTimingForSave\(existing/);
    assert.match(mutation, /return upsertRace\(trackerData/);
    assert.doesNotMatch(source, /await loadTrackerData\(\)/);
  });

  test("does not invoke result refresh or settlement from a manual save", async () => {
    const source = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
    const saveAction = source.split("export async function saveTimewiseComparisonAction")[1]
      ?.split("function requiredFormValue")[0] ?? "";
    assert.doesNotMatch(saveAction, /refreshEligibleTodaySelectionResults/);
    assert.doesNotMatch(saveAction, /enrichTodayForwardTrackerResults/);
    assert.match(saveAction, /revalidatePath/);
  });
});

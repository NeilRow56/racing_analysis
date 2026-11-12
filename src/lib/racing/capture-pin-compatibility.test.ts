import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertCompatibleCapturePins } from "./capture-pin-compatibility";
import { assertHurdleV3ShadowPins, loadHurdleV3Shadow, mutateHurdleV3Shadow } from "./hurdle-v3-shadow";
import { loadHurdleMarketEdge, hurdleMarketEdgeSourceHashes, mutateHurdleMarketEdge } from "./hurdle-v3-market-edge";
import { loadEarlyTurf, earlyTurfSourceHashes, mutateEarlyTurf } from "./turf-early-season";
import { loadPositiveNeutral, mutatePositiveNeutral } from "./tissue-positive-neutral";
import { legacyRecordedWinValue, legacyVoidBetResultStatus } from "./backtest";

const evidence = "data/research/settlement-v3-remediation-2026-11-11";
const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

test("all four original dependencies are verified against retained pinned bytes", async () => {
  const monitors: { mismatches: {path: string; expected: string; headMatches: boolean}[] }[] = JSON.parse(await readFile(`${evidence}/source-pins-before.json`, "utf8"));
  assert.equal(monitors.length, 4);
  for (const monitor of monitors) for (const mismatch of monitor.mismatches) {
    assert.equal(mismatch.headMatches, true);
    assert.equal(digest(await readFile(`${evidence}/original-sources/${mismatch.path}.txt`)), mismatch.expected);
  }
});

test("two feature adapter differences are exactly legacy classifier renames", async () => {
  for (const path of ["hurdle-v3-challenger-features.ts", "turf-early-season-inputs.ts"]) {
    const original = await readFile(`${evidence}/original-sources/src/lib/racing/${path}.txt`, "utf8");
    const current = await readFile(`src/lib/racing/${path}`, "utf8");
    assert.equal(current, original.replaceAll("isVoidBetResultStatus", "legacyVoidBetResultStatus").replaceAll("settledWinValue", "legacyRecordedWinValue"));
  }
  // The frozen callers always pass won:null. Preserve even v2's permissive zero/
  // negative positions and 'other' classifications; V3 must not change features.
  const voids = new Set(["non_runner", "abandoned", "cancelled", "canceled", "no_race", "race_void", "void", "void_race"]);
  for (const resultStatus of [null, "", " ", "finished", " Finished ", "other", "0", "pulled_up", "NON_RUNNER", "void", "unknown"])
    for (const finishingPosition of [null, 0, -1, 1, 2]) {
      const isVoid = resultStatus !== null && voids.has(resultStatus.trim().toLowerCase());
      const win = finishingPosition !== null ? finishingPosition === 1 : !resultStatus?.trim() || resultStatus.trim().toLowerCase() === "finished" || isVoid ? null : false;
      assert.equal(legacyVoidBetResultStatus(resultStatus), isVoid);
      assert.equal(legacyRecordedWinValue({ finishingPosition, resultStatus, won: null }), win);
    }
});

test("Market Edge and armed Early Turf accept only reviewed adapters and preserve original pins/captures", async () => {
  const dir = await mkdtemp(join(tmpdir(), "capture-pin-regression-"));
  try {
    for (const [monitor, load, hashes, mutate] of [
      ["hurdle-v3-market-edge", loadHurdleMarketEdge, hurdleMarketEdgeSourceHashes, mutateHurdleMarketEdge],
      ["turf-early-season", loadEarlyTurf, earlyTurfSourceHashes, mutateEarlyTurf],
    ] as const) {
      const data = await load(); assert.ok(data);
      const current = await hashes(); await assertCompatibleCapturePins(data.sourceHashes, current, monitor);
      const drift = { ...current, [Object.keys(current)[0]]: "0".repeat(64) };
      await assert.rejects(assertCompatibleCapturePins(data.sourceHashes, drift, monitor), /changed/);
      await assert.rejects(assertCompatibleCapturePins({ ...data.sourceHashes, extra: "0".repeat(64) }, current, monitor), /pin set/);
      const path = join(dir, `${monitor}.json`), bytes = JSON.stringify(data, null, 2) + "\n";
      await writeFile(path, bytes);
      // Exercise actual mutation guards using temporary copies only.
      if (monitor === "hurdle-v3-market-edge") await mutateHurdleMarketEdge(d => d, path);
      else await mutateEarlyTurf(d => d, path);
      assert.deepEqual(JSON.parse(await readFile(path, "utf8")), data);
      void mutate;
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Shadow and Positive/Neutral capture pins fail closed; Shadow settlement remains available", async () => {
  const shadow = await loadHurdleV3Shadow(); assert.ok(shadow);
  await assert.rejects(assertHurdleV3ShadowPins(shadow), /implementation changed/);
  const positive = await loadPositiveNeutral(); assert.ok(positive);
  const dir = await mkdtemp(join(tmpdir(), "positive-pin-regression-"));
  try {
    const shadowPath = join(dir, "shadow.json");
    await writeFile(shadowPath, JSON.stringify(shadow));
    await mutateHurdleV3Shadow(d => d, shadowPath);
    assert.deepEqual(JSON.parse(await readFile(shadowPath, "utf8")), shadow);
    const path = join(dir, "positive.json"), bytes = JSON.stringify(positive);
    await writeFile(path, bytes);
    await assert.rejects(mutatePositiveNeutral(d => d, path), /methodology changed/);
    assert.equal(await readFile(path, "utf8"), bytes);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("research evidence remains byte-exact except verified outcome-only live updates", { timeout: 60000 }, async () => {
  const before: Record<string, string> = JSON.parse(await readFile(`${evidence}/preservation-before.json`, "utf8"));
  const review: { changed: { path: string; originalEvidence?: string; verifiedOutcomeOnlyChange?: boolean }[] } = JSON.parse(await readFile(`${evidence}/preservation-after.json`, "utf8"));
  for (const [path, expected] of Object.entries(before)) {
    const current = await readFile(path);
    if (digest(current) === expected) continue;
    const change = review.changed.find(row => row.path === path);
    assert.ok(change?.verifiedOutcomeOnlyChange && change.originalEvidence, path);
    const original = await readFile(change.originalEvidence);
    assert.equal(digest(original), expected, "Recovered original bytes must match the untouched initial hash");
    // Permit only appended outcomes where the original was pending. Every other
    // value, including already-recorded outcomes, is compared exactly.
    function originalProjection(old: unknown, next: unknown): unknown {
      if (Array.isArray(old)) {
        assert.ok(Array.isArray(next)); assert.equal(next.length, old.length);
        return old.map((value, i) => originalProjection(value, next[i]));
      }
      if (old !== null && typeof old === "object") {
        assert.ok(next !== null && typeof next === "object");
        const current = next as Record<string, unknown>;
        assert.deepEqual(Object.keys(current), Object.keys(old));
        return Object.fromEntries(Object.entries(old).map(([key, value]) => [key,
          key === "outcome" && value === null ? null : originalProjection(value, current[key])]));
      }
      assert.deepEqual(next, old, path); return next;
    }
    const baseline: unknown = JSON.parse(original.toString());
    assert.deepEqual(originalProjection(baseline, JSON.parse(current.toString())), baseline, path);
  }
});

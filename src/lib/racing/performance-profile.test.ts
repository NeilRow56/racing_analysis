import assert from "node:assert/strict";
import { test } from "node:test";
import { bindProfileContext, isReadOnlyDiagnostic, profileRequest, profileStage, profileSync, recordTiming, withReadOnlyDiagnostic } from "./performance-profile";

test("profiling flags, correlation, nesting, repeats, errors and disabled parity", async () => {
  const saved = { racing: process.env.RACING_PROFILE, research: process.env.RESEARCH_PROFILE, info: console.info };
  const rows: Array<Record<string, unknown>> = [];
  console.info = (line: string) => { rows.push(JSON.parse(line)); };
  try {
    delete process.env.RACING_PROFILE; delete process.env.RESEARCH_PROFILE;
    const value = { unchanged: true };
    assert.equal(await profileRequest("disabled", () => profileStage("child", async () => value)), value);
    assert.equal(profileSync("sync", () => value), value);
    assert.equal(rows.length, 0);
    process.env.RACING_PROFILE = "0";
    await profileRequest("disabled-zero", async () => null);
    assert.equal(rows.length, 0);
    process.env.RACING_PROFILE = "1";
    let deferred: (() => Promise<number>) | undefined;
    const failure = new Error("secret connection string");
    await Promise.all([profileRequest("request-a", async () => {
      await profileStage("parent", async () => {
        await Promise.all([profileStage("ledger", async () => 1), profileStage("ledger", async () => 2)]);
        profileSync("calculation", () => 3);
        recordTiming("callback", 5);
      });
      deferred = bindProfileContext(() => profileStage("deferred", async () => 7));
      await assert.rejects(profileStage("error", async () => { throw failure; }), e => e === failure);
      assert.throws(() => profileSync("sync-error", () => { throw failure; }), e => e === failure);
    }), profileRequest("request-b", () => profileStage("ledger", async () => 4))]);
    assert.equal(await deferred!(), 7);
    const a = rows.find(r => r.operation === "request-a")!;
    const b = rows.find(r => r.operation === "request-b")!;
    assert.notEqual(a.requestId, b.requestId);
    const ledgers = rows.filter(r => r.operation === "ledger" && r.requestId === a.requestId);
    assert.deepEqual(ledgers.map(r => r.occurrence), [1, 2]);
    assert.equal(ledgers[1].repeated, true);
    const parent = rows.find(r => r.operation === "parent")!;
    assert.ok(ledgers.every(r => r.parentSpanId === parent.spanId));
    const spans = rows.filter(r => r.requestId === a.requestId && r.spanId !== undefined);
    assert.equal(new Set(spans.map(r => r.spanId)).size, spans.length);
    assert.equal(rows.find(r => r.operation === "deferred")!.requestId, a.requestId);
    assert.equal(rows.find(r => r.operation === "error")!.status, "error");
    assert.ok(rows.every(r => typeof r.durationMs === "number" && Number(r.durationMs) >= 0));
    assert.ok(!JSON.stringify(rows).includes("secret"));
    assert.equal(isReadOnlyDiagnostic(), false);
    await withReadOnlyDiagnostic(async () => { await Promise.resolve(); assert.equal(isReadOnlyDiagnostic(), true); });
    assert.equal(isReadOnlyDiagnostic(), false);
    delete process.env.RACING_PROFILE; process.env.RESEARCH_PROFILE = "1";
    await profileRequest("legacy-flag", async () => null);
    assert.ok(rows.some(r => r.operation === "legacy-flag"));
    console.info = () => { throw new Error("logger failed"); };
    assert.equal(await profileRequest("logging-failure", async () => value), value);
  } finally {
    console.info = saved.info;
    if (saved.racing === undefined) delete process.env.RACING_PROFILE; else process.env.RACING_PROFILE = saved.racing;
    if (saved.research === undefined) delete process.env.RESEARCH_PROFILE; else process.env.RESEARCH_PROFILE = saved.research;
  }
});

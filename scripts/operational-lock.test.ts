import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { acquireOperationalLock, finishOperationalTasks, operationalEnvironment, withOperationalAccess } from "../src/lib/racing/operational-lock";
import { operationalScript } from "./operational-preload";
import { runCommand, runScheduled, type Dependencies } from "./local-automation";

const modulePath = resolve("src/lib/racing/operational-lock.ts");
const dirs: string[] = [];
async function fixture() { const dir = await mkdtemp(join(tmpdir(), "racing-exclusion-")); dirs.push(dir); return dir; }
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
function child(code: string, env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, ["--eval", code], { cwd: process.cwd(), env, encoding: "utf8", timeout: 10000 });
}
const acquireCode = (root: string) => `import {acquireOperationalLock} from ${JSON.stringify(modulePath)}; const l=acquireOperationalLock('fixture',${JSON.stringify(root)}); console.log(l?'joined':'busy'); l?.release();`;

describe("common operational exclusion (fixtures only)", () => {
  test("two callers: first owns; second is busy; completion and failure release", async () => {
    const root = await fixture();
    await assert.rejects(withOperationalAccess("first", async available => {
      assert.equal(available, true);
      assert.equal(acquireOperationalLock("competitor", root, null), null);
      throw new Error("mock workflow failure");
    }, root), /mock workflow failure/);
    const next = acquireOperationalLock("next", root, null); assert.ok(next); next.release();
  });
  test("failed parallel work keeps the lease until the remaining side effect finishes", async () => {
    const root = await fixture(); let finish!: () => void;
    const pending = new Promise<void>(done => { finish = done; });
    const running = withOperationalAccess("parallel", async () => finishOperationalTasks([Promise.reject(new Error("failed")), pending]), root);
    await new Promise(done => setTimeout(done, 10));
    assert.equal(acquireOperationalLock("early competitor", root, null), null);
    finish(); await assert.rejects(running, /failed/);
    const next = acquireOperationalLock("after drain", root, null); assert.ok(next); next.release();
  });
  test("browser versus CLI: busy renders stored values without running mutations", async () => {
    const root = await fixture(); const owner = acquireOperationalLock("cli", root, null)!;
    let mutations = 0;
    const result = await withOperationalAccess("web", async available => {
      if (available) mutations++;
      return { cards: ["stored racecard"], selections: ["frozen observation"], busy: !available };
    }, root);
    assert.deepEqual(result, { cards: ["stored racecard"], selections: ["frozen observation"], busy: true });
    assert.equal(mutations, 0);
    const competitor = child(acquireCode(root)); assert.equal(competitor.status, 0, competitor.stderr); assert.match(competitor.stdout, /busy/);
    owner.release();
  });
  test("CLI versus wrapper: busy reports 75 and performs no readiness or command", async () => {
    const root = await fixture(); const owner = acquireOperationalLock("manual-cli", root, null)!;
    const forbidden = async () => { throw new Error("must not execute"); };
    const deps: Dependencies = { logRoot: root, now: () => new Date("2026-11-14T08:00:00Z"), ready: forbidden, command: forbidden, pause: forbidden };
    assert.equal(await runScheduled("collection", deps), 75);
    const event = JSON.parse(await readFile(join(root, "overlap-collection.json"), "utf8")); assert.equal(event.status, "locked");
    owner.release();
  });
  test("wrapper passes verified ownership into its mocked workflow child without double acquisition", async () => {
    const root = await fixture(); let joined = false;
    const deps: Dependencies = { logRoot: root, now: () => new Date("2026-11-14T08:00:00Z"), ready: async () => {}, audit: async () => [], pause: async () => {}, command: async command => {
      const result = child(acquireCode(root), command.env);
      assert.equal(result.status, 0, result.stderr); joined = result.stdout.includes("joined");
      assert.equal(acquireOperationalLock("other cli", root, null), null);
      return { code: 0, timedOut: false, hookWarning: false };
    } };
    assert.equal(await runScheduled("collection", deps), 0); assert.equal(joined, true);
    const next = acquireOperationalLock("after-wrapper", root, null); assert.ok(next); next.release();
  });
  test("timeout kills a harmless owning workflow child before the root releases", async () => {
    const root = await fixture(); const owner = acquireOperationalLock("wrapper fixture", root, null)!;
    const running = runCommand({ executable: process.execPath, args: ["--eval", acquireCode(root) + ";setInterval(()=>{},100)"], cwd: process.cwd(), env: { ...process.env, ...owner.environment }, timeoutMs: 100, graceMs: 100, logPrefix: join(root, "timeout") });
    assert.equal(acquireOperationalLock("during timeout", root, null), null);
    const result = await running; assert.equal(result.timedOut, true); assert.equal(result.code, 124);
    assert.equal(acquireOperationalLock("before release", root, null), null);
    owner.release(); const next = acquireOperationalLock("after timeout cleanup", root, null); assert.ok(next); next.release();
  });
  test("nested orchestration joins only with token plus live ancestor identity", async () => {
    const root = await fixture(); const owner = acquireOperationalLock("orchestrator", root, null)!;
    const joined = child(acquireCode(root), { ...process.env, ...owner.environment });
    assert.equal(joined.status, 0, joined.stderr); assert.match(joined.stdout, /joined/);
    assert.ok(JSON.parse(await readFile(join(root, "workflow.lock"), "utf8")).token);
    const denied = child(acquireCode(root), { ...process.env, RACING_OPERATIONAL_OWNER: "fake" });
    assert.match(denied.stdout, /busy/); owner.release();
  });
  test("web credentials are request-local; read-only concurrent request cannot inherit", async () => {
    const root = await fixture(); const original = process.env.RACING_OPERATIONAL_OWNER;
    await withOperationalAccess("web", async available => {
      assert.equal(available, true); assert.ok(operationalEnvironment().RACING_OPERATIONAL_OWNER);
      assert.equal(process.env.RACING_OPERATIONAL_OWNER, original);
      assert.equal(await withOperationalAccess("other-request", async allowed => allowed, root), false);
      const joined = child(acquireCode(root), operationalEnvironment()); assert.match(joined.stdout, /joined/);
    }, root);
  });
  test("unrelated process with a copied token cannot join a live sibling owner", async () => {
    const root = await fixture();
    const holder = spawn(process.execPath, ["--eval", `import {acquireOperationalLock} from ${JSON.stringify(modulePath)}; acquireOperationalLock('holder',${JSON.stringify(root)}); console.log('ready'); setInterval(()=>{},1000);`], { stdio: ["ignore", "pipe", "pipe"] });
    try {
      await new Promise<void>((done, reject) => { holder.stdout.once("data", () => done()); holder.once("error", reject); });
      const owner = JSON.parse(await readFile(join(root, "workflow.lock"), "utf8"));
      assert.equal(acquireOperationalLock("sibling", root, owner.token), null);
      holder.kill("SIGKILL"); await new Promise(done => holder.once("close", done));
      assert.equal(acquireOperationalLock("after-crash", root, owner.token), null);
    } finally { holder.kill("SIGKILL"); }
  });
  test("release rejects replacement ownership; malformed and legacy locks block", async () => {
    const root = await fixture(); const owner = acquireOperationalLock("original", root, null)!;
    const path = join(root, "workflow.lock"); const metadata = JSON.parse(await readFile(path, "utf8"));
    await writeFile(path, JSON.stringify({ ...metadata, token: "replacement" }));
    assert.throws(() => owner.release(), /ownership_changed/);
    for (const value of ['{"pid":123}', '', '{bad', JSON.stringify({ ...metadata, pid: 99999999 })]) {
      await writeFile(path, value); assert.equal(acquireOperationalLock("new", root, metadata.token), null);
    }
  });
  test("Python joins Bun owner; Python standalone excludes browser; normal exit releases", async () => {
    const root = await fixture(); const owner = acquireOperationalLock("bun", root, null)!;
    const python = resolve("scraper/.venv/bin/python");
    const code = `import sys; from pathlib import Path; sys.path.insert(0,${JSON.stringify(resolve("scraper/scripts"))}); from operational_lock import guard_cli; guard_cli('fixture',Path(${JSON.stringify(root)})); print('joined')`;
    const joined = spawnSync(python, ["-c", code], { env: { ...process.env, ...owner.environment }, encoding: "utf8", timeout: 10000 });
    assert.equal(joined.status, 0, joined.stderr); assert.match(joined.stdout, /joined/);
    const denied = spawnSync(python, ["-c", code], { env: { ...process.env, RACING_OPERATIONAL_OWNER: "fake" }, encoding: "utf8", timeout: 10000 });
    assert.equal(denied.status, 75); assert.match(denied.stderr, /WORKFLOW_BUSY/); owner.release();
    const standalone = spawnSync(python, ["-c", code], { encoding: "utf8", timeout: 10000 });
    assert.equal(standalone.status, 0, standalone.stderr);
    const next = acquireOperationalLock("after-python", root, null); assert.ok(next); next.release();
  });
  test("real Bun preload releases fixture CLI success and failure, and inherits nested ownership", async () => {
    const workspace = await fixture(), home = join(workspace, "home");
    await mkdir(join(workspace, "scripts"), { recursive: true });
    await mkdir(join(workspace, "src/lib/racing"), { recursive: true });
    await writeFile(join(workspace, "scripts/operational-preload.ts"), await readFile(resolve("scripts/operational-preload.ts")));
    await writeFile(join(workspace, "src/lib/racing/operational-lock.ts"), await readFile(modulePath));
    await writeFile(join(workspace, "src/lib/racing/performance-profile.ts"), await readFile(resolve("src/lib/racing/performance-profile.ts")));
    await writeFile(join(workspace, "bunfig.toml"), 'preload = ["./scripts/operational-preload.ts"]');
    await writeFile(join(workspace, "scripts/track-fixture.ts"), `
      import {spawnSync} from 'node:child_process';
      if(process.argv[2]==='fail')throw Error('fixture failure');
      if(process.argv[2]==='parent'){
        const c=spawnSync(process.execPath,['run','scripts/track-fixture.ts','child'],{encoding:'utf8',env:process.env});
        if(c.status!==0)throw Error(c.stderr); console.log(c.stdout);
      }
      console.log('FIXTURE_FINISHED');
    `);
    for (const command of ["success", "fail", "parent"]) {
      const result = spawnSync(process.execPath, ["run", "scripts/track-fixture.ts", command], { cwd: workspace, env: { ...process.env, HOME: home }, encoding: "utf8", timeout: 10000 });
      assert.equal(result.status, command === "fail" ? 1 : 0, result.stderr);
      const next = acquireOperationalLock("after fixture", join(home, "Library/Logs/RacingAnalysis"), null); assert.ok(next, result.stderr); next.release();
    }
  });
  test("project preload blocks pinned CLI before loading real workflow; summary stays read-only", async () => {
    const home = await fixture(); const root = join(home, "Library/Logs/RacingAnalysis");
    await mkdir(root, { recursive: true }); await writeFile(join(root, "workflow.lock"), "legacy fixture lock");
    const blocked = spawnSync(process.execPath, ["run", "scripts/track-tissue-generation.ts", "sync"], { env: { ...process.env, HOME: home }, encoding: "utf8", timeout: 10000 });
    assert.equal(blocked.status, 75, blocked.stderr); assert.match(blocked.stderr, /WORKFLOW_BUSY/);
    assert.equal(operationalScript(resolve("scripts/track-tissue-generation.ts"), ["summary"]), false);
    assert.equal(operationalScript(resolve("scripts/run-research-workflow.ts"), ["--mode", "morning"]), true);
    assert.equal(operationalScript(resolve("scripts/settle-research-results.ts"), []), true);
  });
});

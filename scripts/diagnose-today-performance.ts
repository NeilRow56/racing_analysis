/** Read-only Phase 2A investigation. Writes diagnostic artifacts only to a new temp directory. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema";
import { getLocalRacingDate, getTodaysRacingData } from "../src/lib/racing/todays-racing";
import { withReadOnlyDiagnostic } from "../src/lib/racing/performance-profile";

type Query = { query: string; params: unknown[] };
type PlanNode = {
  "Node Type": string;
  "Actual Total Time"?: number;
  "Actual Loops"?: number;
  "Actual Rows"?: number;
  "Subplan Name"?: string;
  "Sort Method"?: string;
  Plans?: PlanNode[];
};
type Plan = { Plan: PlanNode; "Planning Time": number; "Execution Time": number };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const queryKey = (row: Query) => digest(JSON.stringify(row));

function planNodes(node: PlanNode): Omit<PlanNode, "Plans">[] {
  const { Plans = [], ...summary } = node;
  // Exclude predicates, identifiers and query text from the diagnostic summary.
  return [{
    "Node Type": summary["Node Type"],
    "Actual Total Time": summary["Actual Total Time"],
    "Actual Loops": summary["Actual Loops"],
    "Actual Rows": summary["Actual Rows"],
    "Subplan Name": summary["Subplan Name"],
    "Sort Method": summary["Sort Method"],
  }, ...Plans.flatMap(planNodes)];
}

function queryKind(query: string) {
  if (query.includes("bookmakerOdds")) return "racecard";
  if (query.includes('"racing_post_rating"')) return "horse_history";
  if (query.includes('"beaten_distance"')) return "runner_margins";
  if (query.includes('"winning_time"')) {
    if (query.includes("course_surface,surface")) return "turf_speed_targets_or_context";
    if (query.includes("'standard%'")) return "aw_speed_context";
    if (query.includes("like '%hurdle%'")) return "jump_speed_context";
    return "jump_or_aw_speed_targets";
  }
  if (query.includes('"trainer_id"') && !query.includes('"horse_id"')) return "trainer_history";
  if (query.includes('"jockey_id"') && !query.includes('"horse_id"')) return "jockey_history";
  return "other";
}

async function main() {
  const date = process.argv.find(arg => arg.startsWith("--date="))?.slice(7) ?? getLocalRacingDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Expected --date=YYYY-MM-DD");
  const compare = process.argv.find(arg => arg.startsWith("--compare="))?.slice(10);
  const explain = process.argv.includes("--explain");
  const includePage = process.argv.includes("--page");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  url.searchParams.set("options", "-c default_transaction_read_only=on");
  process.env.DATABASE_URL = url.toString();
  const client = postgres(url.toString());
  let activeQueries: Query[] = [];
  const db = drizzle(client, { schema, logger: {
    logQuery(query, params) {
      if (/^select\b/i.test(query)) activeQueries.push({ query, params: structuredClone(params) });
    },
  } });
  const directory = await mkdtemp(join(tmpdir(), "racing-phase2a-"));
  try {
    await withReadOnlyDiagnostic(() => db.transaction(async tx => {
      // The loader's Db type includes $client, although it only uses the query API.
      // Keep every loader query on the transaction's reserved connection.
      const snapshotDb = Object.assign(tx, { $client: client });
      let baseline: string | undefined;
      const allQueries = new Map<string, Query>();
      for (const pass of ["first", "repeat"] as const) {
        activeQueries = [];
        const stages: Record<string, number> = {};
        const started = performance.now();
        const data = await getTodaysRacingData(snapshotDb, date, { onTiming: (name, ms) => { stages[name] = ms; } });
        const durationMs = performance.now() - started;
        assert.equal(data.status, "ok", "A populated Today card is required");
        const snapshot = JSON.stringify(data, null, 2) + "\n";
        if (baseline !== undefined) assert.equal(snapshot, baseline, "Repeat loader output drifted within the snapshot");
        baseline = snapshot;
        if (compare) assert.deepEqual(JSON.parse(snapshot), JSON.parse(await readFile(compare, "utf8")), "Loader differs from saved baseline");
        await writeFile(join(directory, `${pass}.json`), snapshot, { flag: "wx" });
        const counts = new Map<string, number>();
        for (const row of activeQueries) {
          const key = queryKey(row);
          counts.set(key, (counts.get(key) ?? 0) + 1);
          allQueries.set(key, row);
        }
        const summary = {
          pass, date, durationMs, stages, snapshotHash: digest(snapshot),
          queries: activeQueries.length, uniqueQueries: counts.size,
          repeatedQueries: [...counts].filter(([, count]) => count > 1).map(([key, count]) => ({ key, count })),
          queryKinds: activeQueries.reduce<Record<string, number>>((result, row) => {
            const kind = queryKind(row.query);
            result[kind] = (result[kind] ?? 0) + 1;
            return result;
          }, {}),
        };
        await writeFile(join(directory, `${pass}-summary.json`), JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
        console.info(JSON.stringify(summary));
      }
      if (explain) {
        const plans = [];
        // These are additional, serial diagnostic executions, not production query timings.
        // The driver also forces read-only mode on this separate connection.
        for (const [key, row] of allQueries) {
          const rows = await client.unsafe(
            `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${row.query}`,
            row.params as Parameters<typeof client.unsafe>[1],
          );
          const plan = (rows[0]["QUERY PLAN"] as Plan[])[0];
          plans.push({ key, kind: queryKind(row.query),
            planningMs: plan["Planning Time"], executionMs: plan["Execution Time"], nodes: planNodes(plan.Plan) });
        }
        await writeFile(join(directory, "plans.json"), JSON.stringify(plans, null, 2) + "\n", { flag: "wx" });
        console.info(JSON.stringify({ plans: plans.length, executionMsByKind: plans.reduce<Record<string, number>>((result, plan) => {
          result[plan.kind] = (result[plan.kind] ?? 0) + plan.executionMs;
          return result;
        }, {}) }));
      }
    }, { isolationLevel: "repeatable read", accessMode: "read only" }));
    if (includePage) {
      // Full rendered output also covers frozen Tissue/Value and V2/V3 display.
      // Page opens its own forced-read-only connections; this is NOT the loader
      // transaction and is deliberately excluded from loader/query measurements.
      const { default: Page } = await import("../src/app/racing/today/page");
      const { renderToReadableStream } = await import("react-dom/server");
      let baseline: string | undefined;
      for (const pass of ["first", "repeat"]) {
        const html = await withReadOnlyDiagnostic(async () => {
          const element = await Page({ searchParams: Promise.resolve({ date }) });
          const stream = await renderToReadableStream(element);
          await stream.allReady;
          return new Response(stream).text();
        });
        await writeFile(join(directory, `${pass}-page.html`), html, { flag: "wx" });
        if (baseline !== undefined) assert.equal(html, baseline, "Rendered page changed between read-only passes");
        baseline = html;
        console.info(JSON.stringify({ pagePass: pass, htmlHash: digest(html) }));
      }
    }
    console.info(`Read-only loader diagnostics saved to ${directory}`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

try { await main(); }
catch {
  console.error("Today loader diagnostics failed; connection details and underlying errors suppressed.");
  process.exitCode = 1;
}

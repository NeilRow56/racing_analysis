import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createDbConnection } from "@/db";
import { raceResultSurface } from "./race-result-surface";

test("indexed surface lookup preserves join values, source isolation and missing results", {
  skip: !process.env.DATABASE_URL,
}, async () => {
  // Read-only CTE fixtures shadow the real tables; no persistent data is touched.
  const query = new PgDialect().sqlToQuery(sql`
    with races(source_id) as (
      values ('turf'), ('mixed'), ('spaces'), ('missing'), ('null'), ('other-source'), ('other-type')
    ), source_imports(source, source_type, source_id, payload) as (
      values
        ('sporting_life', 'full-result-next-data', 'turf', '{"props":{"pageProps":{"race":{"race_summary":{"course_surface":{"surface":"TURF"}}}}}}'::jsonb),
        ('sporting_life', 'full-result-next-data', 'mixed', '{"props":{"pageProps":{"race":{"race_summary":{"course_surface":{"surface":"tUrF"}}}}}}'::jsonb),
        ('sporting_life', 'full-result-next-data', 'spaces', '{"props":{"pageProps":{"race":{"race_summary":{"course_surface":{"surface":" TURF "}}}}}}'::jsonb),
        ('sporting_life', 'full-result-next-data', 'null', '{}'::jsonb),
        ('other', 'full-result-next-data', 'other-source', '{"props":{"pageProps":{"race":{"race_summary":{"course_surface":{"surface":"TURF"}}}}}}'::jsonb),
        ('sporting_life', 'racecard', 'other-type', '{"props":{"pageProps":{"race":{"race_summary":{"course_surface":{"surface":"TURF"}}}}}}'::jsonb),
        ('other', 'full-result-next-data', 'turf', '{}'::jsonb),
        ('sporting_life', 'racecard', 'turf', '{}'::jsonb)
    )
    select races.source_id as id, ${raceResultSurface("sporting_life")} as surface
    from races order by races.source_id
  `);
  const parameters = query.params.map((value) => {
    assert.equal(typeof value, "string");
    return String(value);
  });
  const connection = createDbConnection();
  try {
    const rows = await connection.client.unsafe(query.sql, parameters);
    assert.deepEqual(Array.from(rows), [
      { id: "missing", surface: null },
      { id: "mixed", surface: "tUrF" },
      { id: "null", surface: null },
      { id: "other-source", surface: null },
      { id: "other-type", surface: null },
      { id: "spaces", surface: " TURF " },
      { id: "turf", surface: "TURF" },
    ]);
  } finally {
    await connection.client.end();
  }
});

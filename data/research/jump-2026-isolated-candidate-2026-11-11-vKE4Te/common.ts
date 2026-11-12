import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as schema from "@/db/schema";
export const ROOT = "data/research/jump-2026-isolated-candidate-2026-11-11-vKE4Te";
export const OLD = "data/research/backtest-cache/backtest_features_v4-sporting_life-jump-2026-01-01-2026-12-31";
export const FROM = "2026-01-01", TO = "2026-10-14";
export function connection() {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("options", "-c default_transaction_read_only=on");
  // All incidental evidence-reader connections inherit the same read-only startup option.
  process.env.DATABASE_URL = url.toString();
  const client = postgres(url.toString(), { max: 1, connect_timeout: 10, connection: { default_transaction_read_only: true } });
  return { client, db: drizzle(client, { schema }) };
}
export async function save(name: string, value: unknown) { await writeFile(join(ROOT,name),JSON.stringify(value,null,2)+"\n"); }
export async function json<T>(path: string): Promise<T> { return JSON.parse(await readFile(path,"utf8")) as T; }
export type Race = { id: string; source_id: string; date: string; at: string; course_id: string; course: string; name: string | null; type: string | null; type_code: string | null; distance: number | null; winning_time: string | null; stage: string | null; full_count: number; full_id: string | null; payload_hash: string | null; raw_time: string | null };
export type Runner = { id: string; source_id: string; race_id: string; horse_id: string; horse: string; trainer_id: string | null; jockey_id: string | null; finishing_position: number | null; result_status: string | null; outcome_code: string | null; sp: string | null; weight: number | null; official_rating: number | null; beaten_distance: string | null };

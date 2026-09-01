import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseEnv } from "@/lib/env";
import * as schema from "./schema";

export function createDbConnection(databaseUrl = getDatabaseEnv().DATABASE_URL) {
  const client = postgres(databaseUrl);
  const db = drizzle(client, { schema });

  return { client, db };
}

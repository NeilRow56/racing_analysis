import { z } from "zod";

const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
});

export function getDatabaseEnv() {
  return databaseEnvSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
  });
}

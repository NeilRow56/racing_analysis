import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { races, sourceImports } from "./schema";

// Display-only prices. Original imports and research capture readers never use this table.
export const raceCurrentPrices = pgTable("race_current_prices", {
  raceId: uuid("race_id").primaryKey().references(() => races.id),
  source: text("source").notNull(),
  sourceId: text("source_id").notNull(),
  originalImportId: uuid("original_import_id").notNull().references(() => sourceImports.id),
  originalFetchedAt: timestamp("original_fetched_at", { withTimezone: true }).notNull(),
  originalPayloadHash: text("original_payload_hash").notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  scheduledOff: timestamp("scheduled_off", { withTimezone: true }).notNull(),
  payload: jsonb("payload").notNull(),
  priceHash: text("price_hash").notNull(),
});

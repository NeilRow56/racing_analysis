CREATE TABLE "race_current_prices" (
	"race_id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"original_import_id" uuid NOT NULL,
	"original_fetched_at" timestamp with time zone NOT NULL,
	"original_payload_hash" text NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"scheduled_off" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"price_hash" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "race_current_prices" ADD CONSTRAINT "race_current_prices_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_current_prices" ADD CONSTRAINT "race_current_prices_original_import_id_source_imports_id_fk" FOREIGN KEY ("original_import_id") REFERENCES "public"."source_imports"("id") ON DELETE no action ON UPDATE no action;
CREATE TABLE "turf_performance_rating_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_id" uuid NOT NULL,
	"runner_id" uuid NOT NULL,
	"horse_id" uuid NOT NULL,
	"race_date" date NOT NULL,
	"rating" numeric(8, 3) NOT NULL,
	"raw_rating" numeric(10, 6) NOT NULL,
	"rank" integer NOT NULL,
	"gap" numeric(8, 3),
	"history_depth" integer NOT NULL,
	"formula_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "turf_performance_rating_snapshots" ADD CONSTRAINT "turf_performance_rating_snapshots_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turf_performance_rating_snapshots" ADD CONSTRAINT "turf_performance_rating_snapshots_runner_id_race_runners_id_fk" FOREIGN KEY ("runner_id") REFERENCES "public"."race_runners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turf_performance_rating_snapshots" ADD CONSTRAINT "turf_performance_rating_snapshots_horse_id_horses_id_fk" FOREIGN KEY ("horse_id") REFERENCES "public"."horses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tpr_snapshots_runner_version_idx" ON "turf_performance_rating_snapshots" USING btree ("runner_id","formula_version");--> statement-breakpoint
CREATE INDEX "tpr_snapshots_race_date_idx" ON "turf_performance_rating_snapshots" USING btree ("race_date");--> statement-breakpoint
CREATE INDEX "tpr_snapshots_race_idx" ON "turf_performance_rating_snapshots" USING btree ("race_id");
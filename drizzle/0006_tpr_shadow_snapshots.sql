ALTER TABLE "turf_performance_rating_snapshots" ADD COLUMN "rating_basis" text DEFAULT 'turf' NOT NULL;--> statement-breakpoint
ALTER TABLE "turf_performance_rating_snapshots" ADD COLUMN "is_cross_surface_fallback" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "turf_performance_rating_snapshots" ADD COLUMN "fallback_source_surface" text;--> statement-breakpoint
CREATE TABLE "turf_performance_rating_shadow_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_id" uuid NOT NULL,
	"runner_id" uuid NOT NULL,
	"horse_id" uuid NOT NULL,
	"race_date" date NOT NULL,
	"race_datetime" timestamp with time zone,
	"formula_version" text NOT NULL,
	"rating_basis" text DEFAULT 'turf' NOT NULL,
	"is_cross_surface_fallback" boolean DEFAULT false NOT NULL,
	"fallback_source_surface" text,
	"w100_rating" numeric(8, 3),
	"w100_raw_rating" numeric(10, 6),
	"w100_rank" integer,
	"w50_rating" numeric(8, 3),
	"w50_raw_rating" numeric(10, 6),
	"w50_rank" integer,
	"is_w100_rank_1" boolean DEFAULT false NOT NULL,
	"is_w50_rank_1" boolean DEFAULT false NOT NULL,
	"shadow_agreement" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "turf_performance_rating_shadow_snapshots" ADD CONSTRAINT "turf_performance_rating_shadow_snapshots_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turf_performance_rating_shadow_snapshots" ADD CONSTRAINT "turf_performance_rating_shadow_snapshots_runner_id_race_runners_id_fk" FOREIGN KEY ("runner_id") REFERENCES "public"."race_runners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turf_performance_rating_shadow_snapshots" ADD CONSTRAINT "turf_performance_rating_shadow_snapshots_horse_id_horses_id_fk" FOREIGN KEY ("horse_id") REFERENCES "public"."horses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tpr_shadow_snapshots_runner_version_idx" ON "turf_performance_rating_shadow_snapshots" USING btree ("runner_id","formula_version");--> statement-breakpoint
CREATE INDEX "tpr_shadow_snapshots_race_date_idx" ON "turf_performance_rating_shadow_snapshots" USING btree ("race_date");--> statement-breakpoint
CREATE INDEX "tpr_shadow_snapshots_race_idx" ON "turf_performance_rating_shadow_snapshots" USING btree ("race_id");

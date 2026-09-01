CREATE TABLE "source_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"source_type" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "race_runners" ADD COLUMN "saddlecloth_number" integer;--> statement-breakpoint
ALTER TABLE "race_runners" ADD COLUMN "outcome_code" text;--> statement-breakpoint
ALTER TABLE "race_runners" ADD COLUMN "beaten_distance" text;--> statement-breakpoint
ALTER TABLE "race_runners" ADD COLUMN "beaten_distance_to_winner" text;--> statement-breakpoint
ALTER TABLE "race_runners" ADD COLUMN "weight_carried_lbs" integer;--> statement-breakpoint
ALTER TABLE "race_runners" ADD COLUMN "jockey_claim_lbs" integer;--> statement-breakpoint
ALTER TABLE "race_runners" ADD COLUMN "headgear" text;--> statement-breakpoint
ALTER TABLE "race_runners" ADD COLUMN "official_rating" integer;--> statement-breakpoint
ALTER TABLE "race_runners" ADD COLUMN "racing_post_rating" integer;--> statement-breakpoint
ALTER TABLE "race_runners" ADD COLUMN "topspeed_rating" integer;--> statement-breakpoint
ALTER TABLE "race_runners" ADD COLUMN "is_favourite" boolean;--> statement-breakpoint
ALTER TABLE "race_runners" ADD COLUMN "horse_age" integer;--> statement-breakpoint
ALTER TABLE "race_runners" ADD COLUMN "horse_sex" text;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "off_time" time;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "race_datetime" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "local_race_datetime" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "race_type_code" text;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "race_class" text;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "distance_yards" integer;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "declared_runner_count" integer;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "actual_runner_count" integer;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "winning_time" text;--> statement-breakpoint
CREATE UNIQUE INDEX "source_imports_source_type_id_idx" ON "source_imports" USING btree ("source","source_type","source_id");
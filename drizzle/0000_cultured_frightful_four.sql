CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text,
	"source_id" text,
	"display_name" text NOT NULL,
	"normalized_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"country" text DEFAULT 'UK'
);
--> statement-breakpoint
CREATE TABLE "horses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text,
	"source_id" text,
	"display_name" text NOT NULL,
	"normalized_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jockeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text,
	"source_id" text,
	"display_name" text NOT NULL,
	"normalized_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "race_runners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text,
	"source_id" text,
	"race_id" uuid NOT NULL,
	"horse_id" uuid NOT NULL,
	"trainer_id" uuid,
	"jockey_id" uuid,
	"finishing_position" integer,
	"finishing_status" text,
	"draw" integer,
	"weight" text,
	"starting_price" text,
	"starting_price_decimal" numeric(8, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "races" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text,
	"source_id" text,
	"race_date" date NOT NULL,
	"course_id" uuid NOT NULL,
	"scheduled_time" time,
	"race_name" text,
	"race_type" text,
	"distance" text,
	"going" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trainers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text,
	"source_id" text,
	"display_name" text NOT NULL,
	"normalized_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "race_runners" ADD CONSTRAINT "race_runners_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_runners" ADD CONSTRAINT "race_runners_horse_id_horses_id_fk" FOREIGN KEY ("horse_id") REFERENCES "public"."horses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_runners" ADD CONSTRAINT "race_runners_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_runners" ADD CONSTRAINT "race_runners_jockey_id_jockeys_id_fk" FOREIGN KEY ("jockey_id") REFERENCES "public"."jockeys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "courses_source_source_id_idx" ON "courses" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "courses_normalized_name_idx" ON "courses" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "horses_source_source_id_idx" ON "horses" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "horses_normalized_name_idx" ON "horses" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "jockeys_source_source_id_idx" ON "jockeys" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "jockeys_normalized_name_idx" ON "jockeys" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "race_runners_source_source_id_idx" ON "race_runners" USING btree ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "race_runners_race_horse_idx" ON "race_runners" USING btree ("race_id","horse_id");--> statement-breakpoint
CREATE INDEX "race_runners_trainer_idx" ON "race_runners" USING btree ("trainer_id");--> statement-breakpoint
CREATE INDEX "race_runners_jockey_idx" ON "race_runners" USING btree ("jockey_id");--> statement-breakpoint
CREATE UNIQUE INDEX "races_source_source_id_idx" ON "races" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "races_course_date_idx" ON "races" USING btree ("course_id","race_date");--> statement-breakpoint
CREATE UNIQUE INDEX "trainers_source_source_id_idx" ON "trainers" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "trainers_normalized_name_idx" ON "trainers" USING btree ("normalized_name");
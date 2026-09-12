CREATE TABLE "saved_research_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"rule_schema_version" text NOT NULL,
	"rule_identity" text NOT NULL,
	"canonical_rule" jsonb NOT NULL,
	"family" text NOT NULL,
	"development_from" date NOT NULL,
	"development_to" date NOT NULL,
	"development_snapshot" jsonb NOT NULL,
	"cache_metadata" jsonb,
	"frozen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "saved_research_rules_status_idx" ON "saved_research_rules" USING btree ("status");--> statement-breakpoint
CREATE INDEX "saved_research_rules_family_idx" ON "saved_research_rules" USING btree ("family");--> statement-breakpoint
CREATE INDEX "saved_research_rules_rule_identity_idx" ON "saved_research_rules" USING btree ("rule_identity");
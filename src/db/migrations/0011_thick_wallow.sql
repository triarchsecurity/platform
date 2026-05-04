CREATE TABLE "slack_action_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" varchar(128) NOT NULL,
	"actor_email" varchar(256),
	"actor_slack_id" varchar(64) NOT NULL,
	"payload_hash" text NOT NULL,
	"response_status" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "slack_action_audit_created_at_idx" ON "slack_action_audit" USING btree ("created_at" DESC NULLS LAST);
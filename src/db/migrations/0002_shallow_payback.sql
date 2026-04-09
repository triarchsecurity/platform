CREATE TABLE "access_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project" varchar(64) NOT NULL,
	"actor_user_id" varchar(128) NOT NULL,
	"actor_email" varchar(256),
	"target_entity_type" varchar(32) NOT NULL,
	"target_entity_id" varchar(128) NOT NULL,
	"target_entity_name" varchar(256),
	"action" varchar(32) NOT NULL,
	"reason" text NOT NULL,
	"session_id" varchar(128),
	"ip_address" varchar(45),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

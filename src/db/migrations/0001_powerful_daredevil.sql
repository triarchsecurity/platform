CREATE TABLE "release_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project" varchar(64) NOT NULL,
	"version" varchar(32) NOT NULL,
	"release_type" varchar(16) NOT NULL,
	"released_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_by" varchar(128),
	"summary" text,
	"entries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

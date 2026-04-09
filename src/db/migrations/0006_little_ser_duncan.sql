CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"firebase_project_id" varchar(128),
	"crdb_cluster" varchar(256),
	"crdb_database" varchar(128),
	"crdb_user" varchar(128),
	"subdomain" varchar(128),
	"custom_domain" varchar(256),
	"deployed_url" varchar(512),
	"github_repo" varchar(256),
	"tech_stack" jsonb DEFAULT '{}'::jsonb,
	"current_version" varchar(32),
	"ecosystem" varchar(64) DEFAULT 'triarch-dev' NOT NULL,
	"api_key" varchar(128),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "projects_key_idx" ON "projects" USING btree ("key");
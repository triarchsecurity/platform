CREATE TABLE "promote_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project" varchar(64) NOT NULL,
	"branch" varchar(256) NOT NULL,
	"result" varchar(16) NOT NULL,
	"merge_sha" varchar(64),
	"conflict_files" jsonb DEFAULT '[]'::jsonb,
	"rebase_error" text,
	"ci_run_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "promote_attempts_project_branch_idx" ON "promote_attempts" ("project", "branch");
--> statement-breakpoint
CREATE INDEX "promote_attempts_created_at_idx" ON "promote_attempts" USING btree ("created_at" DESC NULLS LAST);

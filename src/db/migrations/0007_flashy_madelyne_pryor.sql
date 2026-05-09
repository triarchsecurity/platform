CREATE TABLE "project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_key" varchar(64) NOT NULL,
	"email" varchar(256) NOT NULL,
	"role" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"approver_email" varchar(256) NOT NULL,
	"decision" varchar(16) NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" varchar(45),
	"user_agent" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"author_email" varchar(256) NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "release_logs" ADD COLUMN "env" varchar(8);--> statement-breakpoint
ALTER TABLE "release_logs" ADD COLUMN "status" varchar(24);--> statement-breakpoint
ALTER TABLE "release_logs" ADD COLUMN "commit_sha" varchar(64);--> statement-breakpoint
ALTER TABLE "release_logs" ADD COLUMN "deployed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "release_approvals" ADD CONSTRAINT "release_approvals_release_id_release_logs_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."release_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_feedback" ADD CONSTRAINT "release_feedback_release_id_release_logs_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."release_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_unique_idx" ON "project_members" USING btree ("project_key",lower("email"));
ALTER TABLE "release_logs" ADD COLUMN "branch" varchar(256) DEFAULT 'main';
--> statement-breakpoint
UPDATE "release_logs" SET "branch" = 'main' WHERE "branch" IS NULL;
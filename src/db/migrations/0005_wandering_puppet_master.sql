CREATE TABLE "report_section_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"category" varchar(64) NOT NULL,
	"icon" varchar(64),
	"data_schema" jsonb NOT NULL,
	"default_config" jsonb DEFAULT '{}'::jsonb,
	"requires_service_offering" boolean DEFAULT false,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project" varchar(64) NOT NULL,
	"company_id" uuid,
	"title" varchar(256) NOT NULL,
	"report_type" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "report_section_types_key_idx" ON "report_section_types" USING btree ("key");
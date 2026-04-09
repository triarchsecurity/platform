CREATE TABLE "offering_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offering_id" uuid NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"component_type" varchar(32) NOT NULL,
	"frequency" varchar(32),
	"quantity" integer DEFAULT 1,
	"duration_minutes" integer,
	"is_billable" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offering_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offering_id" uuid NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"milestone_type" varchar(32) NOT NULL,
	"month_offset" integer NOT NULL,
	"revenue_percent" varchar(8),
	"deliverables" jsonb DEFAULT '[]'::jsonb,
	"sort_order" integer DEFAULT 0,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"name" varchar(256) NOT NULL,
	"short_description" text,
	"full_description" text,
	"category" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"pricing_model" varchar(32) NOT NULL,
	"pricing_details" jsonb DEFAULT '{}'::jsonb,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_months" integer,
	"website_visible" boolean DEFAULT false,
	"website_sort_order" integer DEFAULT 0,
	"website_features" jsonb DEFAULT '[]'::jsonb,
	"website_cta_text" varchar(128) DEFAULT 'Learn More',
	"website_cta_url" varchar(512),
	"created_by" varchar(128),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "offering_components" ADD CONSTRAINT "offering_components_offering_id_service_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."service_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_milestones" ADD CONSTRAINT "offering_milestones_offering_id_service_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."service_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_offerings_key_idx" ON "service_offerings" USING btree ("key");
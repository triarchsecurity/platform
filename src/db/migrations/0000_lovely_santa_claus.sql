CREATE TABLE "menu_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" varchar(128) NOT NULL,
	"icon" varchar(64),
	"path" varchar(256) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"min_role" varchar(32) DEFAULT 'user' NOT NULL,
	"badge_source" varchar(128),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project" varchar(64) NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" varchar(128) NOT NULL,
	"icon" varchar(64),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"min_role" varchar(32) DEFAULT 'user' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_subpages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" varchar(128) NOT NULL,
	"path" varchar(256) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"min_role" varchar(32) DEFAULT 'user' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module" varchar(64) NOT NULL,
	"project" varchar(64) NOT NULL,
	"scope" varchar(32) NOT NULL,
	"scope_id" varchar(128),
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project" varchar(64) NOT NULL,
	"role" varchar(32) NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" uuid NOT NULL,
	"permission" varchar(16) DEFAULT 'view' NOT NULL,
	"company_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "menu_pages" ADD CONSTRAINT "menu_pages_section_id_menu_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."menu_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_subpages" ADD CONSTRAINT "menu_subpages_page_id_menu_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."menu_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_pages_section_key_idx" ON "menu_pages" USING btree ("section_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_sections_project_key_idx" ON "menu_sections" USING btree ("project","key");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_subpages_page_key_idx" ON "menu_subpages" USING btree ("page_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "module_settings_unique_idx" ON "module_settings" USING btree ("module","project","scope","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_unique_idx" ON "role_permissions" USING btree ("project","role","entity_type","entity_id","company_id");
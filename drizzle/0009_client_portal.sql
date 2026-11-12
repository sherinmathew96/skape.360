CREATE TABLE "client_portals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"passcode_hash" text,
	"cover_file_id" uuid,
	"brief" text,
	"area" text,
	"sections" jsonb DEFAULT '{"drawings":true,"models":true,"tours":true,"site":true}'::jsonb NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_portals_project_id_unique" UNIQUE("project_id"),
	CONSTRAINT "client_portals_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "portal_id" uuid;--> statement-breakpoint
ALTER TABLE "client_portals" ADD CONSTRAINT "client_portals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portals" ADD CONSTRAINT "client_portals_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portals" ADD CONSTRAINT "client_portals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_portal_id_client_portals_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."client_portals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Close Supabase's public Data API to the new table (see 0001_enable_rls.sql).
ALTER TABLE "client_portals" ENABLE ROW LEVEL SECURITY;

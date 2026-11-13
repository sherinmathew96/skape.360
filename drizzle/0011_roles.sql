CREATE TABLE "roles" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- The five roles the app has always had, with the same access as before.
INSERT INTO "roles" ("key", "name", "permissions", "system") VALUES
  ('admin', 'Admin', '["staff.manage","projects.create","projects.edit","projects.view_all","tasks.manage","studio.manage","share.manage","site.report","procurement.manage","procurement.prices","finance.view","finance.manage","expense.add"]'::jsonb, true),
  ('project_manager', 'Project manager', '["projects.create","projects.edit","projects.view_all","tasks.manage","studio.manage","share.manage","site.report","procurement.manage","procurement.prices","finance.view","expense.add"]'::jsonb, true),
  ('architect', 'Architect', '["studio.manage","share.manage"]'::jsonb, true),
  ('site_engineer', 'Site engineer', '["site.report","expense.add"]'::jsonb, true),
  ('accountant', 'Accountant', '["projects.view_all","procurement.prices","finance.view","finance.manage","expense.add"]'::jsonb, true)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
-- Close Supabase's public Data API to the new table (see 0001_enable_rls.sql).
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "site_report_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"date" date NOT NULL,
	"weather" text NOT NULL,
	"labour" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"work_done" text NOT NULL,
	"issues" text,
	"client_visible" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"location" text,
	"assignee_id" uuid,
	"due_date" date,
	"status" text DEFAULT 'open' NOT NULL,
	"photo_file_id" uuid,
	"fix_photo_file_id" uuid,
	"fix_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fixed_at" timestamp with time zone,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "site_report_photos" ADD CONSTRAINT "site_report_photos_report_id_site_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."site_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_report_photos" ADD CONSTRAINT "site_report_photos_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_reports" ADD CONSTRAINT "site_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_reports" ADD CONSTRAINT "site_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snags" ADD CONSTRAINT "snags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snags" ADD CONSTRAINT "snags_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snags" ADD CONSTRAINT "snags_photo_file_id_files_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snags" ADD CONSTRAINT "snags_fix_photo_file_id_files_id_fk" FOREIGN KEY ("fix_photo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snags" ADD CONSTRAINT "snags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_photos_report_idx" ON "site_report_photos" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_reports_project_date_idx" ON "site_reports" USING btree ("project_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "snags_project_number_idx" ON "snags" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "snags_status_idx" ON "snags" USING btree ("project_id","status");--> statement-breakpoint
-- Close Supabase's public Data API to the new tables (see 0001_enable_rls.sql).
ALTER TABLE "site_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "site_report_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "snags" ENABLE ROW LEVEL SECURITY;

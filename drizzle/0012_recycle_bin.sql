DROP INDEX "site_reports_project_date_idx";--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "trash_days" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "drawings" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drawings" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "models_3d" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "models_3d" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "site_reports" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "site_reports" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "tours" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tours" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firms" ADD CONSTRAINT "firms_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models_3d" ADD CONSTRAINT "models_3d_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_reports" ADD CONSTRAINT "site_reports_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tours" ADD CONSTRAINT "tours_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "site_reports_project_date_idx" ON "site_reports" USING btree ("project_id","date") WHERE deleted_at is null;
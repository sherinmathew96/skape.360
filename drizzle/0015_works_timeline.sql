CREATE TABLE "works" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"section" text DEFAULT 'Works' NOT NULL,
	"code" text,
	"title" text NOT NULL,
	"unit" text,
	"qty" numeric(14, 3),
	"rate" numeric(14, 2),
	"amount" numeric(14, 2),
	"position" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"planned_start" date,
	"planned_end" date,
	"started_on" date,
	"completed_on" date,
	"note" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "works_project_idx" ON "works" USING btree ("project_id","position");--> statement-breakpoint
-- Close Supabase's public Data API to the new table (see 0001_enable_rls.sql).
ALTER TABLE "works" ENABLE ROW LEVEL SECURITY;

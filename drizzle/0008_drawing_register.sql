CREATE TABLE "drawing_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drawings" ALTER COLUMN "number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "drawings" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "drawings" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "drawings" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "drawings" ADD COLUMN "assignee_id" uuid;--> statement-breakpoint
ALTER TABLE "drawings" ADD COLUMN "client_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "drawings" ADD COLUMN "status_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "drawing_groups" ADD CONSTRAINT "drawing_groups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drawing_groups_project_idx" ON "drawing_groups" USING btree ("project_id","position");--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_group_id_drawing_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."drawing_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drawings_group_idx" ON "drawings" USING btree ("group_id","position");--> statement-breakpoint
-- Existing drawings take their status from where their latest revision stands.
UPDATE "drawings" d SET "status" = CASE r."status"
  WHEN 'approved' THEN 'production'
  WHEN 'changes_requested' THEN 'revision'
  ELSE 'pending' END
FROM (SELECT DISTINCT ON ("drawing_id") "drawing_id", "status" FROM "drawing_revisions" ORDER BY "drawing_id", "rev" DESC) r
WHERE r."drawing_id" = d."id";--> statement-breakpoint
-- Keep the old order (by sheet number) as the starting order.
UPDATE "drawings" d SET "position" = o.n FROM (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "project_id" ORDER BY "number", "created_at"))::int AS n FROM "drawings"
) o WHERE o."id" = d."id";--> statement-breakpoint
-- Close Supabase's public Data API to the new table (see 0001_enable_rls.sql).
ALTER TABLE "drawing_groups" ENABLE ROW LEVEL SECURITY;

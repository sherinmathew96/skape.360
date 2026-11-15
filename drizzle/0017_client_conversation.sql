CREATE TABLE "client_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"href" text NOT NULL,
	"section" text NOT NULL,
	"drawing_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"drawing_id" uuid,
	"model_id" uuid,
	"render_id" uuid,
	"author" text NOT NULL,
	"author_name" text NOT NULL,
	"user_id" uuid,
	"portal_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_one_item" CHECK (num_nonnulls("comments"."drawing_id", "comments"."model_id", "comments"."render_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "inbox_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_updates" ADD CONSTRAINT "client_updates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_updates" ADD CONSTRAINT "client_updates_drawing_id_drawings_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_drawing_id_drawings_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_model_id_models_3d_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models_3d"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_render_id_drawing_renders_id_fk" FOREIGN KEY ("render_id") REFERENCES "public"."drawing_renders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_portal_id_client_portals_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."client_portals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_updates_project_idx" ON "client_updates" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_project_idx" ON "comments" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_drawing_idx" ON "comments" USING btree ("drawing_id");--> statement-breakpoint
CREATE INDEX "comments_model_idx" ON "comments" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "comments_render_idx" ON "comments" USING btree ("render_id");--> statement-breakpoint
-- Close Supabase's public Data API to the new tables (see 0001_enable_rls.sql).
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_updates" ENABLE ROW LEVEL SECURITY;

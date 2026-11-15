CREATE TABLE "drawing_models" (
	"drawing_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drawing_models_drawing_id_model_id_pk" PRIMARY KEY("drawing_id","model_id")
);
--> statement-breakpoint
CREATE TABLE "drawing_renders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drawing_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawing_tours" (
	"drawing_id" uuid NOT NULL,
	"tour_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drawing_tours_drawing_id_tour_id_pk" PRIMARY KEY("drawing_id","tour_id")
);
--> statement-breakpoint
ALTER TABLE "drawing_models" ADD CONSTRAINT "drawing_models_drawing_id_drawings_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_models" ADD CONSTRAINT "drawing_models_model_id_models_3d_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models_3d"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_renders" ADD CONSTRAINT "drawing_renders_drawing_id_drawings_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_renders" ADD CONSTRAINT "drawing_renders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_renders" ADD CONSTRAINT "drawing_renders_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_renders" ADD CONSTRAINT "drawing_renders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_tours" ADD CONSTRAINT "drawing_tours_drawing_id_drawings_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_tours" ADD CONSTRAINT "drawing_tours_tour_id_tours_id_fk" FOREIGN KEY ("tour_id") REFERENCES "public"."tours"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drawing_models_model_idx" ON "drawing_models" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "drawing_renders_drawing_idx" ON "drawing_renders" USING btree ("drawing_id","position");--> statement-breakpoint
CREATE INDEX "drawing_tours_tour_idx" ON "drawing_tours" USING btree ("tour_id");--> statement-breakpoint
-- Close Supabase's public Data API to the new tables (see 0001_enable_rls.sql).
ALTER TABLE "drawing_models" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drawing_tours" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drawing_renders" ENABLE ROW LEVEL SECURITY;

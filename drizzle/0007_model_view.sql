ALTER TABLE "models_3d" ADD COLUMN "optimized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "models_3d" ADD COLUMN "cover_file_id" uuid;--> statement-breakpoint
ALTER TABLE "models_3d" ADD COLUMN "view" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "models_3d" ADD CONSTRAINT "models_3d_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "drawing_groups" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drawing_groups" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "drawing_groups" ADD CONSTRAINT "drawing_groups_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
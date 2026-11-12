CREATE TABLE "firms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"passcode_hash" text,
	"views" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "firms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "firm_id" uuid;--> statement-breakpoint
ALTER TABLE "firms" ADD CONSTRAINT "firms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_firm_idx" ON "projects" USING btree ("firm_id");--> statement-breakpoint
-- Close Supabase's public Data API to the new table (see 0001_enable_rls.sql).
ALTER TABLE "firms" ENABLE ROW LEVEL SECURITY;

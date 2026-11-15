ALTER TABLE "drawing_groups" ADD COLUMN "share_slug" text;--> statement-breakpoint
ALTER TABLE "drawings" ADD COLUMN "share_slug" text;--> statement-breakpoint
ALTER TABLE "drawing_groups" ADD CONSTRAINT "drawing_groups_share_slug_unique" UNIQUE("share_slug");--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_share_slug_unique" UNIQUE("share_slug");
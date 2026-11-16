CREATE TABLE "live_version" (
	"id" integer PRIMARY KEY NOT NULL,
	"v" integer DEFAULT 0 NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "live_version" ("id", "v") VALUES (1, 0) ON CONFLICT DO NOTHING;

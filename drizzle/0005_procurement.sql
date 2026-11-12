CREATE TABLE "business_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"company_name" text DEFAULT 'Studio Skape' NOT NULL,
	"address" text,
	"gstin" text,
	"phone" text,
	"email" text,
	"po_terms" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_items" (
	"receipt_id" uuid NOT NULL,
	"po_item_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	CONSTRAINT "goods_receipt_items_receipt_id_po_item_id_pk" PRIMARY KEY("receipt_id","po_item_id")
);
--> statement-breakpoint
CREATE TABLE "goods_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_id" uuid NOT NULL,
	"received_on" date NOT NULL,
	"note" text,
	"photo_file_id" uuid,
	"received_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_request_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"needed_by" date,
	"note" text,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text
);
--> statement-breakpoint
CREATE TABLE "po_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit" text NOT NULL,
	"rate" numeric(14, 2) NOT NULL,
	"gst_rate" numeric(5, 2) DEFAULT '18' NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"project_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"request_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"expected_date" date,
	"delivery_address" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_at" timestamp with time zone,
	CONSTRAINT "purchase_orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"gstin" text,
	"address" text,
	"supplies" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_po_item_id_po_items_id_fk" FOREIGN KEY ("po_item_id") REFERENCES "public"."po_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_photo_file_id_files_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_request_items" ADD CONSTRAINT "material_request_items_request_id_material_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."material_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_items" ADD CONSTRAINT "po_items_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_request_id_material_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."material_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipts_po_idx" ON "goods_receipts" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "request_items_request_idx" ON "material_request_items" USING btree ("request_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "requests_project_number_idx" ON "material_requests" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "material_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "po_items_po_idx" ON "po_items" USING btree ("po_id","position");--> statement-breakpoint
CREATE INDEX "pos_project_idx" ON "purchase_orders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "pos_status_idx" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "suppliers_name_idx" ON "suppliers" USING btree ("name");--> statement-breakpoint
-- Close Supabase's public Data API to the new tables (see 0001_enable_rls.sql).
ALTER TABLE "business_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "material_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "material_request_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "po_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goods_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goods_receipt_items" ENABLE ROW LEVEL SECURITY;

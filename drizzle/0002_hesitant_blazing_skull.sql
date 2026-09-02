CREATE TYPE "public"."digital_access_code_status" AS ENUM('active', 'redeemed', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."memory_capture_mode" AS ENUM('note_only', 'note_with_surrounding');--> statement-breakpoint
CREATE TYPE "public"."memory_output_type" AS ENUM('personal_pdf', 'digital_frame', 'physical_gift');--> statement-breakpoint
CREATE TYPE "public"."memory_project_status" AS ENUM('draft', 'ready', 'fulfilled');--> statement-breakpoint
CREATE TYPE "public"."physical_order_status" AS ENUM('pending', 'awaiting_dilekkutum_order', 'matched', 'in_production', 'packaged', 'shipped', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "digital_access_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"memory_project_id" text,
	"code" text NOT NULL,
	"status" "digital_access_code_status" DEFAULT 'active' NOT NULL,
	"redeemed_at" timestamp with time zone,
	"redeemed_by" text,
	"expires_at" timestamp with time zone,
	"external_provider" text,
	"external_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digital_access_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "memory_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"created_by" text NOT NULL,
	"capture_mode" "memory_capture_mode" NOT NULL,
	"output_type" "memory_output_type" NOT NULL,
	"frame_template_id" text,
	"status" "memory_project_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "physical_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"memory_project_id" text NOT NULL,
	"order_number" text NOT NULL,
	"status" "physical_order_status" DEFAULT 'pending' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "physical_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
ALTER TABLE "digital_access_codes" ADD CONSTRAINT "digital_access_codes_memory_project_id_memory_projects_id_fk" FOREIGN KEY ("memory_project_id") REFERENCES "public"."memory_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_access_codes" ADD CONSTRAINT "digital_access_codes_redeemed_by_users_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_projects" ADD CONSTRAINT "memory_projects_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_projects" ADD CONSTRAINT "memory_projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_orders" ADD CONSTRAINT "physical_orders_memory_project_id_memory_projects_id_fk" FOREIGN KEY ("memory_project_id") REFERENCES "public"."memory_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_orders" ADD CONSTRAINT "physical_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
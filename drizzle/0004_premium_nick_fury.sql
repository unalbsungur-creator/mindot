ALTER TABLE "messages" ADD COLUMN "show_on_personal_wall" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "public_wall_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "public_wall_description" text;
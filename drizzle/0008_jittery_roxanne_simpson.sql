ALTER TABLE "messages" ADD COLUMN "consent_accepted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "consent_version" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "consent_accepted_at" timestamp with time zone;
ALTER TABLE "messages" ADD COLUMN "pending_content" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "revision_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "revision_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "revision_reviewed_by" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "revision_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_revision_reviewed_by_users_id_fk" FOREIGN KEY ("revision_reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
CREATE TYPE "public"."message_report_reason" AS ENUM('spam', 'harassment', 'hate', 'sexual_content', 'violence', 'illegal', 'copyright', 'other');--> statement-breakpoint
CREATE TYPE "public"."message_report_status" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TABLE "message_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"reporter_id" text,
	"anonymous_reporter_id" text,
	"reason" "message_report_reason" NOT NULL,
	"details" text,
	"status" "message_report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text
);
--> statement-breakpoint
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "message_reports_message_reporter_idx" ON "message_reports" USING btree ("message_id","reporter_id") WHERE "message_reports"."reporter_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "message_reports_message_anon_idx" ON "message_reports" USING btree ("message_id","anonymous_reporter_id") WHERE "message_reports"."anonymous_reporter_id" is not null;--> statement-breakpoint
CREATE INDEX "message_reports_status_created_idx" ON "message_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "message_reports_message_idx" ON "message_reports" USING btree ("message_id");
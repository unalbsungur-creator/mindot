CREATE TABLE "message_likes" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"user_id" text,
	"anonymous_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "like_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "message_likes" ADD CONSTRAINT "message_likes_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_likes" ADD CONSTRAINT "message_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "message_likes_message_user_idx" ON "message_likes" USING btree ("message_id","user_id") WHERE "message_likes"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "message_likes_message_anon_idx" ON "message_likes" USING btree ("message_id","anonymous_id") WHERE "message_likes"."anonymous_id" is not null;--> statement-breakpoint
CREATE INDEX "message_likes_message_idx" ON "message_likes" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "messages_status_like_count_idx" ON "messages" USING btree ("status","like_count");
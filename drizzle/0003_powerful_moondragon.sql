ALTER TABLE "users" ADD COLUMN "public_id" text;--> statement-breakpoint
CREATE INDEX "messages_author_created_idx" ON "messages" USING btree ("author_id","created_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_public_id_unique" UNIQUE("public_id");
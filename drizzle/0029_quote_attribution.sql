-- MB-01 "Bu söz kimin?" — quote attribution on messages. Hand-written (not
-- drizzle-kit generate), additive only: four new nullable/defaulted columns
-- and two CHECK constraints. Existing rows become "own words"
-- (is_quote = false, quote_author = null) through the constant default;
-- no row is rewritten, nothing is dropped or renamed.
ALTER TABLE "messages" ADD COLUMN "is_quote" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "quote_author" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "pending_is_quote" boolean;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "pending_quote_author" text;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_quote_author_check" CHECK (("messages"."is_quote" or "messages"."quote_author" is null) and ("messages"."quote_author" is null or char_length("messages"."quote_author") between 1 and 80));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_pending_quote_author_check" CHECK (("messages"."pending_is_quote" is true or "messages"."pending_quote_author" is null) and ("messages"."pending_quote_author" is null or char_length("messages"."pending_quote_author") between 1 and 80));

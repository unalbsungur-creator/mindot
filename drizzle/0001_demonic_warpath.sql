CREATE TYPE "public"."ai_moderation_decision" AS ENUM('safe', 'review', 'blocked');--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "ai_moderation_status" "ai_moderation_decision";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "ai_moderation_provider" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "ai_moderation_categories" text[];--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "ai_moderation_reason" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "ai_moderation_confidence" real;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "ai_moderated_at" timestamp with time zone;
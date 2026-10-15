ALTER TABLE "users" ADD COLUMN "public_wall_consent_version" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "public_wall_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_public_wall_consent_pair" CHECK (("users"."public_wall_consent_version" is null) = ("users"."public_wall_consent_at" is null));
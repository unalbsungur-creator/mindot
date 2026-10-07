CREATE TYPE "public"."apple_token_client" AS ENUM('web', 'ios');--> statement-breakpoint
CREATE TYPE "public"."mobile_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TABLE "mobile_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"previous_refresh_token_hash" text,
	"platform" "mobile_platform" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mobile_sessions_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
-- Hand-edited: drizzle-kit cannot name the old primary key and emitted the
-- composite PK before the column it uses. 0020 declared user_id inline as
-- PRIMARY KEY, so Postgres named it apple_sign_in_tokens_pkey. Order: add the
-- column (existing rows become 'web'), drop the old PK, add (user_id, client).
ALTER TABLE "apple_sign_in_tokens" ADD COLUMN "client" "apple_token_client" DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "apple_sign_in_tokens" DROP CONSTRAINT "apple_sign_in_tokens_pkey";--> statement-breakpoint
ALTER TABLE "apple_sign_in_tokens" ADD CONSTRAINT "apple_sign_in_tokens_user_id_client_pk" PRIMARY KEY("user_id","client");--> statement-breakpoint
ALTER TABLE "mobile_sessions" ADD CONSTRAINT "mobile_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mobile_sessions_user_idx" ON "mobile_sessions" USING btree ("user_id");
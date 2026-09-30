CREATE TABLE "apple_sign_in_tokens" (
	"user_id" text PRIMARY KEY NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apple_sign_in_tokens" ADD CONSTRAINT "apple_sign_in_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
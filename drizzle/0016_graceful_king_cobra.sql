CREATE TYPE "public"."memory_pdf_unlock_source" AS ENUM('token', 'legacy_access_code', 'admin', 'legacy_grandfathered');--> statement-breakpoint
CREATE TYPE "public"."token_ledger_type" AS ENUM('grant', 'purchase', 'subscription', 'consume', 'refund', 'adjustment');--> statement-breakpoint
CREATE TABLE "memory_pdf_unlocks" (
	"id" text PRIMARY KEY NOT NULL,
	"memory_project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"source" "memory_pdf_unlock_source" NOT NULL,
	"ledger_entry_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_pdf_unlocks_memory_project_id_unique" UNIQUE("memory_project_id"),
	CONSTRAINT "memory_pdf_unlocks_ledger_entry_id_unique" UNIQUE("ledger_entry_id"),
	CONSTRAINT "memory_pdf_unlocks_token_has_ledger_entry" CHECK ("memory_pdf_unlocks"."source" <> 'token' or "memory_pdf_unlocks"."ledger_entry_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "token_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"type" "token_ledger_type" NOT NULL,
	"balance_after" integer NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"idempotency_key" text NOT NULL,
	"external_provider" text,
	"external_reference" text,
	"created_by" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "token_ledger_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "token_ledger_amount_non_zero" CHECK ("token_ledger"."amount" <> 0),
	CONSTRAINT "token_ledger_balance_after_non_negative" CHECK ("token_ledger"."balance_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "token_wallets" (
	"user_id" text PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "token_wallets_balance_non_negative" CHECK ("token_wallets"."balance" >= 0)
);
--> statement-breakpoint
ALTER TABLE "memory_pdf_unlocks" ADD CONSTRAINT "memory_pdf_unlocks_memory_project_id_memory_projects_id_fk" FOREIGN KEY ("memory_project_id") REFERENCES "public"."memory_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_pdf_unlocks" ADD CONSTRAINT "memory_pdf_unlocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_pdf_unlocks" ADD CONSTRAINT "memory_pdf_unlocks_ledger_entry_id_token_ledger_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."token_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_ledger" ADD CONSTRAINT "token_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_ledger" ADD CONSTRAINT "token_ledger_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_wallets" ADD CONSTRAINT "token_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_pdf_unlocks_user_created_idx" ON "memory_pdf_unlocks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "token_ledger_user_created_idx" ON "token_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "token_ledger_external_ref_idx" ON "token_ledger" USING btree ("external_provider","external_reference") WHERE "token_ledger"."external_provider" is not null and "token_ledger"."external_reference" is not null;
CREATE TABLE "token_purchase_lots" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "provider" text DEFAULT 'shopier' NOT NULL,
  "external_order_reference" text NOT NULL,
  "package_id" text NOT NULL,
  "package_tokens" integer NOT NULL,
  "paid_amount_kurus" integer NOT NULL,
  "credited_ledger_entry_id" text NOT NULL,
  "payment_approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "token_purchase_lots_credited_ledger_entry_id_unique" UNIQUE("credited_ledger_entry_id"),
  CONSTRAINT "token_purchase_lots_tokens_positive" CHECK ("token_purchase_lots"."package_tokens" > 0),
  CONSTRAINT "token_purchase_lots_amount_non_negative" CHECK ("token_purchase_lots"."paid_amount_kurus" >= 0)
);
--> statement-breakpoint
CREATE TABLE "token_purchase_allocations" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "consume_ledger_entry_id" text NOT NULL,
  "purchase_lot_id" text,
  "source_type" text NOT NULL,
  "amount" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "token_purchase_allocations_amount_positive" CHECK ("token_purchase_allocations"."amount" > 0),
  CONSTRAINT "token_purchase_allocations_source_valid" CHECK ("token_purchase_allocations"."source_type" in ('purchase', 'reward', 'admin_grant', 'other')),
  CONSTRAINT "token_purchase_allocations_purchase_has_lot" CHECK ("token_purchase_allocations"."source_type" <> 'purchase' or "token_purchase_allocations"."purchase_lot_id" is not null),
  CONSTRAINT "token_purchase_allocations_nonpurchase_has_no_lot" CHECK ("token_purchase_allocations"."source_type" = 'purchase' or "token_purchase_allocations"."purchase_lot_id" is null)
);
--> statement-breakpoint
CREATE TYPE "token_refund_status" AS ENUM('pending_external_refund', 'external_refund_confirmed', 'cancelled');
--> statement-breakpoint
CREATE TABLE "token_refunds" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "purchase_lot_id" text NOT NULL,
  "status" "token_refund_status" DEFAULT 'pending_external_refund' NOT NULL,
  "refund_amount_kurus" integer NOT NULL,
  "tokens_reversed" integer NOT NULL,
  "idempotency_key" text NOT NULL,
  "external_refund_reference" text,
  "created_by" text NOT NULL,
  "confirmed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "token_refunds_idempotency_key_unique" UNIQUE("idempotency_key"),
  CONSTRAINT "token_refunds_amount_non_negative" CHECK ("token_refunds"."refund_amount_kurus" >= 0),
  CONSTRAINT "token_refunds_tokens_non_negative" CHECK ("token_refunds"."tokens_reversed" >= 0),
  CONSTRAINT "token_refunds_confirmation_pair" CHECK (("token_refunds"."status" = 'external_refund_confirmed') = ("token_refunds"."confirmed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "token_purchase_lots" ADD CONSTRAINT "token_purchase_lots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "token_purchase_lots" ADD CONSTRAINT "token_purchase_lots_credited_ledger_entry_id_token_ledger_id_fk" FOREIGN KEY ("credited_ledger_entry_id") REFERENCES "public"."token_ledger"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "token_purchase_allocations" ADD CONSTRAINT "token_purchase_allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "token_purchase_allocations" ADD CONSTRAINT "token_purchase_allocations_consume_ledger_entry_id_token_ledger_id_fk" FOREIGN KEY ("consume_ledger_entry_id") REFERENCES "public"."token_ledger"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "token_purchase_allocations" ADD CONSTRAINT "token_purchase_allocations_purchase_lot_id_token_purchase_lots_id_fk" FOREIGN KEY ("purchase_lot_id") REFERENCES "public"."token_purchase_lots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "token_refunds" ADD CONSTRAINT "token_refunds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "token_refunds" ADD CONSTRAINT "token_refunds_purchase_lot_id_token_purchase_lots_id_fk" FOREIGN KEY ("purchase_lot_id") REFERENCES "public"."token_purchase_lots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "token_refunds" ADD CONSTRAINT "token_refunds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE UNIQUE INDEX "token_purchase_lots_provider_order_idx" ON "token_purchase_lots" USING btree ("provider", "external_order_reference");
--> statement-breakpoint
CREATE INDEX "token_purchase_lots_user_created_idx" ON "token_purchase_lots" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "token_purchase_allocations_consume_lot_source_idx" ON "token_purchase_allocations" USING btree ("consume_ledger_entry_id", "purchase_lot_id", "source_type");
--> statement-breakpoint
CREATE INDEX "token_purchase_allocations_lot_created_idx" ON "token_purchase_allocations" USING btree ("purchase_lot_id", "created_at");
--> statement-breakpoint
CREATE INDEX "token_refunds_lot_created_idx" ON "token_refunds" USING btree ("purchase_lot_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "token_refunds_external_ref_idx" ON "token_refunds" USING btree ("external_refund_reference") WHERE "token_refunds"."external_refund_reference" is not null;

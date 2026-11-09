-- MN-01 moderation alerts. Hand-written (not drizzle-kit generate), additive
-- only: two new tables and the single state row. Nothing existing is
-- altered, rewritten, dropped or renamed.
--
-- No email address is ever stored: a recipient is identified only by an
-- HMAC-SHA256 digest of its normalized address (64 lowercase hex), keyed by
-- MODERATION_ALERT_HASH_KEY, which lives outside the database.
--
-- moderation_alert_state: exactly one row (id = 1) — the current alert cycle
-- (one continuous non-empty stretch of the review queue) and the global
-- send lease. The lease token is random and lives only here; a send's
-- completion is accepted only while its token (and generation and sequence)
-- still match — the fencing that keeps a late, superseded sender from
-- overwriting a newer claim.
CREATE TABLE "moderation_alert_state" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"phase" text DEFAULT 'idle' NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"cycle_started_at" timestamp with time zone,
	"lease_token" text,
	"lease_generation" integer,
	"lease_expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_alert_state_singleton_check" CHECK ("moderation_alert_state"."id" = 1),
	CONSTRAINT "moderation_alert_state_phase_check" CHECK (("moderation_alert_state"."phase" = 'idle' and "moderation_alert_state"."cycle_started_at" is null) or ("moderation_alert_state"."phase" = 'active' and "moderation_alert_state"."cycle_started_at" is not null and "moderation_alert_state"."generation" >= 1)),
	CONSTRAINT "moderation_alert_state_generation_check" CHECK ("moderation_alert_state"."generation" >= 0),
	CONSTRAINT "moderation_alert_state_lease_check" CHECK (("moderation_alert_state"."lease_token" is null and "moderation_alert_state"."lease_generation" is null and "moderation_alert_state"."lease_expires_at" is null) or ("moderation_alert_state"."lease_token" is not null and char_length("moderation_alert_state"."lease_token") between 16 and 128 and "moderation_alert_state"."lease_generation" >= 1 and "moderation_alert_state"."lease_expires_at" is not null))
);
--> statement-breakpoint
-- moderation_alert_recipients: one row per recipient per cycle. Retry
-- timing is derived from last_attempt_at (lib/decideModerationAlert.ts);
-- next_attempt_at records that derived time for operators and the cron's
-- "anything due?" check. claimed_count / template_kind are fixed when a send
-- sequence is claimed, so every retry of it sends the same email (and the
-- same idempotency key) even if the queue has changed meanwhile.
CREATE TABLE "moderation_alert_recipients" (
	"generation" integer NOT NULL,
	"address_hash" text NOT NULL,
	"send_sequence" integer NOT NULL,
	"template_kind" text NOT NULL,
	"claimed_count" integer NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone NOT NULL,
	"consecutive_failures" smallint DEFAULT 0 NOT NULL,
	"in_flight" boolean NOT NULL,
	"lease_token" text NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_alert_recipients_pk" PRIMARY KEY ("generation", "address_hash"),
	CONSTRAINT "moderation_alert_recipients_hash_check" CHECK ("moderation_alert_recipients"."address_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "moderation_alert_recipients_generation_check" CHECK ("moderation_alert_recipients"."generation" >= 1),
	CONSTRAINT "moderation_alert_recipients_sequence_check" CHECK ("moderation_alert_recipients"."send_sequence" >= 1),
	CONSTRAINT "moderation_alert_recipients_template_check" CHECK ("moderation_alert_recipients"."template_kind" in ('initial', 'reminder')),
	CONSTRAINT "moderation_alert_recipients_count_check" CHECK ("moderation_alert_recipients"."claimed_count" between 1 and 1000000),
	CONSTRAINT "moderation_alert_recipients_failures_check" CHECK ("moderation_alert_recipients"."consecutive_failures" between 0 and 4),
	CONSTRAINT "moderation_alert_recipients_success_check" CHECK ("moderation_alert_recipients"."last_success_at" is null or "moderation_alert_recipients"."last_success_at" <= "moderation_alert_recipients"."last_attempt_at"),
	CONSTRAINT "moderation_alert_recipients_token_check" CHECK (char_length("moderation_alert_recipients"."lease_token") between 16 and 128)
);
--> statement-breakpoint
INSERT INTO "moderation_alert_state" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;

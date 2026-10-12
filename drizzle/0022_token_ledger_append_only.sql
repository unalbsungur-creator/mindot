-- token_ledger is append-only: INSERT is the only allowed write.
--
-- The one exception is account deletion (userRepository.deleteAccount),
-- which must re-point a deleted user's ledger rows to that deletion's
-- tombstone before it can delete the user row (the FKs are ON DELETE no
-- action). Three triggers enforce that exception together, none of them by
-- looking at a tombstone's id or email format:
--
-- 1. token_ledger_guard_row (BEFORE UPDATE OR DELETE, immediate). An UPDATE
--    is accepted only when every column other than user_id/created_by is
--    unchanged, at least one of them changes, and each changed column moves
--    FROM an active user (deleted_at IS NULL) TO a tombstone (deleted_at IS
--    NOT NULL) whose xmin is the current top-level transaction id.
--    DELETE (and, via token_ledger_guard_truncate, TRUNCATE) is always
--    rejected.
--
-- 2. users_tombstone_guard_row (BEFORE UPDATE on users). xmin alone can't
--    tell an INSERT from an UPDATE made by the same transaction: updating an
--    old tombstone, or setting deleted_at on an active user, would also give
--    that row the current xid. So no UPDATE may set, change or clear
--    deleted_at, and a tombstone row can't be updated at all. A row with
--    deleted_at set and xmin = the current top-level xid has therefore been
--    INSERTed as a tombstone by this transaction (outside any savepoint — a
--    subtransaction's xmin is its own xid, so that case fails closed).
--
-- 3. token_ledger_repoint_deferred (constraint trigger, DEFERRABLE INITIALLY
--    DEFERRED, so it runs at COMMIT). For every accepted re-pointing it
--    checks that the user the column moved away from no longer exists — the
--    source account was deleted by this same transaction, which the FKs only
--    allow once nothing references it any more — and that the target is
--    still a tombstone this transaction inserted. A move without the
--    deletion, or with the deletion undone by ROLLBACK TO SAVEPOINT, aborts
--    the COMMIT. Each UPDATE event is checked on its own OLD/NEW, so
--    deleteAccount's two separate UPDATEs of the same row (user_id, then
--    created_by) each pass. SET CONSTRAINTS ... IMMEDIATE only moves the
--    check before the user's DELETE, so it fails closed rather than
--    bypassing it.
--
-- A guard against application bugs, not against the table owner or a
-- superuser: the owner can ALTER TABLE ... DISABLE TRIGGER or drop these
-- triggers, and a superuser can also skip them via session_replication_role
-- = replica.
CREATE OR REPLACE FUNCTION "public"."token_ledger_guard"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_xid xid := pg_current_xact_id()::xid;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'token_ledger is append-only: % is not allowed', TG_OP
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF (to_jsonb(NEW) - 'user_id' - 'created_by') IS DISTINCT FROM (to_jsonb(OLD) - 'user_id' - 'created_by') THEN
    RAISE EXCEPTION 'token_ledger is append-only: only user_id/created_by may be re-pointed to a tombstone'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.user_id IS NOT DISTINCT FROM OLD.user_id AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'token_ledger is append-only: UPDATE changes nothing'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id AND NOT (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = OLD.user_id AND u.deleted_at IS NULL)
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.user_id AND u.deleted_at IS NOT NULL AND u.xmin = current_xid)
  ) THEN
    RAISE EXCEPTION 'token_ledger is append-only: user_id may only move from an active user to a tombstone created in this transaction'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by AND NOT (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = OLD.created_by AND u.deleted_at IS NULL)
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.created_by AND u.deleted_at IS NOT NULL AND u.xmin = current_xid)
  ) THEN
    RAISE EXCEPTION 'token_ledger is append-only: created_by may only move from an active user to a tombstone created in this transaction'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "token_ledger_guard_row" ON "public"."token_ledger";
--> statement-breakpoint
CREATE TRIGGER "token_ledger_guard_row" BEFORE UPDATE OR DELETE ON "public"."token_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."token_ledger_guard"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "token_ledger_guard_truncate" ON "public"."token_ledger";
--> statement-breakpoint
CREATE TRIGGER "token_ledger_guard_truncate" BEFORE TRUNCATE ON "public"."token_ledger" FOR EACH STATEMENT EXECUTE FUNCTION "public"."token_ledger_guard"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."users_tombstone_guard"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'users tombstone guard: a deleted account''s tombstone can''t be updated'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'users tombstone guard: deleted_at is set only by inserting a tombstone, never by UPDATE'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "users_tombstone_guard_row" ON "public"."users";
--> statement-breakpoint
CREATE TRIGGER "users_tombstone_guard_row" BEFORE UPDATE ON "public"."users" FOR EACH ROW
  WHEN (OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION "public"."users_tombstone_guard"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."token_ledger_repoint_check"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_xid xid := pg_current_xact_id()::xid;
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id AND (
    OLD.user_id IS NULL
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = OLD.user_id)
    OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.user_id AND u.deleted_at IS NOT NULL AND u.xmin = current_xid)
  ) THEN
    RAISE EXCEPTION 'token_ledger is append-only: user_id was re-pointed but its account was not deleted by this transaction'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by AND (
    OLD.created_by IS NULL
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = OLD.created_by)
    OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.created_by AND u.deleted_at IS NOT NULL AND u.xmin = current_xid)
  ) THEN
    RAISE EXCEPTION 'token_ledger is append-only: created_by was re-pointed but its account was not deleted by this transaction'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NULL;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "token_ledger_repoint_deferred" ON "public"."token_ledger";
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "token_ledger_repoint_deferred" AFTER UPDATE ON "public"."token_ledger"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.created_by IS DISTINCT FROM NEW.created_by)
  EXECUTE FUNCTION "public"."token_ledger_repoint_check"();

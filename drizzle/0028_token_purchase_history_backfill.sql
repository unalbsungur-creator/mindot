-- Backfill source lots and consumption allocations from immutable historical ledger rows.
-- Mirrors runtime accounting: consume earlier available purchase lots first, then other sources by (created_at, id). Never edits token_ledger or token_wallets.
-- Fails closed if a consume cannot be attributed to earlier credits.
DO $$
DECLARE
  account_row record;
  ledger_row record;
  source_row record;
  remaining_to_allocate integer;
  allocated_now integer;
  source_type_value text;
  purchase_lot_value text;
BEGIN
  CREATE TEMP TABLE refund_backfill_eligible_users (user_id text PRIMARY KEY);
  INSERT INTO refund_backfill_eligible_users (user_id)
  SELECT DISTINCT l.user_id FROM public.token_ledger l
  WHERE NOT EXISTS (
    SELECT 1 FROM public.token_purchase_allocations a WHERE a.user_id = l.user_id
  );

  CREATE TEMP TABLE refund_backfill_source_queue (
    user_id text NOT NULL,
    source_ledger_entry_id text PRIMARY KEY,
    source_type text NOT NULL,
    purchase_lot_id text,
    remaining_tokens integer NOT NULL,
    created_at timestamptz NOT NULL
  );

  INSERT INTO public.token_purchase_lots (
    id, user_id, provider, external_order_reference, package_id, package_tokens,
    paid_amount_kurus, credited_ledger_entry_id, payment_approved_at, created_at
  )
  SELECT
    md5('token-purchase-lot-backfill:' || l.id), l.user_id, 'shopier',
    l.external_reference, l.reference_id, l.amount,
    CASE l.reference_id WHEN 'tokens-10' THEN 1200 WHEN 'tokens-50' THEN 5000 WHEN 'tokens-100' THEN 8000 END,
    l.id, NULL, l.created_at
  FROM public.token_ledger l
  INNER JOIN refund_backfill_eligible_users eu ON eu.user_id = l.user_id
  WHERE l.type = 'purchase'
    AND l.amount > 0
    AND l.external_provider = 'shopier'
    AND l.external_reference IS NOT NULL
    AND (
      (l.reference_id = 'tokens-10' AND l.amount = 10) OR
      (l.reference_id = 'tokens-50' AND l.amount = 50) OR
      (l.reference_id = 'tokens-100' AND l.amount = 100)
    )
  ON CONFLICT DO NOTHING;

  FOR account_row IN SELECT user_id FROM refund_backfill_eligible_users ORDER BY user_id LOOP
    DELETE FROM refund_backfill_source_queue WHERE user_id = account_row.user_id;
    FOR ledger_row IN
      SELECT * FROM public.token_ledger
      WHERE user_id = account_row.user_id
      ORDER BY created_at, id
    LOOP
      IF ledger_row.amount > 0 THEN
        source_type_value := 'other';
        purchase_lot_value := NULL;
        IF ledger_row.reference_type = 'first_share_reward' THEN
          source_type_value := 'reward';
        ELSIF ledger_row.type = 'grant' AND ledger_row.reference_type = 'admin_grant' THEN
          source_type_value := 'admin_grant';
        ELSIF ledger_row.type = 'purchase' AND ledger_row.external_provider = 'shopier' THEN
          SELECT lot.id INTO purchase_lot_value
          FROM public.token_purchase_lots lot
          WHERE lot.credited_ledger_entry_id = ledger_row.id LIMIT 1;
          IF purchase_lot_value IS NOT NULL THEN source_type_value := 'purchase'; END IF;
        END IF;
        INSERT INTO refund_backfill_source_queue (
          user_id, source_ledger_entry_id, source_type, purchase_lot_id, remaining_tokens, created_at
        ) VALUES (
          ledger_row.user_id, ledger_row.id, source_type_value, purchase_lot_value,
          ledger_row.amount, ledger_row.created_at
        );
      ELSIF ledger_row.type = 'consume' AND ledger_row.amount < 0 THEN
        remaining_to_allocate := -ledger_row.amount;
        FOR source_row IN
          SELECT * FROM refund_backfill_source_queue
          WHERE user_id = account_row.user_id AND remaining_tokens > 0
          ORDER BY CASE WHEN source_type = 'purchase' THEN 0 ELSE 1 END, created_at, source_ledger_entry_id FOR UPDATE
        LOOP
          EXIT WHEN remaining_to_allocate = 0;
          allocated_now := LEAST(remaining_to_allocate, source_row.remaining_tokens);
          INSERT INTO public.token_purchase_allocations (
            id, user_id, consume_ledger_entry_id, source_ledger_entry_id,
            purchase_lot_id, source_type, amount, created_at
          ) VALUES (
            md5('token-allocation-backfill:' || ledger_row.id || ':' || source_row.source_ledger_entry_id),
            account_row.user_id, ledger_row.id, source_row.source_ledger_entry_id,
            source_row.purchase_lot_id, source_row.source_type, allocated_now, ledger_row.created_at
          ) ON CONFLICT (consume_ledger_entry_id, source_ledger_entry_id) DO NOTHING;
          UPDATE refund_backfill_source_queue
          SET remaining_tokens = remaining_tokens - allocated_now
          WHERE source_ledger_entry_id = source_row.source_ledger_entry_id;
          remaining_to_allocate := remaining_to_allocate - allocated_now;
        END LOOP;
        IF remaining_to_allocate > 0 THEN
          RAISE EXCEPTION 'Cannot safely allocate % Token(s) for user % consume entry %',
            remaining_to_allocate, account_row.user_id, ledger_row.id;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  DROP TABLE refund_backfill_source_queue;
  DROP TABLE refund_backfill_eligible_users;
END
$$;

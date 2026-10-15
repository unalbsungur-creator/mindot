# Token refund implementation design

Status: design only; not production-ready. Implement and test on `mindot-staging-build` before any release.

## Existing invariants

- `token_ledger` is append-only. Corrections are new ledger entries; existing entries are never edited or deleted.
- `token_wallets.balance` must equal the sum of the user's ledger entries and must never be negative.
- Shopier order crediting is idempotent by normalized order reference.
- A PDF unlock costs one Token and is recorded by a consume ledger row linked to the memory project.
- Existing ledger entries do not identify which purchase lot funded a consume. Therefore, historical purchases cannot be reliably refunded by package-level usage without an explicit migration policy.

## Proposed model

1. Keep `token_ledger` as the financial/token audit trail.
2. Add a purchase-lot record for each verified Shopier order, with unique provider/order reference, user, package token count, paid amount in kuruş, credited ledger entry, payment approval timestamp (when known), and refund state.
3. Add token-allocation rows linking each consume ledger entry to one or more lots. Allocate newly spent Tokens deterministically (FIFO among eligible purchased lots); record reward/admin-granted Tokens as non-purchase sources so they are never silently attributed to a Shopier purchase.
4. Add refund records with unique idempotency key, purchase-lot reference, amount in kuruş, Tokens reversed, admin actor, external Shopier refund reference, and timestamps. Do not mark a refund completed until the operator confirms Shopier has actually refunded the payment.
5. In one database transaction, lock the wallet and lot, validate refundable unused quantity, insert the refund record, append the compensating ledger entry, update the wallet projection, and allocate the refunded quantity to the source lot. Enforce unique constraints so retries cannot double-refund.
6. Never reduce a user's balance below zero. If spent Tokens are not recoverable, the system must not create a negative balance or pretend the external refund succeeded.

## Refund policy calculation

Do not calculate usage as a percentage of the user's current total wallet: rewards and multiple purchases make that ambiguous. Calculate only the unused Tokens attributable to the specific purchase lot.

The previously drafted threshold (full package refund when usage is at most 10%, otherwise refund the unused Token value) is a proposed business rule, not a confirmed legal rule. Before release, the Turkish policy text, translations, and Shopier product descriptions must agree, and statutory consumer rights must remain unaffected. If the policy cannot be implemented faithfully against lot allocations, do not publish it.

For package prices, store integer kuruş rather than floating-point TL. Any partial refund rounding rule must be deterministic and documented.

## Migration / legacy handling

- Do not infer historical Token source allocations from current balances.
- Mark pre-feature Shopier purchases as legacy/unattributed; require manual review for refunds on them unless reliable purchase/consume history can be reconstructed.
- Migration must not update or delete existing ledger entries.
- Verify the wallet-balance invariant before and after migration.

## Required tests

- New purchase creates one lot and is credited once for a repeated Shopier order.
- Spending consumes exactly one Token and creates an allocation to the correct lot/source.
- Reward/admin-granted Tokens are not incorrectly assigned to a paid purchase.
- Multiple purchases are allocated deterministically.
- Refund amount follows the agreed policy and currency rounding.
- Refund cannot exceed eligible unused quantity or original paid amount.
- Repeated refund request, repeated external reference, or concurrent admin submissions cannot double-refund.
- Shopier refund not yet confirmed leaves the MINDOT refund pending and does not falsely report completion.
- Existing balances and append-only ledger protections remain intact.
- Legacy/unattributed purchase is routed to manual review.
- Database integration tests verify wallet balance equals ledger sum and no transaction can create a negative balance.

## Release gate

No production migration, live-site change, Shopier policy update, or refund processing until staging tests pass and the refund policy is explicitly approved. This document alone does not implement the refund feature.

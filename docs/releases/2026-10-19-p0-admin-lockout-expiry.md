# MINDOT P0 — Admin Lockout Expiry Fix

| | |
|---|---|
| Release result | **COMPLETED** |
| Severity | P0 (security / availability of `/admin/login`) |
| PR | [#12](https://github.com/unalbsungur-creator/mindot/pull/12) — `fix/admin-lockout-expiry` |
| Merge commit | `705017b6422956ca3eb3b88d91f0866dbe88a5d9` (2026-10-19 14:46 UTC), parents `a3afcd1` + `86a526f` |
| Tested tree | merge tree `dedc74ae…` is identical to `86a526f`, the commit tested on staging |
| Production Worker | `mindot` → version `b18c49c6-2f74-4c7c-be9f-31db8f4cde2f`, 100% (deployed 2026-10-19 14:51 UTC by Workers Builds) |
| Rollback target | `a1e78ae9-24ed-4290-b9b1-357d34552e0f` (production before this release) |
| Migrations | none in this release |

## The bug

`/admin/login` (the one Credentials admin) locks the account for 15 minutes after 5 consecutive wrong passwords.

- **Old behavior:** once the 15-minute lock expired, the very next wrong password locked the account again for another 15 minutes.
- **New behavior:** when the lock has expired, the first wrong password starts the count again at 1. The account is not locked again until 5 new consecutive failures.

### Root cause

`userRepository.recordFailedLogin` only ever incremented `failed_login_attempts`, and the counter was reset only by a successful sign-in. After an expired lock the counter was still ≥ 5, so a single failure made it 6, crossed the threshold and set a new `locked_until`. Anyone who knew the admin email could keep the admin locked out indefinitely with roughly one request per lock period.

### The fix

- `recordFailedLogin(userId, now)` is now a single atomic `UPDATE`: an *expired* lock restarts the count at 1 and clears `locked_until`; otherwise the count is incremented; reaching 5 sets `locked_until = now + 15 min`. An active lock is never extended. Concurrent failures serialize on the row lock.
- The Credentials `authorize()` logic moved into `verifyAdminCredentials` (`features/auth/service.ts`), which uses one `now` for both the lock check and the recorded failure. While locked, the password is not checked at all, so even the right one is refused. Every rejection stays the same generic `null` → one message (no email enumeration).
- No schema change.

### Changed files (8)

| File | Change |
|---|---|
| `src/features/users/repository.ts` | atomic `recordFailedLogin(userId, now)`; exported `MAX_FAILED_LOGIN_ATTEMPTS`/`LOCKOUT_MINUTES` |
| `src/features/auth/service.ts` | new `verifyAdminCredentials` (dependency-injected, testable) |
| `src/features/auth/auth.ts` | Credentials `authorize()` delegates to `verifyAdminCredentials` |
| `src/features/auth/service.test.ts` | unit tests for the sign-in decision |
| `src/features/users/adminLockout.db.test.ts` | new: 12 tests against real PostgreSQL (throwaway Docker) |
| `package.json` | `test:db:admin-lockout` script |
| `.github/workflows/ci.yml` | runs `test:db:admin-lockout` |
| `CLAUDE.md` | "Admin credentials lockout" section |

## Verification

### CI

Both CI runs on `86a526f` (push 39167066484, pull_request 39167070244) succeeded, every step including `npm test`, `test:db:tokens`, `test:db:refunds`, `test:db:account-deletion`, `test:db:admin-lockout`, `lint`, `tsc --noEmit` and the isolated staging build. PR state before merge: `mergeable_state=clean`, 8 files.

### Staging (`mindot-staging`, version `7b15ab5f-666f-4e66-a877-aced73f91d89`)

Built from an independent LF clone of `86a526f` with no `.env*` files (`npm ci`, `npm test` 507/507, `test:db:admin-lockout` 12/12, `build:cf:staging`), deployed with `--env staging` only. Staging uses its own Hyperdrive and database (see [staging-deployment-setup.md](../staging-deployment-setup.md#current-environment-map)). Results, read back from the staging database in read-only transactions:

| Scenario | Result |
|---|---|
| 5 wrong passwords lock the account for 15 min | PASS — count 5, `locked_until` = 5th failure + 15 min |
| Attempts during the lock are not counted and do not extend it | PASS — count stayed 5, `locked_until` unchanged |
| First wrong password after the lock expired (the P0) | PASS — count 1, `locked_until` NULL |
| Right password after expiry signs in and resets | PASS — count 0, `locked_until` NULL |
| Right password refused while locked | not observed on staging; covered by unit + DB tests |
| Existing admin session survives a lock | not observed on staging; covered by DB tests |

### Production

- Pre-merge: production database at 29/29 migrations, last `0028_token_purchase_history_backfill` (read-only check of `drizzle.__drizzle_migrations` only). Rows 0026–0028 carry the hash of the CRLF form of the same files (applied from a Windows checkout) — content identical; drizzle decides by `created_at`, so this is informational only.
- Workers Builds: `mindot` succeeded on `705017b`; version `b18c49c6…` at 100%, Hyperdrive binding `8c1d28bf…` (production), no `APP_ENV`.
- HTTP smoke: `/` 200 with canonical `https://mind-ot.com`, `/admin/login` 200, `robots.txt` is the production allow/disallow list with the sitemap, `sitemap.xml` 200; no `noindex`, no `X-Robots-Tag`, no staging reference.
- Production admin sign-in: one correct-password sign-in — **PASS**, confirmed by the operator.
- Staging stayed on `7b15ab5f` throughout.

## Rollback

Not needed. If it ever is:

1. `npx wrangler rollback a1e78ae9-24ed-4290-b9b1-357d34552e0f` (top-level, no `--env`), or Dashboard → mindot → Deployments → Rollback.
2. Confirm with `npx wrangler deployments status` and an HTTP 200 on `/`.
3. A Cloudflare rollback does not change `main` — the next push to `main` redeploys. A permanent revert is a PR with `git revert -m 1 705017b`.

No database step: this release has no migration. Rolling back only brings the old lockout bug back.

## Remaining risks

- The lock is account-wide, not per client: anyone who knows the admin email can still lock it for 15 minutes with 5 requests, and a distributed attacker can repeat that every period. Tracked as [P1 — Admin Login Abuse Protection](../security/p1-admin-login-abuse-protection.md).
- Failed admin sign-ins are not logged, so an attack is only visible in the database row.
- Production deploys outside Workers Builds have happened before (e.g. 2026-10-18 14:42 UTC); confirm the active version before any future rollback.

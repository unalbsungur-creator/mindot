# P1 — Admin Login Abuse Protection

| | |
|---|---|
| Status | **OPEN** — analysis only, nothing enabled |
| Follows | [P0 — Admin Lockout Expiry Fix](../releases/2026-10-19-p0-admin-lockout-expiry.md) |
| Surface | `/admin/login` (the one Credentials admin) |

## Current state

- `verifyAdminCredentials` (`features/auth/service.ts`) + `userRepository.recordFailedLogin`: 5 consecutive wrong passwords lock the account for 15 minutes; an expired lock restarts the count at 1 (P0 fix); success resets it. The state is the `users` row (`failed_login_attempts`, `locked_until`), so it holds across Worker isolates.
- **Account-wide, not per client.** Anyone who knows the admin email can lock the admin out for 15 minutes with 5 requests, and repeat it every period from one or many IPs. Brute force is slowed to 5 guesses per 15 minutes; denial of service against the admin is not prevented.
- An existing admin JWT session is not affected by a lock (the `jwt` callback only checks `isActiveAccount`), so a lock-out mainly blocks *new* sign-ins.
- Every rejection returns the same generic message (no email enumeration) — this must stay true for any new control.
- **No logging.** A failed or locked sign-in writes nothing to the Worker logs; `wrangler.jsonc` has no `observability` block. An attack is visible only in the database row.
- **No client IP is read anywhere** in `src/` today, and there is no KV / Durable Object binding for per-client counters.

## Request paths that must be covered

1. `POST /admin/login` — the form's Server Action (`adminSignIn`, `features/auth/actions.ts`; `Next-Action` header), which calls `signIn("credentials")` server-side. This is the normal path.
2. `POST /api/auth/callback/credentials` — Auth.js's own handler (`app/api/auth/[...nextauth]/route.ts`) also accepts Credentials posts (with a CSRF token from `/api/auth/csrf`). A control on path 1 only is bypassable through path 2.

## Options

| Option | What it stops | Cost / caveats |
|---|---|---|
| **A. Cloudflare WAF rate limiting rule** on the two paths above, `POST`, counted per IP | Single-IP brute force and single-IP lock-out | Zone plan limits (below); per-IP only, so a distributed attacker still locks the account |
| **B. Cloudflare Access (Zero Trust) in front of `/admin*`** | Everything: unauthenticated clients never reach the login | Free for small teams; adds an IdP/OTP step for the admin; must exclude nothing the public site needs (`/admin*` is admin-only already) |
| **C. Turnstile on the admin form**, verified server-side in `verifyAdminCredentials` before the password check | Scripted attempts on both paths | Free; needs a site key/secret per environment; failure must still return the generic message |
| **D. In-app per-(IP, account) counter** (DB table or KV) so the account lock only triggers from repeated failures by the same client | Lock-out by a single client | Code + storage + migration; still weak against many IPs; IP trust rules below apply |

Recommended order to evaluate: **B** (strongest, no code), then **A** as cheap defense in depth, then **C**. **D** only if B is rejected.

## Cloudflare plan limits (to verify against the live account)

- The `mind-ot.com` zone's plan has not been verified in this analysis. The Workers *account* is on a paid plan (see the `limits` comment in `wrangler.jsonc`); zone WAF features follow the **zone** plan.
- On the Free zone plan, Cloudflare's rate limiting rules are, per its current documentation, limited to one rule, counted by IP, with a short fixed counting period and mitigation timeout and a block action. Confirm the exact limits in the dashboard before designing around them — a 10-second window, for example, does not express "5 per 15 minutes" and only blunts bursts.
- **Existing disabled rate-limit rule:** reported by the operator; not inspected here (no zone-level API access in this analysis). Before enabling it: record its expression, paths, method filter, counting characteristic, threshold/period, action and timeout; check that it covers both paths above and `POST` only; and test it on staging first.

## Risks of false positives

- Blocking the operator's own IP during a mistyped-password streak, on top of the account lock.
- Shared/carrier-grade NAT: a per-IP rule can block other people behind the same address — low impact here because only one person uses `/admin/login`, but a rule must never match public paths (`/`, `/board`, `/api/board`, `/api/auth/*` for Google/Apple sign-in).
- A rule on `/api/auth/*` broadly would break normal Google/Apple sign-in and session refresh; match `/api/auth/callback/credentials` exactly.

## Client IP trust

- Behind Cloudflare, `CF-Connecting-IP` is set by the edge and is the client address to use. `X-Forwarded-For` / `X-Real-IP` can be supplied by the client and must not be trusted for any decision.
- WAF rules count on the edge's own view of the client IP, so option A needs no app-side IP handling.

## Observability

- Add a structured log line for each failed admin sign-in and each lock start (`reason: "wrong-password" | "locked" | "lock-started"`, timestamp, Cloudflare ray id) — never the email, password or full IP in plain text.
- Enable Workers Logs for `mindot` (`observability` in `wrangler.jsonc`) so those lines are retained; decide retention deliberately.
- Optional: a read-only admin view of `failed_login_attempts`/`locked_until`.

## Safe staging test plan (for whichever option is chosen)

1. Configure it on `staging.mind-ot.com` only (WAF rules can be scoped by hostname; Access apps by domain/path). Production untouched.
2. Staging admin account only; record the start state read-only (`failed_login_attempts = 0`, `locked_until` NULL).
3. Confirm the control triggers on both `POST /admin/login` and `POST /api/auth/callback/credentials`.
4. Confirm Google sign-in, `/`, `/board` and `/api/board` are unaffected from the same IP while the control is active.
5. Confirm the admin can still sign in after the control's timeout, and that the account-level lock behaves exactly as after the P0 fix.
6. Only then plan the production rollout, with the rule's previous state recorded for rollback.

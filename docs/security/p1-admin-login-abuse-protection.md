# P1 — Admin Login Abuse Protection

| | |
|---|---|
| Status | **IN PROGRESS** — Option C (Turnstile) implemented in code (GÖREV 30), not yet deployed; keys unset |
| Follows | [P0 — Admin Lockout Expiry Fix](../releases/2026-10-19-p0-admin-lockout-expiry.md) |
| Surface | `/admin/login` (the one Credentials admin) |

> **GÖREV 30 update — Option C is built.** Cloudflare Turnstile is now wired
> into the one shared boundary both admin sign-in paths pass through. See
> [Chosen control: Turnstile (Option C)](#chosen-control-turnstile-option-c)
> below for the architecture, configuration, staging/production rollout order,
> and rollback. Keys are **not** set in any environment yet, so until they are
> set the admin login fails closed (see rollout order — set the secret before
> deploying the code).

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

## Chosen control: Turnstile (Option C)

Implemented in GÖREV 30 (branch `feat/admin-turnstile`). Stops scripted/bot
sign-in attempts on **both** request paths above, because the check lives at
the one function they converge on.

### Architecture

- **Single boundary.** `verifyAdminCredentials` (`features/auth/service.ts`) is
  where the `/admin/login` Server Action (`adminSignIn`) and the raw
  `POST /api/auth/callback/credentials` both end up (via the Credentials
  provider's `authorize()`). The Turnstile check is the **first** thing it does
  — before `getCredentialsByEmail`, before any password work.
- **The token rides on the credentials.** It is `credentials.turnstileToken`,
  so it arrives identically on both paths; a check placed only in `adminSignIn`
  would be bypassable through the raw callback, so it is deliberately **not**
  there.
- **Verifier module.** `features/auth/lib/turnstile.ts` calls Cloudflare
  siteverify. It checks `success === true`, `action === "admin-login"`, and
  that `hostname` is the current environment's own host (production and staging
  hostnames are kept strictly separate; development accepts localhost only).
  Token length is capped at 2048. It is injected into `verifyAdminCredentials`
  (`AdminCredentialsDeps.verifyTurnstile`) so unit tests never hit the network.
- **Fail-closed, everywhere.** Missing/oversized token, missing secret, network
  error, timeout (5s, `AbortController`), 5xx, non-JSON body, `success:false`
  (covers invalid/expired/reused tokens), or any action/hostname mismatch → the
  attempt is refused. **No retry** (a retry would double-spend the one-time
  token). Neither the token nor the secret is ever logged — only a short reason
  code.
- **P0 lockout preserved exactly.** A Turnstile rejection returns *before*
  `recordFailedLogin`, so a bot that cannot solve the challenge can never drive
  the real admin's `failed_login_attempts`/`locked_until`. Once a valid token is
  present, the password/lockout logic is byte-for-byte the P0 behavior.
- **Generic message unchanged.** A failed Turnstile check surfaces as the same
  `invalidCredentials` message as every other rejection — no enumeration.
- **OAuth untouched.** Google/Apple sign-in use `ProviderSignInDeps`, which has
  no Turnstile field and never reaches `verifyAdminCredentials`.
- **Client.** The Managed widget (action `admin-login`) loads **only** on
  `/admin/login` (`features/auth/components/TurnstileWidget.tsx`). Submit is
  disabled until a token is present; the widget is reset after a failed attempt.
  The trusted client IP (`CF-Connecting-IP` only — never `X-Forwarded-For`) is
  read in `authorize()` and forwarded to siteverify as `remoteip`.

### Configuration

Two env vars, a **different key pair per environment** (Cloudflare Turnstile
widget), never committed:

- `TURNSTILE_SITE_KEY` — public; read at request time in
  `app/admin/login/page.tsx` and passed to the client (not inlined at build).
- `TURNSTILE_SECRET_KEY` — server-only; read in `features/auth/lib/turnstile.ts`.

The build never needs real values. If unset at runtime the login fails closed
(the form shows an unavailable state; the server rejects regardless).

**Local development:** use Cloudflare's documented always-pass test keys
(site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`)
in `.env.local`; the dev hostname allow-list is localhost. These are public
Cloudflare test values, not secrets.

### Staging rollout (manual prerequisites)

1. In the Cloudflare dashboard, create a Turnstile widget (Managed) whose
   hostname is `staging.mind-ot.com`; note its site key + secret key.
2. Set `TURNSTILE_SITE_KEY` (plain var is fine; it's public) and
   `TURNSTILE_SECRET_KEY` (**secret**, `wrangler secret`) on the
   `mindot-staging` Worker — **before** deploying this code, or admin login on
   staging fails closed in the gap.
3. Deploy the branch to staging only. Confirm the widget renders on
   `/admin/login`, a solved challenge lets a correct password through, and a
   wrong password still shows the generic message and (manually, read-only)
   does **not** increment the counter when the challenge is unsolved.
4. Confirm Google sign-in, `/`, `/board`, `/api/board` are unaffected.

### Production rollout (secret-before-deploy order — mandatory)

1. Create a **separate** production Turnstile widget (hostname `mind-ot.com`).
2. Set `TURNSTILE_SECRET_KEY` (secret) and `TURNSTILE_SITE_KEY` on the
   production Worker **first**, and confirm they are present.
3. **Only then** deploy the code. Reversing this order makes admin login
   unreachable (fail-closed) for the window between deploy and secret-set.
4. Smoke-test one real admin sign-in immediately after deploy.

### Rollback

- **Fastest (no redeploy):** this control is the admin's own login; it does not
  affect public traffic. If the widget provider has an outage, the immediate
  option is to roll the Worker back to the previous version (the pre-GÖREV-30
  code), which removes the Turnstile requirement. Record the current version id
  before deploying so the rollback target is known.
- Do **not** "disable" by unsetting the secret — that fails closed (login
  becomes impossible), it does not open the gate. Rollback is a code/version
  revert, not a config toggle.
- The database and the P0 lockout columns are untouched by this change, so a
  rollback needs no migration.

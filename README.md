# MINDOT

A limitless digital wall where anyone can leave a thought for strangers to discover — see [CLAUDE.md](./CLAUDE.md) for the full architecture.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3200](http://localhost:3200).

## Manual testing entry point

The exact order to go from a fresh checkout to a real, signed-in, authenticated
test session. Each step links to the section with the actual detail — this is
just the sequence, not a duplicate of it.

1. Create/configure Google OAuth credentials for local development — see
   "Google OAuth readiness" below.
2. Add the **localhost** authorized redirect URI from that section's table.
3. *(Only when deploying)* add the **production** authorized redirect URI
   from the same table — skip this step for local testing.
4. Configure `.env.local` — see "Environment variables" below.
5. Set `ADMIN_EMAILS` to your own Google account's email — see "Database
   commands" below for why the seeded `admin@mindot.dev` can't be signed
   into directly.
6. Start PostgreSQL — see "Local PostgreSQL" below.
7. Run migrations: `npm run db:migrate`.
8. *(Optional)* seed development data: `npm run db:seed`, then
   `npm run db:verify` to confirm it seeded correctly.
9. Start the application: `npm run dev`.
10. Sign in with the Google account matching your `ADMIN_EMAILS` value.
11. Work through "Manual QA — end-to-end checklist" below, A → K.

## Environments and deployment

Use separate databases, Google OAuth clients, and secrets for development,
staging, and production. Never copy production secrets into `.env.local` or
commit any environment file. The deployment platform must support a Next.js
Node.js runtime and PostgreSQL connectivity; no specific hosting provider is
required.

The production origin is `https://mind-ot.com`. MINDOT remains the product
and brand name; `mind-ot.com` is only its technical web address. Set both
`NEXT_PUBLIC_APP_URL` and `AUTH_URL` to the exact deployed HTTPS origin.

Builds deliberately do not require a database or OAuth credentials. Runtime
features validate their own configuration when invoked, allowing the same
artifact to move from staging to production without embedding secrets.

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_APP_URL` — public canonical origin; not a secret.
- `AUTH_URL` — Auth.js canonical origin; normally identical to the app URL.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from a Google Cloud OAuth 2.0 Web application client. Redirect URI: `<origin>/api/auth/callback/google`.
- `AUTH_SECRET` — generate with `npx auth secret`.
- `DATABASE_URL` — a PostgreSQL connection string (see below).
- `ADMIN_EMAILS` — comma-separated emails that become admins on their first sign-in.

Public site identity itself (brand name, production URL, default description) is
centralized in `src/lib/siteConfig.ts`, not an environment variable — read from
there rather than hardcoding `MINDOT`/`mind-ot.com` in a new route's metadata.

## Local PostgreSQL

Any real Postgres works — pick whichever is easiest for you:

**Option A — Docker (optional, not required):**

```bash
docker run --name mindot-db -e POSTGRES_PASSWORD=password -e POSTGRES_DB=mindot -p 5432:5432 -d postgres:16
```

Then `DATABASE_URL=postgresql://postgres:password@localhost:5432/mindot`.

**Option B — a local PostgreSQL install.** Create a database named `mindot` and point `DATABASE_URL` at it.

**Option C — a free-tier hosted Postgres** (Neon, Supabase, Railway, etc.) — copy the connection string it gives you into `DATABASE_URL`.

## Database commands

- `npm run db:generate` — generate SQL migration files from `src/lib/db/schema.ts` after changing it.
- `npm run db:migrate` — apply generated migrations to `DATABASE_URL`.
- `npm run db:push` — push the schema directly without generating migration files (fast iteration in local dev only — prefer generate+migrate once the schema is stable).
- `npm run db:seed` — populate dev data: an admin user, a regular user, invitations in every state (active/expired/used/revoked), messages in every status (pending/approved/rejected, including one anonymous approved message and one approved+named message deliberately excluded from the personal wall), approved messages spread across several board tiles, personal wall visibility in both states, and representative Memory Project / digital access-code / physical-order data. Safe to re-run — see "Development seed data & test readiness" in CLAUDE.md for exactly what's created and why. Prints the digital access codes and physical order number it created, since those are otherwise unguessable.
- `npm run db:verify` — a repeatable automated check (no new dependency) that the seeded data's privacy/ownership invariants actually hold: anonymous authorship never reaches public output, pending/rejected messages stay private, wall curation and visibility are enforced at the query level, and access-code/ownership scoping can't be bypassed. Run it after `db:seed` (or any time you suspect a regression) — see CLAUDE.md for exactly what it checks.
- `npm run db:studio` — a local browser UI for inspecting the database.

**`admin@mindot.dev`/`visitor@mindot.dev` are backing data, not accounts you can sign in as** — their ids aren't real Google accounts. To test as an admin, set `ADMIN_EMAILS` in `.env.local` to your own Google account's email *before* signing in with Google; your real account becomes admin on that first sign-in.

After seeding, try:

- `/invite/welcome-to-mindot` — an active invitation
- `/invite/expired-example`, `/invite/used-up-example`, `/invite/revoked-example` — the other invitation states
- `/board` — the real board, reading approved messages back out
- `/admin/moderation` — sign in with your own email (added to `ADMIN_EMAILS`) to review the seeded pending messages
- `/u/devwall01` — the seeded enabled personal wall (one message deliberately hidden from it); `/u/devwall00` — the seeded disabled wall, showing the "private" state
- `/admin/access-codes` and `/admin/orders` — the seeded digital access codes (one of each status) and the one seeded physical order, already mid-fulfilment

### Production database workflow

1. Create an empty production PostgreSQL database and set `DATABASE_URL` in
   the deployment environment.
2. Back up an existing database before every release.
3. Apply committed migrations in order with `npm run db:migrate` as a
   release step before serving the new application version.
4. Set `ADMIN_EMAILS` before the intended first administrator signs in. It
   only assigns a role when a user row is first created; later role changes
   are database-managed.
5. Never run `npm run db:seed` in production. It creates development fixtures. `npm run db:verify` doesn't create or corrupt data (every check either reads or attempts a redemption that's expected to fail), but it's a development testing tool — there's no reason to run it against production either.

Do not use `db:push` for production. A database outage is a runtime service
failure and is handled by user-facing error boundaries; it must not expose a
connection string or environment-variable name to visitors.

## Google OAuth readiness

MINDOT uses Auth.js v5's Google provider (`src/features/auth/auth.ts`), routed
through its single catch-all handler at
`src/app/api/auth/[...nextauth]/route.ts`. That handler is what fixes the
exact callback path below — it isn't a guessed convention.

For each environment, create or configure an OAuth 2.0 **Web application** in
Google Cloud Console:

1. Configure the OAuth consent screen, application name, support contact,
   privacy URL, terms URL, and only the `openid email profile` scopes.
2. Add the exact authorized JavaScript origin and redirect URI for the
   environment you're configuring:

   | Environment | Authorized JavaScript origin | Authorized redirect URI |
   | --- | --- | --- |
   | Local development | `http://localhost:3200` | `http://localhost:3200/api/auth/callback/google` |
   | Production | `https://mind-ot.com` | `https://mind-ot.com/api/auth/callback/google` |

   (Local development's origin/port follows whatever `NEXT_PUBLIC_APP_URL`/
   `AUTH_URL` you actually set in `.env.local` — `http://localhost:3200` is
   this repo's own default in `.env.example`, matching `npm run dev`'s own
   pinned port; if you override the port, use that port instead.)
3. Keep localhost, staging, and production as separate OAuth clients with
   explicit origins; avoid wildcard redirect URIs.
4. Verify `AUTH_URL` and `NEXT_PUBLIC_APP_URL` match the public origin for
   that environment exactly (scheme, host, and port).
5. Never commit a real `GOOGLE_CLIENT_SECRET` — it belongs in `.env.local`
   (gitignored) or your deployment platform's secret store only.

No real OAuth client, DNS record, database, or deployment is configured by
this repository.

## Production launch checklist

### Infrastructure

- [ ] Provision production PostgreSQL with backups and connection limits.
- [ ] Set every required environment variable from `.env.example` in the host.
- [ ] Apply all committed migrations; do not run the development seed.
- [ ] Confirm an environment-less `npm run build` still succeeds.

### Authentication and administration

- [ ] Complete Google consent-screen verification where required.
- [ ] Add the production origin and callback URL exactly.
- [ ] Set `AUTH_SECRET` to a new production-only value.
- [ ] Bootstrap the first admin once and verify moderation access.

### Domain and security

- [ ] Point `mind-ot.com` DNS to the selected host.
- [ ] Enforce HTTPS and verify canonical URLs and Open Graph images.
- [ ] Confirm private, invite, Memory, share-workflow, and admin routes are `noindex`.
- [ ] Obtain professional review of Privacy, Terms, and Community Guidelines drafts.

### Social and commerce

- [ ] Configure only real Instagram, TikTok, and YouTube URLs; unset entries stay hidden.
- [ ] Configure a real `SHOPPIER_PRODUCT_URL` before enabling purchase messaging.
- [ ] Verify `DILEKKUTUM_URL` and the documented manual order-reference workflow.
- [ ] Do not claim automated Shoppier or DilekKutum integration.

### Automated validation

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npm run build`

### Manual QA — end-to-end checklist

Run `npm run db:seed` first so pending content, both wall-visibility states,
and representative Memory Project/access-code/order data already exist —
see "Development seed data & test readiness" in CLAUDE.md. Set `ADMIN_EMAILS`
to your own Google email before signing in if you want to exercise the admin
steps too (see above — the seeded admin user isn't a sign-in-able account).
Run `npm run db:verify` alongside this checklist to confirm the privacy/
ownership invariants below hold at the data layer, not just in the UI.

**A. Visitor**

- [ ] Homepage loads
- [ ] First-time onboarding opens automatically on a fresh visit
- [ ] Onboarding can be skipped (Skip, the close control, or Escape)
- [ ] Onboarding completion persists — it doesn't reopen automatically on the next visit
- [ ] Footer's "How MINDOT works" reopens onboarding on demand, from any page
- [ ] Header/footer navigation reaches Explore, Write, Privacy, Terms, Community Guidelines
- [ ] `/privacy`, `/terms`, `/community-guidelines` load and read correctly

**B. Authentication**

- [ ] Sign in with Google from `/write` (or the header)
- [ ] Sign out returns to a signed-out state (header avatar disappears)
- [ ] A returning signed-in visit doesn't require signing in again (session persists)
- [ ] The header avatar links to `/me`
- [ ] Visiting any `/admin/*` page while signed out (or signed in as a non-admin) shows "Admins only," not the real content or a crash

**C. Writing**

- [ ] Open `/write` — signed out shows the sign-in prompt, signed in shows the form
- [ ] Select a note template — the live preview updates
- [ ] Write content — the character counter updates
- [ ] Select anonymous sharing (the default) — preview hides name/photo
- [ ] Select named sharing — preview shows name/photo
- [ ] Submit — confirm the pending-state success message, with a next action (write another / view archive), not a dead end
- [ ] Confirm the new thought appears in `/me/archive` as "Pending review"

**D. Moderation**

- [ ] A newly submitted message remains "pending" and does not appear on `/board`
- [ ] `/admin/moderation` lists the pending thought(s)
- [ ] Admin can approve one — it disappears from the pending queue
- [ ] Admin can reject another — it disappears from the pending queue
- [ ] The approved message now appears correctly on `/board`
- [ ] The rejected message never appears on `/board` or anywhere public

**E. Board**

- [ ] `/board` loads and pans/zooms
- [ ] Approved messages appear, positioned deterministically
- [ ] An approved anonymous message's author identity never appears (name/photo absent)
- [ ] An approved named message shows its name (and photo, if set) — and only there, never for an anonymous one
- [ ] Hovering/focusing a note reveals its "Preserve"/"Share" actions
- [ ] "Preserve" opens `/memory/[messageId]`; "Share" opens `/share/[messageId]`

**F. Personal space**

- [ ] `/me` loads (signed in) and shows your display name/avatar
- [ ] Activity counts (thoughts written, published, pending review) reflect real data
- [ ] `/me/archive` lists your own messages in every state (pending/published/not published)
- [ ] `/me/memories` lists your own Memory Projects
- [ ] The wall visibility toggle and description field in `/me` are present and clearly labeled

**G. Personal wall**

- [ ] With your wall disabled, `/u/[your publicId]` shows the "this wall is private" state, not your notes
- [ ] Enabling your wall makes `/u/[your publicId]` show your named, approved, curated-in notes
- [ ] A wall with zero eligible notes shows a distinct "waiting for its first thought" empty state, not an error
- [ ] A named approved note you haven't excluded appears on your wall
- [ ] An anonymous note of yours never appears on your wall, regardless of wall visibility
- [ ] "Remove from personal wall" in `/me/archive` removes a note from your wall without touching the board
- [ ] "Add to personal wall" restores it
- [ ] The public wall link in `/me` is copyable and correct
- [ ] "Share my wall" is only offered while the wall is enabled and has content
- [ ] The wall's Open Graph preview never reveals identity for a disabled or empty wall

**H. Memory Project**

- [ ] Start a Memory Project from an approved message (via "Preserve")
- [ ] Choose capture mode (note only / with surrounding notes) and output type
- [ ] Create the project
- [ ] For a digital frame project, select a frame template — every template renders
- [ ] Download the PDF and confirm it opens
- [ ] View the PDF inline (admin order detail's "View PDF," or `/me/memories`)
- [ ] Turkish/German/French/Spanish diacritics render correctly in the PDF (already confirmed programmatically this EPIC — see the Final Report; re-confirm visually if content changes)

**I. Digital product flow**

- [ ] Redeem the seeded active/unassigned access code (printed by `db:seed`) against a `digital_frame` project — access is granted
- [ ] Entering an invalid code shows a clear, specific error
- [ ] Entering the already-redeemed seeded code again (against a different project) is rejected
- [ ] Entering the seeded revoked code is rejected
- [ ] Entering the seeded expired code is rejected
- [ ] Sign out and back in, revisit the unlocked project — access persists without re-entering the code
- [ ] Download only becomes available after access is actually granted

**J. Physical gift flow**

- [ ] Create a `physical_gift` project — an order number is generated
- [ ] The order-number-entry instructions for DilekKutum are visible and clear
- [ ] The "choose your box and packaging" handoff link is present
- [ ] As admin, find the order in `/admin/orders` by its number
- [ ] Admin can update its status, and the change is reflected back to the buyer's `/me/memories`

**K. Admin**

- [ ] `/admin/moderation` — pending queue, approve, reject
- [ ] `/admin/invitations` — create, copy link, active/expired/used/revoked states render distinctly (the seeded ones already cover every state)
- [ ] `/admin/access-codes` — issue, list, revoke; the seeded active/redeemed/revoked/expired codes all show distinct statuses
- [ ] `/admin/orders` — list and detail view
- [ ] Order detail's PDF view/download works
- [ ] Every `/admin/*` page independently rejects a non-admin session, not just the nav that links to it

**Resilience (any section)**

- [ ] Database and OAuth failure screens are friendly and reveal no secrets

## Learn more

- [CLAUDE.md](./CLAUDE.md) — architecture rules and conventions for this project.
- [Next.js Documentation](https://nextjs.org/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [Auth.js Documentation](https://authjs.dev)

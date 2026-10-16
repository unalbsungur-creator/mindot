# MINDOT staging deployment setup

The `Deploy staging` GitHub Actions workflow is deliberately staging-only. It runs tests, builds with `APP_ENV=staging`, applies migrations to an explicitly allowlisted standalone staging database, deploys Wrangler's `--env staging` Worker, and checks the staging homepage and non-indexable robots file. It never targets the top-level production Worker.

## Required GitHub Environment configuration

Open **Repository → Settings → Environments → staging**. Add the following environment secrets and variables. The first deployment attempt on 2026-10-16 stopped before installing dependencies, migrations, or deployment because all five required values were absent; no staging or production database was changed by that attempt.

### Environment secrets

| Name | Value |
|---|---|
| `STAGING_DATABASE_URL` | Direct PostgreSQL URL for the separate, empty staging database. Never use production or a database containing copied production data. |
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token for deploying the staging Worker. Use least privilege. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID that owns the `mindot-staging` Worker. |

The token needs permission to deploy the existing `mindot-staging` Worker. Because the first deployment can attach the `staging.mind-ot.com` custom domain, it also needs Workers Routes write permission for the `mind-ot.com` zone if that route/domain is not already configured. See Cloudflare's [Workers roles and permissions](https://developers.cloudflare.com/workers/authorization/workers/) and [GitHub Actions deployment guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).

### Environment variables

| Name | Value |
|---|---|
| `STAGING_DATABASE_HOST` | Exactly the hostname in `STAGING_DATABASE_URL` (hostname only; no scheme or port). |
| `STAGING_DATABASE_NAME` | Exactly the database name in the URL path, without the leading slash. |

The workflow checks the database URL against the host and database-name allowlist before any migration or deployment. If a required value is missing or the URL does not match, the workflow stops before changing anything.

## Runtime authentication and admin walkthrough

Database migration and Worker deployment alone do not configure OAuth or create an administrator.

1. In Cloudflare, configure staging-only Worker secrets for `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` (and Apple secrets only if that provider is being tested). Do not reuse production OAuth credentials or `AUTH_SECRET`. The Google OAuth redirect URI must be `https://staging.mind-ot.com/api/auth/callback/google`.
2. Create a staging admin only against the staging database, using the documented `npm run db:create-admin` process and the staging connection string. Never run it with the production database URL.
3. After the workflow deploys, open `https://staging.mind-ot.com` and run the sign-in/admin/refund browser walkthrough. Use a real test purchase record in staging; do not process a real Shopier refund.

## Running the workflow

Once the environment is configured, open **Actions → Deploy staging → Run workflow** and select branch `mindot-staging-build`. The workflow re-runs tests, builds the isolated staging Worker, applies migrations in journal order, deploys only `--env staging`, and checks that the staging origin responds while `robots.txt` contains `Disallow: /`.

## Production release stays separate

This workflow does not merge PR #10, deploy the production Worker, or run production migrations. Production release requires its own database backup, migration and deployment plan, successful staging browser walkthrough, and approved refund policy. Confirmation of a MINDOT refund must only be entered after the operator has actually completed the external refund in Shopier.

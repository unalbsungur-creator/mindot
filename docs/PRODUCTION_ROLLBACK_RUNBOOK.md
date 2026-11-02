# MINDOT — Production Rollback Runbook

## Scope
Production Worker: `mindot`
Staging Worker: `mindot-staging`
Production URL: https://mind-ot.com/

This document covers Cloudflare Worker version rollback only.
Database migrations, external services and data changes are NOT
automatically reverted.

## Known versions (verified 2026-11-02)
- Production: c47c575b-7117-4831-bcf3-324122723af2
- Previous production candidate: bd085951-9d93-4536-aeb8-b6b20598be04
- Staging: c6b8a15a-9786-4f45-a6cc-145b2e39af18

These are historical references, not permanent rollback targets.
Always verify current deployments before an incident rollback.

## 1. Detect and assess
- Review UptimeRobot alerts for homepage and admin login.
- Confirm failures independently.
- Check Cloudflare Worker error metrics.
- Identify whether the issue is code, configuration, database,
  external service, or infrastructure related.

## 2. Verify current deployment (read-only)
From the project directory:

    npx wrangler deployments list --name mindot

Record the current version and deployment timestamp.

## 3. Select a rollback target
- Use a previously verified healthy production version.
- Confirm required secrets and bindings are compatible.
- Review any database migration or schema incompatibility.
- Never select a version solely because it is older.

## 4. Authorization
Production rollback requires explicit owner approval.
Do not execute rollback as part of a routine diagnostic.
Do not run deploy, rollback, or database reset commands
without authorization.

## 5. Execute rollback
Use Cloudflare Dashboard > Workers & Pages > mindot >
Deployments / Versions to inspect the available rollback
or version promotion controls.

Confirm the selected version, environment and traffic
allocation before approving the production change.

Do not operate on mindot-staging by mistake.

## 6. Verify recovery
- Check https://mind-ot.com/ returns HTTP 200.
- Check https://mind-ot.com/admin/login returns HTTP 200.
- Check Cloudflare Worker errors.
- Confirm the affected user journey works.
- Verify authentication, card creation, and payment-related
  workflows where relevant and safe.
- Check UptimeRobot recovery notifications.

## 7. Record incident
Record incident start/end, symptoms, root cause,
previous version, restored version, approval,
verification results and follow-up actions.

## Safety notes
- Worker rollback does not reverse database migrations.
- Do not expose secrets, tokens or private user data in logs.
- Avoid enabling stored invocation logs without privacy review.
- Automatic deployment from GitHub main may overwrite a
  rollback during a subsequent merge.
- Keep staging and production isolated.

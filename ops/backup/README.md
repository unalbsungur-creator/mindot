# Weekly encrypted database backup

Security pack 2b, item 6. `.github/workflows/weekly-backup.yml` runs every Sunday at 02:17 UTC (and on demand from the Actions tab):

1. `pg_dump` (custom format, PostgreSQL 18 client) of the production database as the read-only role `mindot_backup` (member of `pg_read_all_data` only). `playing_with_neon` (Neon's sample table) is left out.
2. The dump is streamed straight into `age --encrypt` to the **public** key in `age-recipient.txt`. The plaintext dump never touches the runner's disk. The private key exists only offline, with the owner.
3. The `.age` file is uploaded to the private R2 bucket `mindot-db-backups` (`weekly/mindot-prod-<UTC time>.dump.age`, SHA-256 in the object metadata and the run summary). Only the newest 12 are kept; older ones are deleted by the same run.
4. If any step fails, a short e-mail with no data goes to destek@mind-ot.com (Resend).

## Secrets

| Secret | What it is |
| --- | --- |
| `BACKUP_DATABASE_URL` | `mindot_backup` (read-only) on the direct (non-pooler) host |
| `R2_BACKUP_ACCESS_KEY_ID` / `R2_BACKUP_SECRET_ACCESS_KEY` | R2 API token, **Object Read & Write on `mindot-db-backups` only** |
| `BACKUP_ALERT_RESEND_API_KEY` | Resend key with **sending access** only |

## Restore

`ops/backup/restore-test.ps1` (Windows PowerShell, Docker Desktop, run from the repo root):

```powershell
powershell -ExecutionPolicy Bypass -File ops\backup\restore-test.ps1 -ObjectKey weekly/mindot-prod-YYYY-MM-DDTHHMMZ.dump.age
```

It downloads the backup with your Wrangler login, asks for the age private key with hidden input, decrypts and restores inside throwaway containers (the key only ever lives in a container's in-memory `/secret`), prints table row counts and deletes everything it created. For a real restore, run the same decrypt step and `pg_restore` into the target database instead — see the owner's one-page guide (`mindot-security/yedekten-geri-yukleme.md`).

## Rotating the key

Generate a new pair offline, replace the line in `age-recipient.txt`, merge. Old backups still need the old private key until they age out (12 weeks).

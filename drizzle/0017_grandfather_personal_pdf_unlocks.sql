-- Custom SQL migration file, put your code below! --
-- Grandfather every personal_pdf project that exists when this migration
-- runs: their PDFs were free before MINDOT Tokens, so they keep that access
-- as a permanent `legacy_grandfathered` unlock (no ledger entry, no token
-- granted or spent). Data-only and one-time: projects created after this
-- runs are not covered. digital_frame / physical_gift projects and
-- digital_access_codes are untouched. ON CONFLICT on the unique
-- memory_project_id makes re-running it a no-op for already-unlocked projects.
INSERT INTO "memory_pdf_unlocks" ("id", "memory_project_id", "user_id", "source", "ledger_entry_id")
SELECT gen_random_uuid()::text, "id", "created_by", 'legacy_grandfathered', NULL
FROM "memory_projects"
WHERE "output_type" = 'personal_pdf'
ON CONFLICT ("memory_project_id") DO NOTHING;

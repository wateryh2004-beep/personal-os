# Leisure migration impact and rollback boundary

Prepared migration: `20261004193516_leisure_experiences_and_protected_feedback.sql`

No production or staging application has occurred. The only executed database verification used a new in-memory PostgreSQL engine with synthetic auth, Notes and audit tables; it had no network connection or real data.

## Objects created

- Private schema `leisure_private` with explicit schema/function privilege revocations
- Three public domain tables: `leisure_experiences`, `leisure_feedback`, `leisure_content_versions`
- Read-only authenticated grants, RLS enabled, and one owner-select policy on each table
- Four domain indexes: `leisure_experiences_owner_updated_idx`, `leisure_feedback_owner_idx`, `leisure_feedback_note_idx`, `leisure_content_versions_owner_idx`
- One unique index on the existing Notes table: `notes_leisure_owner_key` over `(id, user_id)`
- Four validation helpers in the private schema: `valid_timestamp`, `valid_http_url`, `valid_sources`, `valid_ratings`
- Three owner-checking private transaction functions: `save_feedback`, `save_content`, `archive_experience`
- Three public invoker RPC wrappers: `save_leisure_feedback`, `save_leisure_content`, `archive_leisure_experience`

Standard primary keys, ownership foreign keys and domain check constraints are part of the new tables. No existing Notes content, table columns, policies or authentication configuration are modified. No trigger, job, seed, storage bucket, credential or OAuth grant is created.

## Behavioral effect on existing Notes

The new feedback table references a Note using the composite `(linked_note_id, user_id)` foreign key. This enforces ownership and uses `ON DELETE RESTRICT`. Once a real reference exists, hard deletion of that Note must first explicitly unlink it; ordinary Note archival continues to work. An archived Note's saved reference is retained, but the UI suppresses its unusable link. The new unique index may briefly lock the Notes table during a future migration; the application plan should account for its table size and migration window.

## Audit and versions

Every successful content create/update/archive writes a full immutable version plus an existing `audit_logs` record in the same transaction. Feedback changes have a separate revision and atomic audit entry. A failed audit insert rolls back the associated data mutation. No audit record is written merely by applying this schema.

## Rollback options

- Before any application: there is nothing to roll back
- Disposable staging transaction rehearsal: run the schema and synthetic checks inside an explicitly controlled transaction and roll it back; verify the new objects and synthetic audit rows are absent afterward
- Code rollback after schema application: roll the application back while retaining the additive schema/data; existing Notes/Travel/Shopping behavior is unchanged apart from the documented hard-delete restriction when leisure Note references exist
- Schema removal after real writes: do not automatically drop tables/functions/schema or erase audit entries. Dropping the leisure tables permanently destroys personal feedback and content history. Export and verify a restorable backup first, inspect cross-object dependencies, and obtain explicit action-time approval for irreversible deletion

No executable destructive down-migration is included. A future removal should target only these exact new objects, should not cascade through pre-existing Notes or audit data, and should remove the composite Note index only after confirming nothing else depends on it.

## Remaining rehearsal gates

A real Supabase staging rehearsal is still needed for API exposure settings, advisors, role behavior and true concurrent sessions. Keep `leisure_private` out of exposed schemas. The app relies on authenticated owner sessions, not service-role writes. Synthetic PGlite verification is evidence of SQL behavior, not evidence that a hosted database was migrated successfully.

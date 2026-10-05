# 闲暇 persistence contract

Status: implementation and reviewed migration prepared; **not applied to Supabase**. There is no production seed, external write endpoint, OAuth scope expansion, scheduled generation or publication in this change.

## Canonical model

- `leisure_experiences` is the dedicated editorial record for films, series, games, books, music, outings and other leisure experiences. It contains source-backed context and optional practical details, never personal progress or reactions
- `leisure_feedback` is a separate owner-authored record. A recommendation can have no feedback; `status` is nullable even after liking something. Clearing progress or a reaction does not invent interest
- `leisure_content_versions` is append-only editorial history. Creation and every update/archive preserve a complete revision snapshot. This domain-specific snapshot is not a generic item/EAV store
- Every table has ownership, timestamps, archival metadata and RLS. No title/path naming convention or Notes container is used to encode leisure data
- External platform ratings preserve the original string value and scale. Every rating must refer to a matching rating source and have a check timestamp. A source can be unverified or stale; only a verified source with a timestamp may be treated as verified by the UI

`src/features/leisure/types.ts` is the shared home/detail view contract. Home reads a `LeisureSummary` projection that excludes long Markdown bodies, source arrays and rating arrays at the database boundary; detail reads the full `LeisureExperience`. Optional practical fields are nullable. Browsing context is transient; setting/company/budget describe known editorial facts rather than inferred user preferences.

## Read behavior

`getLeisureExperiences()` returns `{ experiences, unavailable, hasMore }`. It loads at most 100 active records, ordered by editorial `updated_at` descending and stable ID, using a 101st record to detect truncation. The UI must not describe this bounded result as the entire collection when `hasMore` is true. `getLeisureExperience(id)` reads the same content and feedback model for a single active, owned record.

Reads explicitly filter the session owner as well as using RLS. A failed/malformed feedback query fails the combined read instead of pretending all recommendations have no feedback. A missing migration is an unavailable state, not an empty collection. Authentication redirects remain intact.

Linked Notes references are stored IDs backed by an owned composite FK. Reads retain the stored `linked_note_id` but expose `linked_note_available` and a title only after an owner-and-active check. Thus an archived note cannot become a clickable stale link or be silently removed by an unrelated status change. Hard deletion of a linked note is restricted until the owner explicitly clears its reference; normal archival remains available.

## Routine feedback writes

`saveLeisureFeedback(input)` is a Server Action. It validates a complete personal snapshot with Zod, calls `requireOwner()` and invokes one database transaction. Browser-supplied `user_id`, content fields and unknown keys are rejected. Identity comes only from `auth.uid()` inside the transaction.

Input fields:

- `experience_id`: UUID
- `expected_revision`: 0 for first creation, otherwise the last server-confirmed feedback revision
- `status`: interested, planned, current, completed, or null
- `reaction`: liked, not_for_me, or none
- `personal_note`: plain user-authored text, up to 10,000 characters
- `linked_note_id`: owned note UUID or null

The RPC serializes competing writes, verifies ownership and active experience, compares revisions, writes feedback and writes the audit record atomically. A newly assigned note must be owned and active. An unchanged owned note reference may be preserved after that note is archived. No raw table INSERT/UPDATE/DELETE grant is given to authenticated, anon or service_role clients.

The action returns `{ ok: true, feedback }` only for a validated RPC result. Otherwise it returns `invalid`, `conflict`, `note_unavailable` or `unavailable`. On a conflict, reload the current record before retrying; never silently replace a concurrent edit. A transport failure can occur after commit, so the UI should refresh before resubmission rather than assume the old revision remains valid. A subsequent cache-refresh failure does not misreport a committed save as failed.

## Editorial write boundary

`leisureContentWriteSchema` and `save_leisure_content(experience_id, expected_revision, content)` define the eventual external-content contract. The content object has an explicit allowlist; feedback, ownership, timestamps and revision keys are rejected. The RPC only mutates `leisure_experiences`, its immutable version history, and audit logs. Feedback fields, rows and revision numbers are untouched.

`archive_leisure_experience(id, expected_revision)` archives with the same revision/audit guarantees and retains personal feedback/history. There is no hard-delete capability. No browser content-editing action or external agent credentials are added. A future external tool must expose only the editorial capability, enforce its own narrow existing authorization, and record trusted actor provenance; it must not grant an agent the personal-feedback capability or widen OAuth scopes merely to ingest content. Current authenticated writes are recorded as user actions; this migration does not claim AI provenance that has not been authenticated.

Public RPC wrappers are `SECURITY INVOKER`. The narrowly scoped write implementations live in non-exposed `leisure_private`, use an empty search path, explicitly authenticate `auth.uid()`, derive ownership internally and have PUBLIC/anon/service_role execute revoked. Their `SECURITY DEFINER` privilege is limited to audited writes because giving clients raw table privileges would allow bypassing revision and audit enforcement. Keep `leisure_private` out of exposed API schemas.

## Verification

Unit and contract suite:

```sh
npm exec vitest run -- tests/leisure-persistence*.test.ts
npm run typecheck
npm exec eslint -- src/features/leisure/{types,schemas,queries,actions}.ts tests/leisure-persistence*.test.ts tests/leisure-persistence-database.mjs
```

An additional real PostgreSQL-engine smoke suite uses disposable in-memory PGlite. It creates minimal local auth/Notes/audit fixtures and evaluates the prepared migration there, with no Supabase credentials or connection. The dependency is installed outside the repository so the application lockfile remains unchanged:

```sh
npm install --prefix /tmp/leisure-sql-test --no-audit --no-fund @electric-sql/pglite@0.3.14
LEISURE_PGLITE_MODULE=/tmp/leisure-sql-test/node_modules/@electric-sql/pglite/dist/index.js node tests/leisure-persistence-database.mjs
```

This verifies schema/function compilation; owner/other-owner/anon/service_role allow/deny; immutable history; nullable statuses and clearing; original source validation; optimistic revisions; archived note preservation; new archived note rejection; content updates leaving feedback unchanged; and complete rollback when audit insertion fails.

It does not replace a full-stack Supabase staging rehearsal or true multi-connection concurrency test. Before an authorized deployment, apply all migrations to a disposable/staging Supabase database, run database advisors and RLS tests there, and verify refresh/navigation persistence with the signed-in owner. No linked/production database commands are part of this implementation task.

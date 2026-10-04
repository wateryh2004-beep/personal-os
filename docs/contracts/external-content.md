# External authoring → PersonalOS reading

## Scope and rollout state

Codex / Claude Code research and author selected content. PersonalOS stores Markdown in its existing canonical Notes and Interview tables, renders it, and supports search, versions and practice. There is no automatic whole-chat ingestion, hosted model dependency, queue, vector database or replacement content store in this pilot.

The Career reading UI and `/notes/{id}/read` can be deployed independently. **External content writes are not live until the reviewed transaction SQL is installed.** Missing RPC returns `migration_required`; the adapter never falls back to non-atomic writes. The SQL proposal is `docs/contracts/content-write-transaction.sql`, not an applied migration. Generate the actual migration with the Supabase CLI, run isolated database tests and obtain approval before applying it to production.

The proposal adds one narrow SECURITY INVOKER RPC plus an idempotency receipt index on existing `audit_logs`. It does not create accounts, tokens, service-role access, new tables or looser RLS. Existing history and identifiers are preserved. The rollback-only synthetic PostgreSQL suite passed in the separately identified validation project; see [verification record](content-write-verification.md). Production RLS/installation and two-session concurrency remain rollout gates.

## Authentication boundary

`/api/content` uses the existing verified owner cookie session and underlying RLS. GET supports bounded `find` and `read`. POST additionally requires same-origin `Origin`, non-cross-site fetch metadata, JSON and a streamed one-megabyte limit. It does not accept an owner ID, bearer credential, password or API key in the command. No CORS grant is added. Set APP_URL to the exact public origin for each deployment (including a preview that is allowed to test writes). A production APP_URL inherited by preview intentionally rejects preview POSTs. Without a canonical origin, the boundary matches the browser Origin to the actual Host and request protocol, rather than Next.js’s internal listening hostname; forwarded-host is never trusted.

An external runner can call `writeContent` only through an already authorized owner-session provider that supplies its authenticated client. This repository does not copy browser cookies, ask for tokens, create persistent access, or pretend a shell is already connected. A CLI-only Codex/Claude deployment needs a separately approved authentication integration before live operation. Prefer a bounded, revocable owner auth integration; never use an admin/service-role credential as the authoring identity. Approval to publish code is separate from approval to apply the database migration and from approval to create persistent access.

Local command preparation needs no authentication and makes no network calls:

```sh
node --experimental-transform-types scripts/prepare-content.mjs < chosen-command.json
```

The output is validated JSON for an authorized transport, not proof it was saved. Keep private content files out of Git. Do not put credentials or content in shell arguments/logs. Choose the exact conversation excerpt or curated Markdown before preparing a command; preserve the original body bytes and add `sourceUrl` separately. The source URL is stored in the atomic receipt and displayed by the reader; it does not establish factual correctness.

Note commands must explicitly choose `contentOrigin: "human" | "ai_generated"`; there is no inferred default. `source` identifies the transporting tool, not the author. Optional `captureMode: "original" | "curated"` records whether the selected text was copied or transformed, independently of authorship. A verbatim human-only excerpt can be `human`; a verbatim AI answer remains `ai_generated`. Treat mixed human/AI conversations conservatively as `ai_generated` unless the selected text is explicitly human-only. A curated AI rewrite of an existing human note must explicitly change its origin. These provenance labels are not fact verification. The existing origin field also governs AI background retrieval, so do not label mixed/AI content as human merely because it was copied exactly.

## Bounded discovery and read

- `GET /api/content?action=find&kind=note&q=...&limit=20` searches titles and returns metadata and reader links, not every note body
- `GET /api/content?action=read&kind=note&id=UUID` returns current Markdown, revision, updated_at and source records
- `GET /api/content?action=find&kind=interview&q=...&limit=20` searches canonical question text and returns stable preparation IDs
- `GET /api/content?action=read&kind=interview&id=PREPARATION_UUID&answerId=ANSWER_UUID` returns the chosen answer and bounded version metadata. Omit answerId to select a current/preferred-language draft. `versions` includes archived stream heads so the writer cannot unknowingly reuse a version number

All queries filter the verified owner. Notes marked sensitive/never-visible, archived or trashed are unavailable to this AI authoring boundary. The authenticated owner can still read their own saved Notes in the website. No privacy fallback omits these filters if a schema/query fails. More than 200 versions in one preparation returns a bounded-read error rather than silently calculating a wrong stream head.

## Commands

The executable Zod contract is `src/features/content/contracts.ts`. Unknown keys are rejected. A UUID `operationId` names one intent; keep the exact command for an uncertain retry. Different bytes or metadata with the same operationId fail with `idempotency_conflict`.

1. `note.create`: source (`codex`, `claude`, `external_agent`), contentOrigin (`human` or `ai_generated`, required), title, bodyMarkdown, optional folderId/sourceUrl/captureMode. Returns the new note's stable entityId, revision, updatedAt and `/notes/{id}/read` link
2. `note.update`: source, contentOrigin (required explicit choice), noteId, expectedRevision, expectedUpdatedAt, title, bodyMarkdown, optional sourceUrl/captureMode. Saves the previous canonical body as a snapshot in the same transaction, then increments revision. The row timestamp also detects legacy title changes that do not increment revision
3. `interview.answer.append`: source, preparationId, answerMode (`spoken` only in this pilot), language, targetSeconds, expectedVersion, expectedAnswerId, expectedUpdatedAt, bodyMarkdown, optional changeNote/sourceUrl. Stable identity is the preparation and its mode/language/duration stream. expectedVersion is the greatest version number in that exact stream, including archived rows. For the first version use 0 and null base ID/timestamp; otherwise use the exact selected base row and current stream head. A fresh draft after archived history may omit both base ID and timestamp, but must still supply the actual stream head

Interview changes append a draft, never replace an old body, promote an answer, mark mastery or claim a fact was confirmed. The result includes new answerId and a reader link explicitly selecting it; the default reader keeps any already adopted answer. Existing practice/history references remain valid. To change assumptions after a conflict, read again, review, then use a new operationId; do not auto-overwrite.

## Acceptance and recovery

- Chosen conversation: prepare exact original or curated Markdown + explicit contentOrigin + sourceUrl → authorized `note.create` → returned reader URL → check body, source and identity → replay unchanged command returns the same receipt
- Interview revision: read preparation/base and stream head → append with CAS → returned answer-specific URL renders the new draft → old version still readable → replay produces no duplicate → stale/different command returns conflict
- Unexpected disconnect after write: retry the exact command and operationId. Content, history and receipt commit together
- Versions/recovery: Notes reader shows recent snapshots and links to existing document recovery; Interview retains existing version management routes. Content writes require no website deployment once the code and transaction are installed

Before enabling writes, run the proposal against an isolated database migrated from the repository: anonymous rejection, owner-A/B isolation and guessed parent IDs, concurrent duplicate replay, same ID/different payload, stale revision/timestamp, parallel stream appends, archived/private records, transaction rollback, and history retention. Never run these fixtures against production content.

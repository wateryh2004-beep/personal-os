# Content write transaction verification

Final verification run: 2026-10-04, 18:27 UTC

## Scope and environment

The prepared transaction was executed against the independently identified
`personal-os-interview-lab-v1-1-validation` Supabase project. Its project metadata
reported `ACTIVE_HEALTHY`. The production project was neither queried nor changed
for this verification.

The validation database had the required Notes columns, Interview V1.1 tables,
and existing authenticated table privileges. The proposed `write_content(jsonb)`
function and `content_write_receipt_unique_idx` were absent before the test.

The exact prepared function/index and the executable assertion suite were
combined inside a single transaction. The proposal's standalone transaction
wrapper was removed; the combined statement contained no `COMMIT`. Synthetic
users and records were created for testing, and all DDL and fixture/content
writes ended with `ROLLBACK`. No existing user content was selected or changed.

## Checks passed in PostgreSQL

The suite in `tests/database/content-write.sql` completed successfully:

- `SECURITY INVOKER` behavior and authenticated-only RPC execution
- Anonymous execution denied; authenticated requests without a user ID denied
- Actual non-bypass-RLS authenticated role with distinct synthetic owners A/B
- Cross-owner note reads and direct updates denied; cross-owner write targets,
  folders, preparations and selected answer bases unavailable
- Identical operations return the original receipt without duplicate notes,
  snapshots or receipts; changed payloads with the same operation ID rejected
- The same operation ID belongs independently to each owner
- Original Markdown preserved exactly, with source URL stored separately
- Required explicit authorship: verbatim human text remains `human`; a curated
  revision changes to `ai_generated` only when explicitly supplied. Missing
  authorship is rejected. Capture mode and source tool are recorded separately,
  and the audit retains the previous authorship label
- Existing note identity retained; revision increments; old and new bodies
  retained in version history
- Stale note revisions and timestamps rejected
- Sensitive and never-visible notes rejected by the external write path
- Interview edits append new unconfirmed AI drafts, preserve the current answer,
  and create no practice records
- Stale interview stream versions and selected-base timestamps rejected
- Unsupported answer modes and caller-supplied adoption status rejected
- Archived-only answer streams can receive a fresh draft without reviving history
- A deliberately failed final audit receipt rolls back the canonical note update,
  both snapshots, and receipt; a failed create leaves no orphan note

## Independent rollback verification

A separate query after the successful test returned:

| Object/check | Result |
| --- | --- |
| `public.write_content(jsonb)` | Absent |
| `public.content_write_receipt_unique_idx` | Absent |
| Synthetic receipt-failure function | Absent |
| Synthetic receipt-failure triggers | 0 |
| Synthetic test users | 0 |

The transaction, its function execution grants, and fixtures were therefore not
installed or retained in the validation database. This was a verification run,
not a deployment or a production migration.

## Reproduction and remaining gates

`node scripts/test-content-database.mjs --help` explains the local-only runner.
It requires an explicit opt-in, a literal loopback host, an explicitly named
isolated test database, and an already-installed `psql`. It does not install
software or provision a database. `--proposal` includes the reviewed proposal
inside the same rolled-back test transaction. Connection credentials are not
passed as command arguments or printed.

The following are **not yet verified**:

- Two-session contention/replay races and competing note/interview writes. The
  local runner documents the separate concurrency scenarios; the successful
  single-session suite is not evidence that those races were exercised
- The fixture branch for the later Interview V1.2 taxonomy registry and V1.3
  archetype triggers. This live validation database has Interview V1.1
- Production migration installation, production grants, or external-agent login
  provisioning

Any later change to the prepared transaction or assertions requires another
verification run before claiming that changed version passed. The separate
`content-write-rollback.sql` is a prepared function/index removal script; it has
not been applied and intentionally deletes no content or audit history.

## Verified source fingerprints

The final run above used these SHA-256 fingerprints:

- `docs/contracts/content-write-transaction.sql`: `b5455b6f8a4461802b837d613629f3e42fc27555ee9ccefddbea4b20346a81f8`
- `tests/database/content-write.sql`: `e4d2b661e17ab90b262f3dadedf542de5bb5a2dfe75b861c0dcb2c3954239d1b`

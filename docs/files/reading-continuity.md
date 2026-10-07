# Private PDF reading continuity

Apply `20261007092752_document_reading_progress.sql` before releasing. No data
backfill, file-byte mutation, cover regeneration, or bucket changes are required.

The owner-scoped table stores page, page count and revision. The document has a
separate source version which changes only when byte-identity metadata changes,
not for rename/move, extraction or cover updates. Preview HEAD identifies that
version and subsequent PDF reads reject a changed source. Reopening restores a
saved page only for the same source and page count. Existing 25 MiB/500-page reader
budgets are preserved; browser-native previews do not report reading positions.

Opening, zooming and failed renders never advance progress. Successfully rendered
user navigation enters a serial write queue. Each save uses an expected revision
and stable mutation ID, including a lost-response retry. The database locks the
parent first to serialize concurrent first inserts and source changes. A stale
device must explicitly choose the latest position or its current page; deliberately
reading backwards remains valid. Network failures are visible and never called
saved. There is no local persistent private reading-history cache. Already-issued
saves can finish on close; hard browser/process termination before the server
receives them may lose the most recent turn.

Progress is user data suitable for recovery. A restore must map source_version to
the restored document's new reading_source_version after verifying original bytes.
It must not copy a stale token onto a different source. No high-volume page-turn
audit events are written: the row's revision and timestamp record this preference.

## Verification

- Full local unit/UI/API suite: 256 files / 1,746 tests passed
- Typecheck and changed-source lint passed; full repo lint has pre-existing errors
- Migration + synthetic PostgreSQL/PGlite RLS/regression checks passed, including
  owner isolation, forged parent ID, anon denial, bounds, stale revisions, retries,
  rereading, source replacement and archive denial
- PostgreSQL 17 CI includes a 12-connection first-write race
- Real browser synthetic fixture exercises actual PDF canvas ink, two contexts,
  conflict resolution, refresh, close and Back/Forward. Local Chromium could not
  launch because this executor rejects local sockets even with escalated execution;
  this browser stage is a CI release gate, not a claimed local pass

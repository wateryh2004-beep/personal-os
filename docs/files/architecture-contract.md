# Files architecture contract

Reviewed design date: 2026-10-07. This is the integrated acceptance contract for the ten-item program, not a claim that a feature is live or that every provider's newest release is automatically better. The design favors verifiable, mature patterns within the existing private R2 + Supabase + Next.js architecture.

## Boundaries and invariants

1. **Originals are authoritative.** An upload is provisional until the existing full-content SHA-256 and sealed-copy verification completes. A UI progress bar, provider ETag, multipart completion response or thumbnail is not proof that the original is available. Available originals are not overwritten by OCR, rendering, rename, folder changes or recovery rehearsal.
2. **Metadata is owner-scoped and source-versioned.** Authenticated server identity, RLS and owner-prefixed object paths agree. Clients cannot supply an owner, trusted provider upload ID or publication state. Byte-source replacement invalidates reading position and derived-work publication; rename/move alone does not discard reading progress or regenerate the same derivative.
3. **Upload sessions are durable workflow state.** Large files use bounded multipart parts and concurrency, incremental client hashing and server-persisted session state. Resume lists authoritative provider parts and checks the reselected file's full identity. Completion/cancel lease races and lost replies must converge without publishing corrupted data or deleting an available original. The 100 MiB product limit remains an intentional resource bound, not R2's provider limit.
4. **Derived artifacts are replaceable.** Cached covers are identified by source SHA and renderer version, stored privately, and authorized before conditional 304 responses. Leased jobs are bounded, retryable and idempotent. Unsupported or malformed PDFs retain original access. OCR is an explicit browser-local worker operation with pinned, same-origin assets; it records provenance and may publish only for the unchanged owner/source. It is not a server-durable job: closing the browser cancels local recognition, and the UI must state that limit.
5. **Search follows accepted content.** Native extraction remains the fast path. OCR text and its provenance are atomically accepted before indexing; a stale legacy extractor must not overwrite it. Blank pages do not erase recognized text, and page/byte limits must never masquerade as a complete partial extraction. Archived/foreign sources remain excluded by owner/availability checks.
6. **Recovery is a tested format, not a download claim.** Versioned schema allowlists, row/object hashes, counts, completion markers and relationship validation accompany portable snapshots. Files originals are cross-matched to existing portable packages; private artwork bytes are included in the system snapshot. Missing providers/objects are explicit gaps. Isolated native PostgreSQL restoration applies the actual schema, preserves ownership and version history, and verifies re-exported contents and real foreign keys. It never targets an existing production database.
7. **State and costs are truthful.** Uploading, paused, failed, pending derivative, unsynced progress, stale quote and incomplete recovery are distinct from success. Storage stock, the owner's persisted capacity plan and provider monthly billing are separate units. Unknown billing stays unknown. Timing telemetry contains route categories and durations, not document names, contents, search text or record IDs.
8. **Interaction remains usable.** Cards load small cached covers; heavy PDF/OCR code loads only on explicit use. Mobile/desktop layouts, keyboard controls, cancellation, retry, Back/Forward and repeated actions are tested using synthetic data. Resource limits and recovery steps are discoverable without adding an administrative dashboard.

## Verification mapping

- Original sealing and upload integrity: existing upload-finalization tests plus multipart client/API/adapter/SQL and concurrency tests
- Covers: real synthetic render/font/scan fixtures, cold traced deployment packages, owner/lease SQL and image/network/browser evidence
- Reading: source-version/CAS tests, independent contexts, deliberate rereading, close/reopen and native PostgreSQL first-write races
- OCR: real Chinese/English image and scanned-PDF recognition, blank-page and native-text cases, no external runtime assets, source/CAS/RLS and legacy extraction races
- Search: native PostgreSQL owner/archive/domain/literal-query tests; actual item destinations in UI
- Recovery: corrupt/incomplete package rejection, numeric normalization, native schema replay and restore/re-export, artwork/original-byte checks and no-existing-target safety tests
- Startup/UI: cold and warm synthetic browser measurements; warm cached Notes must not wait for the streamed server model; responsive screenshots inspected
- Final release: aggregate typecheck, full suite, production build, changed-file lint, exact-head CI, independent review and separately reviewed production migration/configuration steps

## Current primary references

- [R2 object upload guidance](https://developers.cloudflare.com/r2/objects/upload-objects/): multipart supports retrying only failed parts; non-final parts have a 5 MiB minimum. Our 8 MiB parts stay inside that bound.
- [R2 consistency model](https://developers.cloudflare.com/r2/reference/consistency/): provider consistency does not replace application-level ownership, checksums, workflow leases or cross-database publication checks.
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): policies enforce row access with authenticated identity; privileged server operations need their own bounded checks.
- [Tesseract.js](https://github.com/naptha/tesseract.js): local worker recognition is used as a mature browser/Node engine. PDF rasterization is handled separately; documents are not sent to an OCR vendor.
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/): Standard's monthly free allowance is 10 GB-month; object stock cannot be subtracted from monthly billing usage to invent an account balance.

## Release and scope limits

No new backup destination, storage account, public bucket, persistent credential, paid recognition/feed service or destructive original cleanup is included. Provider permission expansion, production schema application and feature flags are separate reviewed release steps. No China-network, real-user device or live platform-cold-start measurement has been obtained. Synthetic evidence must not be relabeled as production evidence. Remaining coverage gaps stay open in the ten-item checklist.

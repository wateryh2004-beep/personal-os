# Settings: bounded R2 storage inspection

Settings exposes two explicit owner-only actions:

- **检查连接**: server configuration / account-level endpoint format, a timed `HeadBucket` request, and the current user's current-bucket Files database totals.
- **检查并统计用量**: the same checks plus `ListObjectsV2`, at most 20 pages of 1,000 objects, within a 45-second inspection deadline.

No inspection is started on render, navigation or a timer. UI refreshes only the displayed age of the snapshot. No object body is downloaded, written, deleted or made public. No API key or additional permission is requested. The existing server-side R2 adapter owns all provider SDK calls.

## Scope and interpretation

HeadBucket success establishes only that the configured bucket was reachable for that authenticated operation. It does not establish object Get/Put permission, browser CORS, or integrity of every file. Failure is scoped to configuration, access denied, not found, or network/service unavailable. Provider error messages, credentials and endpoint are not returned.

Logical totals use owner-scoped Supabase document records and distinguish available, archived and pending bytes. Pending record sizes need not have reached R2. Archived objects remain stored. Errors, invalid sizes, paging limits and unavailable records produce an unavailable state rather than a successful zero.

Actual usage aggregates the configured bucket's listed object bytes and count, including other modules and temporary/archived objects. It never returns object keys or contents. `complete` means the listing exhausted its continuation tokens; `partial` means only the observed subset is known; `unavailable` means no usable page was obtained. Empty successful buckets are distinct from failed listings. Pagination during concurrent changes is a listing snapshot, not an atomic inventory. Multipart uploads not yet completed are excluded.

These are not account billing metrics, free-tier/quota percentages, cost estimates, or an orphan-deletion plan. A record/object count mismatch alone is not grounds to remove anything.

## Privacy, request bounds and caching

The POST route authenticates `requireOwnerApi` on every request, rejects cross-origin requests and invalid inputs, and responds with `private, no-store` plus `Vary: Cookie`. It keeps only aggregate results in a bounded in-process map keyed by authenticated owner and check mode. Concurrent and repeated requests within 60 seconds reuse the same promise/result. This is instance-local deduplication, not a distributed rate limit or durable monitoring system. The map is capped at 16 entries. There is no scheduled inspection.

Snapshots include completion time; the UI marks snapshots older than five minutes and preserves the old snapshot with an explicit warning if a later request fails. Basic health checks deliberately replace any prior full usage snapshot with an unscanned state, avoiding mixing metric timestamps.

## Verification

Synthetic tests cover provider pagination/limits/errors/cursor loops/invalid totals/abort, owner and origin checks, private response headers, identity-separated reuse, TTL expiry, database scoping and logical totals, UI unknown/partial/expired/failed/retry/unmount states and no request on mount. No production bucket was listed or credential read during implementation.

Official provider compatibility reference: https://developers.cloudflare.com/r2/api/s3/api/

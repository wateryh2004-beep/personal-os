# Cached private PDF covers (test branch)

## Goal

Files cards show a small real first-page WebP instead of repeatedly parsing PDFs on a phone. Opening a PDF still uses the existing reader and original-file route. Image thumbnails are unchanged.

## Security and lifecycle

- Source originals remain sealed and private in the existing R2 bucket. No external conversion service, new bucket, or public URL is introduced.
- The source checksum and pinned renderer version identify each immutable derivative. Renaming a document does not require rendering again.
- Every cover request checks the authenticated owner and current document availability/archive state. Conditional cache hits are authorized before returning 304. Browser cache is private and must revalidate; there is no permanent IndexedDB or cross-account JavaScript blob cache.
- Upload completion and thumbnail completion are independent. Failed thumbnails leave the original usable. Durable jobs can retry infrastructure failures; malformed/encrypted/unsupported documents fall back to a quiet PDF placeholder.
- Client cards only request visible small images, with three request slots, up to eight pending checks, a 35-second mounted deadline, and a 128 KiB response budget. Temporary URLs and in-flight requests are released on navigation. A pending timeout does not cancel the durable server job.
- Rendering runs in a separately terminable Node process with bounded source size, first page only, page count, image/pixel and elapsed-time limits. This reduces resource risk; it does not make PDF processing free or imply zero memory use.

## Rollout gates

This branch does not authorize a production migration, backfill, merge, configuration change, or deployment. `PDF_COVERS_ENABLED` is off by default. Enable it only after reviewing the migration and passing isolated test results, verifying the deployed Node/runtime bundle and existing scheduler, and obtaining rollout approval.

The new schema is a reviewable migration in `supabase/migrations/`. Run it against an isolated synthetic database first. Preserve existing R2 credentials and permissions; no new long-lived credentials are needed. Rollback disables the flag and returns to quiet placeholders while originals and the PDF reader remain available. Do not delete originals or thumbnail objects as part of rollback.

## Verification

The focused UI tests use synthetic data only, with screenshots at 360, 390 and 1440 px. Measurements distinguish first-time rendering from repeat authenticated image revalidation. They must show that list views do not fetch original PDF bytes or load PDF.js and that clicking the reader still does.

Renderer tests cover real synthetic PDF parsing and encoding, output signatures/dimensions, rotation, Chinese text, raster scans, encrypted/malformed inputs, oversized inputs and cancellation. Backend tests and isolated SQL checks exercise ownership, archive behavior, leases, concurrent claims, failed work/retry, and source/version invalidation.

CI screenshots and measurements are evidence for those synthetic fixtures, not a claim that every private PDF or every phone has been tested. Production migration and real private-document acceptance remain separate rollout steps.

## Renderer runtime, fidelity and packaging

The server-only adapter starts one short-lived Node process at a time per server
instance. Its `SIGKILL` deadline is 15 seconds of elapsed wall time, covering
synchronous JavaScript and native canvas/image decoding. An abort also kills and
reaps the process before releasing its slot. The child receives only PDF bytes
and fixed rendering limits, with a minimal environment that excludes R2,
database and authentication secrets. It does not accept a path or URL.

Limits: 12 MiB source, at most 500 pages, first page only, longest output edge
512 px, 128 KiB WebP, 16 million pixels per embedded image or intermediate
canvas, 32 million live canvas pixels, and a 192 MiB V8 heap. Native allocation
is not governed by V8's heap limit; these controls are not an OS memory sandbox.
Sharp runs with one encoding thread and disabled cache. Native canvases and the
PDF loading task are explicitly destroyed; process exit releases remaining
native resources. No input PDF is written to disk.

The complete page aspect ratio and PDF rotation are preserved. Visible standard
annotations are rasterized, but interactive scripts are never executed. XFA,
password-protected, malformed or resource-exceeding documents fall back to the
PDF placeholder. Missing-font or omitted-content diagnostics also fail closed.
Embedded Chinese text is tested against an independently rasterized reference
image; an unembedded STSong CJK fixture deliberately falls back, because PDF.js
standard fonts do not supply a portable Chinese substitute. No remote font
fetch or system-font dependency is used. PDF.js 6.4's strict operator-list error
path can resolve incomplete content; the renderer instead captures recoverable
warnings privately and rejects content-loss cases before storing an image.

Exact dependency pins are `pdfjs-dist@6.4.299` (Apache-2.0) and
`@napi-rs/canvas@1.0.10` (MIT), alongside `sharp@0.35.5` (Apache-2.0).
The application and matching ESLint package are pinned to Next 16.3.6. The
[bounded 2026-10-07 security patch](security/runtime-dependencies-2026-10-07.md)
replaces the previously measured Sharp 0.35.3 / Next 16.3.0 installation while
preserving renderer limits and all existing package license identifiers.
PDF.js requires Node >=22.13; local verification uses Node 24.19.0 and the
existing project selects Node 24.x. No project runtime setting is changed.
PDF.js's CMaps, standard fonts, WASM decoders and ICC profiles retain their
upstream notices, as do the platform canvas and Sharp packages. The Chinese
fixture contains an OFL-licensed Noto subset with its notice alongside the test.

Sources:
- Official Node example: https://github.com/mozilla/pdf.js/tree/master/examples/node/pdf2png
- PDF.js API options: https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html
- PDF.js license: https://github.com/mozilla/pdf.js/blob/master/LICENSE
- Native canvas implementation/license: https://github.com/Brooooooklyn/canvas
- Sharp licensing: https://github.com/lovell/sharp/blob/main/LICENSE
- Next asset tracing: https://nextjs.org/docs/app/api-reference/config/next-config-js/output

`next.config.ts` keeps renderer dependencies external and explicitly traces the
one-shot worker, CMaps, fonts, decoders, licenses and native bindings into all
three job-running routes. Run `node scripts/verify-pdf-cover-package.mjs` after
`next build`. It copies only runtime files listed in each route's actual trace
into an isolated temporary directory and renders a synthetic Chinese PDF there;
it does not reuse the source checkout's node_modules or connect to services.
This catches missing files that a normal development render can conceal.

The renderer tests write real WebP samples and `metrics.json` under
`test-results/pdf-renderer/`; the package smoke writes `package-metrics.json`.
Example local cold-process times were about 0.5–1.1 seconds, producing 1.5 KiB
portrait, 3.9 KiB embedded-Chinese and 110 KiB noisy scanned covers. These are
small synthetic fixtures on this executor, not production latency guarantees.
Backend/network tests remain synthetic, and no private production PDF was read.

Historical pre-hardening production build and all three cold-copy trace checks
passed with Sharp 0.35.3 / Next 16.3.0. Each trace
packaged 361 renderer runtime files (about 124.6 MiB), including the optional
native library variants installed by npm; the complete route traces were about
128.5–130.5 MiB. Isolated packaged Chinese rendering took about 0.52–0.55 seconds.
These are build/packaging checks, not a deployed production smoke test.

With Sharp 0.35.5 / Next 16.3.6, the 2026-10-07 clean build and all three cold
route-package copies also pass: **361 runtime files / 131,984,695 bytes
(125.9 MiB)** per copy, with embedded-Chinese rendering at 584, 578 and 604 ms.
The actually loaded native libraries are libheif 1.23.5 and librsvg 2.63.2.
Portrait, rotated, embedded-Chinese and noisy-scan output SHA-256 hashes match
the previous installation exactly; WebP remains 1.6.0. The existing
`pdfjs-6.4.299-webp-v1` cache key is therefore retained, without rewriting or
invalidating stored covers. Exact hashes and package evidence are in
[the security evidence JSON](security/runtime-dependencies-2026-10-07-evidence.json).
Final-commit Chromium/CI and separately authorized deployed-runtime acceptance
remain required; local Chromium is blocked by this executor's socket restriction.

## Backend operation and recovery

- `GET /api/files/:documentId/pdf-cover` returns an owner-authorized WebP, or `304` on a matching verified output digest. A ready/304 lookup performs read-only metadata queries and never enqueues or reads original bytes. Pending work returns `202`, `Retry-After: 3`; permanent failure is `422`, oversized source is `413`, and disabled/unavailable service is `503`. None of the error responses includes provider details or private object keys.
- Metadata queries and queue RPCs have a five-second abort budget. Jobs get a 60-second database lease, a fresh unguessable lease token and at most three attempts. The runner uses an overall 25-second deadline, shorter than the remaining lease, and a separately killable 15-second render process. Retryable failures wait 30 then 60 seconds; expired workers cannot publish.
- Invoker-only queue RPCs and mutation grants are restricted to the existing server role. Authenticated job reads use RLS for the same owner and current active source. Per-owner advisory serialization plus a single live lease limits concurrent render jobs across server instances. Changing source checksum/path/bucket/size or renderer version invalidates old work. A source change preserves a still-running lease until expiry before replacing its job, avoiding overlapping render admission.
- Upload response success does not await any cover database or storage operation. `after()` registers a best-effort enqueue/render kick. The existing `/api/cron/files-extraction` schedule stays at 19:25 UTC daily; its independent cover phase runs before text extraction, discovers at most three old/missed documents and processes at most two jobs. Visible-file requests receive priority over background discovery. No migration automatically renders or backfills documents.
- R2 keys are owner/document scoped under `pdf-covers`, with the renderer version and actual source SHA-256. Writes are conditional creates; a verified readback precedes publication. Confirmed missing derived objects can be requeued without resetting attempts. A corrupt immutable object is terminal and is not overwritten or deleted automatically; repair requires a reviewed renderer-version bump. Network/authentication outages do not invalidate a good ready record. No original-object cleanup is part of this feature.
- Resource limits: 12 MiB source, 500 pages inspected for admission, first page only, maximum 512-pixel edge, 128 KiB WebP output, and bounded embedded-image pixels. Documents outside policy retain the PDF placeholder and their normal reader/download path.

## Isolated SQL checks

The `pdf-cover-sql` CI job creates a disposable PostgreSQL 17 `pdf_cover_test` database, runs `tests/fixtures/pdf-cover-sql/bootstrap.sql`, the reviewed migration, `regression.sql`, then `scripts/pdf-cover-sql-concurrency.py`. The Python runner rejects non-loopback hosts and any other database name. Do not use these fixtures against an existing or production database.

The synthetic regression suite covers owner/RLS restrictions, service-only invoker execution, archive checks, checksum-free legacy files, source/version invalidation, retry/backoff/exhaustion, expired-token publication rejection and missing/corrupt derivative repair CAS. The separate 16-connection test verifies cross-instance owner admission, visible priority, expiry recovery and repeated enqueue idempotency. These checks were also run successfully against an isolated local PostgreSQL 17.11 instance; no production schema, data or R2 object was accessed.

# Private document OCR

## Usage and limits

Files list and grid offer **OCR** for PDF, PNG, JPEG and non-animated WebP. Opening the dialog only reads job metadata. The explicit Start / Retry button runs recognition in a disposable browser worker; neither opening Files nor cron starts OCR. Keep the page and OCR dialog open. Cancel, closing the dialog, or navigating away terminates the worker; retries restart the complete document. There is no unattended server OCR queue.

- Tesseract.js / Tesseract.js-core **7.0.0**, local `chi_sim+eng` models **1.0.0**: simplified Chinese and English, primarily clear printed text
- Maximum source size **20 MiB**, PDF **10 pages**, source image **20 million pixels**, rendered page **4 million pixels / 4096px edge**, **300,000 characters**, **5 minutes per attempt / 45 seconds per page** including first engine initialization
- One active run per owner, enforced by a database advisory lock and **6-minute** nonrenewing lease. A crashed/offline client can retry after expiry
- PDFs exceeding 10 pages are rejected entirely. Text is published only when every page finishes. Individual blank/unrecognized pages are counted and reported; only an entirely empty result fails the attempt. All pages must finish before publication; no partial run is presented as complete
- Pages with at least 80 non-whitespace native text characters use that layer without loading OCR; sparse/scanned pages are rasterized. Mixed text/image pages with substantial native text use the text layer, so text embedded only inside additional pictures on those pages is not separately recognized
- No handwriting, vertical/traditional Chinese, layout/table reconstruction, encrypted PDF, animated images, or guaranteed accuracy. OCR may misread or omit characters; the original remains authoritative

## Privacy, integrity and lifecycle

All engine JavaScript, CPU variants, WASM, and models are served from `/ocr/v1/` on the app origin. No CDN, paid API, API key, OCR provider, AI endpoint or document upload is used. Tesseract persistent language caching and implicit sublanguage loading are disabled; original bytes and intermediate canvases live only in the current browser session. The existing authenticated API reads the owner's original from their configured private R2 bucket. It validates ownership, source path, size, active run and checksum before sending bytes, and the browser verifies SHA-256 again.

`start_document_ocr` and `update_document_ocr` derive ownership from `auth.uid()`. Direct job writes are revoked. Publication compares the exact run token and source path/bucket/checksum/size under a row lock, then atomically writes `documents.extracted_text`, audit metadata (no text), and completed status. The existing document search trigger indexes that text; existing AI visibility policies continue to apply. The document also retains the latest successful extraction method, exact engine/model versions, original SHA-256, total pages and blank/unrecognized-page count. This provenance is independent of the replaceable run record and survives failed retries. It is included in portable Files export and whole-system backup. Old tokens, other owners, expired leases and archived or changed sources cannot publish. Replacing a source clears derived text and job state, which also removes stale text from search. Failed/cancelled retries retain a prior successful index. An interrupted completion response can be checked by reopening the dialog.

The original fast automatic text-layer extraction remains in place; completed text/OCR results are not overwritten by older extraction work. PR61 cover queue, rendering and cache paths are unchanged. `document_ocr_jobs` is transient run metadata; the durable recognized content remains in the existing document export.

## Packaging and deployment

Run `npm ci --ignore-scripts`, then `npm run build`. `prebuild` invokes `scripts/prepare-ocr-assets.mjs`; `predev` does the same for development. Generated `public/ocr/` is gitignored. The generator fails if required core variants are missing, copies pinned official npm assets without modification, includes model/engine licenses and notices, and writes a SHA-256 manifest. The combined deployment assets total approximately **25 MB**, while each browser downloads only its matching CPU variant and two language packs on explicit recognition. `/ocr/v1/` is excluded from auth middleware as public code/models only; document APIs remain authenticated.

Ship migration `20261007093341_private_document_ocr.sql` through normal review/deployment. No production migration, object rewrite or backfill is needed by this development change. Deploy schema before exposing the new UI. Fresh browser support requires Worker, WebAssembly, canvas and Web Crypto; asset/network failure produces a retryable visible error.

Notices are in `docs/licenses/` and copied alongside deployed assets. Published npm wrapper metadata declares MIT, while the upstream trained-data repositories provide Apache 2.0 model licenses; both original model license texts and wrapper metadata are distributed.

## Verification

- `npm run typecheck`; `npm test`
- `node scripts/verify-private-ocr-runtime.mjs`: actual local Tesseract recognition of synthetic Chinese/English PNG and image-only PDF rendered with PDF.js; verifies the PDF has no text layer
- `NODE_PATH="$(npm root -g)" node scripts/private-ocr-e2e.cjs`: Chromium test of cold copied assets, real recognition, digital-text-layer fast path, explicit loading, size/page rejection, cancellation and navigation; blocks all non-origin requests. Needs Playwright and Chinese fonts
- `.github/workflows/private-ocr.yml`: real recognition/browser tests plus PostgreSQL 17 isolation/publication/search-invalidation regression. No real documents or deployment credentials
- SQL fixtures also run with PGlite locally, using the actual existing `sync_search_document` function; native PostgreSQL concurrency remains a CI check

Local execution evidence: TypeScript and full Vitest passed; real Node recognition and PGlite SQL regression passed. Local Chromium was blocked by the execution sandbox's socket restriction before any page ran, so browser assertions are CI gates rather than a claimed local pass.

## Architecture references and deliberate gaps

- [Tesseract.js local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md) and [worker API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md): pinned local workers/core/models, sequential reuse and termination
- [PDF.js examples](https://mozilla.github.io/pdf.js/examples/): text-layer access and canvas rasterization; downloaded originals remain unchanged
- [Supabase database functions](https://supabase.com/docs/guides/database/functions) and [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): authenticated identity, explicit function grants, owner isolation and atomic publication

The searchable derivative has source/engine/model lineage and replace-safe publication, but only the latest successful recognized text is retained. Historical OCR outputs are not separate immutable artifacts yet. Browser-local recognition cannot continue after navigation or power loss; retry restarts the full bounded document. Scanned PDFs over the limit need to be split before upload, and mixed pages with a substantial existing text layer are not fully re-OCRed. These are explicit boundaries of this implementation, not promises of a larger document-processing service.

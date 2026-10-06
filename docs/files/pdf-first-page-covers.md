# PDF first-page covers

Files grid cards render the complete first page in the existing square cover
area. Clicking the card still opens the paged PDF reader. The default compact
list does not automatically fetch PDF content.

## Resource and privacy boundaries

- Admit only visible grid cards, one PDF at a time. Remove queued cards that
  leave the viewport; cancel work when navigating, filtering, or unmounting.
- Perform an authenticated, no-store HEAD before loading the same-origin
  owner-only preview endpoint. No new endpoint, public URL, external reader,
  persistent cache, storage object, or database field is introduced.
- Automatically cover PDFs up to 12 MiB and 500 pages. Enforce the byte limit
  again from response headers and PDF.js progress, with a 20-second deadline.
  The deadline is best-effort: the installed in-process PDF.js worker can delay
  timers during synchronous parsing; byte, page, and pixel caps still apply.
- Render page one only, with at most 512 × 512 canvas pixels, preserving the
  entire page's aspect ratio. Disable annotation rendering and XFA. Retain only
  canvas pixels after rendering; destroy the PDF document before admitting the
  next cover. Clear pixels on unmount.
- Preserve the reader's 4-million-pixel embedded-image limit with
  `stopAtErrors: true`. High-resolution scans above that limit fall back rather
  than showing a falsely successful blank cover. Cover support is not universal
  for scanned PDFs; do not increase this bound without a separate memory review.
- Missing, encrypted, malformed, oversized, timed-out, or unrenderable files
  keep a clickable placeholder. Existing full preview/download behavior and
  the original-file upload limit remain unchanged.

## Verification

`tests/files-pdf-cover.test.ts` covers admission, offscreen cancellation,
authenticated preflight, actual render completion, teardown, limits, timeouts,
errors, navigation, and StrictMode. Existing photo and reader tests remain
regression coverage for the shared visibility helper and queue.

`scripts/files-browser-e2e.cjs` uses generated synthetic PDFs only. It asserts
actual painted cover pixels, the canvas budget, reader reopening, focus return,
no writes/original-download requests, and no horizontal overflow. It captures
`pdf-first-page-covers-{360,390,1440}.png` with the existing CI artifact flow.
These assertions must run in an approved browser/CI environment before visual
verification is reported as passed.

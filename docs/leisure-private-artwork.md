# Private promotional artwork in R2

This migration is limited to the 16 public promotional URLs frozen in `artwork-import-registry.ts`. Adding an item to the display collection does not authorize or enable another import. Artwork remains owned by its rights holders; retaining a source and using private storage does not establish copyright clearance.

## Run

1. Deploy the reviewed code only after publication is authorized
2. Sign in through the existing owner login and open `/leisure/artwork-storage`
3. Choose “复制并校验这 16 张图片”. Each asset is processed separately; the page reports verified originals and failures independently. A failure is not reported as migrated
4. Confirm all 16 successes, then inspect the authenticated `/api/leisure/artwork` mapping and actual image requests. Verify logout makes the private routes unavailable

No new credentials, bucket, public domain, database migration, or CORS changes are needed. Existing server-only R2 configuration is reused. Never paste keys/cookies into chat or expose deployment environment values.

## Integrity and scope

- Only exact registry URLs can be fetched, over HTTPS, with redirects rejected, a 15-second fetch timeout, and a 5 MiB streamed limit
- MIME, decoded dimensions, pixel count, and single-frame raster format must match. HTML, SVG, corrupt data, unexpected sizes and authentication/block pages are rejected, with no alternate-source bypass
- Originals are preserved unchanged. Two uncropped WebP variants (maximum widths 640 and 1280) reduce transfer costs
- Keys are owner-prefixed and SHA-256-addressed. Conditional create (`If-None-Match: *`) prevents overwrites
- Every object is read back and checked against its MIME, byte length and SHA-256 before activation. The immutable manifest records source URL, credit, original/variant dimensions, sizes, hashes and verification time
- Retry verifies existing objects instead of overwriting. Partial writes can leave private unreferenced objects; this workflow never deletes them or unrelated files
- The generic Files upload endpoint is intentionally not used because it also cleans stale pending documents

## Private delivery and fallback

All status and image requests authenticate the owner independently. Responses are private/no-store and vary by Cookie. Image bytes use a fixed raster MIME and `nosniff`; image keys and external fetch URLs cannot be chosen by the request.

The optional client helper discovers only verified manifest mappings. A custom Next Image loader must request the same-origin private route directly, using the two fixed width variants. Never wrap those routes or signed R2 URLs in the public Next image optimizer. Before discovery, and if private delivery fails, the existing official-image display remains available; if both fail, retain the current visual fallback.

Rollback: remove the private-source preference from the display component. Original source URLs/provenance remain intact, and private stored objects can remain unchanged. Do not enable public access to the bucket, which also holds other private documents.

## Verification record

Automated tests use synthetic images and mocked storage; they do not prove production uploads. Production success requires actual read-back verification for each asset and logged-in/logged-out route checks after deployment. No upload is performed during build or page rendering; only an explicit authenticated import action writes objects.

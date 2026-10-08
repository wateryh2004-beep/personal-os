# Bounded runtime dependency security patch

## Scope and provenance

This patch is based on `720cbdba33b6d55a5d848232faadf9c5963def9b`. It updates four existing dependency families, the matching Next ESLint package, and only their required companions. It does not change Next configuration, renderer settings, Files data models, RLS, migrations, credentials, storage permissions, production state, or the existing OCR/runtime pins.

All 26 vulnerable package entries in the original production audit were byte-for-byte identical as JSON objects in the lockfiles at main `247976e390bccd7b81bdcbe412843bc1f4bd7864`, PR 61 `038017352e28e18e0cbca081afade2ec3cef5407`, and the starting release commit. The photo-preview, DOCX-extraction, and travel-map source files also matched main. These are pre-existing findings, not dependencies introduced by the ten-item release.

| Existing package | Before | Reviewed patch | Existing license |
| --- | --- | --- | --- |
| next | 16.3.0 | 16.3.6 | MIT |
| eslint-config-next | 16.3.0 | 16.3.6 | MIT |
| sharp | 0.35.3 | 0.35.5 | Apache-2.0 |
| maplibre-gl | 6.3.0 | 6.4.1 | BSD-3-Clause |
| @xmldom/xmldom, through mammoth | 0.8.13 | 0.8.15 | MIT |

The scoped Mammoth override pins a version within its existing `^0.8.6` requirement. No Mammoth downgrade or extra direct runtime dependency is used. Next requires `@swc/helpers` 0.5.23 and matching 16.3.6 Next/SWC companions; Sharp requires its matching 0.35.5 platform binaries and libvips 1.3.4 companions. Exactly 42 existing lockfile package entries change, with no package added or removed. All 42 license identifiers remain unchanged. The published Next, Sharp, MapLibre and xmldom license files are byte-identical to the previous installed releases; eslint-config-next retains its MIT package declaration.

## Verified applicability

- **Sharp/libheif:** [official advisory](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c), affected `<0.35.4`, fixed `0.35.4`. Files accepts AVIF and calls Sharp after owner authentication, ownership checks, byte limits and signature checks. Malicious bytes in a document the owner imports remain a native-decoder risk; size/time limits do not repair memory corruption. Potential RCE is runtime-dependent, including glibc Linux and executable hardening.
- **Sharp/librsvg:** [official advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w), affected `<0.35.5`, fixed `0.35.5`. Photo previews reject SVG before decoding. Artwork import checks the detected format after Sharp metadata parsing, so a compromised approved source is not categorically excluded. The combined patch loads libheif **1.23.5** and librsvg **2.63.2** locally, replacing 1.23.1 and 2.62.90.
- **MapLibre attribution XSS:** [official advisory](https://github.com/maplibre/maplibre-gl-js/security/advisories/GHSA-jrc7-96c5-q579), affected `<=6.4.0`, fixed `6.4.1`. Travel loads a third-party OpenFreeMap style whose source attribution enters the affected sanitizer. Popup `setText()` is correct but protects a separate path. A synthetic source-attribution test using the actual 6.3.0 distribution leaves `ontoggle` intact; 6.4.1 removes it and preserves safe credit text/links. This is a demonstrated sanitization difference, not a claim that the provider is compromised.
- **xmldom parsing DoS:** [official CPU advisory](https://github.com/xmldom/xmldom/security/advisories/GHSA-8344-3jmq-59r6) and [memory advisory](https://github.com/advisories/GHSA-965w-775f-mr7g), affected 0.7.0–0.8.14, fixed 0.8.15. Files `mammoth.extractRawText()` parses uploaded DOCX XML in the Node process. Owner-only imports narrow access but do not make externally obtained documents trustworthy. Compressed input limits and final text truncation do not bound the vulnerable XML operation. The serialization-specific xmldom advisories have no demonstrated path in this raw-text extraction flow.
- **Next Windows RCE:** [official advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36), affected 16.0.0–16.3.2, fixed 16.3.3. Requires Windows filesystem hosting and Pages/App Router without Cache Components. Local checks run on Linux; production OS was not established.
- **Next AVIF optimizer RCE:** [official advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4), affected 16.x `<16.3.3`, fixed 16.3.3. The image optimizer is present; exact artwork URL allowlists restrict anonymous input. An anonymous attacker-controlled source was not demonstrated. The authenticated direct-Sharp AVIF path is independently reachable.
- **Next Node ImageResponse RCE:** [official advisory](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j), affected `>=16.2.0 <16.3.6`, fixed 16.3.6. Requires attacker-controlled SVG content, attributes or styles passed into Node `next/og`. No ImageResponse/next/og usage was found. Version 16.3.6 covers all three findings without the unrelated 16.4.0 update suggested by audit.

## Cache and renderer compatibility

The PDF worker passes Sharp a PNG generated by PDF.js/canvas, not original AVIF or SVG bytes. Its format restrictions, encoding parameters, process isolation and source/version CAS remain unchanged. The WebP codec remains 1.6.0.

Four existing synthetic render samples are byte-identical across the old and patched installations. Their SHA-256 hashes are recorded in the adjacent evidence JSON. This supports retaining `pdfjs-6.4.299-webp-v1`; no existing immutable cover, manifest or original is rewritten, deleted or invalidated by this dependency-only patch. This is representative byte-compatibility evidence, not proof for every possible PDF. A later rendering/encoding-policy change or a verified byte-compatibility regression must advance the renderer version.

## Verification performed

- Clean `npm ci --ignore-scripts --no-audit --no-fund` succeeds with the patched lockfile
- Full suite: **280 test files, 1,892 tests pass**
- `npm run typecheck` passes
- Changed TypeScript/JavaScript lint passes; `node --check scripts/map-attribution-security-e2e.cjs` passes
- `E2E_MOBILE_HARNESS=1 npm run build` succeeds on Next 16.3.6
- `node scripts/verify-pdf-cover-package.mjs` passes all three route traces: **361 runtime files / 131,984,695 bytes** per cold copy, successful genuine CJK PDF rendering at 584/578/604 ms in this run
- Genuine JPEG/PNG/WebP/AVIF/GIF thumbnail transforms, authorization/ownership rejection, limits, metadata stripping, cancellation, actual PDF native rendering and mocked-private-artwork read-back regressions pass
- Added actual bilingual DOCX zip extraction with a bounded 8,000-attribute XML element, retaining text and paragraph structure through Mammoth/xmldom
- Added installed-package/license/native-library guards and actual distributed MapLibre attribution-control tests
- Existing Files/PDF/Leisure/navigation browser CI remains; a new isolated Chromium check covers real-map third-party attribution, safe credit preservation and text popups at 390/1440 px, with screenshot/evidence artifacts

**Not locally passed:** Chromium cannot start in this executor: its process-singleton socket fails with `Operation not permitted`. No sandbox bypass was attempted. Real-browser gates and screenshot inspection must pass on the final published commit in CI before release. No production or authenticated live-user smoke is claimed.

**Repository-wide lint:** the full lint command remains a separate failing baseline check. Its diagnostic comparison against the starting checkout is recorded in the evidence JSON; this patch does not broaden scope into unrelated Career/assistant/PWA edits or disable lint rules.

## Audit comparison and intentionally unchanged findings

The production-only audit changes from **26 packages / 55 unique advisories** (3 critical, 15 high, 7 moderate, 1 low packages) to **22 packages / 39 unique advisories** (1 critical, 13 high, 7 moderate, 1 low). The four targeted package entries disappear. This is not a zero-vulnerability claim.

- Fifteen remaining package groups enter production through the unimported **shadcn CLI**: shadcn, MCP SDK, Hono, proxy-addr, qs, ip-address, fast-uri, js-yaml, postcss-selector-parser, brace-expansion, braces, micromatch, fast-glob, ts-morph and @ts-morph/common. No app/runtime shadcn import was found. Moving it to devDependencies and CLI upkeep are separate work, deliberately omitted here.
- The remaining critical [proxy-addr issue](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) additionally needs a misconfigured IPv4-mapped IPv6 trust subnet in an Express application. The CLI dependency alone does not demonstrate a PersonalOS authentication bypass.
- **Mammoth/argparse/sprintf-js:** the moderate meta-finding follows Mammoth's CLI, while the application uses the library's raw-text extraction. [sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) has no published patched version; do not downgrade Mammoth to audit's suggested 0.3.29.
- **Undici 7.29.0:** also belongs to AI SDK provider-utils, so it is not wholly CLI-only. The reviewed advisories require WebSocket, BalancedPool-specific TLS callbacks, or retry/cache/decompress/dump interceptors not found in the app; provider-utils' inspected downloader uses ordinary Agent/fetch. Current exploitability is unconfirmed. The [compatible 7.29.1 security patch](https://github.com/nodejs/undici/releases/tag/v7.29.1) is deferred, not silently installed.
- **DOMPurify 3.4.13:** jsPDF transitive dependency. Reviewed [IN_PLACE advisories](https://github.com/advisories/GHSA-p98j-92pf-mc4p) have no matching app usage; Notes exports a canvas image into PDF. Compatible floor 3.4.16 is deferred.
- **nanoid 3.3.17 / source-map-js 1.2.1:** PostCSS dependencies. No user-controlled zero-length custom generator or indexed source-map processing was found. Compatible patch floors are [3.3.18](https://github.com/advisories/GHSA-2v37-7h3g-55p8) and [1.2.2](https://github.com/advisories/GHSA-68fv-2mgg-jv7q); both remain unchanged.

No blanket audit fix, downgraded CLI, unrelated transitive refresh, package publishing, production migration, deployment or external permission change is included.

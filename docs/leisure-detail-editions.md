# Leisure detail editions · October 5 refinement

## Scope

The liked homepage composition remains intact. This iteration concentrates on the experience after opening a title, and adds 12 verified artwork identities for the independently prepared content expansion. It does not seed content, update a user's notes/feedback, or change database/authentication schemas.

- Details are small editorial spreads: intact artwork on a framed surface, a strong title and invitation, one verified official action, then known practical facts.
- Film/series use a screening-room imprint, games a subtle printed grid, and music a square sleeve with a CSS-only record silhouette. Each edition has a restrained, consistent accent rather than arbitrary per-title colors.
- A chapter index links to existing introduction/start/reflection sections. Missing fields do not create placeholders or made-up facts. Source dates, original ratings, credits and edition caveats remain in the source disclosure.
- Previous/next browsing uses only real records in the current filtered collection. A single alternative is shown once; missing current records or singleton collections do not fabricate neighbors.
- Home filter state lives in bounded URL parameters, so detail return links and browser history restore the collection context. `from` is never treated as a return URL; repeated/unknown/oversized values are normalized or dropped.
- Explicit detail navigation protects unsaved reflection drafts and blocks navigation during a save. Full page unload also warns. Browser-history/sidebar SPA navigation is inherited behavior and is not claimed to have new draft protection.
- Existing feedback revision conflicts, serialized writes and independent unsaved reflection/status behavior remain unchanged.

## Accessibility and motion

All navigation uses native links, controls remain keyboard/touch reachable, and decorative graphics are hidden from assistive technology. Mobile actions have 44px minimum targets. No audio, autoplay, animation timer, scroll interception, or motion library is introduced. Existing reduced-motion rules disable transitions; the few arrow transforms also have explicit reduced-motion overrides.

## Artwork

The 12 additional exact title/kind matches and original asset URLs are listed in `leisure-artwork-expansion-provenance.json`. Their dimensions and JPEG payloads were verified and images visually inspected during source research. Next Image allows exactly the supplied host/path/query combinations, with no wildcard host or arbitrary URL support. Album sleeves remain square; source images are not cropped in detail.

The original 16 and new 12 retain separate hosting authorization scopes. Private R2 migration, if integrated, is a separate owner-only operation and must not silently include new artwork.

## Verification status

Local verification before private-hosting integration:

- Full TypeScript check and standard Turbopack production build passed
- 185 test files / 1,027 tests passed
- Focused ESLint and `git diff --check` passed
- Repository-wide lint remains the existing 147 errors / 5 warnings; this is not a full lint pass
- Independent code review completed; its repeated-query-parameter crash finding was fixed and regression tested

Rendered signoff remains pending an authorized CI/browser run. Local browser/socket restrictions were not bypassed. `scripts/leisure-e2e.cjs` covers 360, 390, 768 and 1440px in the real AppShell: 28 decoded artworks, filtering and history, portrait/landscape/square/music details, keyboard adjacent navigation, note-save/draft/conflict flows, reduced motion and broken-image fallback. Screenshots must be inspected independently before calling the design visually verified.

## Combined private-hosting verification

The fixed-original-16 R2 feature is integrated through its verified mapping helper. The image component uses a same-origin custom loader for private variants only; failures step down to the original official URL and then the designed text fallback, remembering both failures to prevent retry loops. New artwork remains outside the migration registry.

Combined local checks passed: 190 test files / 1,055 tests, TypeScript, focused ESLint and the standard Turbopack build. A second independent review found no blocker in the merged private-source integration. Production upload/readback and browser screenshots remain separate pending checks, not covered by those local results.

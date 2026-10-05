# Leisure: a gallery for the good hours

## Local visual exception

The October 5 redesign explicitly gives leisure a more expressive direction than the ordinary work modules in `design-system.md`: official film/series/game artwork, warm paper, editorial serif headings, an immersive featured composition, an always-visible collection, and responsive micro-interactions. This exception is scoped to leisure’s CSS module; it does not change shared color tokens, other pages, personal content or feedback storage.

- A manually advanced feature rotates only among currently eligible experiences. No autoplay, timer, audio, recommendation write or inferred preference persistence.
- All loaded experiences appear in the collection immediately, with type buttons and optional local context controls. A CSS-column gallery preserves each supplied artwork’s actual proportions.
- A tilted poster hover, arrow movement, bounded feature transition and filter reveal add tactile feedback. Keyboard and touch have the same navigation/selection functions; `prefers-reduced-motion` disables animation and hover transforms.
- Smartphone/tablet feature artwork is intact above its text. Large desktop artwork can act as a cinematic backdrop. Detail images retain their source proportions; landscape art uses the full width.
- Personal status and reaction remain distinct visible text. No completed/disliked item is offered as the featured suggestion. Disliked items remain discoverable in the complete collection.
- Practical details, official entry and reflection remain easy to reach. Source/date/rating audit detail is available through a disclosure instead of dominating the first screen.
- The app shell removes duplicate padding for leisure only. The QA fixture uses that real shell, including its sidebar/mobile bar.

## Artwork and rights

`src/features/leisure/artwork.ts` is a curated, owner-independent title/kind lookup. It contains only public title metadata and verified official promotional URLs. It does not accept arbitrary URLs from database content, load Markdown images, contain a private owner ID, or encode anyone’s personal feedback. A known display-only continuation suffix is removed for identity matching.

`docs/leisure-artwork-provenance.json` records the original public pages, exact asset URLs, dimensions, content type, verification time, credit and edition caveats for 16 works. Nintendo Switch 2 editions were checked individually. Some assets are promotional stills, not posters; a still does not identify a viewing start or progress.

Copyright remains with the respective rights holders. Source verification is not an open-license or blanket reproduction/hotlink clearance. The implementation uses remote promotional URLs for informational identification, preserves source attribution on details, and does not commit the copyrighted image binaries as code-licensed assets. Public/commercial redistribution needs separate rights review.

Next Image serves responsive optimized sizes with an exact-URL allowlist (including path/query), eager loading only for the feature/detail, and lazy gallery loading. This isolates the user’s browser from direct third-party image requests. Failed/unknown images retain a designed textual fallback and never remove a title or link.

## Verification

Local checks for the revised implementation:

- TypeScript and focused ESLint passed
- 183 test files / 1,019 tests passed, including five new gallery/matching/failure tests
- Existing feedback concurrency, dirty reflection and source-link safety tests remain passing
- `E2E_MOBILE_HARNESS=1 npm run build`: standard Turbopack production build passed
- `git diff --check`: passed
- Repository-wide lint was rerun: 147 errors / 5 warnings remain in the existing baseline; focused success is not a repository-wide lint pass

Browser verification is prepared in `scripts/leisure-e2e.cjs` but not yet executed for this patch. It must run in the authorized CI/browser environment before visual signoff. The real-app-shell fixtures cover 360, 390, 768 and 1440 px; all 16 official images must decode; category switching, keyboard shuffle, no overflow, Back/Forward, reduced motion and forced broken-image fallback are checked. Existing synthetic feedback/error/conflict/long-content checks remain.

No production database, authentication, RLS, feedback action or migration changed. No branch push, PR, merge or deployment is part of these local verification claims.

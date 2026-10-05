# 闲暇 implementation and verification

## Delivered

- One navigation entry, `/leisure`, in the existing life/Personal area; also reachable through mobile More and command navigation
- Editorial homepage with one featured experience and up to three alternatives, then the user's known interests/current plans and saved reactions
- A single useful empty state, an honest unavailable state, and no generated favorites, completed experiences or seed recommendations
- Optional native controls for time, setting, company and budget; these affect only the current browser view and are not written as inferred preferences
- `/leisure/[id]` with sanitized Markdown, optional practical metadata, original platform ratings/check dates, and verified source links
- Source links are inactive when unverified, explicitly stale, future-dated or more than 90 days past checking. This is a freshness heuristic, not a guarantee of live availability. Unknown Markdown links and remote images are not loaded
- Session-authenticated feedback Server Action, protected personal reactions/reflections, independent editorial revisions, immutable content history and atomic audit writes
- Existing Travel, Shopping and Notes links are reused; no new scheduling, checkout, content scraping or OAuth scopes

Home queries are bounded to the 100 most recently updated active records and explicitly disclose truncation. Home shelves derive from this bounded set, not the full historical collection. Detail URLs continue to read an older owned record. The home query omits Markdown bodies and source/rating payloads; full personal-note text remains in the shared feedback model although the shelf renders a short preview.

## Data and authorization gate

The prepared migration is `20261004193516_leisure_experiences_and_protected_feedback.sql`. It has **not** been applied to Supabase. Before application, the real routes show a data-unavailable state. After application, a zero-record database shows the honest empty design.

The content-write contract exists at the database/schema boundary, but there is no external leisure HTTP tool or expanded OAuth permission in this change. A future gateway integration must expose only editorial content writes and must not grant personal-feedback capability to an AI editor. See `leisure-persistence.md` for the transaction/security contract and deployment rehearsal.

There is intentionally no administrative content-entry form. No real recommendation has been imported. No production data was read or written as part of these checks.

## Local verification — 2026-10-04

Passed on the final implementation:

- `npm run typecheck`
- `npm test`: **182 files, 1,007 tests passed**
- Targeted ESLint across all new leisure code/tests and changed navigation/harness files
- `git diff --check`
- `E2E_MOBILE_HARNESS=1 npm run build`: standard Turbopack production build, including `/leisure` and `/leisure/[id]`
- An earlier `E2E_MOBILE_HARNESS=1 npm run build -- --webpack` also passed
- Isolated PostgreSQL-engine migration/security smoke test: ownership/RLS, denied raw writes, independent revisions, immutable history, archived-reference preservation, conflict handling and atomic rollback on audit failure
- `npm run audit:ui`: warning-only audit exits successfully. The five new raw-control notices are intentional semantic native selects/textarea: they provide labelled keyboard/mobile controls without a custom dropdown stack

Repository-wide `npm run lint` remains red with **147 errors and 5 warnings in unchanged existing files**. No leisure/changed-file lint error remains. This is not reported as a full lint pass.

## Independent review

A separate read-only reviewer inspected owner-data protection, feedback concurrency, links and UI behavior. Two findings were fixed and regression-tested:

1. Status/reaction saves no longer remount the feedback editor by revision, so a locally unsaved reflection survives server refresh
2. An archived linked Note keeps its saved ID during unrelated feedback edits; only the unavailable link is suppressed

The reviewer reported no remaining owner-data/feedback security blocker in the inspected paths. React/jsdom checks verify these interactions without a browser socket.

## Browser gate — pending

No real-browser screenshots or rendered pixel review were produced locally because preview/socket use is blocked in this environment. The restriction was not bypassed. A synthetic, opt-in fixture is prepared under `/mobile-native-e2e?scene=leisure`; no fixture appears in a normal production route.

`scripts/leisure-e2e.cjs` is added to the existing Verify workflow. Once publication/CI execution is authorized it covers 360, 390, 768 and 1440 widths, keyboard context expansion, filter reset, detail navigation, Back/Forward, repeated feedback, personal reflection, stale/unverified source links, empty/error/conflict/long-content states and overflow. Screenshots will be written to the existing CI artifact folder.

The fixture tests UI behavior, not a live authenticated Supabase write. A staging migration rehearsal and signed-in refresh/persistence test remain separate pre-release checks.

## Integration notes

This work starts from local `efa7205`, whose tree represents deployed Notes-search commit `8131244`. It does not include PR 57's Career/OAuth work. Shared integration edits are additive only:

- `src/lib/navigation-registry.ts`: Compass import and one `/leisure` item
- `tests/navigation-registry.test.ts`: expected route, More and descendant assertions
- `src/app/mobile-native-e2e/page.tsx`: LeisureFixture import, optional item query parameter and one scene branch
- `.github/workflows/verify.yml`: one leisure E2E command

Preserve the concurrent OAuth fixture imports/branches/commands when integrating. No auth or existing entity/Notes file is modified.

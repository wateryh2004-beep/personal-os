# Ten-item optimization program

User-approved scope, 2026-10-07. Release main only after all ten acceptance gates pass. No production changes have been made by this program. Integration base: main `247976e390bccd7b81bdcbe412843bc1f4bd7864` plus the two tested commits in draft PR 61, ending `038017352e28e18e0cbca081afade2ec3cef5407`.

## Acceptance and current status

1. **Startup and navigation — pending.** Record reproducible cold/warm browser readiness, route transitions, transferred JS and request ordering; remove a measured bottleneck and demonstrate no correctness regression. Report cloud/throttled measurements as such, never as China-user or confirmed platform-cold measurements.
2. **Cached PDF covers — implementation verified, integration pending.** Reuse PR 61. No PDF bytes/parser on card display, authenticated cache revalidation, bounded renderer, quiet fallbacks, original reader works. Preserve its real renderer, cold-package, SQL and responsive-browser regression coverage. Production flag is disabled pending release review.
3. **Interview learning value — separate content owner, pending.** Fresh inventory and protected-answer checks; bounded quality rubric and useful answer/explanation structure; no invented personal facts or concurrent content writes. Content-owner evidence is required before this gate closes.
4. **Complete recoverable backup — in progress.** Owner-scoped portable business rows, notes, versions and relationships; explicit inventory/exclusions, integrity validation and isolated round-trip restore. Original files covered through verified portable file packages. No new external backup destination or production restore.
5. **Global search coverage — implementation/local checks passed; integration pending.** Leisure, Briefing and Investment included with accurate deep links, owner isolation, archive rules, stable ordering and empty/error behavior; old domains remain covered.
6. **Scanned PDF/image OCR — in progress.** Mature local engine, no third-party document transfer; explicit opt-in, bounded background work, searchable output, cancellation/error states and Chinese/English synthetic scans. Text-native extraction must remain fast and correct.
7. **PDF reading continuity — in progress.** Owner-scoped durable page/source state, cross-session/device restoration and discreet continue action; stale source, page limits, repeated tabs, debounce and failed writes tested.
8. **Resumable uploads — in progress after reading continuity.** Existing private storage multipart workflow with persistent session/part validation and retry; interrupted/reopened upload resumes verified parts, bounded memory/concurrency, explicit cancel and safe completion; original integrity checks preserved.
9. **Investment daily overview — in progress.** Cash/dividend ledger, manual/imported dated quotes, valuations and unrealized P&L; no invented price or holding, explicit missing/stale states, currency correctness and strict real/paper isolation. Synthetic accounting and owner-isolation tests.
10. **Understandable storage — implementation/local checks passed; integration pending.** Distinguish current object stock, Standard 10 GB-month allowance, unknown account billing and persisted personal capacity budget; no guessed remaining free balance. Responsive clear UI with refresh/account isolation tests.

## Sequence and dependencies

Foundation: 1, 4, 10. Document flow: 2, 7, 8, 6. Coverage: 5 and 9. Item 3 is independently coordinated, with no parallel production answer writes. All changes join one integration branch for aggregate verification. New schema must also be included in backup inventory.

## Release gates

- Each item's focused checks and acceptance evidence recorded, including unrun/blocked checks
- Integrated TypeScript, full unit suite, production build, changed-file lint, SQL and mobile/desktop interrupted/repeated-flow tests pass
- Existing full-lint baseline is recorded rather than falsely called green
- Synthetic/public fixtures only; no secrets or personal documents in repository/artifacts
- Review exact production migration/security changes before execution; no new credentials, backup destinations or cleanup without separate approval
- No paid OCR or market feed without approval; missing billing/quotes remain unknown
- Verify remote final commit and exact-commit CI before main; no early individual merge

## Checkpoint

2026-10-07: Fresh remote main verified. Isolated integration checkout created from exact PR 61 head. Backup and investment work assigned independently. No production DB/R2/configuration changes, no main update.

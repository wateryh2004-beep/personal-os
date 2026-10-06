# Settings workspace redesign

## Composition

Four hash-addressable sections keep the main page quiet: storage, connections, AI/privacy, and general. All panels stay mounted so changing sections does not discard drafts or the current read-only snapshot. Hash changes support browser Back/Forward; no database setting is changed by navigation.

Storage leads with actual bucket bytes and object count. The database's active/archived byte distribution is a separate logical chart; pending upload declarations do not participate in that chart. Connection checks and operational caveats are progressive details rather than the main visual hierarchy.

## Capacity semantics

- No default capacity is invented. Account free allowance remaining is unknown because the existing service reads a single bucket snapshot, not account-wide monthly billing usage.
- A manually entered personal budget in GiB enables a meter only when the bucket enumeration completed. Partial and unavailable enumerations never produce remaining capacity.
- The personal budget is transient component state, reset when the page is left or refreshed. It changes no Cloudflare limit, database record, billing plan, or existing user setting.
- Provider free allowance and personal budget are not interchangeable. Cloudflare documents Standard's free storage allowance as 10 GB-month per month, calculated from daily peak storage over a billing period; Infrequent Access is excluded. Source verified 2026-10-06: https://developers.cloudflare.com/r2/pricing/
- Bucket snapshots exclude unfinished multipart uploads and may change during enumeration. A difference between database record count and bucket object count does not prove orphaned objects.
- HeadBucket success does not test object read/write, CORS or every file's integrity. Failed refreshes preserve a visibly historical snapshot and remove the green latest-check styling.

## Verification

Run npm run typecheck, npm test and focused ESLint. Repository-wide lint currently has unrelated pre-existing failures. scripts/settings-preview.mjs serves the actual Settings page using synthetic query/action modules only; scripts/settings-workspace-e2e.cjs checks 360/390/1440px, navigation history, retained unsaved forms, empty/partial/unavailable/auth-error states, no auto-scan, and overflow. Its focused six screenshots and JSON report are uploaded by Verify CI. The existing R2 endpoint fixture remains in place.

The local executor cannot launch Chromium because socket creation is denied. Browser pixel review must use the CI artifact after approved publication; passing unit tests is not visual sign-off.

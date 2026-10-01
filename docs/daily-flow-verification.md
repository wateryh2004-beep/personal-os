# Daily flow usability changes

## Scope

- Explicit, cross-device Today priorities reference up to three Microsoft To Do tasks, including undated tasks. Date-driven reminders remain separate. Selecting a priority never changes a task deadline or creates a duplicate task.
- Today task, calendar, and roadmap links open exact records. Task and Calendar state reconcile refreshes and interrupted writes; repeated writes, stale lookups, and unrelated rollback are guarded.
- Notes references preserve entity identity, show source context, and can be copied/reused. Save/read errors offer recovery without discarding input. Notes is first in the simplified mobile More menu; Career remains a primary tab.
- Practice records expose existing duration, bottleneck, and next-focus fields, show saved receipts and persisted review timing, and distinguish partial schedule failure. No interview content is rewritten.

## Database rollout

`20261001080655_today_task_priorities.sql` is additive. It adds a narrowly scoped table plus an atomic SECURITY INVOKER RPC, preserves source tasks, archives removed selections, restricts both record and referenced-task ownership, and limits active positions to three. A compare-and-swap guard rejects a stale second device. Dates come from the authenticated owner's profile timezone.

Apply the reviewed migration before releasing the UI. If the migration is missing or a read fails, Today shows an unavailable-priorities message and still renders its existing workspaces. Reverting application code leaves the new table harmlessly in place; no destructive rollback is required.

Validation: applied only to the isolated validation project before review. `supabase/tests/today_task_priorities.sql` exercises owner isolation, direct-RLS foreign references, anonymous denial, cap/duplicates, undated tasks, stale dates/windows, reorder/archive, and unchanged task state in a transaction that rolls back every fixture. Do not run its fixture setup against production.

## Verification and limits

Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run lint`. Existing main has 165 lint errors and four warnings; this change reduces it to 161 errors and four warnings with no new findings. Changed TypeScript files pass lint.

The GitHub verification workflow runs the existing 360/390/412/430px browser suite, extended with priority selection/cap/cancel, canonical links, and practice form controls. It uploads synthetic-data screenshots for visual review. The harness remains available only with `E2E_MOBILE_HARNESS=1` and makes no provider writes during the test.

Local TypeScript, unit/rendered interaction tests, build, and SQL checks pass. Local full-browser execution is blocked by the execution environment's socket/network-interface restrictions, so browser and CI status must be checked on the exact published commit before merge. Authenticated production and provider-write behavior need a separate post-deployment check; fixture/browser tests are not claims of a live provider mutation.

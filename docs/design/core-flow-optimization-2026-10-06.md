# Core flow optimization · 2026-10-06

## Verified problems and bounded changes

- Notes: an empty parent with populated child folders presented only an empty-note call to action. The main pane now has navigable child folders, a parent path, and explicitly direct-level note counts. It does not infer recursive totals from paginated metadata. Search remains a note-results view; clearing it returns folder navigation. Existing sidebar, folder selection and per-URL scroll restoration remain in place. No content is reorganized.
- Tasks: full creation and inline creation used different list defaults and different completion behavior. The full form uses the selected list, guards duplicate submission, retains uncertain/error drafts, distinguishes a confirmed write from a failed follow-up read, and reveals the actual server-returned task. Task deadlines use local wall-clock conversion instead of displaying a UTC substring as local time; DST gaps/overlaps are rejected visibly. Existing stored deadlines are not migrated.
- Projects: creation lacked a pending/error/success lifecycle. Creation now retains failed input, blocks repeated/in-flight dismissal, provides Cancel, and closes/resets after acknowledgment. The one-shot URL intent is consumed rather than replaying after a reload.
- Calendar: cancelling an all-day draft left its state in the next edit session. Each edit/cancel boundary now starts fresh from the current event and resets action receipts.
- Investment: phones show full holding cards rather than requiring horizontal table scanning. Exact values, unknown basis, realized P&L, account currency and closed-position status remain visible. Shared research/strategy scope and absent valuation are explicit; no calculation, storage or transaction logic changes.

## Verification scope

Synthetic React interaction tests cover cancellation, errors, repeated submissions, one-shot URL intents, real-row reread/reveal, folder search/navigation/scroll retention and timezone conversion. Shared Dialog tests cover controlled/uncontrolled repeated mobile Back veto.

`scripts/core-flows-e2e.cjs` runs gated synthetic scenes at 360/390/1440px, blocks writes and external requests, checks Back/Forward and cancellation, and captures focused images below 32 MiB. Investment uses its existing isolated browser fixture. No production tasks, projects, events, holdings or notes are created for QA.

Actual read-only production pixels were reviewed for the baseline Tasks, Notes and Projects pages. Local browser execution is unavailable in this environment; revised pixel evidence comes from the CI artifacts, not source inspection or jsdom. Consult the exact commit's workflow and artifact evidence for final run results.

Full-repository lint has pre-existing findings. Baseline and candidate must be compared by normalized path/rule/message, not merely matching totals. Only new findings belong to this change.

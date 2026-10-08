# AI-first workspace simplification

This successor is based on PR #62 (`31434e1`). It is review/test work only. It does not apply migrations, merge the release branch or authorize production deployment.

## Reading and decision surfaces

- Projects is an auxiliary Tasks view at `/tasks/projects`; `/projects?create=1` remains compatible. Project records and create behavior are preserved.
- Career Capital becomes a separately streamed count-only home summary, with a stable `#capital` target. Missing reads remain unknown rather than zero. The old Capital URL redirects there.
- Career Materials is consolidated into Files. `/career/materials` redirects to a thin `/files/materials` provider-specific evidence metadata view because Files currently opens only available R2 originals. This retains visibility of private Supabase Storage evidence (including current Experience uploads) without migrating objects or inventing download support.
- Skills, certifications and career profile show saved information before collapsed correction forms. Fact/bullet separation and all existing write authorization remain unchanged.
- Reviews leaves primary navigation. History and explicit decision confirmations remain, with optional generation below. Today’s background disclosure and command search retain access. The weekly suggestion is phrased as optional, not a completion requirement.
- Inbox shows pending proposals and failed/unclassified items. Processed history no longer consumes the pending query limit; the oldest 100 pending records are shown with an honest count notice. A ready status without a proposal remains visible. Manual conversion and capture remain discoverable disclosures, with original confirmation semantics.
- Interview learning/practice/insights stay primary. Question and session administration are secondary.
- PR #62 cash/dividend/quote inputs move under “高级更正”. Valuation, timestamps, missing/stale status, idempotency, confirmations and mode isolation remain. This change adds neither automatic financial writes nor live quotes.

Shopping, Travel and the core Tasks/Calendar/Files/Notes/Briefing/Leisure workflows remain available. No records, reminders or decision confirmations are deleted.

## Verification

The synthetic `ai-first-browser` fixture imports the actual reader/disclosure components with read/write boundaries mocked. It cannot access authentication, databases or external services. Its CI browser test checks 360, 390 and 1440 px, collapsed inputs, retained confirmations, correction reopening and no horizontal overflow. Existing Project/Task navigation and investment retry/pending/focus browser checks remain part of Verify. CI workflows accept the stacked PR target branch to test only this successor diff. Production remains gated separately.

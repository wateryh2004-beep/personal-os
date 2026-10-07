# Investment daily overview

## Scope and data honesty

The holdings page now includes each account's book cash, recorded quote valuation, unrealized P&L and cumulative net cash dividends. Real and paper accounts remain isolated, including quote histories for the same symbol. All amounts stay in the account's original currency; there is no cross-currency total, FX assumption, live-price claim, investment advice, brokerage order or new provider/credential.

The two new dedicated tables are `investment_cash_ledger` and `investment_quotes`. They contain no seed data. Existing trades, weighted-average cost, realized P&L, opening holdings, void corrections, strategies and research retain their original accounting and history.

- Cash events: opening balance, deposits, withdrawals, dividends, standalone fees and immutable void corrections
- Opening cash is the balance at the beginning of the earliest recorded cash/trade day, before that day's movements. It may explicitly be zero. Until supplied, cash and combined book assets remain unknown
- Buys subtract price × quantity plus transaction fees; sells add proceeds less fees. Opening holdings do not subtract cash a second time. Standalone fees must not duplicate fees already recorded on trades
- Dividends add gross amount less withholding tax and dividend fees. They are displayed separately and do not reduce holding cost or get folded into realized trading P&L
- Negative book cash is shown with a reconciliation warning, never interpreted as broker buying power. Backdating an existing trade before the cash anchor makes cash unknown until the opening is corrected; existing trade rules are not changed
- Quotes are manually entered or imported as a version-1 JSON batch of at most 100. Price strings, currency, source and an explicit timezone-bearing as-of are required. The manual form labels its date/time input UTC. No request fetches a quoted source URL
- Latest as-of wins per account/symbol, with account sequence breaking same-time corrections. Old snapshots remain readable. A zero quote must be explicitly supplied and confirmed; missing prices stay missing
- Quotes older than 72 hours are visibly marked stale. This is an elapsed-time disclosure, not an exchange trading calendar. Staleness rechecks once a minute without fetching prices. Each quoted position shows its source and UTC as-of
- Missing any open-position price makes account valuation and combined assets unknown. Unknown basis makes unrealized P&L unknown, even with a known price. A closed position has known zero current exposure without requiring a price
- Totals are based only on the recorded books and as-of prices. They are not time-weighted returns, realized total wealth, reconciled broker statements or live balances. Splits, reinvestments, FX and derivatives remain unsupported

All decimal inputs remain strings with up to eight decimal places. Calculations use fixed-point BigInt and round half up to eight decimal places, matching trade accounting. Computed totals can exceed the input digit range without floating-point loss.

## Authentication, immutable writes and reads

Server actions resolve the owner from the session, ignore browser owner fields, require user confirmation and validate Zod inputs. RPCs run as security invoker. Both tables have owner RLS, composite account/owner foreign keys, insert/select-only authenticated grants and no anonymous access. Trigger helpers have no client EXECUTE. Every insert is audited transactionally, including direct authenticated inserts.

The account row lock serializes trades, cash and quotes on a shared monotonic revision. Direct insert triggers enforce owner/account availability, original currency, nonfuture dates, one active cash opening, valid dividend deductions and valid same-account void targets. UUID import keys make exact retries idempotent and reject changed content. Quote imports are one atomic transaction; a failed row rolls back all rows, audit events and revisions in that batch.

The read path checks exact row counts and caps each append-only book at 5,000 rows. Shared sequence coverage is checked against account revision across all three books; a torn concurrent read is refused instead of calculating a partial daily overview. A missing migration, error, truncated read or invalid snapshot disables the new daily controls while preserving existing holdings/history behavior. A reload can resolve a transient read inconsistency. No web request creates storage or runs migrations.

## Search deep links

- Account: `/investments?tab=holdings&mode=real|paper&item=<account UUID>`
- Strategy: `/investments?tab=strategies&item=<version UUID>`
- Research: `/investments?tab=research&item=<run UUID>`

The item must be a valid UUID. Only the owner-scoped current-mode account is highlighted. Owned unarchived strategy/research links can be retrieved beyond the recent 100-record window; records are revealed and focused, never modified. Invalid, inaccessible or archived items are not loaded as a fallback. The data-backed page includes the existing privacy-safe workspace readiness metric.

## Reviewable migration and release gates

`20261007093144_investment_daily_overview.sql` was generated by the Supabase CLI and contains only additive schema/functions/policies for review. It has **not** been applied to production. Review, required database authorization, isolated CI and the complete ten-item integration gates remain prerequisites to deployment. There are no package or credential additions to the app.

Local checks:
- Focused investment unit/schema/action/DOM tests cover financial arithmetic, sells/fees/dividends, zero versus unknown, missing/stale quotes, currencies/modes, retry/confirmation and interrupted mobile forms
- Existing and new SQL migrations plus both regression scripts execute against disposable PGlite 0.5.8 PostgreSQL, with synthetic owner A/B and anonymous roles. This verifies RLS, direct writes, RPCs, immutable grants, currency/date checks, batch rollback, corrections and audits; it is not a substitute for multi-session PostgreSQL CI
- Typecheck and focused ESLint must pass before commit
- The existing `investment-sql` CI job runs PostgreSQL 16 and 17, now including daily regression and a separate observed cash/quote lock-contention test
- `scripts/investment-daily-e2e.cjs` adds isolated 360/390/1440 px quote/cash/import/error/mode/deep-link checks. All writes are mocked; all external and API requests are blocked. Local Chromium launch is blocked by the executor's socket restriction, so screenshots and this browser gate require CI or an approved supported browser environment. No visual pass is claimed from DOM tests

Rollback is non-destructive: a failed migration transaction rolls back automatically. After a successful migration, retain the new append-only books and revert the app release if necessary; do not delete financial history. Backup exports must include both new tables, their sequence/idempotency keys, original timestamps and cash void references.

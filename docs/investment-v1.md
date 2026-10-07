# Investment journal V1

## Product boundary

The investment module connects a private holdings journal, immutable strategy versions, and attributed research. `/investments` is discoverable in desktop navigation, the mobile More menu, and the command palette. `/investing` redirects to it. View state is in `tab` and `mode` query parameters, making Back/Forward and deep links predictable.

Real and paper accounts are separate. Strategies and research are a shared hypothesis library; saving one never creates a trade. There are no brokerage connections, orders, autonomous execution, price-provider calls, or additional AI-provider transmissions. Persistent Codex OAuth is not assumed live. This phase accepts a user-reviewed JSON research import through the authenticated web app.

## Data and calculation

Four dedicated owner-scoped tables are proposed: investment_accounts, investment_ledger, investment_strategy_versions and investment_research_runs. No generic items/EAV table. SQL numeric inputs travel as decimal strings, with up to eight decimal places; portfolio calculation uses scaled BigInt. Remaining basis uses weighted average cost, buy fees are capitalized, sell fees reduce proceeds, and allocations round half up to eight decimal places. A full sale removes all remaining basis to avoid rounding residue.

Supported financial ledger events are opening holdings, buys and sells in an account's currency. An opening snapshot must be the symbol's first event. Unknown opening cost remains unknown through subsequent additions and partial disposals. Fully closing a position clears its remaining basis; unknowable historical realized P&L stays unknown. Corrections append a void event with the original entry ID and a mandatory reason. Original records remain readable and immutable. Already-voided entries and correction events cannot be voided again. Removing an entry replays the remaining history and is rejected if any later sale would be unsupported; then the original remains effective. A corrected replacement may be added after a successful void. This is a journal correction, never cancellation of an actual market transaction. Cash consistency is outside this phase because cash is not modeled. Entries are replayed by occurrence date and account sequence. Backdated entries are rejected when any point would be short. Actual future-dated trades are rejected.

This version does not calculate cash, mark-to-market valuation, unrealized P&L, total portfolio return, taxes, dividends, splits, FX, derivatives or short positions. The UI states these boundaries. Users with unsupported events should not interpret this journal as a reconciled broker statement. No zero-valued or fabricated prices are used. No personal wealth is seeded.

The owner account ID is resolved from the server session. Browser user_id fields are ignored. SQL compound ownership foreign keys prevent linking a user's ledger/research to another user's account/strategy. Appended records have no update/delete grants. A per-account lock plus expected revision protects simultaneous ledger writes; a database trigger enforces chronological nonnegative quantities even on direct inserts. UUID idempotency keys deduplicate ledger retries and reject reuse with different content. Research imports use a stable key and SHA-256 of validated content. Database retry checks also compare the actual stored fields with the supplied fields, so a caller-supplied hash cannot conceal changed content. All four tables have invoker-mode insert audit triggers; direct inserts are audited in the same transaction too. Strategy versions serialize on their stable strategy key, append a new row, and leave prior versions intact.

The read model refuses to calculate if account/ledger queries fail or exceed its bounded 100-account / 5,000-entry read. Strategy/research lists show the latest 100 records. Exact row counts are compared to returned ledger length, so a lower server-side row cap also fails closed rather than silently omitting trades. These limits are explicit MVP boundaries, not silent complete-history claims.

## Research import contract

`src/features/investment/schemas.ts` defines schema_version 1 and a visibly instructional example. Required fields include a stable import_key, title, kind, Markdown body, as_of date, source URLs, producer, and limitations. Optional strategy_version_id links to an immutable version owned by the same user.

Research opinions cannot include performance metrics. Backtests additionally require data snapshot identity, code version, ordered start/end dates no later than as_of, benchmark, transaction-cost assumptions, a result artifact URL, total return and max drawdown. The database additionally validates nested JSON types, required values, date ranges, metrics and source-link shapes, so bypassing the web form cannot inject malformed research objects. These are imported claims, always labeled unreplicated; schema validation is not performance verification. URLs are stored/displayed, never fetched automatically. Models cannot declare their own results verified. Backtest/live series are never combined.

## Storage rollout and verification gates

`docs/sql/investment-v1-candidate.sql` is the reviewed SQL reference, outside the automatic migration directory. Formal migrations are generated by the Supabase CLI and tracked in Git. Following explicit approval, the additive base migration was applied to the confirmed production project; the exact status and follow-up permission boundary are recorded below. No holdings were inserted, existing business records and policies were unchanged, and no credentials or brokerage access were created.

For each deployment or fresh installation:
1. Review the four tables, owner isolation, limited grants and invoker functions; obtain required production database/access approval
2. In an approved local PostgreSQL/Supabase environment, create the final migration with the supported Supabase CLI and test the candidate
3. Exercise actual owner A / owner B / anonymous RLS reads and writes, composite ownership, simultaneous inserts, rejected backdates, safe/rejected correction events, duplicate retry/conflict, preserved versions and transactional audit rollback
4. Run advisors and review SQL security; static contract tests alone are not sufficient evidence
5. After approval, apply the reviewed migration to the intended project, verify schema history and owner flows, then publish app changes according to repository policy

If storage is missing or unreadable, the new page deliberately reports unavailable storage and disables forms rather than presenting a false empty portfolio. No automatic setup or migration runs from a web request.

## Isolated CI SQL test route

The `investment-sql` workflow job starts an ephemeral official PostgreSQL 16 service with a test-only database and no Supabase/Vercel secrets. `tests/fixtures/investment-sql/bootstrap.sql` creates synthetic `auth.users` and an `auth.uid()` test stub; the actual PostgreSQL `anon` and `authenticated` roles exercise the candidate's RLS and privileges. It then runs the candidate and regression script. A two-process Python check verifies only one writer can commit against a shared revision. These files are never to be run against a connected/production Supabase project. The user authorized the draft testing PR and isolated CI run. PostgreSQL 16.15 execution passed for candidate commit 5807e839, including observed overlapping row-lock contention; production setup and release were subsequently explicitly approved, while each release still waits for its verification gates.

The independent browser job starts the Vite fixture under `tests/fixtures/investment-browser`. It mocks all writes, has no session/database connector, and rejects external/API requests. It captures empty, populated, unavailable and modal views at 390/1440px for visual review. There is no production fixture route or authentication exception.

## Verification

Unit fixtures use synthetic TEST symbols only. Calculator and schema tests cover exact decimals, weighted costs, unknown basis, completed lots, mode isolation, backdated oversells, provenance, future/malformed dates and hash stability. Auth-action mocks test session ownership, missing accounts, confirmation, stale revisions and retry outcomes. SQL tests are static contract checks, not a substitute for live RLS or transactional database tests. See task completion report for actual lint/type/build/browser results.

## Approved production rollout

After isolated verification, the user explicitly approved production setup and release. A narrowly scoped catalog preflight confirmed the intended PersonalOS Supabase project uses PostgreSQL 17.6, all four investment tables and six helper/RPC names are absent, and the existing audit_logs columns plus owner policies support invoker-mode audit inserts. No existing application rows were read or changed.

The Supabase CLI generated the formal `*_investment_journal_v1.sql` migration under `supabase/migrations`. A regression test requires its SQL statements to exactly match the reviewed candidate. Isolated CI now executes that formal file on PostgreSQL 16 and 17 before production application.

Rollback is additive and non-destructive: a failed migration transaction rolls back automatically. After a successful commit, a release failure should keep the private investment schema in place and retain or restore the prior app deployment; do not drop populated tables or delete history. Any destructive schema rollback requires separate review and permission. Applying this migration does not populate real or simulated holdings.

Production application succeeded as migration `20261005181404_investment_journal_v1`; the repository filename was aligned to that authoritative migration-history version. Initial catalog verification found all four tables empty, RLS enabled, anonymous reads/writes denied, and no new security-advisor findings. A follow-up trigger execution boundary explicitly revokes Supabase's inherited authenticated EXECUTE from the trigger-only validator. The CI fixture now models Supabase's function default privileges and requires this narrow client-execution boundary while proving trigger-driven writes still work.

The boundary follow-up also adds an account_id/user_id covering index identified by the production performance advisor. Expected unused-index notices on empty new tables are not a reason to remove their lookup indexes. Existing unrelated advisories remain out of scope.

The follow-up applied successfully as `20261005182442_investment_trigger_execute_boundary`. Catalog verification confirms both anon and authenticated cannot execute the trigger-only validator directly, authenticated can still execute the append RPC, the covering index exists, and all four investment tables remain empty. Formal filenames match the two authoritative production migration-history versions.

## Daily overview extension

The next additive phase adds manual/imported quote valuation and an immutable cash/dividend book. See [investment daily overview](investment-daily-overview.md) for current accounting, missing/stale states, owner boundaries, migration review and verification gates. The V1 description above records the original release scope; this extension does not replace or rewrite its trade history.

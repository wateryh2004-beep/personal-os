# Search coverage and storage clarity

## Search

`search_personal_os` retains the established indexed domains, then includes live owner-scoped Leisure experiences, completed Briefing entries (summary and source content), and Investment accounts, strategy versions and research. Live projections intentionally avoid stale derived rows when a parent feed or account is archived. SQL remains security invoker, with explicit owner checks and existing RLS. It grants no new data access.

Results open the specific Leisure detail, the Briefing history entry anchor, or the matching Investment tab/item. Investment deep-link UI is coordinated with the daily-overview slice. Query wildcard escaping, Chinese substrings, domain filters, bounded input and deterministic tie-breakers are preserved. Large collections should be profiled before replacing these live projections with maintained indexes.

Local verification: 9 focused search tests and isolated PGlite/PostgreSQL-compatible schema/RLS regressions passed. Native PostgreSQL 17 CI is configured; browser deep-link verification and final integrated CI remain pending.

## Storage

The personal capacity budget is saved in the owner's profile, with existing profile RLS, explicit Save, validated GiB bounds and retryable failure. Refresh/other-device entry reads the saved value. It does not automatically inspect the R2 bucket.

The UI explicitly separates current bucket object stock, a personal capacity budget, Standard's 10 GB-month monthly allowance, and unavailable account-wide monthly billing. It never subtracts instantaneous bytes from GB-month or labels an unknown account remainder as zero. Reference checked 2026-10-07: https://developers.cloudflare.com/r2/pricing/ . Free tier applies to Standard only; GB-month averages daily storage peaks over the billing period. No account-billing credentials were created.

Local verification: 26 focused search/storage/component tests, typecheck and changed-file lint passed. Profile schema migration and integrated browser/CI verification remain release gates. No production schema or account preference has been changed.

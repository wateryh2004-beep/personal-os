# Performance baseline and measurement protocol

> Status: established before the P0 route/data-path refactor. Values must be
> measured on a real authenticated deployment; this document intentionally
> does not invent localhost or cloud timings.

## Environment discovery

| Item | Evidence | Result |
| --- | --- | --- |
| Supabase production region | Product configuration supplied for this work | `ap-southeast-2` (Sydney) |
| Vercel link in this checkout | `.vercel/project.json` | **NOT PRESENT** |
| Vercel CLI | executable lookup | **NOT AVAILABLE** |
| Connected Vercel account project list | Vercel connection, 2026-08-17 | No `personal-os` project exposed to this environment |
| Production function region | project/deployment configuration | **NOT MEASURED** — do not infer it from the absence of `regions` in `vercel.json` |

The absent project identity means no deployment, function region, production
logs, or production benchmark can be truthfully recorded from this checkout.
Before any region change, link the intended project or grant access to it, then
inspect its current Functions region and deployment URL. Do not configure
multi-region execution for this single Sydney database without that evidence.

## Baseline architecture (before P0 changes)

| Workspace | Route critical path | Secondary path | Warm data cache |
| --- | --- | --- | --- |
| Today | page → `getTodayWorkspace()` → profile → eight parallel reads → possible briefing entries | proactive reconcile after response | none |
| Tasks | page → `getMicrosoftTodoWorkspace()` → auth + connection/lists/tasks | none | UI state only |
| Notes | page → `getNotesWorkspace()` → auth + profile/RPC/folders | paginated list/search | UI state only |
| Calendar | page → `getCalendarWorkspace()` → auth + connection/categories/profile | client range fetch after FullCalendar `datesSet` | component-local range map only |

All four route pages originally waited for their initial private read model
before rendering their workspace component. `router.prefetch()` was present in
the AppShell, but there was no paired data prefetch and no evidence that it
made authenticated dynamic workspace data ready.

## Authentication matrix

| Request | Proxy auth | Layout auth | Query/API auth | Action auth | Expected result |
| --- | --- | --- | --- | --- | --- |
| Client navigation / direct app load | `getClaims`, owner email gate | `requireOwner` | each private query also calls `requireOwner` | n/a | owner-only private UI |
| API GET | proxy deliberately does not redirect API paths | n/a | route must call `requireOwnerApi` or a query guarded by `requireOwner` | n/a | JSON 401/403, no private response |
| Server Action | proxy applies to the originating app request | n/a | n/a | actions call `requireOwner` before reads/writes | owner-only mutation |
| Unauthenticated / expired token | proxy redirects app paths and refreshes/clears cookies | defensive fallback | APIs must reject independently | actions redirect/reject through `requireOwner` | no data emitted |
| Authenticated non-owner | proxy redirects and clears cookie | defensive fallback | independently owner-scoped | independently owner-scoped | no data or mutation |

The duplicated Layout/query check is currently retained while the private route
boundary is migrated. React `cache()` deduplicates `requireOwner` only inside
one RSC render tree; it does not deduplicate Proxy, API, or separate route
requests. Removing the Layout check requires a route-by-route proof that every
private page, query, API handler, and Server Action preserves its own trusted
authorization boundary.

## Cache Components decision

`next.config.ts` intentionally does **not** enable `cacheComponents` in this
change. The local Next 16.3 documentation confirms that ordinary `use cache`
scopes cannot read `cookies()`/`headers()`, while `use cache: private` is
browser-memory only and requires explicit cache ownership/lifetime. This app's
workspace read models are owner-scoped and currently resolve Supabase session
credentials through `requireOwner`; introducing component-level caching without
separating those boundaries would make the safety model harder to audit.

The implemented cache is therefore an explicit client memory cache behind
owner-authenticated `private, no-store` endpoints. It has no shared HTTP cache,
no localStorage persistence, and is cleared on logout. Route entry sees a
workspace shell first; an already visited workspace sees its snapshot first;
the request then reconciles in the background.

## Measurement protocol

Set `NEXT_PUBLIC_PERF_DEBUG=true` in a development or controlled deployment to
log client marks, and `PERF_DEBUG=true` to log server JSON spans. Diagnostics
record only workspace/span names, elapsed milliseconds, and route labels—never
note bodies, task titles, calendar subjects, prompts, email, tokens, or user
IDs.

For each run, record browser/device, production deployment URL, function
region, network condition, and whether it is cold or warm. Perform:

1. Hard reload Today, then Today → Tasks → Notes → Calendar → Tasks → Notes → Today.
2. Repeat the sequence at 390px.
3. Record `nav_click`, route commit, workspace visible, and data-ready values.
4. Compare the second Tasks/Notes/Calendar entry with cached useful UI budget
   (≤200ms target). Do not use a cloud CI network threshold as proof of that
   interactive target.

## Before / after benchmark table

| Metric | Before | After |
| --- | --- | --- |
| Tasks warm: click → useful UI | NOT MEASURED | NOT MEASURED |
| Notes warm: click → useful UI | NOT MEASURED | NOT MEASURED |
| Calendar warm: click → useful UI | NOT MEASURED | NOT MEASURED |
| Today warm: click → useful UI | NOT MEASURED | NOT MEASURED |

The table must be filled only after the real deployment is accessible. The
local type/lint/test/build gates verify correctness, not production latency.

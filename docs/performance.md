# Interaction performance budget

Personal OS is a private, server-authorized application. Private data must not
be moved to public caching in the name of speed. Instead, interaction latency
is managed at the client boundary.

- Sidebar navigation updates active feedback in the next frame; the AppShell
  remains mounted while route data streams in.
- Local controls (tabs, filters, panels and calendar navigation) never wait
  for a network response.
- Notes keystrokes do not make requests. Autosave is debounced, returns a
  revision to the existing editor and must not call `router.refresh()`.
- Calendar date/view changes keep one FullCalendar instance. Ranges are cached
  and concurrent requests for the same range are deduplicated.
- Closed Agent and page AI panels must not mount, restore runs, subscribe to
  Realtime, or ship their heavy runtime eagerly.
- Mutations use an optimistic local state first, then reconcile provider truth.
  A failure visibly rolls back and reports the failure.
- `location.reload()` is forbidden for business operations. New
  `router.refresh()` calls require a documented reason that local state cannot
  satisfy (for example, an explicit full Microsoft reconcile).

Development diagnostics should be guarded by `NEXT_PUBLIC_PERF_DEBUG`; do not
add production console loops. Browser regression tests must cover Notes save,
Calendar navigation/mutation, Tasks completion, closed Agent, Shopping create
and Travel reordering before a performance-sensitive change is merged.

## Refresh and reload audit

The following remaining calls are intentional exceptions, not routine UI
synchronization:

- Calendar's **Outlook reconcile** button refreshes the server tree only after
  an explicit full Microsoft synchronization. Drag, resize, create, filter,
  view, and date navigation stay local-first.
- Microsoft device authorization reloads once after an OAuth connection has
  changed. This is session/connection recovery, not a business mutation.
- Notes folder administration, career-roadmap administration, and review
  proposal workflows are low-frequency administrative operations. Any new
  high-frequency mutation there must adopt local optimistic state instead.

Files upload and extraction used to refresh the whole workspace after each
operation. They now add or update the confirmed file record in local state;
the ordinary next navigation still reconciles it against the server.

## Interaction budget and local diagnostics

The user sees local feedback, not a promise about provider response time:

- Navigation click → pending active state: **under 100 ms**.
- Warm restore for an already visited Today, Tasks, Notes, or Calendar
  workspace: cached useful UI **≤200 ms** (ideal: under 100 ms); refresh is a
  background concern and must not clear the previous snapshot.
- Cold private route: useful workspace chrome should normally appear around
  **1 s** on production networks, materially below the former 2–3 s wait. It
  is a target to benchmark, not a fabricated local guarantee.
- Provider mutation → optimistic visible UI: **under 100 ms**; a failed
  provider reconciliation must roll back visibly.
- Panel, dialog, and quick capture: state changes in the next frame; CSS motion
  completes in roughly **150–200 ms**.
- Quick-create submit → local pending state: immediate; confirmation happens
  after the provider responds.
- Search debounce: **120–180 ms**.

When `NEXT_PUBLIC_PERF_DEBUG=true`, `perfMark` / `perfMeasure` write only
development console diagnostics for navigation, quick capture and lazy panels.
They do not send analytics or persist personal behavior.

`npm run audit:ui` is a warning-only regression guardrail. It flags likely
design-system drift and raw feature-level controls, while keeping deliberate
renderer/third-party exceptions in a small allowlist. It is intentionally not
a blocking lint rule until historical exceptions are retired.

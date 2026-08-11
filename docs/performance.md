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

# UI responsiveness refinement — October 2026

## What changed

- The persistent shell reports real React navigation pending state immediately.
  Full-content ViewTransition snapshots and the extra 180 ms indicator delay
  are removed. Repeated destinations, redirects and Back are regression-tested.
- Search and quick create show dismissible loading chrome while code loads.
  A newer create request wins, and a closed surface cannot reappear when a
  delayed import finishes. Closed AI surfaces remain unmounted.
- Interview editing no longer rebuilds the entire library or re-renders its
  question rows for every keystroke. Unchanged Markdown is memoized. The search
  index is workspace-scoped, weakly held and invalidated by immutable draft
  updates. Save queues, provenance, versions and mobile history are unchanged.
- Calendar reuses immutable timezone formatters in a bounded 16-entry cache.
  This does not cache dates, results or private data. DST ambiguity and invalid
  times keep their original rejection behavior. The event source and plugin
  arrays remain stable during unrelated renders.
- Side-panel resizing writes at most once per animation frame, without
  re-rendering its React contents per pointer event. Missing saved widths use
  the intended defaults, including the Notes navigator.
- Today has one owner for responsive content gutters. Its loading layout has
  the same origin. Tasks and Calendar now use workspace-shaped route loading
  states, including a one-day mobile calendar skeleton.
- Mobile Notes preserves space between its folder control and heading for both
  populated and empty lists. Task row menus keep their own right-hand column.
  Dialog and sheet scrims use tint without a full-page backdrop-blur pass.

## Reproducible CPU/work-count evidence

These are synthetic local tests, **not production latency measurements**.

| Workload | Before (`aeb4407`) | After |
| --- | ---: | ---: |
| 10 answer keystrokes, 153-question fixture: unrelated body/label reads | 10,640 | 0 |
| Reopen selected mobile question: unchanged Markdown parses | 2 | 0 |
| Five incremental library searches: full-body indexing reads | 765 | 153 |
| 200 calendar event projections, median of 9, Node v24.19.0 | 36.89 ms | 3.30 ms |
| 20 wall-time conversions, same environment | 99.45 ms | 10.32 ms |

Reproduce calendar CPU timings with:

```sh
node scripts/benchmark-calendar-timezone.mjs aeb4407
```

The script checks exact output equality first. Runtime and hardware affect
timings, so CI checks deterministic formatter construction counts and event
source identity rather than flaky millisecond thresholds. Interview operation
counts are covered in `interview-rendering-performance.test.ts` and
`interview-search-index.test.ts`.

## Browser coverage

The existing `E2E_MOBILE_HARNESS=1` route now has fixture-only shell scenes for
Today, Tasks, Calendar, Notes and loading states. CI captures 390 px and 1440 px
views, checks horizontal overflow, active navigation, Today gutter/loading
origin, Notes default width, Tasks detail close/Back, and reduced-motion dialog
dismissal. Bounding-box checks prevent the mobile Notes folder/title collision
and task menu wrapping; computed-style checks verify unblurred dialog/sheet
scrims. The established 360–430 px Interview/history/draft provenance tests
still run. All fixtures are synthetic; tests do not submit mutations.

Navigation interruption and delayed-import ownership use deterministic React
tests. Fixture screenshots do not prove authenticated production query latency.

## Remaining server-side limitation

Today, Tasks, Notes and Calendar still wait for their authoritative RSC read
models before passing data to their client loader. Their existing memory
snapshots therefore do not eliminate that server wait during navigation. This
change does not claim to fix or benchmark production network latency.

A safe streamed-cache redesign must account for prefetched reads overtaken by
local mutations, concurrent navigation, logout and cross-tab/session changes.
No auth boundary, database schema, personal content or cache ownership contract
is weakened here. Measure an authenticated deployment using the existing
`performance-baseline.md` protocol before claiming a click-to-content target.

# Typography and spacing refinement — October 2026

## Scope

A presentational pass over the existing interface, based on the approved PR51
390 px and 1440 px screenshots (tree `4e1995a8a23272be8041dfd35efa730f135421f7`).
No data, saved content, auth, routes, mutation handlers, navigation ownership,
Interview provenance or the 153-question library is changed.

- Shared page titles use 28 px desktop / 24 px mobile, 1.25 line height and
  -0.015 em tracking instead of the cramped 1.06–1.08 / -0.042 em treatment.
  The generic header allows long titles to wrap rather than hiding them.
- Local system fonts remain; explicit Windows and Linux CJK fallbacks are added.
  No remote font request or new font dependency is introduced.
- Secondary and tertiary text use `#62626a` and `#6e6e76`. These exceed 4.5:1
  contrast on white and the app's `#f4f4f6` / `#f5f5f7` base surfaces. This is
  not a claim about every tinted, disabled or translucent state.
- Today uses a consistent 32 px mobile section gap and aligned desktop columns.
  Explicit shrinkable grid tracks keep populated 360 px sections inside their gutters.
  Its secondary divider changes from 60 + 44 px to 32 + 24 px on mobile, and
  from 76 + 52 px to 48 + 32 px on desktop. Empty-state padding is reduced.
  Body copy is 13–14 px and supporting copy is at least 12 px in those sections.
- Tasks and Notes use 14 px row titles with 12 px metadata. The active Tasks
  underline is 2 px and inside the scrolling rail, rather than clipped below it.
  Notes row menus and Today capture have 44 px mobile hit targets.
- Interview preserves its memoized read-first flow. Reading copy is 15 px with
  28 px line height; labels and title tracking are less compressed.

## Verification

The existing browser harness uses only synthetic data and never submits forms.
It now exercises empty and populated Today, Tasks, Calendar, Notes, loading
states and a long shared heading at 360 / 390 / 430 / 640 / 1440 px. Interview retains
360 / 390 / 412 / 430 px history, filters, provenance and reading-mode checks.
Cropped Interview screenshots supplement the full-page images.

New computed-style/geometry checks cover heading size and line height, aligned
Today columns, circular capture controls, touch-sized non-overlapping Notes
menus, row typography and the visible active-tab underline. Existing regression
checks for folder/header separation, drawer close/create hit areas, task menus,
Back/Forward and reduced-motion overlays remain intact.

`typography-spacing-metrics.json` is emitted with the CI screenshot artifact so
actual geometry can be compared to the approved baseline images. Source tests
also protect neutral-surface contrast, local CJK fallbacks and shared styles.

The server-side RSC wait described in `ui-responsiveness-verification.md`
remains unchanged. This visual pass makes no new latency or performance claim.

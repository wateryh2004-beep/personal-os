# Calendar time contract

- Timed events are canonical UTC ISO instants in app payloads and `timestamptz` storage.
- UI input is wall time plus the profile's IANA timezone. Only `calendar/timezone.ts` converts it to an instant; ambiguous or nonexistent DST wall times fail closed.
- FullCalendar runs in explicit UTC-coercion mode. Its boundary adapters project app instants to visible wall-clock fields and convert callback fields back before any mutation.
- All-day events are DATE semantics. They are re-anchored at local midnight only for existing instant storage and never derived from UTC midnight dates.
- Microsoft Graph conversion lives in `event-payload.ts`; create, update, sync and AI proposals all enter the same operation pipeline.

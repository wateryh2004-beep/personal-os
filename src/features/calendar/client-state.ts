import type { CalendarEventRecord } from "./types";

/** Pure state helpers used by the Calendar workspace and regression tests. */
export function calendarRangeKey(startsAt: string, endsAt: string) {
  return `${startsAt}:${endsAt}`;
}

export function isCurrentCalendarRangeResponse(currentSequence: number, responseSequence: number) {
  return currentSequence === responseSequence;
}

export function filterCalendarEvents(events: CalendarEventRecord[], categories: Set<string>) {
  return categories.size
    ? events.filter((event) => event.categories.some((category) => categories.has(category)))
    : events;
}

export function replaceCalendarEvent(events: CalendarEventRecord[], next: CalendarEventRecord) {
  return events.map((event) => event.id === next.id ? next : event);
}

export function removeCalendarEvent(events: CalendarEventRecord[], id: string) {
  return events.filter((event) => event.id !== id);
}

/**
 * A successful mutation can remove an event from the current visible range
 * (for example, dragging Sunday into the following week). This is distinct
 * from a failed mirror refetch, which must make FullCalendar roll back.
 */
export function reconcileCalendarMutationRange(events: CalendarEventRecord[], id: string) {
  const event = events.find((item) => item.id === id);
  return event
    ? { kind: "updated" as const, event }
    : { kind: "moved_out_of_range" as const };
}

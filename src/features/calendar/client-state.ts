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

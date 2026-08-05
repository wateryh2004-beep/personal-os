import type { CreateCalendarEvent } from "./schemas";

export function calendarPayload(value: CreateCalendarEvent) {
  return {
    subject: value.subject,
    startsAt: value.startsAt,
    endsAt: value.endsAt,
    locationName: value.locationName,
    isAllDay: value.isAllDay,
  };
}

export function eventForGraph(value: CreateCalendarEvent) {
  return {
    subject: value.subject,
    start: { dateTime: value.startsAt, timeZone: "UTC" },
    end: { dateTime: value.endsAt, timeZone: "UTC" },
    isAllDay: value.isAllDay,
    ...(value.locationName ? { location: { displayName: value.locationName } } : {}),
  };
}

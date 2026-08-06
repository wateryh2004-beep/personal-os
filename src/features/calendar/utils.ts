import type { CreateCalendarEvent } from "./schemas";

export function calendarPayload(value: CreateCalendarEvent) {
  return {
    subject: value.subject,
    description: value.description,
    startsAt: value.startsAt,
    endsAt: value.endsAt,
    locationName: value.locationName,
    isAllDay: value.isAllDay,
  };
}

export function eventForGraph(value: CreateCalendarEvent) {
  return {
    subject: value.subject,
    ...(value.description ? { body: { contentType: "text", content: value.description } } : {}),
    start: { dateTime: value.startsAt, timeZone: "UTC" },
    end: { dateTime: value.endsAt, timeZone: "UTC" },
    isAllDay: value.isAllDay,
    ...(value.locationName ? { location: { displayName: value.locationName } } : {}),
  };
}

import { dateTimeInputValue, wallTimeToIso } from "@/features/calendar/timezone";

const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Task forms use the device's wall clock; persisted deadlines remain UTC instants. */
export function taskDueInputValue(value: string | null, timezone = browserTimezone()): string {
  return value ? dateTimeInputValue(value, timezone) : "";
}

/** Reject DST gaps/overlaps rather than silently moving a deadline to another time. */
export function taskDueInputToIso(value: string, timezone = browserTimezone()): string | null {
  return value ? wallTimeToIso(value, timezone) : null;
}

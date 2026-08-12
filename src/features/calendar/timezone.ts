/**
 * Calendar time contract:
 * - timed events are UTC ISO instants everywhere outside this module;
 * - user input is a wall time plus an IANA timezone;
 * - all-day events are ISO DATE values, never midnight instants.
 *
 * FullCalendar is deliberately run in UTC-coercion mode. We project an
 * instant to a UTC Date whose fields are the user's wall time, then convert
 * those fields back at the UI boundary. This avoids browser-timezone and
 * optional named-timezone-plugin behaviour leaking into persisted data.
 */
export type CalendarWallTime = `${number}-${number}-${number}T${number}:${number}`;
export type CalendarDate = `${number}-${number}-${number}`;

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsForInstant(value: string | Date, timezone: string): Parts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

function pad(value: number) { return String(value).padStart(2, "0"); }
function asWallTime(parts: Parts) { return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}` as CalendarWallTime; }
function asDate(parts: Parts) { return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}` as CalendarDate; }
function wallEpoch(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(value);
  if (!match) throw new Error("calendar_wall_time_invalid");
  const [, year, month, day, hour, minute, second = "0"] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
}

function offsetAt(instant: number, timezone: string) {
  const parts = partsForInstant(new Date(instant), timezone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - instant;
}

/** Converts an unambiguous user wall time to its canonical UTC instant. */
export function wallTimeToInstant(value: string, timezone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(value);
  if (!match) throw new Error("calendar_wall_time_invalid");
  const [, year, month, day, hour, minute, second = "0"] = match;
  const target = wallEpoch(value);
  const offsets = new Set<number>();
  for (let hour = -36; hour <= 36; hour += 1) offsets.add(offsetAt(target + hour * 3_600_000, timezone));
  const candidates = [...offsets]
    .map((offset) => target - offset)
    .filter((instant) => {
      const parts = partsForInstant(new Date(instant), timezone);
      return parts.year === Number(year) && parts.month === Number(month) && parts.day === Number(day)
        && parts.hour === Number(hour) && parts.minute === Number(minute) && parts.second === Number(second);
    });
  if (candidates.length !== 1) throw new Error(candidates.length ? "calendar_wall_time_ambiguous" : "calendar_wall_time_nonexistent");
  return new Date(candidates[0]).toISOString();
}

export function instantToWallTime(value: string, timezone: string) { return asWallTime(partsForInstant(value, timezone)); }
export function instantToDate(value: string, timezone: string) { return asDate(partsForInstant(value, timezone)); }

/** Date handed to FullCalendar in UTC-coercion mode; its UTC fields are wall time. */
export function instantToFullCalendarDate(value: string, timezone: string) {
  const parts = partsForInstant(value, timezone);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
}

/** Converts a FullCalendar UTC-coerced timed Date back to the canonical instant. */
export function fullCalendarDateToInstant(value: Date, timezone: string) {
  const wall = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}T${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}` as CalendarWallTime;
  return wallTimeToInstant(wall, timezone);
}

export function fullCalendarDateToAllDay(value: Date) { return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}` as CalendarDate; }
export function allDayDateToFullCalendarDate(value: CalendarDate) { return `${value}T00:00:00.000Z`; }

/** Adds calendar days to a DATE without involving the browser's timezone. */
export function shiftCalendarDate(value: CalendarDate, amount: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10) as CalendarDate;
}

/** Moves a calendar cursor in the profile timezone, never in device-local time. */
export function shiftCalendarCursor(value: Date, timezone: string, amount: number) {
  const wall = instantToWallTime(value.toISOString(), timezone);
  const date = new Date(`${wall}:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  const nextWall = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  return new Date(wallTimeToInstant(nextWall, timezone));
}

// Compatibility aliases for the existing form boundary.
export const dateTimeInputValue = instantToWallTime;
export const wallTimeToIso = wallTimeToInstant;

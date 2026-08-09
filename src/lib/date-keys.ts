const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateKey(value: string) {
  if (!DATE_KEY_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value ? date : null;
}

/**
 * Returns the user's local calendar date. Date-only values are kept date-only
 * and are never interpreted as UTC instants.
 */
export function getDateKeyInTimeZone(value: Date | string, timeZone: string) {
  if (typeof value === "string" && parseDateKey(value)) return value;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function addDateKeyDays(dateKey: string, days: number) {
  const date = parseDateKey(dateKey);
  if (!date) throw new Error(`Invalid date key: ${dateKey}`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Signed calendar-day distance: target - origin. */
export function differenceDateKeys(targetDate: string, originDate: string) {
  const target = parseDateKey(targetDate);
  const origin = parseDateKey(originDate);
  if (!target || !origin) throw new Error("Invalid date key");
  return Math.round((target.getTime() - origin.getTime()) / 86_400_000);
}

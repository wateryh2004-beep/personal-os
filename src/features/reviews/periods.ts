import type { ReviewPeriod, ReviewType } from "./types";

function parts(date: Date, timeZone: string) {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(values.map((part) => [part.type, part.value]));
}

export function getDateKeyInTimeZone(date: Date, timeZone: string) {
  const value = parts(date, timeZone);
  return `${value.year}-${value.month}-${value.day}`;
}

export function addLocalDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

export function getLocalWeekPeriod(date: Date, timeZone: string) {
  const today = getDateKeyInTimeZone(date, timeZone);
  const [year, month, day] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const startDate = addLocalDays(today, mondayOffset);
  return { startDate, endDate: addLocalDays(startDate, 6) };
}

export function getReviewPeriod(
  reviewType: Exclude<ReviewType, "decision">,
  date: Date,
  timeZone: string,
): ReviewPeriod {
  if (reviewType === "daily") {
    const startDate = getDateKeyInTimeZone(date, timeZone);
    return { key: `daily:${startDate}`, startDate, endDate: startDate, timezone: timeZone };
  }
  const { startDate, endDate } = getLocalWeekPeriod(date, timeZone);
  return { key: `weekly:${startDate}`, startDate, endDate, timezone: timeZone };
}

export type TodayTask = {
  id: string;
  title: string;
  due_at: string | null;
  importance: string | null;
  status: string;
};

function calendarDateKey(value: Date | string, timeZone: string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function isDueToday(value: string | null, now: Date, timeZone: string) {
  return value ? calendarDateKey(value, timeZone) === calendarDateKey(now, timeZone) : false;
}

export function splitTodayTasks(tasks: TodayTask[], now: Date, timeZone: string) {
  const pending = tasks.filter((task) => task.status !== "completed");
  const today = pending.filter((task) => isDueToday(task.due_at, now, timeZone));
  const upcoming = pending
    .filter((task) => !isDueToday(task.due_at, now, timeZone))
    .sort((left, right) => (left.due_at ?? "9999").localeCompare(right.due_at ?? "9999"));
  return { today, upcoming };
}

export function formatTodayDate(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
}

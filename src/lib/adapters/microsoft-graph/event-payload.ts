export type GraphCalendarCreatePayload = {
  subject: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  locationName: string | null;
  isAllDay: boolean;
  timeZone?: string;
  categories?: string[];
  importance?: "low" | "normal" | "high";
  showAs?: "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown";
  transactionId?: string;
  startDate?: string;
  endDateExclusive?: string;
};

const windowsTimeZones: Record<string, string> = {
  "Asia/Shanghai": "China Standard Time",
  "Asia/Hong_Kong": "China Standard Time",
  "Asia/Tokyo": "Tokyo Standard Time",
  "America/Los_Angeles": "Pacific Standard Time",
  "America/New_York": "Eastern Standard Time",
  "Europe/London": "GMT Standard Time",
  UTC: "UTC",
};

export function graphTimeZone(ianaTimeZone: string) {
  const mapped = windowsTimeZones[ianaTimeZone];
  if (!mapped) throw new Error("calendar_timezone_unsupported");
  return mapped;
}

function localDateTime(isoDateTime: string, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(isoDateTime));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
  } catch {
    return isoDateTime.replace(/(?:Z|[+-]\d\d:\d\d)$/, "");
  }
}

function nextDate(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Converts application ISO values to Graph's dateTimeTimeZone representation. */
export function calendarEventForGraph(value: GraphCalendarCreatePayload) {
  const timeZone = value.timeZone || "Asia/Shanghai";
  const graphZone = graphTimeZone(timeZone);
  const localDate = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  const startDate = value.startDate ?? localDate(value.startsAt);
  const endDate = value.endDateExclusive ?? nextDate(startDate);
  const start = value.isAllDay ? `${startDate}T00:00:00` : localDateTime(value.startsAt, timeZone);
  const end = value.isAllDay ? `${endDate}T00:00:00` : localDateTime(value.endsAt, timeZone);

  return {
    subject: value.subject,
    ...(value.transactionId ? { transactionId: value.transactionId } : {}),
    ...(value.description ? { body: { contentType: "text", content: value.description } } : {}),
    start: { dateTime: start, timeZone: graphZone },
    end: { dateTime: end, timeZone: graphZone },
    isAllDay: value.isAllDay,
    ...(value.categories ? { categories: value.categories } : {}),
    ...(value.importance ? { importance: value.importance } : {}),
    ...(value.showAs && value.showAs !== "unknown" ? { showAs: value.showAs } : {}),
    ...(value.locationName ? { location: { displayName: value.locationName } } : {}),
  };
}

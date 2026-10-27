import { wallTimeToIso } from "@/features/calendar/timezone";
export type AvailabilityPeriod = { start: string; end: string };
export type CapacityEvent = {
  starts_at: string;
  ends_at: string;
  show_as: string | null;
};
/** Merge busy intersections, never subtract two overlapping events twice. */
export function calculateCapacity(
  date: string,
  timezone: string,
  periods: AvailabilityPeriod[],
  events: CapacityEvent[],
  tasks: { estimated_minutes: number | null }[],
  complete: boolean,
) {
  const intervals = periods.map(
    (period) =>
      [
        Date.parse(wallTimeToIso(`${date}T${period.start}`, timezone)),
        Date.parse(wallTimeToIso(`${date}T${period.end}`, timezone)),
      ] as const,
  );
  let available = 0,
    busy = 0;
  for (const [start, end] of intervals) {
    if (end <= start) throw new Error("invalid_period");
    available += (end - start) / 60000;
    const clipped = events
      .filter((event) => event.show_as !== "free")
      .map((event) => [
        Math.max(start, Date.parse(event.starts_at)),
        Math.min(end, Date.parse(event.ends_at)),
      ])
      .filter(([a, b]) => b > a)
      .sort((a, b) => a[0] - b[0]);
    let mergedStart = 0,
      mergedEnd = 0;
    for (const [a, b] of clipped) {
      if (a > mergedEnd) {
        busy += (mergedEnd - mergedStart) / 60000;
        mergedStart = a;
        mergedEnd = b;
      } else mergedEnd = Math.max(mergedEnd, b);
    }
    busy += (mergedEnd - mergedStart) / 60000;
  }
  const estimated = tasks.reduce(
      (sum, task) => sum + (task.estimated_minutes ?? 0),
      0,
    ),
    unknown = tasks.filter((task) => task.estimated_minutes === null).length;
  return {
    available,
    busy: complete ? busy : null,
    free: complete ? available - busy : null,
    estimated,
    unknown,
    overbooked: complete ? Math.max(0, estimated - (available - busy)) : null,
  };
}

/** Cache all-day rows already use local-midnight anchors (Calendar DATE contract).
 * A changed timezone/legacy non-midnight anchor cannot establish a free slot. */
export function hasCanonicalAllDayAnchors(
  events: (CapacityEvent & { is_all_day: boolean })[],
  timezone: string,
) {
  return events.every(
    (event) =>
      !event.is_all_day ||
      [event.starts_at, event.ends_at].every((value) => {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: timezone,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        }).formatToParts(new Date(value));
        return ["hour", "minute", "second"].every(
          (type) => parts.find((part) => part.type === type)?.value === "00",
        );
      }),
  );
}
export function calendarCapacityComplete(
  connection: {
    status: string;
    last_error_code: string | null;
    last_sync_at: string | null;
    calendar_sync_window_start: string | null;
    calendar_sync_window_end: string | null;
  } | null,
  start: string,
  end: string,
  count: number,
  allDayCanonical: boolean,
  now: number,
  maxAgeMs: number,
) {
  const synced = connection?.last_sync_at
    ? Date.parse(connection.last_sync_at)
    : NaN;
  return Boolean(
    connection?.status === "enabled" &&
      !connection.last_error_code &&
      Number.isFinite(synced) &&
      now >= synced &&
      now - synced <= maxAgeMs &&
      connection.calendar_sync_window_start &&
      connection.calendar_sync_window_end &&
      Date.parse(connection.calendar_sync_window_start) <= Date.parse(start) &&
      Date.parse(connection.calendar_sync_window_end) >= Date.parse(end) &&
      count <= 1000 &&
      allDayCanonical,
  );
}

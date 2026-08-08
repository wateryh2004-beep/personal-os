import {
  dateTimeInputValue,
  wallTimeToIso,
} from "@/features/calendar/timezone";

export type BusyInterval = {
  startsAt: string;
  endsAt: string;
  isAllDay?: boolean;
};

type TimeRange = { startsAt: string; endsAt: string };

function localDateKeys(startsAt: string, endsAt: string, timezone: string) {
  const first = dateTimeInputValue(startsAt, timezone).slice(0, 10);
  const last = dateTimeInputValue(new Date(Date.parse(endsAt) - 1).toISOString(), timezone).slice(0, 10);
  const values: string[] = [];
  const cursor = new Date(`${first}T00:00:00Z`);
  const stop = new Date(`${last}T00:00:00Z`);
  while (cursor <= stop && values.length < 32) {
    values.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return values;
}

function clampRange(range: TimeRange, outer: TimeRange) {
  const start = Math.max(Date.parse(range.startsAt), Date.parse(outer.startsAt));
  const end = Math.min(Date.parse(range.endsAt), Date.parse(outer.endsAt));
  return end > start
    ? { startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() }
    : null;
}

export function findFreeTimeSlots(input: {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  timezone: string;
  busy: BusyInterval[];
  preferredTimeRanges?: TimeRange[];
  excludeAllDay?: boolean;
  workingHours?: { startsAt: string; endsAt: string };
  limit?: number;
}) {
  const outer = { startsAt: input.startsAt, endsAt: input.endsAt };
  const working = input.workingHours ?? { startsAt: "08:00", endsAt: "22:00" };
  const windows = input.preferredTimeRanges?.length
    ? input.preferredTimeRanges
        .map((range) => clampRange(range, outer))
        .filter((range): range is TimeRange => Boolean(range))
    : localDateKeys(input.startsAt, input.endsAt, input.timezone)
        .map((date) =>
          clampRange(
            {
              startsAt: wallTimeToIso(`${date}T${working.startsAt}`, input.timezone),
              endsAt: wallTimeToIso(`${date}T${working.endsAt}`, input.timezone),
            },
            outer,
          ),
        )
        .filter((range): range is TimeRange => Boolean(range));
  const busy = input.busy
    .filter((event) => !(input.excludeAllDay && event.isAllDay))
    .map((event) => ({ start: Date.parse(event.startsAt), end: Date.parse(event.endsAt) }))
    .filter((event) => Number.isFinite(event.start) && Number.isFinite(event.end))
    .sort((a, b) => a.start - b.start);
  const durationMs = input.durationMinutes * 60_000;
  const result: Array<{ startsAt: string; endsAt: string; durationMinutes: number }> = [];
  for (const window of windows.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))) {
    let cursor = Date.parse(window.startsAt);
    const end = Date.parse(window.endsAt);
    for (const event of busy) {
      if (event.end <= cursor || event.start >= end) continue;
      if (event.start - cursor >= durationMs) {
        result.push({
          startsAt: new Date(cursor).toISOString(),
          endsAt: new Date(cursor + durationMs).toISOString(),
          durationMinutes: input.durationMinutes,
        });
      }
      cursor = Math.max(cursor, event.end);
      if (result.length >= (input.limit ?? 12)) return result;
    }
    if (end - cursor >= durationMs)
      result.push({
        startsAt: new Date(cursor).toISOString(),
        endsAt: new Date(cursor + durationMs).toISOString(),
        durationMinutes: input.durationMinutes,
      });
    if (result.length >= (input.limit ?? 12)) break;
  }
  return result;
}

import type { CalendarEventRecord } from "@/features/calendar/types";

/** A bounded hint from the currently loaded records; never a provider availability claim. */
export function calendarDragPreview(events: CalendarEventRecord[], range: { startsAt: string; endsAt: string; eventId?: string }) {
  const start = Date.parse(range.startsAt);
  const end = Date.parse(range.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { durationMinutes: null, overlaps: [] as CalendarEventRecord[] };
  return {
    durationMinutes: Math.round((end - start) / 60_000),
    overlaps: events.filter(event => event.id !== range.eventId && event.show_as !== "free"
      && Date.parse(event.starts_at) < end && Date.parse(event.ends_at) > start),
  };
}

export function calendarDurationLabel(minutes: number | null) {
  if (minutes === null) return "时长待定";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} 小时${rest ? ` ${rest} 分钟` : ""}` : `${minutes} 分钟`;
}

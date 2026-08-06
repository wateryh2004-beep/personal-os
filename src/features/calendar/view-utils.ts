export type TimedCalendarEvent = { id: string; starts_at: string; ends_at: string; is_all_day: boolean };

export type TimedEventLayout<T extends TimedCalendarEvent> = {
  event: T;
  startMinutes: number;
  endMinutes: number;
  column: number;
  columns: number;
};

const minutesFromStartOfDay = (date: Date) => Math.round((date.getTime() - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 60_000);

export function layoutTimedEvents<T extends TimedCalendarEvent>(events: T[], startHour = 6, endHour = 24): TimedEventLayout<T>[] {
  const rangeStart = startHour * 60;
  const rangeEnd = endHour * 60;
  const sorted = events
    .filter((event) => !event.is_all_day)
    .map((event) => {
      const startsAt = new Date(event.starts_at);
      const endsAt = new Date(event.ends_at);
      const dayStart = new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate());
      return { event, startMinutes: Math.max(rangeStart, minutesFromStartOfDay(startsAt)), endMinutes: Math.min(rangeEnd, Math.round((endsAt.getTime() - dayStart.getTime()) / 60_000)), column: 0, columns: 1 };
    })
    .filter((event) => event.endMinutes > event.startMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes || a.event.id.localeCompare(b.event.id));

  const result: TimedEventLayout<T>[] = [];
  let active: TimedEventLayout<T>[] = [];
  let group: TimedEventLayout<T>[] = [];
  let groupColumns = 1;
  const finishGroup = () => {
    for (const item of group) item.columns = groupColumns;
    group = [];
    groupColumns = 1;
  };

  for (const item of sorted) {
    active = active.filter((activeItem) => activeItem.endMinutes > item.startMinutes);
    if (!active.length && group.length) finishGroup();
    const occupied = new Set(active.map((activeItem) => activeItem.column));
    while (occupied.has(item.column)) item.column += 1;
    active.push(item);
    group.push(item);
    groupColumns = Math.max(groupColumns, item.column + 1);
    result.push(item);
  }
  finishGroup();
  return result;
}

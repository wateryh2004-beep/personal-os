export type TimedStop = {
  id: string;
  day_number: number | null;
  planned_time: string | null;
  duration_minutes: number | null;
};
export type StopOverlap = { first: string; second: string; minutes: number };
export function tripTimeOverlaps(stops: TimedStop[]): StopOverlap[] {
  const intervals = stops
    .flatMap((stop) => {
      const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(
        stop.planned_time ?? "",
      );
      if (
        stop.day_number == null ||
        !match ||
        stop.duration_minutes == null ||
        stop.duration_minutes <= 0
      )
        return [];
      const hour = Number(match[1]),
        minute = Number(match[2]);
      if (hour > 23 || minute > 59) return [];
      const start = (stop.day_number - 1) * 1440 + hour * 60 + minute;
      return [{ id: stop.id, start, end: start + stop.duration_minutes }];
    })
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const overlaps: StopOverlap[] = [];
  for (let index = 0; index < intervals.length; index++)
    for (
      let next = index + 1;
      next < intervals.length && intervals[next].start < intervals[index].end;
      next++
    ) {
      const a = intervals[index],
        b = intervals[next];
      overlaps.push({
        first: a.id,
        second: b.id,
        minutes: Math.min(a.end, b.end) - b.start,
      });
    }
  return overlaps;
}

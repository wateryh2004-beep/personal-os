import { addDateKeyDays, getDateKeyInTimeZone } from "@/lib/date-keys";
import { wallTimeToIso } from "@/features/calendar/timezone";

export type TimedCalendarEvent = {
  id: string;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
};

export type TimedEventSegment<T extends TimedCalendarEvent = TimedCalendarEvent> = {
  id: string;
  event: T;
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

export type CalendarLayoutView = "day" | "week";
export type TimedEventLayout<T extends TimedCalendarEvent = TimedCalendarEvent> = {
  event: T;
  segmentId: string;
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
  actualStartMinutes: number;
  actualEndMinutes: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  clippedBefore: boolean;
  clippedAfter: boolean;
  clusterId: number;
  lane: number;
  laneCount: number;
  laneSpan: number;
  left: number;
  width: number;
  overlapCount: number;
  layoutMode: "single" | "columns";
};

function localMinutes(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return get("hour") * 60 + get("minute");
}

export function projectEventIntoLocalDays<T extends TimedCalendarEvent>(event: T, timezone: string): TimedEventSegment<T>[] {
  if (Date.parse(event.ends_at) <= Date.parse(event.starts_at)) return [];
  const firstDate = getDateKeyInTimeZone(event.starts_at, timezone);
  const lastDate = getDateKeyInTimeZone(new Date(Date.parse(event.ends_at) - 1), timezone);
  if (!firstDate || !lastDate) return [];
  const result: TimedEventSegment<T>[] = [];
  for (let dateKey = firstDate; dateKey <= lastDate; dateKey = addDateKeyDays(dateKey, 1)) {
    const nextDate = addDateKeyDays(dateKey, 1);
    const dayStart = Date.parse(wallTimeToIso(`${dateKey}T00:00`, timezone));
    const dayEnd = Date.parse(wallTimeToIso(`${nextDate}T00:00`, timezone));
    const eventStart = Date.parse(event.starts_at);
    const eventEnd = Date.parse(event.ends_at);
    const continuesBefore = eventStart < dayStart;
    const continuesAfter = eventEnd > dayEnd;
    const startMinutes = continuesBefore ? 0 : localMinutes(event.starts_at, timezone);
    const endMinutes = continuesAfter || eventEnd === dayEnd ? 1440 : localMinutes(event.ends_at, timezone);
    result.push({ id: `${event.id}:${dateKey}`, event, dateKey, startMinutes, endMinutes, continuesBefore, continuesAfter });
  }
  return result;
}

export function projectEventsByLocalDay<T extends TimedCalendarEvent>(events: T[], timezone: string) {
  const map = new Map<string, TimedEventSegment<T>[]>();
  for (const event of events) {
    for (const segment of projectEventIntoLocalDays(event, timezone)) {
      map.set(segment.dateKey, [...(map.get(segment.dateKey) ?? []), segment]);
    }
  }
  return map;
}

function overlaps(left: { startMinutes: number; endMinutes: number }, right: { startMinutes: number; endMinutes: number }) {
  return left.startMinutes < right.endMinutes && right.startMinutes < left.endMinutes;
}

type WorkingLayout<T extends TimedCalendarEvent> = TimedEventLayout<T>;

function layoutCluster<T extends TimedCalendarEvent>(cluster: WorkingLayout<T>[]) {
  let active: WorkingLayout<T>[] = [];
  let laneCount = 1;
  for (const item of cluster) {
    active = active.filter((candidate) => candidate.endMinutes > item.startMinutes);
    const occupied = new Set(active.map((candidate) => candidate.lane));
    let lane = 0;
    while (occupied.has(lane)) lane += 1;
    item.lane = lane;
    active.push(item);
    laneCount = Math.max(laneCount, lane + 1);
  }

  for (const item of cluster) {
    item.laneCount = laneCount;
    item.overlapCount = cluster.filter((candidate) => candidate.segmentId !== item.segmentId && overlaps(item, candidate)).length + 1;
    let laneSpan = 1;
    for (let lane = item.lane + 1; lane < laneCount; lane += 1) {
      const blocked = cluster.some((candidate) => candidate.lane === lane && overlaps(item, candidate));
      if (blocked) break;
      laneSpan += 1;
    }
    item.laneSpan = laneSpan;
    if (laneCount === 1) {
      item.layoutMode = "single";
      item.left = 0;
      item.width = 100;
    } else {
      item.layoutMode = "columns";
      item.left = (item.lane / laneCount) * 100;
      item.width = (laneSpan / laneCount) * 100;
    }
  }
}

export function layoutTimedEvents<T extends TimedCalendarEvent>(segments: TimedEventSegment<T>[], options: { view: CalendarLayoutView; startHour?: number; endHour?: number }): TimedEventLayout<T>[] {
  const rangeStart = (options.startHour ?? 6) * 60;
  const rangeEnd = (options.endHour ?? 24) * 60;
  const sorted: WorkingLayout<T>[] = segments
    .filter((segment) => !segment.event.is_all_day)
    .map((segment) => ({
      event: segment.event,
      segmentId: segment.id,
      dateKey: segment.dateKey,
      startMinutes: Math.max(rangeStart, segment.startMinutes),
      endMinutes: Math.min(rangeEnd, segment.endMinutes),
      actualStartMinutes: segment.startMinutes,
      actualEndMinutes: segment.endMinutes,
      continuesBefore: segment.continuesBefore,
      continuesAfter: segment.continuesAfter,
      clippedBefore: segment.startMinutes < rangeStart,
      clippedAfter: segment.endMinutes > rangeEnd,
      clusterId: 0,
      lane: 0,
      laneCount: 1,
      laneSpan: 1,
      left: 0,
      width: 100,
      overlapCount: 1,
      layoutMode: "single" as const,
    }))
    .filter((item) => item.endMinutes > item.startMinutes)
    // When starts are equal, keep the longest event in the left-most lane. This
    // makes a stable visual spine and prevents short cards from hiding it.
    .sort((left, right) => left.startMinutes - right.startMinutes || right.endMinutes - left.endMinutes || left.event.id.localeCompare(right.event.id));

  const clusters: WorkingLayout<T>[][] = [];
  let cluster: WorkingLayout<T>[] = [];
  let clusterEnd = -1;
  for (const item of sorted) {
    if (cluster.length && item.startMinutes >= clusterEnd) {
      clusters.push(cluster);
      cluster = [];
      clusterEnd = -1;
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMinutes);
  }
  if (cluster.length) clusters.push(cluster);
  clusters.forEach((items, clusterId) => {
    items.forEach((item) => { item.clusterId = clusterId; });
    layoutCluster(items);
  });
  return sorted;
}

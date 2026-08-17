export type TimelineItem = { starts_on: string | null; target_date: string };
export type TimelineTrackRange = { start_date: string | null; end_date: string | null };
export type TimelineDomain = { start: Date; end: Date };

const planningHorizon = new Date("2027-12-01T00:00:00Z");

export function monthStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

export function addMonths(value: Date, months: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
}

export function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

export function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function daysInMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
}

export function monthCount(domain: TimelineDomain) {
  return (domain.end.getUTCFullYear() - domain.start.getUTCFullYear()) * 12 + domain.end.getUTCMonth() - domain.start.getUTCMonth() + 1;
}

export function getTimelineDomain(
  now: Date,
  items: TimelineItem[],
  ranges: TimelineTrackRange[] = [],
): TimelineDomain {
  const current = monthStart(now);
  const latestMilestone = items.reduce<Date>((max, item) => {
    const date = parseDate(item.target_date);
    return date > max ? date : max;
  }, planningHorizon);
  const latest = ranges.reduce<Date>((max, range) => {
    const dateKey = range.end_date ?? range.start_date;
    if (!dateKey) return max;
    const date = parseDate(dateKey);
    return date > max ? date : max;
  }, latestMilestone);
  return { start: addMonths(current, -36), end: addMonths(monthStart(latest), 36) };
}

export function timelineMonths(domain: TimelineDomain) {
  return Array.from({ length: monthCount(domain) }, (_, index) => addMonths(domain.start, index));
}

/** Pixel x for a calendar date. This deliberately has no fixed range or clamp. */
export function dateToX(date: string, domain: TimelineDomain, monthWidth: number) {
  const value = parseDate(date);
  const monthIndex = (value.getUTCFullYear() - domain.start.getUTCFullYear()) * 12 + value.getUTCMonth() - domain.start.getUTCMonth();
  return monthIndex * monthWidth + ((value.getUTCDate() - 1) / daysInMonth(value)) * monthWidth;
}

export function xToDate(x: number, domain: TimelineDomain, monthWidth: number) {
  const index = Math.max(0, Math.min(monthCount(domain) - 1, Math.floor(x / monthWidth)));
  const month = addMonths(domain.start, index);
  const proportion = Math.max(0, Math.min(0.999, (x - index * monthWidth) / monthWidth));
  const day = Math.max(1, Math.min(daysInMonth(month), Math.floor(proportion * daysInMonth(month) + 1e-7) + 1));
  return formatDate(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day)));
}

export function dateDiffDays(start: string, end: string) {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000);
}

export function addDays(date: string, days: number) {
  const value = parseDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return formatDate(value);
}

/** starts_on is the explicit switch between point and duration rendering. */
export function isDuration(item: TimelineItem) {
  return item.starts_on !== null;
}

export type VisibleItemGeometry = {
  intersectsViewport: boolean;
  clippedLeft: boolean;
  clippedRight: boolean;
};

/** Display-only clipping; stored dates are never changed. */
export function getVisibleItemGeometry({ itemStart, itemEnd, viewportStart, viewportEnd }: {
  itemStart: string;
  itemEnd: string;
  viewportStart: string;
  viewportEnd: string;
}): VisibleItemGeometry {
  const intersectsViewport = itemStart <= viewportEnd && itemEnd >= viewportStart;
  return {
    intersectsViewport,
    clippedLeft: intersectsViewport && itemStart < viewportStart,
    clippedRight: intersectsViewport && itemEnd > viewportEnd,
  };
}

export function getDurationLabelPosition({ barLeft, barRight, viewportLeft, viewportRight, padding = 7 }: {
  barLeft: number;
  barRight: number;
  viewportLeft: number;
  viewportRight: number;
  padding?: number;
}) {
  const visibleLeft = Math.max(barLeft, viewportLeft);
  const visibleRight = Math.min(barRight, viewportRight);
  if (visibleRight <= visibleLeft) return { intersectsViewport: false, left: 0, maxWidth: 0 };
  const labelLeft = Math.min(Math.max(visibleLeft + padding, barLeft + padding), Math.max(barLeft + padding, barRight - padding));
  return {
    intersectsViewport: true,
    left: labelLeft - barLeft,
    maxWidth: Math.max(0, visibleRight - labelLeft - padding),
  };
}

export type TimelineObstacle = { left: number; right: number };

/**
 * A point milestone has no time width, but its title does. Keep its label in
 * the same compact lane and choose the side with enough real pixel space
 * before a neighbouring duration bar, rather than letting the title cover it.
 */
export function getPointLabelPlacement({ pointX, desiredWidth, obstacles, timelineWidth, gap = 12 }: {
  pointX: number;
  desiredWidth: number;
  obstacles: TimelineObstacle[];
  timelineWidth: number;
  gap?: number;
}) {
  const leftObstacle = obstacles.reduce((closest, obstacle) => obstacle.right <= pointX && obstacle.right > closest ? obstacle.right : closest, 0);
  const rightObstacle = obstacles.reduce((closest, obstacle) => obstacle.left >= pointX && obstacle.left < closest ? obstacle.left : closest, timelineWidth);
  const leftSpace = Math.max(0, pointX - leftObstacle - gap);
  const rightSpace = Math.max(0, rightObstacle - pointX - gap);
  if (rightSpace >= desiredWidth) return { side: "right" as const, width: desiredWidth };
  if (leftSpace >= desiredWidth) return { side: "left" as const, width: desiredWidth };
  return leftSpace > rightSpace
    ? { side: "left" as const, width: leftSpace }
    : { side: "right" as const, width: rightSpace };
}

/** Track phases remain a separate, higher-level background range. */
export function trackRangeGeometry(range: TimelineTrackRange, domain: TimelineDomain, monthWidth: number) {
  if (!range.start_date || !range.end_date) return null;
  const left = dateToX(range.start_date, domain, monthWidth);
  const right = dateToX(range.end_date, domain, monthWidth);
  return { left, width: Math.max(4, right - left + 4) };
}

/** First-fit interval packing prevents points and duration bars from covering each other. */
export function packTimelineItems<T extends { id: string; starts_on: string | null; target_date: string }>(items: T[]) {
  const rows: T[][] = [];
  for (const item of [...items].sort((a, b) => (a.starts_on ?? a.target_date).localeCompare(b.starts_on ?? b.target_date))) {
    const start = item.starts_on ?? item.target_date;
    let row = rows.find((candidate) => {
      const last = candidate.at(-1);
      return !last || last.target_date < start;
    });
    if (!row) {
      row = [];
      rows.push(row);
    }
    row.push(item);
  }
  return rows;
}

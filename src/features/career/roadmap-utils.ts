export type TimelineItem = { starts_on: string | null; target_date: string };
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

export function getTimelineDomain(now: Date, items: TimelineItem[]): TimelineDomain {
  const current = monthStart(now);
  const latest = items.reduce<Date>((max, item) => {
    const date = parseDate(item.target_date);
    return date > max ? date : max;
  }, planningHorizon);
  return {
    start: addMonths(current, -36),
    end: addMonths(monthStart(latest), 36),
  };
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

export function isDuration(item: TimelineItem) {
  return Boolean(item.starts_on && item.starts_on !== item.target_date);
}

export type VisibleItemGeometry = {
  intersectsViewport: boolean;
  clippedLeft: boolean;
  clippedRight: boolean;
  visibleStart: string | null;
  visibleEnd: string | null;
};

/**
 * Calculates display-only clipping. The returned dates never replace a
 * milestone's stored starts_on or target_date.
 */
export function getVisibleItemGeometry({ itemStart, itemEnd, viewportStart, viewportEnd }: {
  itemStart: string;
  itemEnd: string;
  viewportStart: string;
  viewportEnd: string;
}): VisibleItemGeometry {
  const intersectsViewport = itemStart <= viewportEnd && itemEnd >= viewportStart;
  if (!intersectsViewport) return { intersectsViewport: false, clippedLeft: false, clippedRight: false, visibleStart: null, visibleEnd: null };
  return {
    intersectsViewport: true,
    clippedLeft: itemStart < viewportStart,
    clippedRight: itemEnd > viewportEnd,
    visibleStart: itemStart < viewportStart ? viewportStart : itemStart,
    visibleEnd: itemEnd > viewportEnd ? viewportEnd : itemEnd,
  };
}

/** Positions an in-bar label within the visible part of its real pixel range. */
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

export function timelineCardRange(item: TimelineItem) {
  return { left: 0, width: 0, isPoint: !isDuration(item) };
}

export function timelineDateLabel(item: TimelineItem) {
  return isDuration(item) ? `${item.starts_on!.slice(5)} — ${item.target_date.slice(5)}` : item.target_date.slice(5);
}

type Interval = { id: string; starts_on: string | null; target_date: string };

/** First-fit interval packing prevents overlapping work from covering each other. */
export function packIntervals<T extends Interval>(items: T[]) {
  const rows: T[][] = [];
  const sorted = [...items].sort((a, b) => (a.starts_on ?? a.target_date).localeCompare(b.starts_on ?? b.target_date));
  for (const item of sorted) {
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

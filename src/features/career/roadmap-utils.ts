export type TimelineItem = { target_date: string };
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

/** Milestones are points. Only track phases own a start/end range. */
export function trackRangeGeometry(range: TimelineTrackRange, domain: TimelineDomain, monthWidth: number) {
  if (!range.start_date || !range.end_date) return null;
  const left = dateToX(range.start_date, domain, monthWidth);
  const right = dateToX(range.end_date, domain, monthWidth);
  return { left, width: Math.max(4, right - left + 4) };
}

/** First-fit packing keeps point labels on the same date from covering each other. */
export function packMilestonePoints<T extends { id: string; target_date: string }>(items: T[]) {
  const rows: T[][] = [];
  for (const item of [...items].sort((a, b) => a.target_date.localeCompare(b.target_date))) {
    let row = rows.find((candidate) => candidate.at(-1)?.target_date !== item.target_date);
    if (!row) {
      row = [];
      rows.push(row);
    }
    row.push(item);
  }
  return rows;
}

const timelineStart = new Date("2026-08-01T00:00:00+08:00").getTime();
const timelineEnd = new Date("2027-12-31T23:59:59+08:00").getTime();

function ratio(date: string) {
  const value = new Date(`${date}T12:00:00+08:00`).getTime();
  return Math.max(0, Math.min(100, ((value - timelineStart) / (timelineEnd - timelineStart)) * 100));
}

/** Keep point milestones readable without allowing a card to escape the grid. */
export function timelineCardRange(item: { starts_on: string | null; target_date: string }) {
  const start = ratio(item.starts_on ?? item.target_date);
  const end = Math.max(start, ratio(item.target_date));
  const minimumWidth = 11.2;
  const width = Math.min(100, Math.max(minimumWidth, end - start));
  return {
    left: Math.max(0, Math.min(100 - width, start)),
    width,
    isPoint: !item.starts_on || item.starts_on === item.target_date,
  };
}

export function timelineDateLabel(item: { starts_on: string | null; target_date: string }) {
  return item.starts_on ? `${item.starts_on.slice(5)} — ${item.target_date.slice(5)}` : item.target_date.slice(5);
}

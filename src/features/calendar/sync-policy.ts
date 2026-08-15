/**
 * 历史回看窗口：Outlook 保留多年日程，本地镜像此前只同步最近 30 天，更早的日程
 * 永远进不了镜像、日历里看不到。同步统一走非 delta 的 calendarView 全量读（delta
 * 会精简循环日程的 occurrence 字段），2 年（730 天）回看 + 180 天未来完全在
 * calendarView 支持范围内。
 */
export const CALENDAR_HISTORY_DAYS = 730;
export const CALENDAR_FORWARD_DAYS = 180;

export function calendarSyncWindow(now: number) {
  const start = new Date(now - CALENDAR_HISTORY_DAYS * 86_400_000).toISOString();
  const end = new Date(now + CALENDAR_FORWARD_DAYS * 86_400_000).toISOString();
  return { start, end };
}

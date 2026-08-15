export type CalendarSyncTrigger = "manual" | "scheduled";

/**
 * Delta sync is ideal for routine background reconciliation. A manual sync
 * is an explicit request to rebuild the local Outlook mirror and therefore
 * must include unchanged historical events as well.
 */
export function calendarSyncOptions(trigger: CalendarSyncTrigger) {
  return { forceFull: trigger === "manual" };
}

/**
 * 历史回看窗口：Outlook 保留多年日程，本地镜像此前只同步最近 30 天，更早的日程
 * 永远进不了镜像、日历里看不到。calendarView/delta 单次窗口最长约 100 年，
 * 2 年（730 天）回看 + 180 天未来完全在安全范围内。
 */
export const CALENDAR_HISTORY_DAYS = 730;
export const CALENDAR_FORWARD_DAYS = 180;

export function calendarSyncWindow(now: number) {
  const start = new Date(now - CALENDAR_HISTORY_DAYS * 86_400_000).toISOString();
  const end = new Date(now + CALENDAR_FORWARD_DAYS * 86_400_000).toISOString();
  return { start, end };
}

type StoredSyncWindow = {
  calendar_delta_link: string | null;
  calendar_sync_window_start: string | null;
  calendar_sync_window_end: string | null;
};

/**
 * 判断是否沿用 delta 增量同步。除了常规约束（delta 链接存在、窗口未过期），还要求
 * 已存窗口起点已覆盖历史回看起点（storedStart ≤ defaultStart）。
 *
 * 这保证部署「2 年历史窗口」后的第一次同步（无论手动或定时）会走全量：把历史日程
 * 补进镜像、并把 storedStart/storedEnd 更新为新的 2 年窗口、重建 delta 链接。
 * 此后 storedStart 固定为「全量时刻 − 730 天」，随 now 推进恒满足 storedStart ≤
 * now − 730d（因为全量时刻总在过去），于是恢复增量同步，不会反复全量。
 */
export function shouldUseCalendarDelta(connection: StoredSyncWindow, now: number, defaultStart: string, forceFull: boolean) {
  if (forceFull) return false;
  if (!connection.calendar_delta_link || !connection.calendar_sync_window_start || !connection.calendar_sync_window_end) return false;
  if (Date.parse(connection.calendar_sync_window_end) <= now + 30 * 86_400_000) return false;
  if (Date.parse(connection.calendar_sync_window_start) > Date.parse(defaultStart)) return false;
  return true;
}

/**
 * deltaLink 会编码创建时的查询参数。增量响应依赖其中 $select 指定的事件字段：
 * - 历史曾不带 $select 创建过光标 → subject/categories 等字段全缺；
 * - 即便带了 $select，若不含 type/seriesMasterId，循环日程无法拼回 master，
 *   其 occurrence 的 subject 仍会是空。
 * 只要字段契约不完整就放弃增量、走全量重建，让新光标带上完整字段。
 */
export function deltaLinkCarriesEventFields(deltaLink: string | null | undefined) {
  if (!deltaLink) return false;
  return decodeURIComponent(deltaLink).includes("seriesMasterId");
}

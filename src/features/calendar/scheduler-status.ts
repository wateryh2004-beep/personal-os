export type CalendarSchedulerRun = { trigger_source: string; completed_at: string | null; next_scheduled_at: string | null; failed_count: number; error_code: string | null };

/** A computed due time is not evidence that a scheduler exists. */
export function calendarSchedulerStatus(runs: CalendarSchedulerRun[], now = Date.now()) {
  const successful = runs.filter((run) => run.completed_at && !run.failed_count && !run.error_code);
  const hourly = successful.find((run) => run.trigger_source === "external_scheduler" && now - Date.parse(run.completed_at!) <= 2 * 3600_000);
  const daily = successful.find((run) => run.trigger_source === "scheduled" && now - Date.parse(run.completed_at!) <= 26 * 3600_000);
  return {
    backgroundSyncLabel: hourly ? "后台每小时同步" : daily ? "后台每日同步" : "尚未验证后台调度",
    nextHourlyAt: hourly?.next_scheduled_at ?? null,
    nextBackgroundAt: (hourly ?? daily)?.next_scheduled_at ?? null,
    freshnessWindowMs: hourly ? 2 * 3600_000 : daily ? 26 * 3600_000 : 3600_000,
  };
}

/** Next configured 23:00 UTC trigger; Hobby may execute within the next hour. */
export function nextDailyCalendarSync(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(23, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

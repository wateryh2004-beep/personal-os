import Link from "next/link";
import { CalendarDays } from "lucide-react";
import type { NowWorkspace } from "@/features/today/types";
import { buildTodaySchedule } from "@/features/today/utils";
import { TodaySectionHeader } from "./section-header";

function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function TodaySchedule({ workspace }: { workspace: NowWorkspace }) {
  const schedule = buildTodaySchedule(workspace.calendar.today);

  return (
    <section aria-labelledby="today-schedule-heading">
      <TodaySectionHeader href="/calendar" label="打开 Calendar">
        <span id="today-schedule-heading">今日日程</span>
      </TodaySectionHeader>
      {workspace.availability.calendar === "unavailable" ? (
        <p className="py-6 text-sm text-[var(--text-secondary)]">
          Calendar 暂不可用。数据恢复后这里会自动显示日程。
        </p>
      ) : !workspace.calendar.today.length ? (
        <div className="flex items-center gap-2 py-6 text-sm text-[var(--text-secondary)]">
          <CalendarDays className="size-4 text-[var(--text-tertiary)]" aria-hidden="true" />
          今天没有固定日程
        </div>
      ) : (
        <div className="pt-2">
          {schedule.allDay.length ? (
            <div className="border-b py-2">
              {schedule.allDay.map((event) => (
                <Link
                  key={event.id}
                  href="/calendar"
                  className="grid grid-cols-[52px_minmax(0,1fr)] gap-3 rounded-[var(--radius-sm)] px-1 py-1.5 hover:bg-[var(--surface-hover)]"
                >
                  <span className="text-xs text-[var(--text-tertiary)]">全天</span>
                  <span className="truncate text-sm font-medium">
                    {event.subject || "未命名日程"}
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
          <ol className="relative ml-[58px] border-l py-1">
            {schedule.timed.map((event) => (
              <li key={event.id} className="relative">
                <span className="absolute -left-[63px] top-3 w-12 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                  {formatTime(event.starts_at, workspace.timezone)}
                </span>
                <span className="absolute -left-[4.5px] top-[17px] size-2 rounded-full border border-[var(--accent)] bg-[var(--surface-canvas)]" />
                <Link
                  href="/calendar"
                  className="ml-3 block rounded-[var(--radius-sm)] px-2 py-2 hover:bg-[var(--surface-hover)]"
                >
                  <span className="block truncate text-sm font-medium">
                    {event.subject || "未命名日程"}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--text-secondary)]">
                    至 {formatTime(event.ends_at, workspace.timezone)}
                    {event.location_name ? ` · ${event.location_name}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          {schedule.hiddenCount ? (
            <Link
              href="/calendar"
              className="mt-1 inline-flex text-xs text-[var(--accent)] hover:underline"
            >
              还有 {schedule.hiddenCount} 项日程
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}

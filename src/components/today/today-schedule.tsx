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
      <TodaySectionHeader href="/calendar" label="日历">
        <span id="today-schedule-heading">今日日程</span>
      </TodaySectionHeader>

      <div className="mt-2.5 border-t border-[var(--separator)] pt-2.5">
        {workspace.availability.calendar === "unavailable" ? (
          <p className="py-5 text-[12px] text-[var(--text-secondary)]">
            Calendar 暂不可用。数据恢复后这里会自动显示日程。
          </p>
        ) : !workspace.calendar.today.length ? (
          <div className="flex items-center gap-2 py-5 text-[12px] text-[var(--text-secondary)]">
            <CalendarDays className="size-3.5 text-[var(--text-tertiary)]" aria-hidden="true" />
            今天没有固定日程
          </div>
        ) : (
          <>
            {schedule.allDay.length ? (
              <div className="mb-2 border-b border-[var(--separator)] pb-2">
                {schedule.allDay.map((event) => (
                  <Link
                    key={event.id}
                    href="/calendar"
                    className="grid grid-cols-[52px_minmax(0,1fr)] gap-2.5 py-1.5 text-[11.5px] transition-colors ui-transition hover:text-[var(--accent)]"
                  >
                    <span className="text-[10.5px] text-[var(--text-tertiary)]">全天</span>
                    <span className="truncate font-medium text-[var(--text-primary)]">{event.subject || "未命名日程"}</span>
                  </Link>
                ))}
              </div>
            ) : null}

            <ol className="relative ml-[58px] border-l border-[var(--separator-strong)] py-0.5">
              {schedule.timed.map((event) => (
                <li key={event.id} className="relative min-h-[46px] py-1.5">
                  <span className="absolute -left-[63px] top-2.5 w-[48px] text-right text-[10.5px] tabular-nums text-[var(--text-tertiary)]">
                    {formatTime(event.starts_at, workspace.timezone)}
                  </span>
                  <span className="absolute -left-[3.5px] top-[14px] size-[6px] rounded-full bg-[var(--accent)] ring-[3px] ring-[var(--surface-canvas)]" />
                  <Link href="/calendar" className="ml-3.5 block min-w-0 group">
                    <span className="block truncate text-[12.5px] font-medium text-[var(--text-primary)] transition-colors ui-transition group-hover:text-[var(--accent)]">
                      {event.subject || "未命名日程"}
                    </span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-[var(--text-secondary)]">
                      至 {formatTime(event.ends_at, workspace.timezone)}
                      {event.location_name ? ` · ${event.location_name}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>

            {schedule.hiddenCount ? (
              <Link href="/calendar" className="mt-2 inline-flex text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[var(--accent)]">
                还有 {schedule.hiddenCount} 项日程
              </Link>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

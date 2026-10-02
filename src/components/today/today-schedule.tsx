import { eventRecordHref } from "@/features/today/record-links";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import type { NowWorkspace } from "@/features/today/types";
import { todaySchedulePresentation } from "@/features/today/presentation";
import { TodaySectionHeader } from "./section-header";
import { CommitmentActions } from "./today-commitments";

function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function TodaySchedule({ workspace }: { workspace: NowWorkspace }) {
  const schedule = todaySchedulePresentation(workspace);
  const eventReminders = new Map(workspace.commitments.filter((item) => item.kind === "event").map((item) => [item.source.entityId, item]));

  return (
    <section aria-labelledby="today-schedule-heading" className="min-w-0">
      <TodaySectionHeader href="/calendar" label="日历">
        <span id="today-schedule-heading">{schedule.nextEvent ? "接下来" : "今日日程"}</span>
      </TodaySectionHeader>

      <div className="mt-2 border-t border-[var(--separator)] pt-2">
        {workspace.availability.calendar === "unavailable" ? (
          <p className="py-3 text-[13px] leading-[22px] text-[var(--text-secondary)]">
            Calendar 暂不可用。数据恢复后这里会自动显示日程。
          </p>
        ) : !workspace.calendar.today.length ? (
          <div className="flex items-center gap-2 py-3 text-[13px] leading-[22px] text-[var(--text-secondary)]">
            <CalendarDays className="size-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
            今天没有固定日程
          </div>
        ) : (
          <>
            {schedule.allDay.length ? (
              <div className="mb-2 border-b border-[var(--separator)] pb-2">
                {schedule.allDay.map((event) => (
                  <Link
                    key={event.id}
                    href={eventRecordHref(event.id)}
                    className="grid grid-cols-[52px_minmax(0,1fr)] gap-2.5 py-1.5 text-[13px] transition-colors ui-transition hover:text-[var(--accent)]"
                  >
                    <span className="text-[12px] text-[var(--text-tertiary)]">全天</span>
                    <span className="truncate font-medium text-[var(--text-primary)]">{event.subject || "未命名日程"}</span>
                  </Link>
                ))}
              </div>
            ) : null}

            <ol className="relative ml-[58px] border-l border-[var(--separator-strong)] py-0.5">
              {schedule.timed.map((event) => (
                <li key={event.id} className="relative min-h-[46px] py-1.5">
                  <span className="absolute -left-[63px] top-2.5 w-[48px] text-right text-[12px] tabular-nums text-[var(--text-tertiary)]">
                    {formatTime(event.starts_at, workspace.timezone)}
                  </span>
                  <span className="absolute -left-[3.5px] top-[14px] size-[6px] rounded-full bg-[var(--accent)] ring-[3px] ring-[var(--surface-canvas)]" />
                  <Link href={eventRecordHref(event.id)} className="ml-3.5 block min-w-0 group">
                    <span className="block truncate text-[14px] font-medium text-[var(--text-primary)] transition-colors ui-transition group-hover:text-[var(--accent)]">
                      {event.subject || "未命名日程"}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-[var(--text-secondary)]">
                      至 {formatTime(event.ends_at, workspace.timezone)}
                      {event.location_name ? ` · ${event.location_name}` : ""}
                    </span>
                  </Link>
                  {eventReminders.has(event.id) ? <div className="ml-3.5 mt-1"><span className="text-[12px] text-[var(--accent)]">{eventReminders.get(event.id)!.whyNow}</span><CommitmentActions item={eventReminders.get(event.id)!} timezone={workspace.timezone} /></div> : null}
                </li>
              ))}
            </ol>

            {schedule.hiddenCount ? (
              <Link href="/calendar" className="mt-2 inline-flex text-[12px] font-medium text-[var(--text-tertiary)] hover:text-[var(--accent)]">
                查看全天 {workspace.calendar.today.length} 项日程
              </Link>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

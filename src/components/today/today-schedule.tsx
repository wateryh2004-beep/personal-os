import { eventRecordHref } from "@/features/today/record-links";
import Link from "next/link";
import type { NowCalendarEvent, NowWorkspace } from "@/features/today/types";
import { todaySchedulePresentation } from "@/features/today/presentation";
import { TodaySectionHeader } from "./section-header";
import { CommitmentActions } from "./today-commitments";

function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}

export function TodaySchedule({ workspace }: { workspace: NowWorkspace }) {
  const schedule = todaySchedulePresentation(workspace);
  const reminders = new Map(workspace.commitments.filter((item) => item.kind === "event").map((item) => [item.source.entityId, item]));
  function eventRow(event: NowCalendarEvent, past = false) {
    const reminder = reminders.get(event.id);
    return <li key={event.id} className={`grid grid-cols-[48px_minmax(0,1fr)] gap-3 py-3 ${past ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"}`}>
      <span className="pt-0.5 text-[13px] tabular-nums text-[var(--text-secondary)]">{event.is_all_day ? "全天" : formatTime(event.starts_at, workspace.timezone)}</span>
      <div className="min-w-0">
        <Link href={eventRecordHref(event.id)} className="block min-h-11 hover:text-[var(--accent)]">
          <span className="line-clamp-2 text-[16px] font-medium leading-6">{event.subject || "未命名日程"}</span>
          {!event.is_all_day || event.location_name ? <span className="mt-1 line-clamp-1 text-[13px] leading-5 text-[var(--text-secondary)]">{!event.is_all_day ? `至 ${formatTime(event.ends_at, workspace.timezone)}` : ""}{event.location_name ? `${!event.is_all_day ? " · " : ""}${event.location_name}` : ""}</span> : null}
        </Link>
        {reminder && !past ? <details className="mt-1"><summary className="min-h-11 cursor-pointer py-2.5 text-[13px] text-[var(--text-secondary)]">更多操作</summary><CommitmentActions item={reminder} timezone={workspace.timezone} /></details> : null}
      </div>
    </li>;
  }
  const remaining = [...schedule.allDay, ...schedule.timed];
  return <section aria-labelledby="today-schedule-heading" className="min-w-0">
    <TodaySectionHeader href="/calendar" label="日历"><span id="today-schedule-heading">今日日程</span></TodaySectionHeader>
    {workspace.availability.calendar === "unavailable" ? <p className="py-3 text-[14px] leading-6 text-[var(--text-secondary)]">日程暂不可用，恢复后会自动更新。</p> : <>
      {remaining.length ? <ol className="divide-y divide-[var(--separator)]">{remaining.map((event) => eventRow(event))}</ol> : <p className="py-3 text-[14px] leading-6 text-[var(--text-secondary)]">{schedule.past.length ? "今天的日程已结束" : "今天没有固定日程"}</p>}
      {schedule.past.length ? <details className="mt-1"><summary className="min-h-11 cursor-pointer py-2.5 text-[13px] text-[var(--text-secondary)]">已结束 {schedule.past.length} 项</summary><ol className="divide-y divide-[var(--separator)]">{schedule.past.map((event) => eventRow(event, true))}</ol></details> : null}
      {schedule.hiddenCount > 0 ? <Link href="/calendar" className="inline-flex min-h-11 items-center text-[13px] text-[var(--accent)]">查看其余 {schedule.hiddenCount} 项日程 →</Link> : null}
    </>}
  </section>;
}

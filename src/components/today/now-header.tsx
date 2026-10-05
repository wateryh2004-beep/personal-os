import type { NowWorkspace } from "@/features/today/types";
import { formatTodayDate } from "@/features/today/utils";

export function NowHeader({ workspace }: { workspace: NowWorkspace }) {
  const dateLabel = workspace.generatedAt ? formatTodayDate(new Date(workspace.generatedAt), workspace.timezone) : workspace.focus?.date ? formatTodayDate(new Date(`${workspace.focus.date}T12:00:00Z`), "UTC") : "今日概览";
  return <header className="flex items-end justify-between gap-4">
    <div>
      <p className="text-[13px] leading-5 text-[var(--text-secondary)]">{dateLabel}</p>
      <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.025em] sm:text-[32px]">今天</h1>
    </div>
    <p className="pb-0.5 text-right text-[13px] leading-5 text-[var(--text-secondary)]">
      {workspace.availability.calendar === "ready" ? `${workspace.summary.todayEventCount} 项日程` : "日程待更新"}
      {workspace.summary.todayTaskCount > 0 ? <span className="block sm:ml-2 sm:inline">{workspace.summary.todayTaskCount} 项今日待办</span> : null}
      {workspace.tasks.overdue.length > 0 ? <span className="block text-[var(--danger)]">{workspace.tasks.overdue.length} 项逾期</span> : null}
    </p>
  </header>;
}

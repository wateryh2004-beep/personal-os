import type { NowWorkspace } from "@/features/today/types";
import { formatTodayDate } from "@/features/today/utils";

export function NowHeader({ workspace }: { workspace: NowWorkspace }) {
  const snapshot = workspace.generatedAt ? new Date(workspace.generatedAt) : workspace.focus?.date ? new Date(`${workspace.focus.date}T12:00:00Z`) : null;
  const date = snapshot && Number.isFinite(snapshot.getTime()) ? snapshot : null;
  const timezone = workspace.generatedAt ? workspace.timezone : "UTC";
  const dateLabel = date ? formatTodayDate(date, timezone) : "今日概览";
  const day = date ? new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, day: "2-digit" }).format(date).replace("日", "") : null;
  const month = date ? new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, month: "long" }).format(date) : null;
  const weekday = date ? new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, weekday: "long" }).format(date) : null;
  return <header className="today-header">
    {day ? <div className="today-calendar-mark" aria-hidden="true"><span className="today-calendar-day">{day}</span><span className="today-calendar-caption">{month}<span>{weekday}</span></span></div> : null}
    <div className="today-header-copy"><p className="today-date">{dateLabel}</p><h1 className="today-title">今天</h1></div>
  </header>;
}

import type { NowWorkspace } from "@/features/today/types";
import { formatTodayDate } from "@/features/today/utils";

export function NowHeader({ workspace }: { workspace: NowWorkspace }) {
  const dateLabel = workspace.generatedAt ? formatTodayDate(new Date(workspace.generatedAt), workspace.timezone) : workspace.focus?.date ? formatTodayDate(new Date(`${workspace.focus.date}T12:00:00Z`), "UTC") : "今日概览";
  return <header className="today-header"><p className="today-date">{dateLabel}</p><h1 className="today-title">今天</h1></header>;
}

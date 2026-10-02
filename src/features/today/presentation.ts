import { getDateKeyInTimeZone } from "@/lib/date-keys";
import type { NowTask, NowWorkspace } from "./types";
import { buildTodaySchedule } from "./utils";

export function todaySchedulePresentation(workspace: NowWorkspace) {
  const nextEvent = workspace.nextAction.kind === "event" ? workspace.nextAction.event : null;
  const remaining = nextEvent ? workspace.calendar.today.filter((event) => event.is_all_day || event.starts_at >= nextEvent.starts_at) : workspace.calendar.today;
  const schedule = buildTodaySchedule(remaining);
  return { ...schedule, nextEvent, hiddenCount: workspace.calendar.today.length - schedule.allDay.length - schedule.timed.length };
}

/** Assign a single primary action surface to each task without changing selection. */
export function todayPresentation(workspace: NowWorkspace) {
  const selected = new Set(workspace.focus?.selectedIds ?? []);
  const schedule = todaySchedulePresentation(workspace);
  const scheduledIds = new Set([...schedule.allDay, ...schedule.timed].map((event) => event.id));
  const priorityReminderCount = workspace.commitments.filter((item) => item.kind === "task" && selected.has(item.task?.id ?? item.source.entityId ?? "")).length;
  const commitments = workspace.commitments.filter((item) => {
    if (item.kind === "task") return !selected.has(item.task?.id ?? item.source.entityId ?? "");
    if (item.kind === "event") return !scheduledIds.has(item.source.entityId ?? "");
    return true;
  });
  const scheduleReminderCount = workspace.commitments.filter((item) => item.kind === "event" && scheduledIds.has(item.source.entityId ?? "")).length;
  const ownedTaskIds = new Set(selected);
  commitments.forEach((item) => { if (item.kind === "task" && item.task) ownedTaskIds.add(item.task.id); });
  const ownedHrefs = new Set(workspace.commitments.map((item) => item.href));
  return {
    commitments,
    priorityReminderCount,
    scheduleReminderCount,
    remainingWorkspace: {
      ...workspace,
      tasks: {
        ...workspace.tasks,
        overdue: workspace.tasks.overdue.filter((task) => !ownedTaskIds.has(task.id)),
        today: workspace.tasks.today.filter((task) => !ownedTaskIds.has(task.id)),
      },
      attention: workspace.attention.filter((item) => !ownedHrefs.has(item.href) && !(item.kind === "task_overdue" && workspace.tasks.overdue.length > 0)),
    },
  };
}

export function priorityDueLabel(task: NowTask, today: string, timezone: string) {
  if (task.status === "completed") return "今天已完成";
  if (!task.due_at) return "无截止日期";
  const due = getDateKeyInTimeZone(task.due_at, timezone);
  if (!due) return "已设截止时间";
  if (due < today) return `已逾期 · ${due.slice(5).replace("-", "/")}`;
  if (due === today) return "今天到期";
  return `${due.slice(5).replace("-", "/")} 到期`;
}

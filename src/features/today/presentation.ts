import { getDateKeyInTimeZone } from "@/lib/date-keys";
import type { NowCalendarEvent, NowTask, NowWorkspace } from "./types";
import { buildTodaySchedule } from "./utils";

export type TodaySchedulePresentation = {
  allDay: NowCalendarEvent[];
  /** Today's ongoing and upcoming timed events, bounded with all-day rows. */
  timed: NowCalendarEvent[];
  /** Ended timed events, available separately without consuming the row limit. */
  past: NowCalendarEvent[];
  nextEvent: NowCalendarEvent | null;
  /** Rows omitted from the visible schedule, excluding the separately shown past. */
  hiddenCount: number;
};

const SCHEDULE_LIMIT = 6;
const sortTimed = (left: NowCalendarEvent, right: NowCalendarEvent) =>
  Date.parse(left.starts_at) - Date.parse(right.starts_at) || left.id.localeCompare(right.id);

export function todaySchedulePresentation(workspace: NowWorkspace): TodaySchedulePresentation {
  const snapshot = workspace.generatedAt ? Date.parse(workspace.generatedAt) : NaN;
  if (!Number.isFinite(snapshot)) {
    // Older workspaces have no clock snapshot. Preserve their visible rows, but
    // never let a next action on another day act as today's timeline cutoff.
    const action = workspace.nextAction;
    const nextEvent = action.kind === "event"
      ? workspace.calendar.today.find((event) => event.id === action.event.id && !event.is_all_day) ?? null
      : null;
    const remaining = nextEvent
      ? workspace.calendar.today.filter((event) => event.is_all_day || event.starts_at >= nextEvent.starts_at)
      : workspace.calendar.today;
    const schedule = buildTodaySchedule(remaining, SCHEDULE_LIMIT);
    return { ...schedule, past: [], nextEvent, hiddenCount: workspace.calendar.today.length - schedule.allDay.length - schedule.timed.length };
  }

  const today = getDateKeyInTimeZone(new Date(snapshot), workspace.timezone)!;
  const todayEvents = workspace.calendar.today.filter((event) => {
    const starts = Date.parse(event.starts_at);
    const ends = Date.parse(event.ends_at);
    if (!Number.isFinite(starts) || !Number.isFinite(ends)) return false;
    const firstDay = getDateKeyInTimeZone(event.starts_at, workspace.timezone)!;
    // Calendar end times are exclusive: an event ending at midnight belongs
    // to the preceding day, while an overnight event still belongs to today.
    const lastDay = getDateKeyInTimeZone(new Date(Math.max(starts, ends - 1)), workspace.timezone)!;
    return firstDay <= today && lastDay >= today;
  });
  const allDay = todayEvents.filter((event) => event.is_all_day)
    .sort((left, right) => left.subject.localeCompare(right.subject, "zh-CN") || left.id.localeCompare(right.id));
  const timed = todayEvents.filter((event) => !event.is_all_day && Date.parse(event.ends_at) > snapshot).sort(sortTimed);
  const past = todayEvents.filter((event) => !event.is_all_day && Date.parse(event.ends_at) <= snapshot).sort(sortTimed);
  const visible = [...allDay, ...timed].slice(0, SCHEDULE_LIMIT);
  return {
    allDay: visible.filter((event) => event.is_all_day),
    timed: visible.filter((event) => !event.is_all_day),
    past,
    nextEvent: timed[0] ?? null,
    hiddenCount: allDay.length + timed.length - visible.length,
  };
}

/** Assign a single primary action surface to each task without changing selection. */
export function todayPresentation(workspace: NowWorkspace) {
  const selected = new Set(workspace.focus?.selectedIds ?? []);
  const schedule = todaySchedulePresentation(workspace);
  const scheduledIds = new Set([...schedule.allDay, ...schedule.timed, ...schedule.past].map((event) => event.id));
  const priorityReminderCount = workspace.commitments.filter((item) => item.kind === "task" && selected.has(item.task?.id ?? item.source.entityId ?? "")).length;
  const commitments = workspace.commitments.filter((item) => {
    if (item.kind === "inbox") return false;
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

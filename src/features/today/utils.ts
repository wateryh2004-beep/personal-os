import type {
  NowAttentionItem,
  NowCalendarEvent,
  NowCareerMilestone,
  NowNextAction,
  NowTask,
} from "./types";
import {
  daysUntilCareerMilestone,
  selectOpenCareerMilestones,
} from "@/features/career/milestone-temporal";
import {
  addDateKeyDays,
  getDateKeyInTimeZone,
} from "@/lib/date-keys";

export { getDateKeyInTimeZone } from "@/lib/date-keys";

export type TodayTask = {
  id: string;
  title: string;
  due_at: string | null;
  importance: string | null;
  status: string;
};

export function isDueToday(value: string | null, now: Date, timeZone: string) {
  return value ? getDateKeyInTimeZone(value, timeZone) === getDateKeyInTimeZone(now, timeZone) : false;
}

export function splitTodayTasks(tasks: TodayTask[], now: Date, timeZone: string) {
  const pending = tasks.filter((task) => task.status !== "completed");
  const today = pending.filter((task) => isDueToday(task.due_at, now, timeZone));
  const upcoming = pending
    .filter((task) => !isDueToday(task.due_at, now, timeZone))
    .sort((left, right) => (left.due_at ?? "9999").localeCompare(right.due_at ?? "9999"));
  return { today, upcoming };
}

function taskScore(task: NowTask) { return task.importance === "high" ? 0 : task.importance === "normal" ? 1 : 2; }
function sortTasks(tasks: NowTask[]) { return [...tasks].sort((a, b) => taskScore(a) - taskScore(b) || (a.due_at ?? "").localeCompare(b.due_at ?? "") || a.title.localeCompare(b.title, "zh-CN")); }

export function groupNowTasks(tasks: NowTask[], now: Date, timeZone: string) {
  const todayKey = getDateKeyInTimeZone(now, timeZone);
  const horizon = addDateKeyDays(todayKey!, 7);
  const pending = tasks.filter((task) => task.status !== "completed" && task.due_at);
  return {
    overdue: sortTasks(pending.filter((task) => getDateKeyInTimeZone(task.due_at!, timeZone)! < todayKey!)),
    today: sortTasks(pending.filter((task) => getDateKeyInTimeZone(task.due_at!, timeZone) === todayKey)),
    upcoming: sortTasks(pending.filter((task) => { const date = getDateKeyInTimeZone(task.due_at!, timeZone); return Boolean(date && date > todayKey! && date <= horizon); })),
  };
}

export function eventIsToday(event: NowCalendarEvent, now: Date, timeZone: string) {
  const today = getDateKeyInTimeZone(now, timeZone);
  return getDateKeyInTimeZone(event.starts_at, timeZone)! <= today! && getDateKeyInTimeZone(event.ends_at, timeZone)! >= today!;
}

export function selectNextAction({ now, timeZone, events, tasks, milestones, inboxCount }: { now: Date; timeZone: string; events: NowCalendarEvent[]; tasks: ReturnType<typeof groupNowTasks>; milestones: NowCareerMilestone[]; inboxCount: number }) {
  const timed = events.filter((event) => !event.is_all_day).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const ongoing = timed.find((event) => new Date(event.starts_at) <= now && now < new Date(event.ends_at));
  if (ongoing) return { kind: "event" as const, event: ongoing, state: "ongoing" as const, reason: `正在进行，${new Intl.DateTimeFormat("zh-CN", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(ongoing.ends_at))}结束`, href: "/calendar" as const };
  const next = timed.find((event) => new Date(event.starts_at) > now);
  if (next && new Date(next.starts_at).getTime() - now.getTime() <= 45 * 60_000) return { kind: "event" as const, event: next, state: "starting_soon" as const, reason: `将在 ${formatRelativeDuration(new Date(next.starts_at).getTime() - now.getTime())}后开始`, href: "/calendar" as const };
  const task = tasks.overdue.find((item) => item.importance === "high") ?? tasks.overdue[0] ?? tasks.today.find((item) => item.importance === "high") ?? tasks.today[0] ?? tasks.upcoming.find((item) => item.importance === "high") ?? tasks.upcoming[0];
  if (task) { const overdue = tasks.overdue.some((item) => item.id === task.id); return { kind: "task" as const, task, reason: overdue ? "已逾期" : task.importance === "high" ? "今天到期 · 高优先级" : "今天值得推进", href: "/tasks" as const }; }
  if (next) return { kind: "event" as const, event: next, state: "upcoming" as const, reason: `距离下一项日程还有 ${formatRelativeDuration(new Date(next.starts_at).getTime() - now.getTime())}`, href: "/calendar" as const };
  const today = getDateKeyInTimeZone(now, timeZone)!;
  const milestone = selectOpenCareerMilestones(milestones, today, 7)[0];
  if (milestone) {
    const days = daysUntilCareerMilestone(milestone.target_date, today);
    return {
      kind: "career_milestone" as const,
      milestone,
      reason: days === 0 ? "这个职业节点计划在今天" : `距离职业节点还有 ${days} 天`,
      href: "/career/roadmap" as const,
    };
  }
  if (inboxCount) return { kind: "inbox" as const, count: inboxCount, reason: "Inbox 中有待整理的信息", href: "/inbox" as const };
  return { kind: "none" as const, reason: "目前没有必须处理的事项。" };
}

export function formatRelativeDuration(milliseconds: number) { const minutes = Math.max(0, Math.round(milliseconds / 60_000)); return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ""}`; }

export function formatTodayDate(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
}

export function buildTodaySchedule(events: NowCalendarEvent[], limit = 6) {
  const allDay = events
    .filter((event) => event.is_all_day)
    .sort((left, right) => left.subject.localeCompare(right.subject, "zh-CN"));
  const timed = events
    .filter((event) => !event.is_all_day)
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at));
  const visible = [...allDay, ...timed].slice(0, limit);

  return {
    allDay: visible.filter((event) => event.is_all_day),
    timed: visible.filter((event) => !event.is_all_day),
    hiddenCount: Math.max(0, events.length - visible.length),
  };
}

export function buildTodayFocusStack(
  tasks: { overdue: NowTask[]; today: NowTask[] },
  attention: NowAttentionItem[],
  nextAction: NowNextAction,
  limit = 8,
) {
  const taskRows = [
    ...tasks.overdue.map((task) => ({ task, label: "已逾期" as const })),
    ...tasks.today.map((task) => ({ task, label: "今天" as const })),
  ];
  const seenTasks = new Set<string>();
  const visibleTasks = taskRows
    .filter(({ task }) => {
      if (seenTasks.has(task.id)) return false;
      seenTasks.add(task.id);
      return true;
    })
    .slice(0, Math.min(6, limit));

  const visibleAttention = attention
    .filter((item) => !(item.kind === "task_overdue" && tasks.overdue.length > 0))
    .filter(
      (item) =>
        !(
          nextAction.kind === "event" &&
          item.kind === "calendar_upcoming" &&
          item.id === `event-${nextAction.event.id}`
        ),
    )
    .filter(
      (item) =>
        !(
          nextAction.kind === "career_milestone" &&
          item.kind === "career_milestone_approaching" &&
          item.id === `milestone-${nextAction.milestone.id}`
        ),
    )
    .slice(0, Math.max(0, limit - visibleTasks.length));

  return { tasks: visibleTasks, attention: visibleAttention };
}

export function todayAvailabilityForError(
  error: { code?: string; message?: string } | null,
) {
  if (!error || ["42P01", "PGRST205"].includes(error.code ?? "")) {
    return "ready" as const;
  }
  return "unavailable" as const;
}

export async function runTodaySideEffectSafely(
  effect: () => Promise<unknown>,
) {
  try {
    await effect();
  } catch {
    // Background reconciliation must never turn a readable Today page into an error page.
  }
}

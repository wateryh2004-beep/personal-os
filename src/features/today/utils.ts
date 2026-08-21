import type {
  NowAttentionItem,
  NowCalendarEvent,
  NowCareerMilestone,
  NowCommitment,
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

function localDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

/**
 * The Today commitment read model is deliberately deterministic: every card
 * comes from a persisted task, calendar event, career milestone, or Inbox
 * count. AI can later explain or refine this list, but cannot invent one.
 */
export function buildNowCommitments({
  now,
  timeZone,
  events,
  tasks,
  milestones,
  inboxCount,
  limit = 5,
}: {
  now: Date;
  timeZone: string;
  events: NowCalendarEvent[];
  tasks: ReturnType<typeof groupNowTasks>;
  milestones: NowCareerMilestone[];
  inboxCount: number;
  limit?: number;
}): NowCommitment[] {
  const candidates: Array<NowCommitment & { rank: number; at: string }> = [];
  const timed = events.filter((event) => !event.is_all_day).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const ongoing = timed.find((event) => new Date(event.starts_at) <= now && now < new Date(event.ends_at));
  const soon = timed.find((event) => new Date(event.starts_at) > now && new Date(event.starts_at).getTime() - now.getTime() <= 45 * 60_000);
  for (const [event, rank, whyNow] of [[ongoing, 0, "日程正在进行"], [soon, 1, "日程即将开始"]] as const) {
    if (!event) continue;
    candidates.push({
      id: `event-${event.id}`,
      kind: "event",
      title: event.subject || "未命名日程",
      whyNow,
      constraint: ongoing === event ? `至 ${localDateTime(event.ends_at, timeZone)} 结束` : `${localDateTime(event.starts_at, timeZone)} 开始`,
      href: "/calendar",
      source: { domain: "calendar", entityId: event.id, label: "Outlook Calendar" },
      rank,
      at: event.starts_at,
    });
  }
  const taskCandidates = [
    ...tasks.overdue.map((task) => ({ task, rank: task.importance === "high" ? 2 : 3, whyNow: "任务已逾期", constraint: `原截止：${localDateTime(task.due_at!, timeZone)}` })),
    ...tasks.today.map((task) => ({ task, rank: task.importance === "high" ? 4 : 5, whyNow: task.importance === "high" ? "今天到期且标为高优先级" : "任务今天到期", constraint: `截止：${localDateTime(task.due_at!, timeZone)}` })),
  ];
  for (const { task, rank, whyNow, constraint } of taskCandidates) {
    candidates.push({ id: `task-${task.id}`, kind: "task", title: task.title || "未命名任务", whyNow, constraint, href: "/tasks", source: { domain: "tasks", entityId: task.id, label: "Microsoft To Do" }, task, rank, at: task.due_at! });
  }
  const today = getDateKeyInTimeZone(now, timeZone)!;
  for (const milestone of selectOpenCareerMilestones(milestones, today, 7)) {
    const days = daysUntilCareerMilestone(milestone.target_date, today);
    candidates.push({ id: `milestone-${milestone.id}`, kind: "milestone", title: milestone.title, whyNow: days === 0 ? "职业节点计划在今天" : "职业节点临近", constraint: days === 0 ? "目标日：今天" : `目标日：${milestone.target_date}（还有 ${days} 天）`, href: "/career/roadmap", source: { domain: "career", entityId: milestone.id, label: "Career Roadmap" }, rank: 6, at: milestone.target_date });
  }
  if (inboxCount > 0) candidates.push({ id: "inbox", kind: "inbox", title: `整理 ${inboxCount} 条 Inbox`, whyNow: "Inbox 中仍有未处理的捕捉", constraint: `${inboxCount} 条待决定去向`, href: "/inbox", source: { domain: "inbox", entityId: null, label: "Inbox" }, rank: 7, at: "9999" });

  const seen = new Set<string>();
  return candidates
    .sort((a, b) => a.rank - b.rank || a.at.localeCompare(b.at) || a.title.localeCompare(b.title, "zh-CN"))
    .filter((item) => !seen.has(item.id) && (seen.add(item.id), true))
    .slice(0, Math.max(0, limit))
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      whyNow: item.whyNow,
      constraint: item.constraint,
      href: item.href,
      source: item.source,
      ...(item.task ? { task: item.task } : {}),
    }));
}

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

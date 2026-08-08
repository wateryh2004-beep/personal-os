import type { NowCalendarEvent, NowCareerMilestone, NowTask } from "./types";

export type TodayTask = {
  id: string;
  title: string;
  due_at: string | null;
  importance: string | null;
  status: string;
};

export function getDateKeyInTimeZone(value: Date | string, timeZone: string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

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
  const horizon = getDateKeyInTimeZone(new Date(now.getTime() + 7 * 86_400_000), timeZone)!;
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

export function selectNextAction({ now, events, tasks, milestones, inboxCount }: { now: Date; events: NowCalendarEvent[]; tasks: ReturnType<typeof groupNowTasks>; milestones: NowCareerMilestone[]; inboxCount: number }) {
  const timed = events.filter((event) => !event.is_all_day).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const ongoing = timed.find((event) => new Date(event.starts_at) <= now && now < new Date(event.ends_at));
  if (ongoing) return { kind: "event" as const, event: ongoing, state: "ongoing" as const, reason: `正在进行，${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(ongoing.ends_at))}结束`, href: "/calendar" as const };
  const next = timed.find((event) => new Date(event.starts_at) > now);
  if (next && new Date(next.starts_at).getTime() - now.getTime() <= 45 * 60_000) return { kind: "event" as const, event: next, state: "starting_soon" as const, reason: `将在 ${formatRelativeDuration(new Date(next.starts_at).getTime() - now.getTime())}后开始`, href: "/calendar" as const };
  const task = tasks.overdue.find((item) => item.importance === "high") ?? tasks.overdue[0] ?? tasks.today.find((item) => item.importance === "high") ?? tasks.today[0] ?? tasks.upcoming.find((item) => item.importance === "high") ?? tasks.upcoming[0];
  if (task) { const overdue = tasks.overdue.some((item) => item.id === task.id); return { kind: "task" as const, task, reason: overdue ? "已逾期" : task.importance === "high" ? "今天到期 · 高优先级" : "今天值得推进", href: "/tasks" as const }; }
  if (next) return { kind: "event" as const, event: next, state: "upcoming" as const, reason: `距离下一项日程还有 ${formatRelativeDuration(new Date(next.starts_at).getTime() - now.getTime())}`, href: "/calendar" as const };
  if (milestones[0]) return { kind: "career_milestone" as const, milestone: milestones[0], reason: `Career milestone · ${milestones[0].target_date}`, href: "/career/roadmap" as const };
  if (inboxCount) return { kind: "inbox" as const, count: inboxCount, reason: "Inbox 中有待整理的信息", href: "/inbox" as const };
  return { kind: "none" as const, reason: "目前没有必须处理的事项。" };
}

export function buildAttentionItems({ now, timeZone, tasks, milestones, inboxCount, calendarError }: { now: Date; timeZone: string; tasks: ReturnType<typeof groupNowTasks>; milestones: NowCareerMilestone[]; inboxCount: number; calendarError: string | null }) {
  const items = [] as import("./types").NowAttentionItem[];
  if (tasks.overdue.length) items.push({ id: "overdue", kind: "overdue_tasks", priority: tasks.overdue.some((task) => task.importance === "high") ? "high" : "medium", title: `${tasks.overdue.length} 项任务已经逾期`, href: "/tasks" });
  milestones.filter((milestone) => milestone.target_date <= getDateKeyInTimeZone(new Date(now.getTime() + 7 * 86_400_000), timeZone)!).forEach((milestone) => items.push({ id: `milestone-${milestone.id}`, kind: "career_milestone", priority: "medium", title: `Career · ${milestone.title}`, description: `目标日期 ${milestone.target_date}`, href: "/career/roadmap" }));
  if (inboxCount) items.push({ id: "inbox", kind: "inbox", priority: inboxCount > 5 ? "medium" : "low", title: `Inbox 中还有 ${inboxCount} 条内容未整理`, href: "/inbox" });
  if (calendarError) items.push({ id: "calendar-sync", kind: "calendar_sync", priority: "medium", title: "Calendar 数据可能未更新", description: "请检查同步状态", href: "/calendar" });
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  return items.sort((a, b) => rank[a.priority] - rank[b.priority]).slice(0, 5);
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

import type {
  NowCalendarEvent,
  NowCareerMilestone,
  NowTask,
} from "@/features/today/types";
import { getDateKeyInTimeZone } from "@/features/today/utils";
import { selectOpenCareerMilestones } from "@/features/career/milestone-temporal";
import type { ProactiveInsight } from "./types";
export function buildProactiveInsights({
  now,
  timeZone,
  tasks,
  events,
  milestones,
  weeklyReviewCompleted = false,
  dueDecisions = [],
}: {
  now: Date;
  timeZone: string;
  tasks: NowTask[];
  events: NowCalendarEvent[];
  milestones: NowCareerMilestone[];
  weeklyReviewCompleted?: boolean;
  dueDecisions?: Array<{ id: string; title: string; review_at: string }>;
}) {
  const today = getDateKeyInTimeZone(now, timeZone)!;
  const insights: ProactiveInsight[] = [];
  const overdue = tasks.filter(
    (t) =>
      t.status !== "completed" &&
      t.due_at &&
      getDateKeyInTimeZone(t.due_at, timeZone)! < today,
  );
  if (overdue.length)
    insights.push({
      id: "overdue",
      kind: "task_overdue",
      priority: overdue.some((t) => t.importance === "high")
        ? "high"
        : "medium",
      title: `${overdue.length} 项任务已经逾期`,
      href: "/tasks",
      fingerprint: `task_overdue:${overdue
        .map((t) => `${t.id}:${t.due_at}`)
        .sort()
        .join(",")}`,
    });
  const upcoming = events.filter(
    (e) =>
      !e.is_all_day &&
      new Date(e.starts_at) > now &&
      new Date(e.starts_at).getTime() - now.getTime() <= 30 * 60_000,
  );
  upcoming
    .slice(0, 1)
    .forEach((e) =>
      insights.push({
        id: `event-${e.id}`,
        kind: "calendar_upcoming",
        priority: "high",
        title: `${e.subject || "日程"} 将在 30 分钟内开始`,
        href: "/calendar",
        fingerprint: `calendar_upcoming:${e.id}:${e.starts_at}`,
      }),
    );
  selectOpenCareerMilestones(milestones, today, 3)
    .forEach((m) =>
      insights.push({
        id: `milestone-${m.id}`,
        kind: "career_milestone_approaching",
        priority: m.importance === "high" ? "high" : "medium",
        title: `Career 节点临近：${m.title}`,
        description: `目标日期 ${m.target_date}`,
        href: "/career/roadmap",
        fingerprint: `career_milestone_approaching:${m.id}:${m.target_date}`,
      }),
    );
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(now);
  if (weekday === "Sun" && !weeklyReviewCompleted)
    insights.push({
      id: "weekly-review",
      kind: "weekly_review_due",
      priority: "low",
      title: "本周复盘仍未安排",
      href: "/reviews",
      fingerprint: `weekly_review_due:${today.slice(0, 4)}-${today.slice(5, 7)}`,
    });
  dueDecisions.slice(0,2).forEach((decision)=>insights.push({id:`decision-${decision.id}`,kind:"decision_review_due",priority:"medium",title:`决定需要复核：${decision.title}`,description:`计划复核时间 ${decision.review_at.slice(0,10)}`,href:"/reviews",fingerprint:`decision_review_due:${decision.id}:${decision.review_at}`}));
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  return insights
    .sort((a, b) => rank[a.priority] - rank[b.priority])
    .slice(0, 3);
}

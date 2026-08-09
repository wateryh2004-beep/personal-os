import type {
  NowCalendarEvent,
  NowCareerMilestone,
  NowTask,
  TodayBriefItem,
} from "./types";
import {
  daysUntilCareerMilestone,
  selectOpenCareerMilestones,
} from "@/features/career/milestone-temporal";
import { getDateKeyInTimeZone } from "@/lib/date-keys";

export function buildTodayBrief(input: {
  now: Date;
  timezone: string;
  overdueTasks: NowTask[];
  todayTasks: NowTask[];
  todayEvents: NowCalendarEvent[];
  milestones: NowCareerMilestone[];
  inboxCount: number;
}): TodayBriefItem[] {
  const items: TodayBriefItem[] = [];
  const formatTime = new Intl.DateTimeFormat("zh-CN", {
    timeZone: input.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const nextEvent = input.todayEvents
    .filter((event) => new Date(event.ends_at).getTime() > input.now.getTime())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  if (nextEvent) {
    const ongoing = new Date(nextEvent.starts_at).getTime() <= input.now.getTime();
    items.push({
      id: `brief-event-${nextEvent.id}`,
      title: nextEvent.subject || "未命名日程",
      reason: nextEvent.is_all_day
        ? "这是今天仍在进行的全天安排。"
        : ongoing
          ? `日程正在进行，将于 ${formatTime.format(new Date(nextEvent.ends_at))} 结束。`
          : `今天 ${formatTime.format(new Date(nextEvent.starts_at))} 开始。`,
      priority: ongoing ? 100 : 88,
      sourceRefs: [{
        id: nextEvent.id,
        domain: "calendar",
        title: nextEvent.subject || "未命名日程",
        href: "/calendar",
        updatedAt: nextEvent.starts_at,
      }],
      suggestedAction: {
        label: "准备",
        agentPrompt: `帮我为今天的日程“${nextEvent.subject || "未命名日程"}”做准备。请先查看相关笔记、任务和个人上下文，再给出有来源的准备清单。`,
      },
    });
  }

  const overdue = input.overdueTasks[0];
  if (overdue) {
    items.push({
      id: `brief-task-${overdue.id}`,
      title: overdue.title || "未命名任务",
      reason: "这项任务已经逾期，值得今天重新安排或完成。",
      priority: overdue.importance === "high" ? 96 : 84,
      sourceRefs: [{
        id: overdue.id,
        domain: "tasks",
        title: overdue.title || "未命名任务",
        href: "/tasks",
        updatedAt: overdue.due_at,
      }],
      suggestedAction: {
        label: "安排今天",
        agentPrompt: `帮我把逾期任务“${overdue.title || "未命名任务"}”安排到今天合适的空闲时间。先检查日历，再生成需要我确认的提案。`,
      },
    });
  } else if (input.todayTasks[0]) {
    const task = input.todayTasks[0];
    items.push({
      id: `brief-task-${task.id}`,
      title: task.title || "未命名任务",
      reason: "这是今天到期的任务。",
      priority: task.importance === "high" ? 90 : 72,
      sourceRefs: [{
        id: task.id,
        domain: "tasks",
        title: task.title || "未命名任务",
        href: "/tasks",
        updatedAt: task.due_at,
      }],
      suggestedAction: {
        label: "检查安排",
        agentPrompt: `检查今天是否已经为任务“${task.title || "未命名任务"}”留出足够时间，并给我一个有依据的建议。`,
      },
    });
  }

  const today = getDateKeyInTimeZone(input.now, input.timezone)!;
  const briefScore = (milestone: NowCareerMilestone) => {
    const days = daysUntilCareerMilestone(milestone.target_date, today);
    if (days === 0) return 92;
    if (days <= 3) return milestone.importance === "high" ? 90 : 82;
    return milestone.importance === "high" ? 78 : 66;
  };
  const nearMilestones = selectOpenCareerMilestones(input.milestones, today, 7)
    .sort((left, right) => briefScore(right) - briefScore(left));
  const distantImportantMilestone = items.length === 0
    ? selectOpenCareerMilestones(input.milestones, today, 30)
        .find((item) => daysUntilCareerMilestone(item.target_date, today) > 7 && item.importance === "high")
    : undefined;
  const milestone = nearMilestones[0] ?? distantImportantMilestone;
  if (milestone) {
    const days = daysUntilCareerMilestone(milestone.target_date, today);
    items.push({
      id: `brief-milestone-${milestone.id}`,
      title: milestone.title,
      reason: days === 0 ? "这个职业节点计划在今天。" : `这个职业节点计划在 ${days} 天后。`,
      priority: days > 7 ? 58 : briefScore(milestone),
      sourceRefs: [{
        id: milestone.id,
        domain: "career",
        title: milestone.title,
        href: "/career/roadmap",
        updatedAt: milestone.target_date,
      }],
      suggestedAction: {
        label: "梳理下一步",
        agentPrompt: `结合我的职业路线、任务和日历，帮我梳理里程碑“${milestone.title}”今天最值得推进的下一步。不要直接修改数据。`,
      },
    });
  }

  if (input.inboxCount > 0) {
    items.push({
      id: "brief-inbox",
      title: `${input.inboxCount} 条 Inbox 尚未整理`,
      reason: "这些记录仍未进入明确的任务、日程或笔记去向。",
      priority: Math.min(76, 52 + input.inboxCount * 3),
      sourceRefs: [{
        id: "unresolved-inbox",
        domain: "inbox",
        title: "未整理 Inbox",
        href: "/inbox",
      }],
      suggestedAction: {
        label: "帮助整理",
        agentPrompt: "帮我检查尚未整理的 Inbox，并逐条建议最合适的去向。所有写入都先生成提案，等待我确认。",
      },
    });
  }

  return items.sort((a, b) => b.priority - a.priority).slice(0, 4);
}

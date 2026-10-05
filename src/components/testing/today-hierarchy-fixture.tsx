"use client";
import { AppShell } from "@/components/layout/app-shell";
import { NowWorkspaceView } from "@/components/today/now-workspace";
import type { NowWorkspace, NowTask } from "@/features/today/types";

const tasks: NowTask[] = [
  { id: "00000000-0000-4000-8000-000000000001", title: "梳理项目复盘，把关键判断讲清楚", due_at: "2026-10-05T10:00:00Z", status: "notStarted", importance: "high" },
  { id: "00000000-0000-4000-8000-000000000002", title: "准备面试：有利润，为什么还缺现金？", due_at: null, status: "notStarted", importance: "normal" },
  { id: "00000000-0000-4000-8000-000000000003", title: "核对需要补充的材料", due_at: "2026-10-04T10:00:00Z", status: "notStarted", importance: "normal" },
  { id: "00000000-0000-4000-8000-000000000004", title: "整理读书笔记", due_at: null, status: "notStarted", importance: "normal" },
];
const event = (id: string, day: string, hour: string) => ({ id, subject: id === "tomorrow" ? "明天的计划沟通" : "项目讨论：确认接下来的安排", starts_at: `2026-10-${day}T${hour}:00:00Z`, ends_at: `2026-10-${day}T${hour}:45:00Z`, is_all_day: false, location_name: "线上会议" });
const tomorrow = event("tomorrow", "06", "06");
const taskCommitment = (task: NowTask) => ({ id: `task-${task.id}`, kind: "task" as const, title: task.title, whyNow: task.id === tasks[2].id ? "任务已逾期" : "今天到期", constraint: task.id === tasks[2].id ? "原截止：10/4 18:00" : "截止：今天 18:00", href: `/tasks?task=${task.id}`, source: { domain: "tasks" as const, entityId: task.id, label: "Microsoft To Do" }, task });
const workspace: NowWorkspace = {
  generatedAt: "2026-10-05T04:00:00Z", timezone: "Asia/Shanghai",
  calendar: { today: [event("past", "05", "02"), event("later", "05", "06")], upcoming: [tomorrow], connection: null },
  tasks: { overdue: [tasks[2]], today: [tasks[0]], upcoming: [] }, career: { upcomingMilestones: [] },
  briefing: { entries: [], date: null }, inboxCount: 3,
  commitments: [taskCommitment(tasks[0]), taskCommitment(tasks[2]), { id: "inbox", kind: "inbox", title: "整理 3 条 Inbox", whyNow: "Inbox 中仍有未处理的捕捉", constraint: "3 条待决定去向", href: "/inbox", source: { domain: "inbox", entityId: null, label: "Inbox" } }],
  nextAction: { kind: "event", event: tomorrow, state: "upcoming", reason: "明天开始", href: "/calendar?event=tomorrow" },
  todayBrief: [
    { id: "inbox", title: "3 条 Inbox 尚未整理", reason: "待决定去向", priority: 1, sourceRefs: [{ id: "inbox", domain: "inbox", title: "Inbox", href: "/inbox" }], suggestedAction: { label: "帮助整理", agentPrompt: "请帮我整理 Inbox" } },
    { id: "background", title: "留意后续职业计划", reason: "这个职业节点计划在 28 天后。", priority: 2, sourceRefs: [{ id: "career", domain: "career", title: "职业计划", href: "/career" }] },
  ], attention: [],
  upcoming: [
    { id: "1", kind: "event", title: "计划沟通", at: tomorrow.starts_at, href: "/calendar?event=tomorrow" },
    { id: "2", kind: "task", title: "完成下周展示材料与演练", at: "2026-10-07T10:00:00Z", href: "/tasks?task=fixture" },
    { id: "3", kind: "event", title: "返程 · 请提前核对车站、出发时间与行李", at: "2026-10-08T04:00:00Z", href: "/calendar?event=return", detail: "仅为合成排版验证数据" },
    { id: "4", kind: "event", title: "每周回顾", at: "2026-10-09T10:00:00Z", href: "/calendar?event=review" },
  ],
  availability: { calendar: "ready", tasks: "ready", career: "ready", inbox: "ready", briefing: "ready" },
  summary: { todayEventCount: 2, todayTaskCount: 1, attentionCount: 1 },
  focus: { date: "2026-10-05", selectedIds: tasks.slice(0, 2).map(t => t.id), selectedTasks: tasks.slice(0, 2), candidates: tasks.slice(2), available: true },
};
export function TodayHierarchyFixture({ mode }: { mode?: string }) {
  const data: NowWorkspace = mode === "empty" ? { ...workspace, calendar: { ...workspace.calendar, today: [] }, tasks: { overdue: [], today: [], upcoming: [] }, commitments: workspace.commitments.filter(item => item.kind === "inbox"), summary: { todayEventCount: 0, todayTaskCount: 0, attentionCount: 0 }, focus: { ...workspace.focus!, selectedIds: [], selectedTasks: [], candidates: tasks } }
    : mode === "tomorrow" ? { ...workspace, generatedAt: "2026-10-05T11:31:00Z", tasks: { overdue: [], today: [], upcoming: [] }, commitments: workspace.commitments.filter(item => item.kind === "inbox"), summary: { todayEventCount: 2, todayTaskCount: 0, attentionCount: 0 }, focus: { ...workspace.focus!, selectedIds: [], selectedTasks: [], candidates: tasks } }
    : mode === "unavailable" ? { ...workspace, availability: { ...workspace.availability, calendar: "unavailable", inbox: "unavailable", briefing: "unavailable" }, inboxCount: 0 }
    : workspace;
  return <AppShell presentationPathname="/today"><div data-testid="today-hierarchy-fixture"><NowWorkspaceView workspace={data} /><p className="px-5 pb-5 text-[11px] text-[var(--text-tertiary)]">合成数据 · 仅用于界面验证</p></div></AppShell>;
}

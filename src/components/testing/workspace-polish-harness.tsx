"use client";

import { AppShell } from "@/components/layout/app-shell";
import { NowWorkspaceView } from "@/components/today/now-workspace";
import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { NotesWorkspaceShell } from "@/components/notes/notes-workspace-shell";
import { NotesWorkspace } from "@/components/notes/notes-workspace";
import { TasksShell } from "@/components/tasks/tasks-workspace-skeleton";
import { CalendarShell } from "@/components/calendar/calendar-workspace-skeleton";
import TodayLoading from "@/app/(app)/today/loading";
import type { NowWorkspace } from "@/features/today/types";
import type { TodoTask } from "@/features/tasks/types";

export type PolishScene = "today" | "tasks" | "calendar" | "notes" | "today-loading" | "tasks-loading" | "calendar-loading";

// Fixture-only, reached through the existing explicitly gated E2E route. Never
// populated from an account, and the browser test never submits these forms.
const now: NowWorkspace = {
  timezone: "Asia/Shanghai", calendar: { today: [], upcoming: [], connection: null },
  tasks: { overdue: [], today: [], upcoming: [] }, career: { upcomingMilestones: [] },
  briefing: { entries: [], date: null }, inboxCount: 0, commitments: [],
  nextAction: { kind: "none", reason: "测试工作区" }, todayBrief: [], attention: [], upcoming: [],
  availability: { calendar: "ready", tasks: "ready", career: "ready", inbox: "ready", briefing: "ready" },
  summary: { todayEventCount: 0, todayTaskCount: 0, attentionCount: 0 },
  focus: { date: "2026-10-02", selectedIds: [], selectedTasks: [], candidates: [], available: true },
};
const tasks: TodoTask[] = ["核对本周计划", "整理学习笔记", "准备下一次复盘"].map((title, index) => ({
  id: `e2e-polish-task-${index}`, providerTaskId: `e2e-${index}`, todoListId: "e2e-list", title,
  bodyText: "仅用于布局与交互验证的虚构条目", status: "notStarted", importance: index === 0 ? "high" : "normal",
  dueAt: "2026-10-02T09:00:00Z", completedAt: null, lastModifiedAt: null,
}));
const notes = ["学习记录", "每周复盘", "想法与灵感"].map((title, index) => ({
  id: `e2e-polish-note-${index}`, title, excerpt: "用于验证列表间距、文字层级与导航的虚构内容。",
  updated_at: "2026-10-02T00:00:00Z", pinned_at: null, folder_id: null, content_origin: "manual",
}));
const folders = [{ id: "e2e-folder", name: "学习", parent_id: null }];
const lists = [{ id: "e2e-list", displayName: "日常", isDefault: true }];
const events: [] = [];
const categories: [] = [];

export function WorkspacePolishHarness({ scene }: { scene: PolishScene }) {
  const pathname = `/${scene.replace("-loading", "")}`;
  return <div data-testid="workspace-polish-harness" data-scene={scene}>
    <AppShell presentationPathname={pathname}>
      {scene === "today" ? <NowWorkspaceView workspace={now} /> : null}
      {scene === "tasks" ? <TaskWorkspace tasks={tasks} lists={lists} initialDayBounds={{ startMs: 0, endMs: 8_640_000_000_000_000 }} /> : null}
      {scene === "calendar" ? <CalendarWorkspace events={events} categories={categories} timezone="Asia/Shanghai" syncStatus={null} scopeReady /> : null}
      {scene === "notes" ? <NotesWorkspaceShell folders={folders} notes={notes}><NotesWorkspace notes={notes} folders={folders} timezone="Asia/Shanghai" state="ready" selectedFolder={null} initialView="all" dailyError={false} initialHasMore={false} /></NotesWorkspaceShell> : null}
      {scene === "today-loading" ? <TodayLoading /> : null}
      {scene === "tasks-loading" ? <TasksShell /> : null}
      {scene === "calendar-loading" ? <CalendarShell /> : null}
    </AppShell>
  </div>;
}

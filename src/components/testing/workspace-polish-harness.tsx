"use client";

import { CareerMaterialsView, type CareerMaterialsData } from "@/components/career/career-materials-view";
import { CareerHomeView, type CareerHomeData } from "@/components/career/career-home-view";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { DashboardLayout } from "@/components/layout/page-layouts";
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
import { FilesPolishFixture } from "./files-polish-fixture";
import { NoteEditorPolishFixture } from "./note-editor-polish-fixture";

export type PolishScene = "heading" | "career" | "career-filled" | "career-materials" | "today" | "today-filled" | "tasks" | "calendar" | "notes" | "note-editor" | "note-pdf" | "files" | "today-loading" | "tasks-loading" | "calendar-loading";

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
const filledTask = { id: "e2e-today-task", title: "整理项目复盘：把问题、判断与下一步写清楚", due_at: "2026-10-02T09:00:00Z", importance: "high", status: "notStarted" };
const filledNow: NowWorkspace = {
  ...now,
  summary: { todayEventCount: 2, todayTaskCount: 1, attentionCount: 0 },
  calendar: { ...now.calendar, today: [
    { id: "e2e-all-day", subject: "阅读与学习 · Synthetic fixture", starts_at: "2026-10-01T16:00:00Z", ends_at: "2026-10-02T16:00:00Z", is_all_day: true, location_name: null },
    { id: "e2e-meeting", subject: "项目复盘 / Project review", starts_at: "2026-10-02T06:00:00Z", ends_at: "2026-10-02T07:00:00Z", is_all_day: false, location_name: "测试工作区" },
  ] },
  tasks: { overdue: [], today: [filledTask], upcoming: [] },
  focus: { date: "2026-10-02", selectedIds: [filledTask.id], selectedTasks: [filledTask], candidates: [], available: true },
  commitments: [{ id: "e2e-commitment", kind: "task", title: filledTask.title, whyNow: "今天到期", constraint: "17:00 前完成复盘记录", href: "/tasks?task=e2e-today-task", source: { domain: "tasks", entityId: filledTask.id, label: "Microsoft To Do · 测试清单" }, task: filledTask }],
  todayBrief: [{ id: "e2e-brief", title: "复盘前先核对记录，再组织表达", reason: "这是用于中英文排版与长行换行验证的虚构内容。", priority: 1, sourceRefs: [{ id: "e2e-note", domain: "notes", title: "项目学习记录", href: "/notes/e2e-note" }] }],
  upcoming: [{ id: "e2e-future", kind: "event", title: "每周回顾 / Weekly review", at: "2026-10-03T06:00:00Z", href: "/calendar?event=e2e-future", detail: "核对待办、日程与下一周的学习安排" }],
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

const career: CareerHomeData = {
  now: Date.parse("2026-10-03T08:00:00Z"), profile: null, directions: [], experienceCount: 0,
  skillCount: 0, resumeCount: 0, applications: [], milestones: [], interviewTargets: [], interviewPreparations: [], unavailable: false,
};
const filledCareer: CareerHomeData = {
  ...career,
  profile: { professional_headline: "Synthetic fixture · 仅用于职业工作台布局验证", current_stage: null },
  interviewTargets: [{ id: "e2e-target", title: "示例面试准备", organization_snapshot: "布局测试组织", role_title_snapshot: "Synthetic fixture / 示例岗位", status: "active", next_interview_at: "2026-10-04T06:00:00Z" }],
  interviewPreparations: [{ id: "e2e-prep", context_id: "e2e-target", status: "draft", next_practice_at: null }],
  recentReadings: [
    {
      id: "e2e-prep", questionId: "e2e-reading-target", contextId: "e2e-target",
      title: "如何把经历讲清楚：从问题、判断到结果 / Explain your reasoning",
      summary: "Synthetic fixture · 先说明具体问题，再给出判断依据和采取的行动。用一项可核对的结果收尾，同时说清限制与下一步。此段仅用于验证阅读摘要在窄屏和桌面上的换行。",
      updatedAt: "2026-10-03T07:30:00Z",
    },
    {
      id: "e2e-general-prep-1", questionId: "e2e-reading-general-1", contextId: null,
      title: "面对条件变化，怎样重新判断优先级？",
      summary: "Synthetic fixture · 明确目标和约束，再比较几个可行选择。把结论、依据与尚待确认的信息分开表达。",
      updatedAt: "2026-10-02T10:00:00Z",
    },
    {
      id: "e2e-general-prep-2", questionId: "e2e-reading-general-2", contextId: null,
      title: "How would you verify an unexpected result? / 核对异常结果",
      summary: "Synthetic fixture · Check the source, compare assumptions, and explain what evidence would change the conclusion.",
      updatedAt: "2026-10-02T08:00:00Z",
    },
    {
      id: "e2e-general-prep-3", questionId: "e2e-reading-general-3", contextId: null,
      title: "用自己的话复述一个概念 · 无摘要布局",
      summary: "",
      updatedAt: "2026-10-01T09:00:00Z",
    },
  ],
  milestones: [{ id: "e2e-milestone", title: "示例事项：核对准备材料与接下来的计划", target_date: "2026-10-03", status: "planned" }],
};

// Only synthetic content; there are no uploaded blobs behind these fixture IDs.
const careerMaterials: CareerMaterialsData = {
  resumes: [
    {
      id: "e2e-materials-resume", title: "Synthetic resume · 项目分析与问题解决 / Analytical work and reasoning",
      version_label: "布局验证 v2", status: "final", updated_at: "2026-10-03T08:00:00Z",
      document_id: "e2e-materials-never",
      content_markdown: "## 示例简历 / Synthetic résumé\n\n这是一份完全虚构的阅读布局样本。用于检查长标题、中文与英文混排、段落和列表，不能作为个人经历使用。\n\n### 工作方法\n\n- 先定义问题与约束，再整理可核对的依据\n- Explain the assumptions, compare alternatives, and describe the result\n- 保留来源与版本，方便回到原始材料复核",
    },
    {
      id: "e2e-materials-draft", title: "Synthetic draft · 尚无正文的简历版本", version_label: "草稿 v1",
      status: "draft", content_markdown: "", document_id: "e2e-materials-legacy", updated_at: "2026-10-02T08:00:00Z",
    },
  ],
  documents: [
    {
      id: "e2e-materials-never", title: "Synthetic evidence · 用于验证多行标题与阅读链接的项目说明、结果核对和证明材料 / A deliberately long reading title",
      original_filename: "SyntheticEvidence_LongFileNameForNarrowScreenWrapping_项目说明与事实核对_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ.pdf",
      document_type: "resume_pdf", confidentiality_level: "private", ai_visibility: "never",
      storage_provider: "cloudflare_r2", storage_state: "available", uploaded_at: "2026-10-03T08:00:00Z",
    },
    {
      id: "e2e-materials-legacy", title: "Synthetic legacy attachment · 旧版证明材料",
      original_filename: "synthetic-legacy-evidence.pdf", document_type: "internship_proof", confidentiality_level: "private", ai_visibility: "normal",
      storage_provider: "supabase_storage", storage_state: "available", uploaded_at: "2026-10-02T08:00:00Z",
    },
    {
      id: "e2e-materials-sensitive", title: "Synthetic certificate · 核对用材料",
      original_filename: "synthetic-certificate.pdf", document_type: "certificate", confidentiality_level: "sensitive", ai_visibility: "sensitive",
      storage_provider: "cloudflare_r2", storage_state: "available", uploaded_at: "2026-10-01T08:00:00Z",
    },
  ],
  associations: [
    { documentId: "e2e-materials-never", label: "Synthetic resume", href: "#resume-e2e-materials-resume" },
    { documentId: "e2e-materials-never", label: "经历事实的来源", href: "/career/experiences/e2e-materials-experience" },
    { documentId: "e2e-materials-legacy", label: "Synthetic draft", href: "#resume-e2e-materials-draft" },
    { documentId: "e2e-materials-sensitive", label: "Synthetic certificate", href: "/career/certifications" },
  ],
  // Exercise a partial-read warning alongside records that are still readable.
  unavailable: true,
};

export function WorkspacePolishHarness({ scene }: { scene: PolishScene }) {
  const pathname = scene === "career-materials" ? "/career/materials" : scene === "heading" ? "/today" : (scene === "note-editor" || scene === "note-pdf") ? "/notes/10000000-0000-4000-8000-000000000001" : `/${scene.replace(/-(loading|filled)$/, "")}`;
  return <div data-testid="workspace-polish-harness" data-scene={scene}>
    <AppShell presentationPathname={pathname}>
      {scene === "heading" ? <DashboardLayout><PageHeader eyebrow="Collection · 排版验证" title="项目与长期计划 / Projects and long-term plans" description="中英文标题、说明和操作保持清晰层级。This synthetic fixture checks wrapping without hiding long titles." action={<Button>新建项目</Button>} secondaryActions={<Button variant="ghost">查看全部</Button>} /><div className="mt-8 border-t border-[var(--separator)] pt-4 text-[14px] leading-6 text-[var(--text-secondary)]">仅用于共享标题组件的布局验证，不包含个人资料。</div></DashboardLayout> : null}
      {scene === "career" || scene === "career-filled" ? <div><p className="mb-4 text-[12px] text-[var(--text-secondary)]">Synthetic fixture · 以下仅为布局验证，不包含个人经历或业务数据。</p><CareerHomeView data={scene === "career-filled" ? filledCareer : career} showContinue={false}/></div> : null}
      {scene === "career-materials" ? <div data-testid="career-materials-fixture"><p className="mb-4 text-[12px] text-[var(--text-secondary)]">Synthetic fixture · 以下仅为阅读布局验证，不包含个人资料或真实文件。</p><CareerMaterialsView data={careerMaterials} /></div> : null}
      {scene === "today" || scene === "today-filled" ? <NowWorkspaceView workspace={scene === "today-filled" ? filledNow : now} /> : null}
      {scene === "tasks" ? <TaskWorkspace tasks={tasks} lists={lists} initialDayBounds={{ startMs: 0, endMs: 8_640_000_000_000_000 }} /> : null}
      {scene === "calendar" ? <CalendarWorkspace events={events} categories={categories} timezone="Asia/Shanghai" syncStatus={null} scopeReady /> : null}
      {scene === "notes" ? <NotesWorkspaceShell folders={folders} notes={notes}><NotesWorkspace notes={notes} folders={folders} timezone="Asia/Shanghai" state="ready" selectedFolder={null} initialView="all" dailyError={false} initialHasMore={false} /></NotesWorkspaceShell> : null}
      {scene === "note-editor" || scene === "note-pdf" ? <NoteEditorPolishFixture pdf={scene === "note-pdf"} /> : null}
      {scene === "files" ? <FilesPolishFixture /> : null}
      {scene === "today-loading" ? <TodayLoading /> : null}
      {scene === "tasks-loading" ? <TasksShell /> : null}
      {scene === "calendar-loading" ? <CalendarShell /> : null}
    </AppShell>
  </div>;
}

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const calendar = source("src/components/calendar/calendar-full-view.tsx");
const calendarWorkspace = source("src/components/calendar/calendar-workspace.tsx");
const appShell = source("src/components/layout/app-shell.tsx");
const globalAgent = source("src/components/assistant/global-agent.tsx");
const taskWorkspace = source("src/components/tasks/task-workspace.tsx");
const taskAssistant = source("src/components/tasks/task-assistant.tsx");
const shopping = source("src/components/shopping/shopping-workspace.tsx");
const travel = source("src/components/travel/trip-detail.tsx");
const files = source("src/components/files/files-workspace.tsx");
const nowWorkspace = source("src/components/today/now-workspace.tsx");
const markdownTheme = source("src/features/notes/editor/markdown-theme.ts");
const rlsOptimization = source("supabase/migrations/20260811104219_optimize_rls_auth_initplan.sql");

describe("interaction performance guardrails", () => {
  it("keeps the calendar instance stable and gives the workspace one cache owner", () => {
    expect(calendar).not.toContain("key={`${view}:${cursor.toDateString()}`}");
    expect(calendar).toContain("api.changeView");
    expect(calendarWorkspace).toContain("rangeCacheRef");
    expect(calendarWorkspace).toContain("requestSequenceRef");
    expect(calendarWorkspace).toContain("invalidateCalendarCache");
  });

  it("renders calendar grid and event ranges in 24-hour time", () => {
    expect(calendar).toContain('locale="zh-cn"');
    expect(calendar).toContain("slotLabelFormat={{ hour: \"2-digit\", minute: \"2-digit\", hour12: false, meridiem: false }}");
    expect(calendar).toContain("eventTimeFormat={{ hour: \"2-digit\", minute: \"2-digit\", hour12: false, meridiem: false }}");
  });

  it("uses the Profile timezone in the category management surface and defaults phones to Day", () => {
    expect(calendarWorkspace).toContain('window.matchMedia("(max-width: 767px)")');
    expect(calendarWorkspace).toContain('current === "week" ? "day"');
    expect(calendarWorkspace).toContain('compactViewport ? ["day", "month"]');
    const categoryManager = source("src/components/calendar/calendar-category-manager.tsx");
    expect(categoryManager).toContain('timeZone: timezone');
  });

  it("renders Markdown list structure as document markers rather than source syntax", () => {
    expect(markdownTheme).toContain('node.name === "ListMark"');
    expect(markdownTheme).toContain('node.name === "TaskMarker"');
    expect(markdownTheme).toContain('node.name === "QuoteMark"');
    expect(markdownTheme).toContain('new MarkdownMarkerWidget');
  });

  it("loads heavy agent surfaces only after the user opens them", () => {
    expect(appShell).toContain("dynamic(");
    expect(appShell).toContain("globalAgentOpen ? <GlobalAgent");
    expect(globalAgent).toContain('perfMark("agent-lazy-mounted")');
  });

  it("keeps task, shopping, travel, and file mutations out of whole-page reloads", () => {
    expect(taskWorkspace).not.toContain("router.refresh()");
    expect(taskAssistant).not.toContain("router.refresh()");
    expect(taskAssistant).toContain("personal-os:tasks-mutated");
    expect(shopping).not.toContain("location.reload()");
    expect(travel).not.toContain("router.refresh()");
    expect(files).not.toContain("router.refresh()");
    expect(files).toContain("setFileRows");
  });

  it("does not attach an unconditional Now refresh loop", () => {
    expect(nowWorkspace).not.toContain("NowAutoRefresh");
    expect(nowWorkspace).not.toContain("setInterval(");
  });

  it("keeps RLS ownership semantics while avoiding per-row auth evaluation", () => {
    expect(rlsOptimization).toContain("alter policy \"profiles_select_own\"");
    expect(rlsOptimization).toContain("user_id = (select auth.uid())");
    expect(rlsOptimization).toContain("created_by = (select auth.uid())");
    expect(rlsOptimization).not.toContain("to anon");
  });
});

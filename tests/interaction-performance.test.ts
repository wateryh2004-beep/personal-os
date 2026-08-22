import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const calendar = source("src/components/calendar/calendar-full-view.tsx");
const globalStyles = source("src/app/globals.css");
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
const calendarTools = source("src/features/assistant/tools/calendar.ts");
const assistantExecutor = source("src/features/assistant/executor.ts");
const rlsOptimization = source("supabase/migrations/20260811104219_optimize_rls_auth_initplan.sql");
const auth = source("src/lib/auth/require-owner.ts");
const proxy = source("src/lib/supabase/proxy.ts");
const noteQueries = source("src/features/notes/queries.ts");
const notePage = source("src/app/(app)/notes/[noteId]/page.tsx");
const todayPage = source("src/app/(app)/today/page.tsx");
const tasksPage = source("src/app/(app)/tasks/page.tsx");
const notesPage = source("src/app/(app)/notes/page.tsx");
const calendarPage = source("src/app/(app)/calendar/page.tsx");
const systemHealth = source("src/components/settings/system-health.tsx");
const controlPlane = source("src/features/system-status/control-plane.ts");

describe("interaction performance guardrails", () => {
  it("keeps the calendar instance stable and gives the workspace one cache owner", () => {
    expect(calendar).not.toContain("key={`${view}:${cursor.toDateString()}`}");
    expect(calendar).toContain("api.changeView");
    expect(calendarWorkspace).toContain("calendarRangeResource");
    expect(calendarWorkspace).toContain("requestSequenceRef");
    expect(calendarWorkspace).toContain("invalidateCalendarCache");
  });

  it("scopes Calendar AI reads and approved mutations to their owner", () => {
    expect(calendarTools).toContain('.eq("user_id", context.userId)');
    expect(assistantExecutor).toContain('.eq("user_id", input.userId)');
  });

  it("renders calendar grid and event ranges in 24-hour time", () => {
    expect(calendar).toContain('from "@fullcalendar/core/locales/zh-cn"');
    expect(calendar).toContain("locale={zhCnLocale}");
    expect(calendar).toContain("firstDay={1}");
    expect(calendar).toContain("now={nowFn}");
    expect(calendar).toContain("wallNowAsUtcDate");
    expect(calendar).toContain("slotLabelFormat={{ hour: \"2-digit\", minute: \"2-digit\", hour12: false, meridiem: false }}");
    expect(calendar).toContain("eventTimeFormat={{ hour: \"2-digit\", minute: \"2-digit\", hour12: false, meridiem: false }}");
    expect(calendar).toContain('slotDuration="00:30:00"');
    expect(calendar).toContain('snapDuration="00:15:00"');
    expect(calendar).toContain("durationMinutes <= 30");
  });

  it("keeps concurrent calendar events expanded instead of splitting or hiding them", () => {
    expect(globalStyles).toContain(".fc-timegrid-event-harness");
    expect(globalStyles).toContain("left:0!important");
    expect(globalStyles).toContain("right:0!important");
    expect(calendar).not.toContain("eventMaxStack={1}");
  });

  it("keeps the all-day strip at half-slot height with events laid out side by side", () => {
    expect(globalStyles).toContain(".fc-timegrid .fc-daygrid-day-events");
    expect(globalStyles).toContain("min-height:0!important");
    expect(globalStyles).toContain("display:flex");
    expect(globalStyles).toContain("flex-wrap:wrap");
    expect(globalStyles).toContain("text-overflow:ellipsis");
  });

  it("uses the Profile timezone in the category management surface and defaults phones to Day", () => {
    expect(calendarWorkspace).toContain('window.matchMedia("(max-width: 767px)")');
    expect(calendarWorkspace).toContain('current === "week" ? "day"');
    expect(calendarWorkspace).toContain('compactViewport ? ["day", "month"]');
    const categoryManager = source("src/components/calendar/calendar-category-manager.tsx");
    expect(categoryManager).toContain('timeZone: timezone');
  });

  it("keeps existing events visible and reports range or sync failures precisely", () => {
    expect(calendarWorkspace).toContain("正在保留已显示的日程");
    expect(calendarWorkspace).toContain("Outlook 同步未完成");
  });

  it("reconciles each calendar mutation only once after a successful action", () => {
    const createForm = source("src/components/calendar/calendar-create-form.tsx");
    const editForm = source("src/components/calendar/calendar-event-edit-form.tsx");
    expect(createForm).toContain("createdHandledRef");
    expect(editForm).toContain("updateHandledRef");
    expect(editForm).toContain("deleteHandledRef");
    expect(calendarWorkspace).toContain("<CalendarEventEditForm key={selected.id}");
    expect(calendarWorkspace).toContain("<CalendarCreateForm key={`${draft.startsAt}:${draft.endsAt}");
  });

  it("re-reads the authoritative mirror after drag and keeps edit times ordered", () => {
    expect(calendarWorkspace).toContain("const refreshed = await refetchActiveRange()");
    expect(calendarWorkspace).toContain("calendar_local_reconciliation_pending");
    expect(calendarWorkspace).toContain("本地日历仍在对账");
    expect(calendarWorkspace).toContain("Moving an event outside the visible range");
    expect(calendarWorkspace).toContain("reconcileCalendarMutationRange");
    const editForm = source("src/components/calendar/calendar-event-edit-form.tsx");
    expect(editForm).toContain("keepEndAfterStart");
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

  it("reuses proxy-verified identity and avoids a document detail query waterfall", () => {
    expect(proxy).toContain("verifiedOwnerIdHeader");
    expect(proxy).toContain("requestHeaders.delete(verifiedOwnerIdHeader)");
    expect(auth).toContain("requestHeaders.get(verifiedOwnerIdHeader)");
    expect(auth).toContain("supabase.auth.getClaims()");
    expect(noteQueries).toContain("const relationsPromise = getNoteLinkRelations");
    expect(noteQueries).toContain("await Promise.all([versionsPromise, relationsPromise])");
    expect(notePage).toContain("const dataPromise = getNote(noteId)");
    expect(notePage).toContain("const foldersPromise = getActiveNoteFolders()");
    expect(notePage).toContain("const aiPromise = getAiSettings()");
  });

  it("starts private workspace reads in the Server Component navigation path", () => {
    expect(todayPage).toContain("await getTodayWorkspace()");
    expect(tasksPage).toContain("const workspacePromise = getMicrosoftTodoWorkspace()");
    expect(notesPage).toContain("const workspacePromise = getNotesWorkspace()");
    expect(calendarPage).toContain("const workspacePromise = getCalendarWorkspace()");
  });

  it("makes deployment and calendar scheduler evidence visible to the owner", () => {
    expect(systemHealth).toContain("运行版本");
    expect(systemHealth).toContain("小时 delta");
    expect(systemHealth).toContain("Webhook");
    expect(controlPlane).toContain("calendar_sync_cron_runs");
    expect(controlPlane).toContain("VERCEL_GIT_COMMIT_SHA");
  });
});

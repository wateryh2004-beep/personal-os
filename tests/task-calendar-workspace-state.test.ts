// @vitest-environment jsdom
import { act, createElement, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoTask } from "@/features/tasks/types";
import type { CalendarEventRecord } from "@/features/calendar/types";
import type { CalendarFullView } from "@/components/calendar/calendar-full-view";

const mocks = vi.hoisted(() => ({
  router: { replace: vi.fn(), refresh: vi.fn() },
  complete: vi.fn(), reopen: vi.fn(), update: vi.fn(), remove: vi.fn(), create: vi.fn(),
  revalidateTasks: vi.fn(), show: vi.fn(), mutateTasks: vi.fn(),
  updateCalendar: vi.fn(), syncCalendar: vi.fn(), range: vi.fn(),
  fullView: null as ComponentProps<typeof CalendarFullView> | null,
  realInspector: false,
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router, usePathname: () => "/workspace" }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/features/tasks/microsoft-todo", () => ({
  completeMicrosoftTodoTaskAction: mocks.complete, reopenMicrosoftTodoTaskAction: mocks.reopen,
  updateMicrosoftTodoTaskAction: mocks.update, deleteMicrosoftTodoTaskAction: mocks.remove,
  createMicrosoftTodoTaskAction: mocks.create, syncMicrosoftTodoAction: vi.fn(), syncAndBackupMicrosoftTodoAction: vi.fn(),
}));
vi.mock("@/features/tasks/workspace-resource", () => ({ tasksWorkspaceResource: { mutate: mocks.mutateTasks, revalidate: mocks.revalidateTasks } }));
vi.mock("@/features/calendar/actions", () => ({ updateCalendarEvent: mocks.updateCalendar, syncAndBackupMicrosoftAction: mocks.syncCalendar }));
vi.mock("@/features/calendar/workspace-resource", () => ({ calendarRangeResource: mocks.range, invalidateCalendarRangeResources: vi.fn() }));
vi.mock("@/components/shared/action-feedback", () => ({ useActionFeedback: () => ({ show: mocks.show }) }));
vi.mock("@/components/shared/use-workspace-scroll-restoration", () => ({ useWorkspaceScrollRestoration: () => null }));
vi.mock("@/components/shared/inspector", async () => {
  const actual = await vi.importActual<typeof import("@/components/shared/inspector")>("@/components/shared/inspector");
  return { Inspector: (props: { open: boolean; title: string; onClose: () => void; children: ReactNode }) => mocks.realInspector
    ? createElement(actual.Inspector, props)
    : props.open ? createElement("aside", { "aria-label": props.title }, createElement("button", { onClick: props.onClose }, "关闭详情"), props.children) : null };
});
vi.mock("@/components/links/entity-backlinks", () => ({ EntityBacklinks: () => null }));
vi.mock("@/components/links/entity-markdown", () => ({ EntityMarkdown: () => null }));
vi.mock("@/components/links/entity-mention-textarea", () => ({ MentionTextarea: () => null }));
vi.mock("@/components/ai/ai-sidecar", () => ({ AISidecar: () => null }));
vi.mock("@/components/tasks/microsoft-todo-create-dialog", () => ({ MicrosoftTodoCreateDialog: () => null }));
vi.mock("@/components/calendar/calendar-category-manager", () => ({ CalendarCategoryManager: () => null }));
vi.mock("@/components/calendar/calendar-create-form", () => ({ CalendarCreateForm: ({ initialStart, initialEnd }: { initialStart: string; initialEnd: string }) => createElement("div", { "data-draft-start": initialStart, "data-draft-end": initialEnd }, "创建表单") }));
vi.mock("@/components/calendar/calendar-event-edit-form", () => ({ CalendarEventEditForm: ({ event }: { event: CalendarEventRecord }) => createElement("div", { "data-event-id": event.id }, event.subject) }));
vi.mock("@/components/calendar/calendar-full-view", () => ({ CalendarFullView: (props: ComponentProps<typeof CalendarFullView>) => {
  mocks.fullView = props;
  return createElement("main", null, props.events.map((event) => createElement("button", { key: event.id, onClick: () => props.onOpen(event) }, event.subject)));
} }));

import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { WorkspacePanelProvider } from "@/components/layout/workspace-panel-provider";
import { createWorkspaceResource } from "@/lib/workspace-resource-cache";
import { loadWorkspaceSession, saveWorkspaceSession } from "@/lib/workspace-session";

function task(id: string, patch: Partial<TodoTask> = {}): TodoTask {
  return { id, providerTaskId: id, todoListId: "list", title: `Task ${id}`, bodyText: null, status: "notStarted", importance: "normal", dueAt: null, completedAt: null, lastModifiedAt: null, ...patch };
}
function calendarEvent(id: string): CalendarEventRecord {
  return { id, provider_event_id: id, subject: `Event ${id}`, body_text: null, starts_at: "2026-12-20T09:00:00Z", ends_at: "2026-12-20T10:00:00Z", is_all_day: false, location_name: null, categories: [], importance: "normal", show_as: "busy", last_synced_at: "2026-10-01T00:00:00Z" };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function rangeFixture(data?: { events: CalendarEventRecord[]; truncated: boolean }, fetcher = async () => ({ events: [] as CalendarEventRecord[], truncated: false })) {
  const resource = createWorkspaceResource("test:calendar-range", fetcher, 120_000);
  if (data) resource.set(data);
  return resource;
}

let root: Root;
let container: HTMLDivElement;
const taskProps = { lists: [{ id: "list", displayName: "Default", isDefault: true }], initialDayBounds: { startMs: 0, endMs: Date.now() + 86_400_000 } };
const calendarProps = { events: [] as CalendarEventRecord[], categories: [], timezone: "UTC", syncStatus: null, scopeReady: true };
async function renderTasks(tasks: TodoTask[], initialTaskId?: string) {
  await act(async () => { root.render(createElement(WorkspacePanelProvider, null, createElement(TaskWorkspace, { ...taskProps, tasks, initialTaskId }))); });
}
async function renderCalendar(initialEventId?: string, extra: Partial<ComponentProps<typeof CalendarWorkspace>> = {}) {
  await act(async () => { root.render(createElement(WorkspacePanelProvider, null, createElement(CalendarWorkspace, { ...calendarProps, ...extra, initialEventId }))); });
}
async function flushTimers() { await act(async () => { await vi.runOnlyPendingTimersAsync(); }); }
async function click(selector: string) {
  const target = container.querySelector<HTMLElement>(selector);
  expect(target, selector).not.toBeNull();
  await act(async () => { target!.click(); });
}
function textButton(text: string) { return [...container.querySelectorAll("button")].find((button) => button.textContent === text)!; }

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/tasks");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  mocks.complete.mockResolvedValue(undefined);
  mocks.update.mockResolvedValue(undefined);
  mocks.reopen.mockResolvedValue(undefined);
  mocks.revalidateTasks.mockResolvedValue(undefined);
  mocks.range.mockReturnValue(rangeFixture());
  mocks.fullView = null;
  mocks.realInspector = false;
  mocks.router.replace.mockReset();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Tasks mounted workspace state", () => {
  it("restores once before saving and accepts refreshed rows without resetting the chosen view", async () => {
    saveWorkspaceSession("tasks:workspace", { view: "all", listId: "list", selectedId: "a" });
    await renderTasks([task("a")]);
    expect(loadWorkspaceSession<{ view: string }>("tasks:workspace")?.view).toBe("all");
    await flushTimers();
    expect(container.querySelector("aside[aria-label]")?.textContent).toContain("Task a");
    await act(async () => { textButton("即将到来").click(); });
    await renderTasks([task("b", { title: "New server task", dueAt: "2030-01-01T00:00:00Z" })]);
    expect(container.textContent).toContain("New server task");
    expect(textButton("即将到来").getAttribute("aria-pressed")).toBe("true");
  });

  it("opens successive route ids, resets editor drafts, and closes on Back to the bare route", async () => {
    const tasks = [task("a"), task("b", { status: "completed" })];
    await renderTasks(tasks, "a"); await flushTimers();
    await act(async () => { textButton("Task a").click(); });
    expect(container.querySelector<HTMLInputElement>("aside input")?.value).toBe("Task a");
    await renderTasks(tasks, "b");
    expect(container.querySelector("aside[aria-label]")?.textContent).toContain("Task b");
    await act(async () => { textButton("Task b").click(); });
    expect(container.querySelector<HTMLInputElement>("aside input")?.value).toBe("Task b");
    expect(textButton("已完成").getAttribute("aria-pressed")).toBe("true");
    await renderTasks(tasks);
    expect(container.querySelector("aside[aria-label]")).toBeNull();
  });

  it("keeps a rapidly dismissed selection closed when its delayed route response arrives", async () => {
    const tasks = [task("a"), task("b")];
    window.history.replaceState(null, "", "/tasks?task=a&source=today");
    await renderTasks(tasks, "a"); await flushTimers();
    await click('[aria-label="打开任务：Task b"]');
    expect(mocks.router.replace).toHaveBeenLastCalledWith("/tasks?task=b&source=today", { scroll: false });
    // The location and server props still describe A while B is already visible.
    await act(async () => { textButton("关闭详情").click(); });
    expect(mocks.router.replace).toHaveBeenLastCalledWith("/tasks?source=today", { scroll: false });
    window.history.replaceState(null, "", "/tasks?task=b&source=today");
    await renderTasks(tasks, "b");
    expect(container.querySelector('aside[aria-label="任务详情"]')).toBeNull();
    window.history.replaceState(null, "", "/tasks?source=today");
    await renderTasks(tasks);
    // Once dismissal has committed, a future explicit deep link still works.
    window.history.replaceState(null, "", "/tasks?task=b&source=today");
    await renderTasks(tasks, "b");
    expect(container.querySelector('aside[aria-label="任务详情"]')?.textContent).toContain("Task b");
  });

  it("guards repeated writes and rolls back only the failing task while preserving newer edits", async () => {
    saveWorkspaceSession("tasks:workspace", { view: "all" });
    const first = deferred<void>(); const second = deferred<void>();
    mocks.complete.mockImplementation((form: FormData) => form.get("task_id") === "a" ? first.promise : second.promise);
    await renderTasks([task("a"), task("b")]); await flushTimers();
    const completeA = container.querySelector<HTMLButtonElement>('[aria-label="完成 Task a"]')!;
    await act(async () => { completeA.click(); completeA.click(); });
    await click('[aria-label="完成 Task b"]');
    expect(mocks.complete).toHaveBeenCalledTimes(2);
    await act(async () => { second.resolve(); await second.promise; });
    await act(async () => { window.dispatchEvent(new CustomEvent("personal-os:tasks-mutated", { detail: { actionType: "tasks.update", proposal: { taskId: "a", patch: { title: "Edited while pending" } } } })); });
    await act(async () => { first.reject(new Error("offline")); await first.promise.catch(() => {}); });
    expect(container.textContent).toContain("Edited while pending");
    expect(container.querySelector('[aria-label="打开任务：Task b"]')).toBeNull();
    expect(container.querySelector('[aria-label="完成 Edited while pending"]')).not.toBeNull();
  });

  it("keeps an optimistic write while applying unrelated refreshed fields", async () => {
    saveWorkspaceSession("tasks:workspace", { view: "all" });
    const request = deferred<void>(); mocks.complete.mockReturnValue(request.promise);
    await renderTasks([task("a"), task("b")]); await flushTimers();
    await click('[aria-label="完成 Task a"]');
    await renderTasks([task("a", { title: "Fresh title" }), task("b", { title: "Fresh B" })]);
    expect(container.querySelector('[aria-label="打开任务：Fresh title"]')).toBeNull();
    expect(container.textContent).toContain("Fresh B");
    await act(async () => { request.reject(new Error("offline")); await request.promise.catch(() => {}); });
    expect(container.querySelector('[aria-label="完成 Fresh title"]')).not.toBeNull();
  });

  it("rolls a failed field back to a newer server value rather than its pre-request value", async () => {
    const request = deferred<void>(); mocks.update.mockReturnValue(request.promise);
    await renderTasks([task("a", { importance: "normal" })], "a"); await flushTimers();
    const importance = container.querySelector<HTMLSelectElement>("aside select")!;
    await act(async () => { importance.value = "high"; importance.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(mocks.update).toHaveBeenCalledWith({ taskId: "a", importance: "high" });
    await renderTasks([task("a", { importance: "low" })], "a");
    expect(importance.value).toBe("high");
    await act(async () => { request.reject(new Error("offline")); await request.promise.catch(() => {}); });
    expect(importance.value).toBe("low");
  });

  it("does not mistake an optimistic cache echo for a confirmed server baseline", async () => {
    const request = deferred<void>(); mocks.update.mockReturnValue(request.promise);
    await renderTasks([task("a", { importance: "normal" })], "a"); await flushTimers();
    const importance = container.querySelector<HTMLSelectElement>("aside select")!;
    await act(async () => { importance.value = "high"; importance.dispatchEvent(new Event("change", { bubbles: true })); });
    const localWorkspace = mocks.mutateTasks.mock.calls.at(-1)![0]({ connection: null, lists: taskProps.lists, tasks: [], unavailable: false, schemaMissing: false });
    await renderTasks(localWorkspace.tasks, "a");
    await act(async () => { request.reject(new Error("offline")); await request.promise.catch(() => {}); });
    expect(importance.value).toBe("normal");
  });

  it("offers a read-only retry for a missing target and clears the deep link when dismissed", async () => {
    window.history.replaceState(null, "", "/tasks?task=missing&source=today");
    await renderTasks([], "missing"); await flushTimers();
    expect(container.textContent).toContain("没有找到这条任务");
    await act(async () => { textButton("重新读取").click(); });
    expect(mocks.revalidateTasks).toHaveBeenCalledWith({ force: true });
    await act(async () => { textButton("关闭详情").click(); });
    expect(mocks.router.replace).toHaveBeenCalledWith("/tasks?source=today", { scroll: false });
  });
});

describe("Task creation and dismissal", () => {
  it("retains failed Quick Add text and never sends a repeated pending submission", async () => {
    const request = deferred<{ status: string; message: string }>();
    mocks.create.mockReturnValue(request.promise);
    await renderTasks([]); await flushTimers();
    await act(async () => { textButton("新建任务").click(); });
    const input = container.querySelector<HTMLInputElement>('input[name="title"]')!;
    const form = input.form!;
    await act(async () => {
      input.value = "Keep this draft";
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      input.value = "Keep this draft";
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await act(async () => { request.reject(new Error("network")); await request.promise.catch(() => {}); });
    expect(container.querySelector<HTMLInputElement>('input[name="title"]')?.value).toBe("Keep this draft");
    expect(container.textContent).toContain("添加结果尚未确认");
  });

  it("dismisses linked task details with Escape", async () => {
    window.history.replaceState(null, "", "/tasks?task=a");
    await renderTasks([task("a")], "a"); await flushTimers();
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(container.querySelector('aside[aria-label="任务详情"]')).toBeNull();
    expect(mocks.router.replace).toHaveBeenCalledWith("/tasks", { scroll: false });
  });
});

describe("Calendar exact-record navigation", () => {
  it("opens the requested event and moves the visible calendar to its date", async () => {
    const event = calendarEvent("target");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ event }) }));
    await renderCalendar("target"); await flushTimers();
    expect(container.querySelector('[data-event-id="target"]')).not.toBeNull();
    expect(mocks.fullView!.initialDate.toISOString()).toBe(new Date(event.starts_at).toISOString());
    expect(mocks.fullView!.events).toEqual([event]);
  });

  it("keeps a dismissed calendar selection closed through a delayed linked-event response", async () => {
    const events = [calendarEvent("a"), calendarEvent("b")];
    window.history.replaceState(null, "", "/calendar?event=a&source=today");
    await renderCalendar("a", { events }); await flushTimers();
    await act(async () => { textButton("Event b").click(); });
    expect(mocks.router.replace).toHaveBeenLastCalledWith("/calendar?event=b&source=today", { scroll: false });
    await act(async () => { textButton("关闭详情").click(); });
    expect(mocks.router.replace).toHaveBeenLastCalledWith("/calendar?source=today", { scroll: false });
    window.history.replaceState(null, "", "/calendar?event=b&source=today");
    await renderCalendar("b", { events }); await flushTimers();
    expect(container.querySelector("aside[aria-label]")).toBeNull();
    window.history.replaceState(null, "", "/calendar?source=today");
    await renderCalendar(undefined, { events }); await flushTimers();
    await renderCalendar("b", { events }); await flushTimers();
    expect(container.querySelector('[data-event-id="b"]')).not.toBeNull();
  });

  it("keeps a locally chosen draft when clearing an older event deep link", async () => {
    const event = calendarEvent("a");
    window.history.replaceState(null, "", "/calendar?event=a");
    await renderCalendar("a", { events: [event] }); await flushTimers();
    await act(async () => { mocks.fullView!.onCreate({ startsAt: "2027-01-20T09:00:00Z", endsAt: "2027-01-20T10:00:00Z", isAllDay: false }); });
    expect(mocks.router.replace).toHaveBeenLastCalledWith("/calendar", { scroll: false });
    window.history.replaceState(null, "", "/calendar");
    await renderCalendar(undefined, { events: [event] }); await flushTimers();
    expect(container.querySelector("aside[aria-label]")?.textContent).toContain("创建表单");
    expect(container.querySelector("[data-draft-start]")?.getAttribute("data-draft-start")).toBe("2027-01-20T09:00:00Z");
    expect(container.querySelector("[data-draft-end]")?.getAttribute("data-draft-end")).toBe("2027-01-20T10:00:00Z");
  });

  it("shows HTTP failure with a working retry rather than silently accepting an error body", async () => {
    const event = calendarEvent("target");
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ event }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ event }) });
    vi.stubGlobal("fetch", fetcher);
    await renderCalendar("target"); await flushTimers();
    expect(container.querySelector('[data-event-id="target"]')).toBeNull();
    expect(container.textContent).toContain("暂时无法读取这条日程");
    await act(async () => { textButton("重新读取").click(); }); await flushTimers();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-event-id="target"]')).not.toBeNull();
  });

  it("does not add or reopen an obsolete lookup after a newer link wins", async () => {
    const first = deferred<{ ok: boolean; json: () => Promise<{ event: CalendarEventRecord }> }>();
    const eventB = calendarEvent("b");
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce({ ok: true, json: async () => ({ event: eventB }) }));
    await renderCalendar("a"); await flushTimers();
    await renderCalendar("b"); await flushTimers();
    await act(async () => { first.resolve({ ok: true, json: async () => ({ event: calendarEvent("a") }) }); await first.promise; });
    expect(container.querySelector('[data-event-id="b"]')).not.toBeNull();
    expect(mocks.fullView!.events.map((event) => event.id)).toEqual(["b"]);
    await renderCalendar(); await flushTimers();
    expect(container.querySelector("aside[aria-label]")).toBeNull();
  });

  it("aborts pending lookup on Close and preserves other query parameters", async () => {
    const request = deferred<{ ok: boolean; json: () => Promise<{ event: CalendarEventRecord }> }>();
    const fetcher = vi.fn().mockReturnValue(request.promise); vi.stubGlobal("fetch", fetcher);
    window.history.replaceState(null, "", "/calendar?event=a&source=today");
    await renderCalendar("a"); await flushTimers();
    await act(async () => { textButton("关闭详情").click(); });
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => { request.resolve({ ok: true, json: async () => ({ event: calendarEvent("a") }) }); await request.promise; });
    expect(container.querySelector("aside[aria-label]")).toBeNull();
    expect(mocks.fullView!.events).toEqual([]);
    expect(mocks.router.replace).toHaveBeenCalledWith("/calendar?source=today", { scroll: false });
  });

  it("restores calendar settings before saving defaults and opens the create route", async () => {
    saveWorkspaceSession("calendar:workspace", { view: "month", cursor: "2026-11-05T12:00:00Z", categories: [], hideInternship: false });
    await renderCalendar();
    expect(loadWorkspaceSession<{ view: string }>("calendar:workspace")?.view).toBe("month");
    await flushTimers();
    expect(mocks.fullView!.initialView).toBe("dayGridMonth");
    expect(mocks.fullView!.initialDate.toISOString()).toBe("2026-11-05T12:00:00.000Z");
    await renderCalendar(undefined, { initialCreateOpen: true }); await flushTimers();
    expect(container.querySelector("aside[aria-label]")?.textContent).toContain("创建表单");
  });

  it("clears a stale range spinner when a newer cached range wins", async () => {
    const request = deferred<{ events: CalendarEventRecord[]; truncated: boolean }>();
    const eventB = calendarEvent("b");
    mocks.range.mockReturnValueOnce(rangeFixture(undefined, () => request.promise))
      .mockReturnValueOnce(rangeFixture({ events: [eventB], truncated: false }));
    await renderCalendar(); await flushTimers();
    await act(async () => { mocks.fullView!.onRangeChange({ start: new Date("2026-10-01"), end: new Date("2026-10-08") }); });
    expect(mocks.fullView!.loadingRange).toBe(true);
    await act(async () => { mocks.fullView!.onRangeChange({ start: new Date("2026-10-08"), end: new Date("2026-10-15") }); });
    expect(mocks.fullView!.loadingRange).toBe(false);
    await act(async () => { request.resolve({ events: [calendarEvent("a")], truncated: true }); await request.promise; });
    expect(mocks.fullView!.events).toEqual([eventB]);
    expect(container.textContent).not.toContain("1,000");
  });

  it("guards a repeated drag and does not close a newer inspector when reconciliation finishes", async () => {
    const eventA = calendarEvent("a"), eventB = calendarEvent("b");
    const request = deferred<{ status: string; message: string }>();
    mocks.updateCalendar.mockReturnValue(request.promise);
    mocks.range.mockReturnValue(rangeFixture({ events: [eventA, eventB], truncated: false }, async () => ({ events: [eventB], truncated: false })));
    await renderCalendar(undefined, { events: [eventA, eventB] }); await flushTimers();
    await act(async () => { mocks.fullView!.onRangeChange({ start: new Date("2026-12-20"), end: new Date("2026-12-21") }); });
    await act(async () => { textButton("Event a").click(); });
    const range = { startsAt: "2026-12-25T09:00:00Z", endsAt: "2026-12-25T10:00:00Z", isAllDay: false };
    let moving!: Promise<void>;
    await act(async () => {
      moving = mocks.fullView!.onMove(eventA, range);
      await expect(mocks.fullView!.onMove(eventA, range)).rejects.toThrow("calendar_event_update_pending");
    });
    expect(mocks.updateCalendar).toHaveBeenCalledTimes(1);
    await act(async () => { textButton("Event b").click(); });
    await act(async () => { request.resolve({ status: "success", message: "Saved" }); await moving; });
    expect(container.querySelector('[data-event-id="b"]')).not.toBeNull();
  });

  it("cancels a loading deep link on Escape instead of reopening after completion", async () => {
    const request = deferred<{ ok: boolean; json: () => Promise<{ event: CalendarEventRecord }> }>();
    const fetcher = vi.fn().mockReturnValue(request.promise); vi.stubGlobal("fetch", fetcher);
    await renderCalendar("a"); await flushTimers();
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => { request.resolve({ ok: true, json: async () => ({ event: calendarEvent("a") }) }); await request.promise; });
    expect(container.querySelector("aside[aria-label]")).toBeNull();
    expect(mocks.fullView!.events).toEqual([]);
  });

});

describe('Independent release review: superseded route replace', () => {
  it('Tasks accepts external B when B supersedes pending dismissal of A', async () => {
    const tasks = [task('a'), task('b')];
    window.history.replaceState(null, '', '/tasks?task=a');
    await renderTasks(tasks, 'a'); await flushTimers();
    await act(async () => { textButton('关闭详情').click(); });
    expect(mocks.router.replace).toHaveBeenLastCalledWith('/tasks', { scroll:false });
    // A newer external Back/Forward or deep-link navigation supersedes the /tasks replace.
    window.history.replaceState(null, '', '/tasks?task=b');
    await renderTasks(tasks, 'b'); await flushTimers();
    expect(container.querySelector('aside[aria-label="任务详情"]')?.textContent).toContain('Task b');
  });
  it('Calendar accepts external B when B supersedes pending dismissal of A', async () => {
    const events = [calendarEvent('a'), calendarEvent('b')];
    window.history.replaceState(null, '', '/calendar?event=a');
    await renderCalendar('a', {events}); await flushTimers();
    await act(async () => { textButton('关闭详情').click(); });
    expect(mocks.router.replace).toHaveBeenLastCalledWith('/calendar', { scroll:false });
    window.history.replaceState(null, '', '/calendar?event=b');
    await renderCalendar('b', {events}); await flushTimers();
    expect(container.querySelector('[data-event-id="b"]')).not.toBeNull();
  });
  it.each(["history", "link", "command"])("Tasks accepts a fresh %s navigation to the previously pending B", async (kind) => {
    const tasks = [task("a"), task("b")];
    window.history.replaceState(null, "", "/tasks?task=a");
    await renderTasks(tasks, "a"); await flushTimers();
    await click('[aria-label="打开任务：Task b"]');
    await act(async () => { textButton("关闭详情").click(); });
    if (kind === "history") {
      window.history.replaceState(null, "", "/tasks?task=b");
      await act(async () => { window.dispatchEvent(new PopStateEvent("popstate")); });
    } else if (kind === "command") {
      await act(async () => { window.dispatchEvent(new CustomEvent("personal-os:navigation-start", { detail: { href: "/tasks?task=b" } })); });
      window.history.replaceState(null, "", "/tasks?task=b");
    } else {
      const link = document.createElement("a"); link.href = "/tasks?task=b"; link.textContent = "Open B";
      link.addEventListener("click", (event) => event.preventDefault()); container.append(link);
      await act(async () => { link.click(); });
      window.history.replaceState(null, "", "/tasks?task=b");
    }
    await renderTasks(tasks, "b"); await flushTimers();
    expect(container.querySelector('aside[aria-label="任务详情"]')?.textContent).toContain("Task b");
  });

  it.each(["history", "link", "command"])("Calendar accepts a fresh %s navigation to the previously pending B", async (kind) => {
    const events = [calendarEvent("a"), calendarEvent("b")];
    window.history.replaceState(null, "", "/calendar?event=a");
    await renderCalendar("a", { events }); await flushTimers();
    await act(async () => { textButton("Event b").click(); });
    await act(async () => { textButton("关闭详情").click(); });
    if (kind === "history") {
      window.history.replaceState(null, "", "/calendar?event=b");
      await act(async () => { window.dispatchEvent(new PopStateEvent("popstate")); });
    } else if (kind === "command") {
      await act(async () => { window.dispatchEvent(new CustomEvent("personal-os:navigation-start", { detail: { href: "/calendar?event=b" } })); });
      window.history.replaceState(null, "", "/calendar?event=b");
    } else {
      const link = document.createElement("a"); link.href = "/calendar?event=b"; link.textContent = "Open B";
      link.addEventListener("click", (event) => event.preventDefault()); container.append(link);
      await act(async () => { link.click(); });
      window.history.replaceState(null, "", "/calendar?event=b");
    }
    await renderCalendar("b", { events }); await flushTimers();
    expect(container.querySelector('[data-event-id="b"]')).not.toBeNull();
  });

});


describe("Real mobile inspector history", () => {
  beforeEach(() => {
    mocks.realInspector = true;
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
    mocks.router.replace.mockImplementation((href: string) => { window.history.replaceState(window.history.state, "", href); });
  });

  it("does not navigate back to A when closing Calendar B after a committed record change", async () => {
    const events = [calendarEvent("a"), calendarEvent("b")];
    const historyState = { __NA: true, tree: ["test-tree"], retained: "kept" };
    window.history.replaceState(historyState, "", "/calendar?event=a");
    await renderCalendar("a", { events }); await flushTimers(); await flushTimers();
    expect(window.history.state.__personalOsMobileLayer).toBeTruthy();
    await act(async () => { textButton("Event b").click(); });
    await renderCalendar("b", { events }); await flushTimers();
    expect(window.location.search).toBe("?event=b");
    await click('[aria-label="关闭日程详情"]');
    await flushTimers(); await flushTimers();
    expect(window.location.pathname + window.location.search).toBe("/calendar");
    expect(window.history.state).toEqual(historyState);
    await renderCalendar(undefined, { events }); await flushTimers();
    expect(container.querySelector('[data-event-id="a"]')).toBeNull();
    expect(container.querySelector('[data-event-id="b"]')).toBeNull();
  });

  it("does not navigate back to A when closing Task B after a committed record change", async () => {
    const tasks = [task("a"), task("b")];
    const historyState = { __NA: true, tree: ["test-tree"], retained: "kept" };
    window.history.replaceState(historyState, "", "/tasks?task=a");
    await renderTasks(tasks, "a"); await flushTimers(); await flushTimers();
    expect(window.history.state.__personalOsMobileLayer).toBeTruthy();
    await click('[aria-label="打开任务：Task b"]');
    await renderTasks(tasks, "b"); await flushTimers();
    expect(window.location.search).toBe("?task=b");
    await click('[aria-label="关闭任务详情"]');
    await flushTimers(); await flushTimers();
    expect(window.location.pathname + window.location.search).toBe("/tasks");
    expect(window.history.state).toEqual(historyState);
    await renderTasks(tasks); await flushTimers();
    expect(container.querySelector('aside[aria-label="任务详情"]')).toBeNull();
  });

  it.each(["tasks", "calendar"])("%s same-record Close does not race a delayed route replace with Back", async (workspace) => {
    mocks.router.replace.mockImplementation(() => {});
    const back = vi.spyOn(window.history, "back");
    const historyState = { __NA: true, tree: ["test-tree"], retained: "kept" };
    const query = workspace === "tasks" ? "task" : "event";
    window.history.replaceState(historyState, "", `/${workspace}?${query}=a`);
    if (workspace === "tasks") await renderTasks([task("a")], "a");
    else await renderCalendar("a", { events: [calendarEvent("a")] });
    await flushTimers(); await flushTimers();
    expect(window.history.state.__personalOsMobileLayer).toBeTruthy();
    await click(workspace === "tasks" ? '[aria-label="关闭任务详情"]' : '[aria-label="关闭日程详情"]');
    await flushTimers(); await flushTimers();
    expect(back).not.toHaveBeenCalled();
    expect(window.history.state).toEqual(historyState);
    expect(container.querySelector('aside[aria-label="任务详情"], aside[aria-label="日程详情"]')).toBeNull();
    // Let the originally requested navigation commit after overlay cleanup.
    window.history.replaceState(window.history.state, "", `/${workspace}`);
    if (workspace === "tasks") await renderTasks([task("a")]);
    else await renderCalendar(undefined, { events: [calendarEvent("a")] });
    await flushTimers();
    expect(container.querySelector('aside[aria-label="任务详情"], aside[aria-label="日程详情"]')).toBeNull();
  });

});

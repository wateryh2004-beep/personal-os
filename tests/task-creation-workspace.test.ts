// @vitest-environment jsdom
import { act, createElement, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoTask } from "@/features/tasks/types";
import type { TasksWorkspaceData } from "@/features/tasks/workspace-resource";
const mocks = vi.hoisted(() => ({ create: vi.fn(), fetch: vi.fn(), update: vi.fn(), show: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }), usePathname: () => "/tasks", useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/features/tasks/microsoft-todo", () => ({
  createMicrosoftTodoTaskAction: mocks.create, updateMicrosoftTodoTaskAction: mocks.update,
  completeMicrosoftTodoTaskAction: vi.fn(), reopenMicrosoftTodoTaskAction: vi.fn(), deleteMicrosoftTodoTaskAction: vi.fn(),
  syncMicrosoftTodoAction: vi.fn(), syncAndBackupMicrosoftTodoAction: vi.fn(),
}));
vi.mock("@/features/tasks/workspace-resource", async () => {
  const { createWorkspaceResource } = await vi.importActual<typeof import("@/lib/workspace-resource-cache")>("@/lib/workspace-resource-cache");
  return { tasksWorkspaceResource: createWorkspaceResource<TasksWorkspaceData>("test:task-creation", (signal) => mocks.fetch(signal), 45_000) };
});
vi.mock("@/components/shared/action-feedback", () => ({ useActionFeedback: () => ({ show: mocks.show }) }));
vi.mock("@/components/shared/use-workspace-scroll-restoration", () => ({ useWorkspaceScrollRestoration: () => null }));
vi.mock("@/components/links/entity-backlinks", () => ({ EntityBacklinks: () => null }));
vi.mock("@/components/links/entity-markdown", () => ({ EntityMarkdown: ({ body }: { body: string }) => createElement("p", null, body) }));
vi.mock("@/components/links/entity-mention-textarea", () => ({ MentionTextarea: () => null }));
vi.mock("@/components/ai/ai-sidecar", () => ({ AISidecar: () => null }));
import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { WorkspacePanelProvider } from "@/components/layout/workspace-panel-provider";
import { tasksWorkspaceResource } from "@/features/tasks/workspace-resource";

const lists = [{ id: "default", displayName: "默认清单", isDefault: true }, { id: "selected", displayName: "项目清单", isDefault: false }];
const created: TodoTask = { id: "created-local-id", providerTaskId: "provider-id", todoListId: "selected", title: "Normalized server title", bodyText: "Server details", importance: "high", status: "notStarted", dueAt: "2026-10-06T01:30:00.000Z", completedAt: null, lastModifiedAt: "2026-10-06T00:00:00.000Z" };
const data = (tasks: TodoTask[] = []): TasksWorkspaceData => ({ lists, tasks, unavailable: false, schemaMissing: false, connection: { id: "connection", status: "active", oauth_connected_at: null, last_error_code: null } });
function Harness({ initialTaskId }: { initialTaskId?: string }) {
  const snapshot = useSyncExternalStore(tasksWorkspaceResource.subscribe, tasksWorkspaceResource.get);
  return createElement(WorkspacePanelProvider, null, createElement(TaskWorkspace, { tasks: snapshot.data!.tasks, lists: snapshot.data!.lists, initialTaskId, initialDayBounds: { startMs: 0, endMs: 1 } }));
}
let root: Root, host: HTMLDivElement;
const createDialog = () => document.querySelector<HTMLElement>('[data-slot="dialog-content"]');
const inspector = () => document.querySelector<HTMLElement>('aside[aria-label="任务详情"]');
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === text)!;
async function render() { await act(async () => root.render(createElement(Harness))); await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); }
async function openAndFill() {
  await act(async () => button("项目清单").click());
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="新建任务"]')!.click());
  const title = createDialog()!.querySelector<HTMLInputElement>('[name="title"]')!;
  title.value = "  submitted draft  ";
}
async function submit() { await act(async () => createDialog()!.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear(); localStorage.clear();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  window.history.replaceState({ __NA: true }, "", "/tasks");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  tasksWorkspaceResource.set(data());
  mocks.create.mockResolvedValue({ status: "success", taskId: created.id, message: "已创建" });
  mocks.fetch.mockResolvedValue(data([created]));
  mocks.update.mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("creation through the mounted task workspace", () => {
  it("rereads the actual normalized task, reveals it, and never duplicates the resource's row", async () => {
    await render(); await openAndFill();
    expect(createDialog()!.querySelector<HTMLSelectElement>('[name="todo_list_id"]')!.value).toBe("selected");
    await submit();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(createDialog()).toBeNull();
    expect(inspector()).toBeNull();
    expect(host.textContent).toContain("任务已创建");
    await act(async () => button("查看任务").click());
    expect(inspector()!.textContent).toContain(created.title);
    expect(inspector()!.textContent).toContain(created.bodyText);
    expect(button("全部").getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll('[aria-label="打开任务：Normalized server title"]')).toHaveLength(1);
    expect(tasksWorkspaceResource.get().data!.tasks).toEqual([created]);
  });

  it("keeps other newly read rows when it publishes the created task", async () => {
    const other = { ...created, id: "other", title: "Another server row" };
    mocks.fetch.mockResolvedValue(data([other, created]));
    await render(); await openAndFill(); await submit();
    expect(tasksWorkspaceResource.get().data!.tasks.map((row) => row.id)).toEqual([other.id, created.id]);
    expect(document.querySelectorAll('[aria-label="打开任务：Normalized server title"]')).toHaveLength(1);
    expect(document.querySelector('[aria-label="打开任务：Another server row"]')).not.toBeNull();
  });

  it("recovers a successful create with read-only retry, including an absent task in the response", async () => {
    mocks.fetch.mockResolvedValueOnce(data());
    await render(); await openAndFill(); await submit();
    expect(createDialog()!.textContent).toContain("任务已创建，但暂时无法读取详情");
    expect(inspector()).toBeNull();
    expect(tasksWorkspaceResource.get().data!.tasks).toHaveLength(0);
    await act(async () => button("重新读取任务").click());
    expect(createDialog()).toBeNull(); expect(inspector()).toBeNull();
    await act(async () => button("查看任务").click());
    expect(inspector()!.textContent).toContain(created.title);
    expect(mocks.create).toHaveBeenCalledTimes(1); expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("retains read recovery after closing a confirmed-create dialog", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("offline"));
    await render(); await openAndFill(); await submit();
    await act(async () => createDialog()!.querySelector<HTMLButtonElement>('form button[type="button"]')!.click());
    expect(createDialog()).toBeNull(); expect(host.textContent).toContain("任务已创建，但暂时无法读取详情");
    await act(async () => button("重新读取").click());
    await act(async () => button("查看任务").click());
    expect(inspector()!.textContent).toContain(created.title);
    expect(mocks.create).toHaveBeenCalledTimes(1); expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain("任务已创建，但暂时无法读取详情");
  });

  it("does not let a late post-create read replace a newer routed selection", async () => {
    const other = { ...created, id: "other", title: "Newer selected task" };
    tasksWorkspaceResource.set(data([other]));
    let finish!: (value: TasksWorkspaceData) => void;
    mocks.fetch.mockReturnValueOnce(new Promise<TasksWorkspaceData>((resolve) => { finish = resolve; }));
    await render(); await openAndFill(); await submit();
    await act(async () => {
      window.history.replaceState(window.history.state, "", "/tasks?task=other");
      root.render(createElement(Harness, { initialTaskId: other.id }));
    });
    await act(async () => finish(data([other, created])));
    expect(createDialog()).toBeNull();
    expect(inspector()!.textContent).toContain(other.title);
    expect(inspector()!.textContent).not.toContain(created.title);
    expect(tasksWorkspaceResource.get().data!.tasks).toHaveLength(2);
  });

  it("does not release a newer route's overlay when a read settles after unmount", async () => {
    let finish!: (value: TasksWorkspaceData) => void;
    mocks.fetch.mockReturnValueOnce(new Promise<TasksWorkspaceData>((resolve) => { finish = resolve; }));
    await render(); await openAndFill(); await submit();
    await act(async () => root.render(createElement("main", null, "Another route")));
    const newerState = { __NA: true, __personalOsMobileLayer: "dialog:newer-route" };
    window.history.replaceState(newerState, "", "/projects");
    await act(async () => finish(data([created])));
    expect(host.textContent).toBe("Another route");
    expect(window.history.state).toEqual(newerState);
    expect(window.location.pathname).toBe("/projects");
  });

  it("shows and saves inspector deadlines in the browser's local timezone", async () => {
    const original = Intl.DateTimeFormat.prototype.resolvedOptions;
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (this: Intl.DateTimeFormat) { return { ...original.call(this), timeZone: "Asia/Shanghai" }; });
    await render(); await openAndFill(); await submit();
    await act(async () => button("查看任务").click());
    const due = inspector()!.querySelector<HTMLInputElement>('[aria-label="截止日期"]')!;
    expect(due.value).toBe("2026-10-06T09:30");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(due, "2026-10-07T10:45");
      due.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(mocks.update).toHaveBeenCalledWith({ taskId: created.id, dueAt: "2026-10-07T02:45:00.000Z" });
  });

  it("closes the mobile creation entry so the next Back returns to the prior route", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    window.history.replaceState({ __NA: true }, "", "/today");
    window.history.pushState({ __NA: true }, "", "/tasks");
    await render(); await openAndFill();
    expect(window.history.state.__personalOsMobileLayer).toMatch(/^dialog:/);
    await submit();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(createDialog()).toBeNull(); expect(inspector()).toBeNull();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
    expect(window.location.pathname).toBe("/tasks");
    expect(window.history.state.__personalOsMobileLayer).toBeUndefined();
    expect(button("查看任务")).toBeDefined();
    await act(async () => { window.history.back(); await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(window.location.pathname).toBe("/today");
  });

  it("opens the normalized task only when requested after mobile creation dismissal", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    window.history.replaceState({ __NA: true }, "", "/today");
    window.history.pushState({ __NA: true }, "", "/tasks");
    await render(); await openAndFill(); await submit();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(inspector()).toBeNull();
    await act(async () => button("查看任务").click());
    expect(inspector()!.textContent).toContain(created.title);
    expect(inspector()!.textContent).toContain(created.bodyText);
    expect(window.history.state.__personalOsMobileLayer).toMatch(/^side-panel:inspector:/);
    await act(async () => { window.history.back(); await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(inspector()).toBeNull(); expect(window.location.pathname).toBe("/tasks");
    await act(async () => { window.history.back(); await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(window.location.pathname).toBe("/today");
  });
});

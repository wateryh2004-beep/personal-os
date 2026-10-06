// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoCreateState } from "@/features/tasks/microsoft-todo";
const mocks = vi.hoisted(() => ({ create: vi.fn(), read: vi.fn(), canonicalHref: "" }));
vi.mock("next/navigation", async () => {
  const { useMemo, useSyncExternalStore } = await import("react");
  const subscribe = (notify: () => void) => {
    const onPop = () => { mocks.canonicalHref = window.location.href; notify(); };
    window.addEventListener("popstate", onPop);
    window.addEventListener("test:next-history", notify);
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("test:next-history", notify); };
  };
  return { useSearchParams: () => {
    const href = useSyncExternalStore(subscribe, () => mocks.canonicalHref);
    return useMemo(() => new URL(href).searchParams, [href]);
  } };
});
vi.mock("@/features/tasks/microsoft-todo", () => ({ createMicrosoftTodoTaskAction: mocks.create }));
import { MicrosoftTodoCreateDialog } from "@/components/tasks/microsoft-todo-create-dialog";

const lists = [
  { id: "default", displayName: "默认清单", isDefault: true },
  { id: "selected", displayName: "项目清单", isDefault: false },
];
let root: Root, host: HTMLDivElement;
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const input = (name: string) => dialog()!.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`)!;
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === text)!;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((finish) => { resolve = finish; }); return { promise, resolve }; }
async function render(selectedListId: string | null = "selected", initialOpen = false) {
  await act(async () => root.render(createElement(MicrosoftTodoCreateDialog, { lists, selectedListId, initialOpen, onCreated: mocks.read })));
}
async function open() { await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="新建任务"]')!.click()); }
async function submit() { await act(async () => dialog()!.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
function fill() { input("title").value = "  我的任务  "; input("body_text").value = "保留说明"; input("importance").value = "high"; input("due_at").value = "2026-10-06T09:30"; }

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  window.history.replaceState({ __NA: true, retained: "state" }, "", "/tasks");
  mocks.canonicalHref = window.location.href;
  for (const method of ["replaceState", "pushState"] as const) {
    const original = window.history[method].bind(window.history);
    vi.spyOn(window.history, method).mockImplementation((data, unused, url) => {
      // Mirror Next 16's early return for its own router/history writes.
      if (data?.__NA || data?._N) return original(data, unused, url);
      original({ ...data, __NA: window.history.state?.__NA, __PRIVATE_NEXTJS_INTERNALS_TREE: window.history.state?.__PRIVATE_NEXTJS_INTERNALS_TREE }, unused, url);
      if (url) { mocks.canonicalHref = window.location.href; window.dispatchEvent(new Event("test:next-history")); }
    });
  }
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  mocks.create.mockResolvedValue({ status: "success", taskId: "created", message: "已创建" });
  mocks.read.mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("full task creation dialog", () => {
  it("targets the selected list and converts the browser wall time before submitting", async () => {
    const original = Intl.DateTimeFormat.prototype.resolvedOptions;
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (this: Intl.DateTimeFormat) { return { ...original.call(this), timeZone: "Asia/Shanghai" }; });
    await render(); await open(); fill();
    expect(input("todo_list_id").value).toBe("selected");
    await submit();
    const form = mocks.create.mock.calls[0][1] as FormData;
    expect(form.get("todo_list_id")).toBe("selected");
    expect(form.get("due_at")).toBe("2026-10-06T01:30:00.000Z");
    expect(form.get("importance")).toBe("high");
    expect(mocks.read).toHaveBeenCalledWith("created");
    expect(dialog()).toBeNull();
  });

  it("retains every field after an action error, then closes only after successful reread", async () => {
    mocks.create.mockResolvedValueOnce({ status: "error", message: "保存失败" });
    await render(); await open(); fill(); await submit();
    expect(dialog()!.querySelector('[role="alert"]')?.textContent).toBe("保存失败");
    expect(input("title").value).toBe("  我的任务  ");
    expect(input("body_text").value).toBe("保留说明");
    expect(input("todo_list_id").value).toBe("selected");
    expect(input("importance").value).toBe("high");
    expect(input("due_at").value).toBe("2026-10-06T09:30");
    const read = deferred<void>(); mocks.read.mockReturnValueOnce(read.promise);
    await submit();
    expect(dialog()).not.toBeNull();
    await act(async () => read.resolve());
    expect(dialog()).toBeNull(); expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it("preserves the draft after a thrown action and allows an explicit cancel/reset", async () => {
    mocks.create.mockRejectedValueOnce(new Error("offline"));
    await render(); await open(); fill(); await submit();
    expect(input("title").value).toBe("  我的任务  ");
    expect(dialog()!.textContent).toContain("提交结果尚未确认");
    await act(async () => button("取消").click());
    expect(dialog()).toBeNull();
    await render("default"); await open();
    expect(input("title").value).toBe(""); expect(input("body_text").value).toBe("");
    expect(input("importance").value).toBe("normal"); expect(input("due_at").value).toBe("");
    expect(input("todo_list_id").value).toBe("default");
    expect(dialog()!.querySelector('[role="alert"]')).toBeNull();
  });

  it("blocks same-tick duplicate submits, cancel, and Escape while pending", async () => {
    const request = deferred<TodoCreateState>(); mocks.create.mockReturnValueOnce(request.promise);
    await render(); await open(); fill();
    await act(async () => {
      const form = dialog()!.querySelector("form")!;
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(button("取消").disabled).toBe(true);
    expect(dialog()!.querySelector("fieldset")!.disabled).toBe(true);
    expect(button("正在创建…").disabled).toBe(true);
    await act(async () => { button("取消").click(); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(dialog()).not.toBeNull();
    await act(async () => request.resolve({ status: "error", message: "重试" }));
    expect(input("title").value).toBe("  我的任务  ");
  });

  it("retries only the read when creation succeeded but details were unavailable", async () => {
    mocks.read.mockRejectedValueOnce(new Error("read failed"));
    await render(); await open(); fill(); await submit();
    expect(dialog()!.textContent).toContain("任务已创建，但暂时无法读取详情");
    expect(dialog()!.querySelector('button[type="submit"]')).toBeNull();
    await submit();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await act(async () => button("重新读取任务").click());
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });

  it("falls back to the default list and clears a dismissed draft", async () => {
    await render("missing"); await open(); fill();
    expect(input("todo_list_id").value).toBe("default");
    await act(async () => button("取消").click()); await open();
    expect(input("title").value).toBe(""); expect(input("due_at").value).toBe("");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("consumes create=1 before opening the mobile layer, preserving URL and Next state", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const state = { __NA: true, retained: "state" };
    window.history.replaceState(state, "", "/tasks?create=1&task=existing&source=today#details");
    mocks.canonicalHref = window.location.href;
    const push = vi.spyOn(window.history, "pushState");
    await render("selected", true);
    expect(dialog()).not.toBeNull();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/tasks?task=existing&source=today#details");
    expect(window.history.state).toMatchObject(state);
    expect(new URL(mocks.canonicalHref).searchParams.has("create")).toBe(false);
    expect(push).toHaveBeenCalledTimes(1);
    expect(String(push.mock.calls[0][2])).not.toContain("create=1");
    await act(async () => { window.history.back(); await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(dialog()).toBeNull(); expect(window.history.state).toEqual(state);
    expect(window.location.search).toBe("?task=existing&source=today");
    await render("selected", true);
    expect(dialog()).toBeNull();
  });

  it("accepts repeated create URL requests after each dismissal without retaining create=1", async () => {
    await render();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await act(async () => window.history.pushState(null, "", "/tasks?create=1&source=today"));
      expect(dialog()).not.toBeNull();
      expect(new URL(mocks.canonicalHref).search).toBe("?source=today");
      await act(async () => button("取消").click());
      expect(dialog()).toBeNull();
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("retains an existing overlay marker when consuming a nested create request", async () => {
    window.history.replaceState({ __NA: true, __personalOsMobileLayer: "side-panel:inspector:existing", retained: "state" }, "", "/tasks?task=existing&create=1");
    mocks.canonicalHref = window.location.href;
    await render("selected", true);
    expect(window.history.state.__personalOsMobileLayer).toBe("side-panel:inspector:existing");
    expect(new URL(mocks.canonicalHref).search).toBe("?task=existing");
    expect(window.history.state.retained).toBe("state");
  });

  it("vetoes mobile Back while the write is in flight", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const request = deferred<TodoCreateState>(); mocks.create.mockReturnValueOnce(request.promise);
    await render(); await open(); fill(); await submit();
    const pendingState = window.history.state;
    await act(async () => { window.history.back(); await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(dialog()).not.toBeNull(); expect(window.history.state).toEqual(pendingState);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await act(async () => request.resolve({ status: "error", message: "未保存" }));
    await act(async () => { window.history.back(); await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(dialog()).toBeNull();
  });
});

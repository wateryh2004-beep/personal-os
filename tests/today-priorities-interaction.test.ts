// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TodayFocus } from "@/features/today/types";
const mocks = vi.hoisted(() => ({ save: vi.fn(), revalidate: vi.fn(), mutate: vi.fn(), invalidate: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props, children) }));
vi.mock("@/features/today/focus-actions", () => ({ saveTodayFocusAction: mocks.save }));
vi.mock("@/features/today/workspace-resource", () => ({ todayWorkspaceResource: { revalidate: mocks.revalidate, mutate: mocks.mutate, invalidate: mocks.invalidate } }));
vi.mock("@/components/today/complete-task-control", () => ({ CompleteTaskControl: ({ title }: { title: string }) => createElement("button", { "aria-label": `完成 ${title}` }, "完成") }));
vi.mock("@/components/today/today-task-actions", () => ({ TodayTaskActions: ({ task }: { task: { title: string } }) => createElement("button", { "aria-label": `更多操作：${task.title}` }, "更多") }));
import { TodayPriorities } from "@/components/today/today-priorities";
let host: HTMLDivElement, root: Root;
const focus: TodayFocus = { date: "2026-10-01", available: true, selectedIds: [], selectedTasks: [], candidates: [1,2,3,4].map((n) => ({ id: `c0000000-0000-4000-8000-00000000000${n}`, title: `Task ${n}`, status: "notStarted", due_at: null, importance: "normal" })) };
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === text)!;
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const draftRows = () => [...dialog().querySelectorAll('[aria-label="待保存的今日重点"] li')];
const render = async (value = focus) => { await act(async () => root.render(createElement(TodayPriorities, { focus: value }))); };
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  mocks.revalidate.mockResolvedValue({ focus });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});
async function choose(n: number) { await act(async () => dialog().querySelector<HTMLButtonElement>(`[aria-label="选择重点 Task ${n}"]`)!.click()); }
async function remove(n: number) { await act(async () => dialog().querySelector<HTMLButtonElement>(`[aria-label="移除重点 Task ${n}"]`)!.click()); }

it("keeps the empty state compact and opens a named bottom sheet without focusing search", async () => {
  expect(host.textContent).toContain("今天想推进什么？");
  expect(host.textContent).not.toMatch(/0\s*\/\s*3|自己选|还没选重点/);
  expect(host.querySelector('input[type="search"]')).toBeNull();
  const trigger = button("选择重点");
  trigger.focus();
  await act(async () => trigger.click());
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(dialog().dataset.side).toBe("bottom");
  expect(document.getElementById(dialog().getAttribute("aria-labelledby")!)?.textContent).toBe("选择今日重点");
  expect(document.getElementById(dialog().getAttribute("aria-describedby")!)?.textContent).toContain("最多选择 3 件");
  expect(document.activeElement).toBe(dialog().querySelector('[data-slot="sheet-title"]'));
  expect(dialog().style.maxHeight).toContain("85dvh");
  await act(async () => button("取消").click());
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it("limits explicit choices to three and cancel never writes", async () => {
  await act(async () => button("选择重点").click());
  for (const n of [1,2,3]) await choose(n);
  expect(draftRows()).toHaveLength(3);
  expect(dialog().querySelector<HTMLButtonElement>('[aria-label="选择重点 Task 4"]')!.disabled).toBe(true);
  expect(host.querySelectorAll('a[href^="/tasks?task="]')).toHaveLength(0);
  await act(async () => button("取消").click());
  expect(dialog()).toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () => button("选择重点").click());
  expect(draftRows()).toHaveLength(0);
});
it("preserves failed choices, retries once, and invalidates old reads after save", async () => {
  mocks.save.mockResolvedValueOnce({ ok: false, message: "未保存" }).mockResolvedValueOnce({ ok: true, message: "已保存" });
  await act(async () => button("选择重点").click()); await choose(1);
  await act(async () => button("保存重点").click());
  expect(dialog().querySelector('[role="alert"]')?.textContent).toBe("未保存");
  expect(draftRows()).toHaveLength(1);
  await act(async () => button("重试保存").click());
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  expect(mocks.revalidate).toHaveBeenCalledWith({ force: true });
  expect(dialog()).toBeNull();
  expect(host.querySelector('[role="status"]')?.textContent).toBe("已保存");
});
it("locks reload, cancellation and writes while a save is pending", async () => {
  let finish!: (result: { ok: boolean; message: string }) => void;
  mocks.save.mockResolvedValueOnce({ ok: false, message: "conflict" }).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => button("选择重点").click()); await choose(1);
  await act(async () => button("保存重点").click());
  await act(async () => button("重试保存").click());
  expect(button("载入最新重点").disabled).toBe(true);
  expect(button("取消").disabled).toBe(true);
  expect(dialog().querySelector<HTMLButtonElement>('[aria-label="关闭重点选择"]')!.disabled).toBe(true);
  expect(dialog().querySelector<HTMLInputElement>('input[type="search"]')!.disabled).toBe(true);
  await act(async () => {
    button("载入最新重点").click(); button("保存中…").click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(dialog()).not.toBeNull();
  expect(mocks.save).toHaveBeenCalledTimes(2); expect(mocks.revalidate).not.toHaveBeenCalled();
  await act(async () => finish({ ok: false, message: "未保存" }));
});
it("retains selection order and the original concurrency baseline when props refresh", async () => {
  const original = { ...focus, selectedIds: [focus.candidates[1].id], selectedTasks: [focus.candidates[1]] };
  await render(original);
  await act(async () => button("调整").click());
  await choose(3); await choose(1); await remove(2); await choose(4);
  expect(draftRows().map((row) => row.textContent)).toEqual(["1Task 3", "2Task 1", "3Task 4"]);
  await render({ ...focus, selectedIds: [focus.candidates[3].id], selectedTasks: [focus.candidates[3]] });
  mocks.save.mockResolvedValueOnce({ ok: true, message: "已保存" });
  await act(async () => button("保存重点").click());
  expect(mocks.save).toHaveBeenCalledWith({ date: focus.date, taskIds: [focus.candidates[2].id, focus.candidates[0].id, focus.candidates[3].id], previousIds: original.selectedIds });
  const update = mocks.mutate.mock.calls[0][0]({ focus: original });
  expect(update.focus.selectedIds).toEqual([focus.candidates[2].id, focus.candidates[0].id, focus.candidates[3].id]);
  expect(update.focus.selectedTasks.map((task: { id: string }) => task.id)).toEqual(update.focus.selectedIds);
});
it("reloads the latest concurrency baseline after a conflict and allows an empty reset", async () => {
  mocks.save.mockResolvedValueOnce({ ok: false, message: "其他窗口已修改" }).mockResolvedValueOnce({ ok: true, message: "已保存" });
  await act(async () => button("选择重点").click()); await choose(1);
  await act(async () => button("保存重点").click());
  mocks.revalidate.mockResolvedValueOnce({ focus: { ...focus, selectedIds: [focus.candidates[2].id], selectedTasks: [focus.candidates[2]] } });
  await act(async () => button("载入最新重点").click());
  expect(draftRows().map((row) => row.textContent)).toEqual(["1Task 3"]);
  await remove(3);
  await act(async () => button("保存重点").click());
  expect(mocks.save).toHaveBeenLastCalledWith({ date: focus.date, taskIds: [], previousIds: [focus.candidates[2].id] });
});
it("keeps the draft available after an unconfirmed save or failed reload", async () => {
  mocks.save.mockRejectedValueOnce(new Error("network"));
  await act(async () => button("选择重点").click()); await choose(1);
  await act(async () => button("保存重点").click());
  expect(dialog().querySelector('[role="alert"]')?.textContent).toContain("未能确认");
  mocks.revalidate.mockRejectedValueOnce(new Error("network"));
  await act(async () => button("载入最新重点").click());
  expect(dialog().querySelector('[role="alert"]')?.textContent).toContain("当前选择仍保留");
  expect(draftRows().map((row) => row.textContent)).toEqual(["1Task 1"]);
});
it("keeps direct completion and task actions outside the editor", async () => {
  const tasks = [
    { ...focus.candidates[1], due_at: "2026-10-01T08:00:00Z" },
    { ...focus.candidates[0], status: "completed" },
  ];
  await render({ ...focus, selectedIds: tasks.map((task) => task.id), selectedTasks: tasks });
  expect([...host.querySelectorAll('a[href^="/tasks?task="]')].map((link) => link.textContent)).toEqual(["Task 2", "打开任务", "Task 1"]);
  expect(host.querySelector('[aria-label="完成 Task 2"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="已完成"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="更多操作：Task 2"]')).not.toBeNull();
  expect(button("明天")).toBeUndefined();
  await act(async () => button("调整").click());
  await remove(2);
  expect(host.querySelector('[aria-label="完成 Task 2"]')).not.toBeNull();
  expect(dialog().querySelector('[aria-label="完成 Task 2"]')).toBeNull();
});
it("mobile Back dismisses the sheet without saving or focusing the keyboard", async () => {
  vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
  const previousState = window.history.state;
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  await act(async () => button("选择重点").click());
  expect(document.activeElement?.tagName).toBe("H2");
  expect(window.history.state.__personalOsMobileLayer).toContain("sheet:");
  await choose(1);
  await act(async () => {
    window.history.replaceState(previousState, "", window.location.href);
    window.dispatchEvent(new PopStateEvent("popstate", { state: previousState }));
  });
  expect(dialog()).toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(back).not.toHaveBeenCalled();
});
it("keeps the sheet and its history marker through repeated Back while saving", async () => {
  vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
  const previousState = { __NA: true, tree: ["today"], retained: "kept" };
  window.history.replaceState(previousState, "", "/today");
  let finish!: (result: { ok: boolean; message: string }) => void;
  mocks.save.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => button("选择重点").click());
  const sheetState = window.history.state;
  const length = window.history.length;
  await choose(1);
  await act(async () => button("保存重点").click());
  const goBack = async () => { await act(async () => {
    const popped = new Promise<void>((resolve) => window.addEventListener("popstate", () => resolve(), { once: true }));
    window.history.back();
    await popped;
  }); };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await goBack();
    expect(dialog()).not.toBeNull();
    expect(draftRows().map((row) => row.textContent)).toEqual(["1Task 1"]);
    expect(window.history.state).toEqual(sheetState);
    expect(window.history.length).toBe(length);
    expect(window.location.pathname).toBe("/today");
    expect(button("取消").disabled).toBe(true);
  }
  await act(async () => finish({ ok: false, message: "未保存" }));
  await goBack();
  expect(dialog()).toBeNull();
  expect(window.history.state).toEqual(previousState);
  expect(window.location.pathname).toBe("/today");
  expect(mocks.save).toHaveBeenCalledOnce();
});

it("keeps all three long focuses and due states visible with only one typographic lead", async () => {
  const tasks = focus.candidates.slice(0, 3).map((task, index) => ({ ...task, title: `${task.title} 很长的任务标题，需要完整换行展示而不是截断`, due_at: index === 0 ? "2026-09-30T08:00:00Z" : index === 1 ? "2026-10-01T08:00:00Z" : null }));
  await render({ ...focus, selectedIds: tasks.map((task) => task.id), selectedTasks: tasks });
  expect(host.querySelectorAll(".today-focus-lead")).toHaveLength(1);
  expect(host.querySelectorAll(".today-focus-row")).toHaveLength(2);
  expect(host.querySelectorAll(".today-focus-item")).toHaveLength(3);
  expect(host.querySelector(".today-priorities")?.className).not.toMatch(/rounded|bg-/);
  expect(host.querySelector(".today-focus-title")?.className).not.toContain("line-clamp");
  expect([...host.querySelectorAll(".today-focus-due")].map((row) => row.textContent)).toEqual(["已逾期 · 09/30", "今天到期"]);
});
it("embeds a shared heading and event lead while keeping all selected focuses compact", async () => {
  const tasks = focus.candidates.slice(0, 3);
  await act(async () => root.render(createElement(TodayPriorities, { focus: { ...focus, selectedIds: tasks.map((task) => task.id), selectedTasks: tasks }, header: createElement("h1", null, "今日"), leadBefore: createElement("p", null, "Next real event"), compactAll: true })));
  expect(host.querySelector(".today-heading-row h1")?.textContent).toBe("今日");
  expect(button("调整重点")).toBeDefined();
  expect(host.querySelectorAll(".today-focus-lead")).toHaveLength(0);
  expect(host.querySelectorAll(".today-focus-row")).toHaveLength(3);
  expect(host.textContent!.indexOf("Next real event")).toBeLessThan(host.textContent!.indexOf("Task 1"));
  await act(async () => button("调整重点").click());
  expect(dialog()).not.toBeNull();
});
it("uses the first unfinished selection as the lead without reordering saved choices", async () => {
  const tasks = focus.candidates.slice(0, 3).map((task, index) => ({ ...task, status: index === 0 ? "completed" : "notStarted" }));
  await render({ ...focus, selectedIds: tasks.map((task) => task.id), selectedTasks: tasks });
  expect(host.querySelector(".today-focus-lead")?.getAttribute("data-task-id")).toBe(tasks[1].id);
  expect([...host.querySelectorAll(".today-focus-item")].map((row) => row.getAttribute("data-task-id"))).toEqual(tasks.map((task) => task.id));
  await render({ ...focus, selectedIds: tasks.map((task) => task.id), selectedTasks: tasks.map((task) => ({ ...task, status: "completed" })) });
  expect(host.querySelector(".today-focus-lead")).toBeNull();
});

it("offers one useful empty-focus row below the evening lead", async () => {
  await act(async () => root.render(createElement(TodayPriorities, { focus, header: createElement("h1", null, "今日"), leadBefore: createElement("p", null, "Tomorrow event"), compactAll: true })));
  expect(host.querySelector(".today-heading-row button")).toBeNull();
  const trigger = host.querySelector<HTMLButtonElement>('[aria-label="选择重点"]')!;
  expect(trigger.textContent).toBe("选择重点");
  expect(host.textContent!.indexOf("Tomorrow event")).toBeLessThan(host.textContent!.indexOf("选择重点"));
  await act(async () => trigger.click());
  expect(dialog()).not.toBeNull();
});

it("separates the empty focus heading from its visible choose action", async () => {
  await act(async () => root.render(createElement(TodayPriorities, { focus, header: createElement("h1", null, "今天") })));
  const heading = host.querySelector("#today-priorities-heading")!;
  expect(heading.textContent).toBe("今日重点");
  expect(heading.classList.contains("sr-only")).toBe(false);
  const trigger = host.querySelector<HTMLButtonElement>('[aria-label="选择重点"]')!;
  expect(trigger.textContent).toBe("选择重点");
  expect(trigger.classList.contains("ui-action-secondary")).toBe(true);
  trigger.focus();
  await act(async () => trigger.click());
  expect(dialog()).not.toBeNull();
  await act(async () => button("取消").click());
  expect(mocks.save).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
});

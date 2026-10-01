// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TodayFocus } from "@/features/today/types";
const mocks = vi.hoisted(() => ({ save: vi.fn(), revalidate: vi.fn(), mutate: vi.fn(), invalidate: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props, children) }));
vi.mock("@/features/today/focus-actions", () => ({ saveTodayFocusAction: mocks.save }));
vi.mock("@/features/today/workspace-resource", () => ({ todayWorkspaceResource: { revalidate: mocks.revalidate, mutate: mocks.mutate, invalidate: mocks.invalidate } }));
vi.mock("@/components/today/complete-task-control", () => ({ CompleteTaskControl: () => null }));
import { TodayPriorities } from "@/components/today/today-priorities";
let host: HTMLDivElement, root: Root;
const focus: TodayFocus = { date: "2026-10-01", available: true, selectedIds: [], selectedTasks: [], candidates: [1,2,3,4].map((n) => ({ id: `c0000000-0000-4000-8000-00000000000${n}`, title: `Task ${n}`, status: "notStarted", due_at: null, importance: "normal" })) };
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === text)!;
beforeEach(async () => { vi.resetAllMocks(); mocks.revalidate.mockResolvedValue({ focus }); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root.render(createElement(TodayPriorities, { focus }))); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT; });
async function choose(n: number) { await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.includes(`Task ${n}`) && !item.getAttribute("aria-label"))!.click()); }
it("limits explicit choices to three and cancel never writes", async () => {
  await act(async () => button("选择重点").click());
  for (const n of [1,2,3]) await choose(n);
  expect(host.querySelectorAll('a[href^="/tasks?task="]')).toHaveLength(3);
  expect([...host.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.includes("Task 4"))!.disabled).toBe(true);
  await act(async () => button("取消").click());
  expect(host.querySelectorAll('a[href^="/tasks?task="]')).toHaveLength(0);
  expect(mocks.save).not.toHaveBeenCalled();
});
it("preserves failed choices, retries once, and invalidates old reads after save", async () => {
  mocks.save.mockResolvedValueOnce({ ok: false, message: "未保存" }).mockResolvedValueOnce({ ok: true, message: "已保存" });
  await act(async () => button("选择重点").click()); await choose(1);
  await act(async () => button("保存重点").click());
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("未保存");
  expect(host.querySelectorAll('a[href^="/tasks?task="]')).toHaveLength(1);
  await act(async () => button("重试保存").click());
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  expect(mocks.revalidate).toHaveBeenCalledWith({ force: true });
});
it("locks reload, cancel and writes while a save is pending", async () => {
  let finish!: (result: { ok: boolean; message: string }) => void;
  mocks.save.mockResolvedValueOnce({ ok: false, message: "conflict" }).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => button("选择重点").click()); await choose(1);
  await act(async () => button("保存重点").click());
  await act(async () => button("重试保存").click());
  expect(button("载入最新重点").disabled).toBe(true);
  expect(button("取消").disabled).toBe(true);
  await act(async () => { button("载入最新重点").click(); button("保存中…").click(); });
  expect(mocks.save).toHaveBeenCalledTimes(2); expect(mocks.revalidate).not.toHaveBeenCalled();
  await act(async () => finish({ ok: false, message: "未保存" }));
});

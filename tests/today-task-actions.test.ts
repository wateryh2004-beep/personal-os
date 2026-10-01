// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ complete: vi.fn(), defer: vi.fn(), show: vi.fn(), todayInvalidate: vi.fn(), tasksInvalidate: vi.fn(), revalidate: vi.fn(), tasksMutate: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props, children) }));
vi.mock("@/features/tasks/microsoft-todo", () => ({ completeMicrosoftTodoTaskAction: mocks.complete, deferMicrosoftTodoTaskAction: mocks.defer }));
vi.mock("@/components/shared/action-feedback", () => ({ useActionFeedback: () => ({ show: mocks.show }) }));
vi.mock("@/features/today/workspace-resource", () => ({ todayWorkspaceResource: { invalidate: mocks.todayInvalidate, revalidate: mocks.revalidate } }));
vi.mock("@/features/tasks/workspace-resource", () => ({ tasksWorkspaceResource: { invalidate: mocks.tasksInvalidate, mutate: mocks.tasksMutate } }));
import { CompleteTaskControl } from "@/components/today/complete-task-control";
import { TodayCommitments } from "@/components/today/today-commitments";
let host: HTMLDivElement, root: Root;
beforeEach(() => { vi.resetAllMocks(); mocks.revalidate.mockResolvedValue({}); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT; });
it("guards repeated completion, keeps failures retryable, and invalidates both caches after success", async () => {
  let finish!: () => void;
  mocks.complete.mockRejectedValueOnce(new Error("offline")).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  await act(async () => root.render(createElement(CompleteTaskControl, { taskId: "t", title: "Task", compact: true })));
  const button = host.querySelector("button")!;
  await act(async () => button.click());
  expect(button.getAttribute("aria-label")).toBe("重试完成 Task");
  expect(mocks.show).toHaveBeenCalledWith(expect.objectContaining({ tone: "error", message: expect.stringContaining("未能确认") }));
  await act(async () => { button.click(); button.click(); });
  expect(mocks.complete).toHaveBeenCalledTimes(2);
  expect(button.disabled).toBe(true);
  await act(async () => finish());
  expect(mocks.tasksInvalidate).toHaveBeenCalledTimes(1);
  expect(mocks.todayInvalidate).toHaveBeenCalledTimes(1);
  expect(mocks.revalidate).toHaveBeenCalledWith({ force: true });
});
it("defers in the profile timezone and invalidates Tasks as well as Today", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-03-07T17:00:00Z"));
  try {
    mocks.defer.mockResolvedValue(undefined);
    await act(async () => root.render(createElement(TodayCommitments, { timezone: "America/New_York", commitments: [{ id: "task-t", kind: "task", title: "Task", whyNow: "今天到期", constraint: "今天", href: "/tasks?task=t", source: { domain: "tasks", entityId: "t", label: "Microsoft To Do" }, task: { id: "t", title: "Task", due_at: null, importance: "normal", status: "notStarted" } }] })));
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("明天"))!.click());
    expect(mocks.defer.mock.calls[0][0].get("due_at")).toBe("2026-03-08T16:00:00.000Z");
    expect(mocks.tasksInvalidate).toHaveBeenCalledTimes(1);
    expect(mocks.todayInvalidate).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});

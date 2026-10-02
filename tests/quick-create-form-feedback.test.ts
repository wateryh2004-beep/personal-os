// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalCreateLayer } from "@/components/shared/global-create-layer-impl";

const actions = vi.hoisted(() => ({ createCalendarEvent: vi.fn(), createNote: vi.fn() }));
vi.mock("@/features/calendar/actions", () => ({ createCalendarEvent: actions.createCalendarEvent }));
vi.mock("@/features/notes/actions", () => ({ createNote: actions.createNote }));
vi.mock("@/features/tasks/microsoft-todo", () => ({ createMicrosoftTodoTaskAction: vi.fn() }));
vi.mock("@/features/shopping/actions", () => ({ createPurchaseItem: vi.fn() }));
vi.mock("@/features/travel/actions", () => ({ createTrip: vi.fn() }));
vi.mock("@/features/projects/actions", () => ({ createProject: vi.fn() }));
vi.mock("@/features/inbox/actions", () => ({ captureInboxItem: vi.fn() }));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false })) });
  vi.clearAllMocks();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("quick-create forms", () => {
  it("labels times and retains input after failure while suppressing duplicate submissions", async () => {
    let fail!: (error: Error) => void;
    actions.createCalendarEvent.mockImplementation(() => new Promise((_resolve, reject) => { fail = reject; }));
    await act(async () => root.render(createElement(GlobalCreateLayer, { initialRequest: { kind: "calendar", title: "准备讨论" } })));
    const form = document.querySelector("form")!;
    const title = form.querySelector<HTMLInputElement>('[name="subject"]')!;
    expect(title.labels?.[0].textContent).toContain("日程标题");
    expect(form.querySelector<HTMLInputElement>('[name="starts_at"]')?.labels?.[0].textContent).toContain("开始时间");
    expect(form.querySelector<HTMLInputElement>('[name="ends_at"]')?.labels?.[0].textContent).toContain("结束时间");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(actions.createCalendarEvent).toHaveBeenCalledTimes(1);
    expect(form.querySelector("fieldset")?.disabled).toBe(true);
    expect(form.getAttribute("aria-busy")).toBe("true");
    await act(async () => fail(new Error("连接中断，请重试。")));
    expect(form.querySelector('[role="alert"]')?.textContent).toContain("连接中断");
    expect(title.value).toBe("准备讨论");
    expect(form.querySelector("fieldset")?.disabled).toBe(false);
    actions.createCalendarEvent.mockResolvedValue({ status: "success", message: "" });
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(actions.createCalendarEvent).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("reports note creation failure inside the still-open dialog", async () => {
    actions.createNote.mockRejectedValue(new Error("暂时无法创建笔记"));
    await act(async () => root.render(createElement(GlobalCreateLayer, { initialRequest: { kind: "note" } })));
    await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("暂时无法创建笔记");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});

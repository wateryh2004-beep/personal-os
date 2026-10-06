// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarEventEditForm } from "@/components/calendar/calendar-event-edit-form";

const actions = vi.hoisted(() => ({ update: vi.fn(), delete: vi.fn() }));
vi.mock("@/features/calendar/actions", () => ({ updateCalendarEvent: actions.update, deleteCalendarEvent: actions.delete }));
vi.mock("@/components/links/entity-markdown", () => ({ EntityMarkdown: ({ body }: { body: string }) => createElement("p", null, body) }));
vi.mock("@/components/links/entity-mention-textarea", () => ({
  MentionTextarea: ({ onChange, ...props }: Omit<ComponentProps<"textarea">, "onChange"> & { onChange: (value: string) => void }) =>
    createElement("textarea", { ...props, onChange: (event) => onChange(event.currentTarget.value) }),
}));

type EventRecord = ComponentProps<typeof CalendarEventEditForm>["event"];
const original: EventRecord = {
  provider_event_id: "outlook-event-1", subject: "原始会议", body_text: "原始说明", starts_at: "2026-10-06T09:00:00.000Z", ends_at: "2026-10-06T10:00:00.000Z",
  is_all_day: false, location_name: "原始地点", categories: [], importance: "normal", show_as: "busy", last_synced_at: "2026-10-06T08:00:00.000Z",
};
let host: HTMLDivElement;
let root: Root;
const reconcile = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false })) });
  vi.clearAllMocks();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
async function render(event = original) { await act(async () => root.render(createElement(CalendarEventEditForm, { event, timezone: "UTC", calendarCategories: [], onReconcile: reconcile }))); }
function button(label: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.textContent === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function click(label: string) { await act(async () => button(label).click()); }
function field<T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement = HTMLInputElement>(name: string) { return host.querySelector<T>(`[name="${name}"]`)!; }
async function changeDescription(value: string) {
  const element = field<HTMLTextAreaElement>("description");
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(element, value);
  await act(async () => element.dispatchEvent(new Event("input", { bubbles: true })));
}
async function submit() { await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

describe("calendar edit sessions", () => {
  it("discards cancelled all-day and text changes and reconstructs the original timed draft", async () => {
    await render(); await click("编辑日程");
    field("subject").value = "未保存标题";
    field("location_name").value = "未保存地点";
    await changeDescription("未保存说明");
    await act(async () => field("is_all_day").click());
    expect(field("is_all_day").checked).toBe(true);
    expect(host.querySelector('input[type="datetime-local"]')).toBeNull();
    await click("取消");
    expect(actions.update).not.toHaveBeenCalled();
    await click("编辑日程");
    expect(field("is_all_day").checked).toBe(false);
    expect(field("subject").value).toBe(original.subject);
    expect(field("location_name").value).toBe(original.location_name);
    expect(field("description").value).toBe(original.body_text);
    expect([...host.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]')].map((element) => element.value)).toEqual(["2026-10-06T09:00", "2026-10-06T10:00"]);
  });

  it("uses the latest incoming event for each new edit without overwriting an active draft", async () => {
    await render(); await click("编辑日程");
    field("subject").value = "进行中的草稿";
    await changeDescription("草稿说明");
    const updated = { ...original, subject: "同步后的标题", body_text: "同步后的说明", location_name: "同步后的地点", is_all_day: true, starts_at: "2026-10-07T00:00:00.000Z", ends_at: "2026-10-09T00:00:00.000Z", importance: "high" as const, show_as: "free" as const };
    await render(updated);
    expect(field("subject").value).toBe("进行中的草稿");
    expect(field("description").value).toBe("草稿说明");
    await click("取消"); await click("编辑日程");
    expect(field("is_all_day").checked).toBe(true);
    expect(field("subject").value).toBe(updated.subject);
    expect(field("description").value).toBe(updated.body_text);
    expect(field("location_name").value).toBe(updated.location_name);
    expect(field("importance").value).toBe("high");
    expect(field("show_as").value).toBe("free");
    expect([...host.querySelectorAll<HTMLInputElement>('input[type="date"]')].map((element) => element.value)).toEqual(["2026-10-07", "2026-10-09"]);
  });

  it("drops old failure receipts on Cancel/Edit and reconciles a later successful save once", async () => {
    actions.update.mockResolvedValueOnce({ status: "error", message: "Outlook 暂不可用" });
    await render(); await click("编辑日程");
    await submit();
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Outlook 暂不可用");
    expect(reconcile).not.toHaveBeenCalled();
    await click("取消"); await click("编辑日程");
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(field("is_all_day").checked).toBe(false);
    actions.update.mockResolvedValueOnce({ status: "success", message: "日程已更新" });
    field("subject").value = "确认保存的标题";
    await submit();
    expect(actions.update).toHaveBeenCalledTimes(2);
    expect(actions.update.mock.calls[1][1].get("subject")).toBe("确认保存的标题");
    expect(actions.update.mock.calls[1][1].get("starts_at")).toBe("2026-10-06T09:00:00.000Z");
    expect(reconcile).toHaveBeenCalledExactlyOnceWith("update");
    expect(host.querySelector('[role="status"]')?.textContent).toBe("日程已更新");
    await render({ ...original, subject: "确认保存的标题" });
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("keeps a pending delete in its session until reconciliation finishes", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let finish!: (result: { status: string; message: string }) => void;
    actions.delete.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await render();
    await submit();
    expect(button("编辑日程").disabled).toBe(true);
    expect(button("正在删除…").disabled).toBe(true);
    await click("编辑日程");
    expect(host.querySelector('input[name="subject"]')?.getAttribute("type")).toBe("hidden");
    await act(async () => finish({ status: "success", message: "日程已删除" }));
    expect(reconcile).toHaveBeenCalledExactlyOnceWith("delete");
  });

  it("does not cancel an in-flight update and resets the session when the selected event changes", async () => {
    let finish!: (result: { status: string; message: string }) => void;
    actions.update.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await render(); await click("编辑日程");
    await submit();
    expect(button("取消").disabled).toBe(true);
    expect(button("正在保存…").disabled).toBe(true);
    await click("取消");
    expect(field("subject")).not.toBeNull();
    await act(async () => finish({ status: "error", message: "保存失败" }));
    await render({ ...original, provider_event_id: "outlook-event-2", subject: "另一条会议", is_all_day: true, starts_at: "2026-10-08T00:00:00.000Z", ends_at: "2026-10-09T00:00:00.000Z" });
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.querySelector('input[name="subject"]')).not.toBeNull();
    // Read-only delete metadata includes subject, but no editable subject input.
    expect(host.querySelector('input[name="subject"]')?.getAttribute("type")).toBe("hidden");
    await click("编辑日程");
    expect(field("subject").value).toBe("另一条会议");
    expect(field("is_all_day").checked).toBe(true);
  });
});

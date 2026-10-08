// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxProposal } from "@/features/inbox/schemas";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(), archive: vi.fn(), restore: vi.fn(), dismiss: vi.fn(),
  reclassify: vi.fn(), note: vi.fn(), daily: vi.fn(), task: vi.fn(), calendar: vi.fn(),
  refresh: vi.fn(), feedback: vi.fn(),
}));
vi.mock("next/navigation", () => {
  const router = { refresh: mocks.refresh };
  return { useRouter: () => router };
});
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props, children) }));
vi.mock("@/components/shared/action-feedback", () => ({ useActionFeedback: () => ({ show: mocks.feedback }) }));
vi.mock("@/features/inbox/actions", () => ({
  captureInboxItem: mocks.capture, archiveInboxItem: mocks.archive, restoreInboxItem: mocks.restore,
  dismissInboxProposal: mocks.dismiss, reclassifyInboxItem: mocks.reclassify,
  convertInboxToNote: mocks.note, convertInboxToDailyNote: mocks.daily,
}));
vi.mock("@/features/calendar/actions", () => ({ createCalendarEvent: mocks.calendar }));
vi.mock("@/features/tasks/microsoft-todo", () => ({ createMicrosoftTodoTaskAction: mocks.task }));

import { InboxWorkspace } from "@/components/inbox/inbox-workspace";

type Props = ComponentProps<typeof InboxWorkspace>;
type Item = Props["items"][number];
const list = { id: "11111111-1111-4111-8111-111111111111", display_name: "Synthetic list", is_default: true };
const noteProposal: InboxProposal = { target: "note", title: "Synthetic proposed note", bodyMarkdown: "Synthetic proposal body" };
const mutations = [mocks.capture, mocks.archive, mocks.restore, mocks.dismiss, mocks.reclassify, mocks.note, mocks.daily, mocks.task, mocks.calendar];
function item(id: string, overrides: Partial<Item> = {}): Item {
  return { id, content_markdown: `Synthetic ${id}`, created_at: "2026-10-01T10:00:00Z", processed_at: null,
    converted_task_id: null, converted_todo_task_id: null, converted_note_id: null,
    ai_proposal: null, ai_status: null, ai_error: null, ...overrides };
}
let host: HTMLDivElement;
let root: Root;
async function render(props: Partial<Props> = {}) {
  await act(async () => root.render(createElement(InboxWorkspace, { items: [], archivedItems: [], lists: [list], ...props })));
}
function button(text: string, scope: ParentNode = host) {
  const result = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent?.trim() === text);
  expect(result, `button: ${text}`).toBeDefined();
  return result!;
}
function disclosure(text: string) {
  const summary = [...host.querySelectorAll("summary")].find((node) => node.textContent?.trim().startsWith(text));
  expect(summary, `disclosure: ${text}`).toBeDefined();
  return summary!.closest<HTMLDetailsElement>("details")!;
}
function section(text: string) {
  return [...host.querySelectorAll("section")].find((node) => node.querySelector("h2")?.textContent?.includes(text))!;
}
function assertNoWrites() { for (const mutation of mutations) expect(mutation).not.toHaveBeenCalled(); }
async function open(details: HTMLDetailsElement) {
  expect(details.open).toBe(false);
  await act(async () => details.querySelector("summary")!.click());
  expect(details.open).toBe(true);
}

beforeEach(() => {
  vi.resetAllMocks();
  for (const mutation of mutations) mutation.mockResolvedValue({ status: "error", message: "Synthetic action rejected" });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("AI-first Inbox workspace", () => {
  it("partitions ready proposals, failed and unclassified records, and history without dropping ready/null proposals", async () => {
    await render({ items: [
      item("ready", { ai_status: "ready", ai_proposal: noteProposal }),
      item("failed", { ai_status: "failed", ai_error: "Synthetic classification failure" }),
      item("unclassified"), item("ready-without-proposal", { ai_status: "ready" }),
      item("failed-with-proposal", { ai_status: "failed", ai_proposal: noteProposal }),
      item("processed", { ai_status: "ready", ai_proposal: noteProposal, processed_at: "2026-10-02T12:00:00Z", converted_note_id: "synthetic-note" }),
    ], archivedItems: [item("archived", { archived_at: "2026-10-03T12:00:00Z" })] });
    const ready = section("已识别，待确认");
    const collection = section("待处理与识别失败");
    expect(ready.querySelector("h2")?.textContent?.trim()).toBe("已识别，待确认 1");
    expect(ready.querySelectorAll("li")).toHaveLength(1);
    expect(ready.textContent).toContain("Synthetic ready");
    expect(collection.querySelector("h2")?.textContent?.trim()).toBe("待处理与识别失败 4");
    for (const id of ["failed", "unclassified", "ready-without-proposal", "failed-with-proposal"]) {
      expect(collection.textContent).toContain(`Synthetic ${id}`);
    }
    expect(collection.textContent).toContain("AI 未能识别：Synthetic classification failure");
    expect(collection.textContent).not.toContain("Synthetic proposed note");
    for (const primary of [ready, collection]) {
      expect(primary.textContent).not.toContain("Synthetic processed");
      expect(primary.textContent).not.toContain("Synthetic archived");
    }
    const processed = disclosure("已整理 · 1");
    const archived = disclosure("已归档 · 1");
    expect(processed.open).toBe(false); expect(archived.open).toBe(false);
    expect(processed.querySelector('a[href="/notes/synthetic-note"]')).not.toBeNull();
    expect(archived.textContent).toContain("Synthetic archived");
    expect(button("同意，创建笔记").closest("details")).toBeNull();
    expect(button("不是这个，放回收集盒")).toBeDefined();
    assertNoWrites();
  });

  it("folds capture and manual destinations by default, leaving retry available without a write", async () => {
    await render({ items: [item("manual")] });
    const capture = disclosure("补充一条记录");
    const manual = disclosure("必要更正 · 手动选择去向");
    expect(capture.open).toBe(false); expect(manual.open).toBe(false);
    expect(host.querySelector('#inbox-capture')?.closest("details")).toBe(capture);
    expect(host.querySelector<HTMLTextAreaElement>('#inbox-capture')?.maxLength).toBe(10_000);
    expect(manual.querySelector("form")).toBeNull();
    expect(button("智能整理").closest("details")).toBeNull();
    for (const label of ["转任务", "转日程", "转笔记", "写今日日记"]) expect(button(label).closest("details")).toBe(manual);
    await open(capture); await open(manual);
    assertNoWrites();
  });

  it.each([
    ["转任务", "手动转成任务", "创建任务"],
    ["转日程", "手动转成日程", "创建日程"],
    ["转笔记", "手动转成笔记", "创建笔记"],
    ["写今日日记", "写入今日日记", "同意，写入今日日记"],
  ])("opens %s only on demand and can dismiss it without submitting", async (label, title, confirmation) => {
    await render({ items: [item("manual")] });
    const manual = disclosure("必要更正 · 手动选择去向");
    await open(manual);
    await act(async () => button(label, manual).click());
    expect(manual.querySelector("form")?.textContent).toContain(title);
    expect(manual.querySelector<HTMLInputElement>('[name="inbox_id"]')?.value).toBe("manual");
    expect(button(confirmation, manual)).toBeDefined(); assertNoWrites();
    await act(async () => button(label, manual).click());
    expect(manual.querySelector("form")).toBeNull(); assertNoWrites();
  });

  it.each<{ proposal: InboxProposal; label: string; mutation: keyof typeof mocks; fields: Record<string, string> }>([
    { proposal: { target: "task", todoListId: list.id, title: "Synthetic task", bodyText: "Synthetic body", importance: "high", dueAt: "2026-10-04T12:00:00Z" }, label: "同意，创建任务", mutation: "task", fields: { todo_list_id: list.id, title: "Synthetic task", body_text: "Synthetic body", importance: "high", due_at: "2026-10-04T12:00:00Z" } },
    { proposal: { target: "calendar", subject: "Synthetic calendar", description: "Synthetic description", startsAt: "2026-10-04T12:00:00Z", endsAt: "2026-10-04T13:00:00Z", locationName: "Synthetic location", isAllDay: false }, label: "同意，创建日程", mutation: "calendar", fields: { subject: "Synthetic calendar", description: "Synthetic description", starts_at: "2026-10-04T12:00:00Z", ends_at: "2026-10-04T13:00:00Z", location_name: "Synthetic location", is_all_day: "" } },
    { proposal: noteProposal, label: "同意，创建笔记", mutation: "note", fields: { title: "Synthetic proposed note", body_markdown: "Synthetic proposal body" } },
    { proposal: { target: "daily" }, label: "同意，写入今日日记", mutation: "daily", fields: {} },
  ])("retains explicit $label confirmation and the original payload", async ({ proposal, label, mutation, fields }) => {
    await render({ items: [item("confirm-me", { ai_status: "ready", ai_proposal: proposal })] });
    assertNoWrites();
    const confirm = button(label);
    expect(confirm.closest("details")).toBeNull();
    await act(async () => confirm.click());
    expect(mocks[mutation]).toHaveBeenCalledOnce();
    const payload = mocks[mutation].mock.calls[0][1] as FormData;
    expect(payload.get("inbox_id")).toBe("confirm-me");
    for (const [key, value] of Object.entries(fields)) expect(payload.get(key)).toBe(value);
    expect(host.textContent).toContain("Synthetic action rejected");
    expect(button(label).disabled).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
    for (const other of mutations.filter((candidate) => candidate !== mocks[mutation])) expect(other).not.toHaveBeenCalled();
  });

  it("does not offer task confirmation for a proposal whose list is unavailable", async () => {
    await render({ items: [item("missing-list", { ai_status: "ready", ai_proposal: { target: "task", todoListId: list.id, title: "Synthetic task", importance: "normal", bodyText: null, dueAt: null } })], lists: [] });
    expect(section("已识别，待确认").textContent).toContain("目标 To Do 清单尚未同步");
    expect([...host.querySelectorAll("button")].some((node) => node.textContent === "同意，创建任务")).toBe(false);
    assertNoWrites();
  });

  it("reports partial reads and the complete pending count without hiding returned records", async () => {
    await render({ items: [item("available")], pendingCount: 137, unavailable: true });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("当前列表可能不完整");
    expect(host.querySelector('[role="status"]')?.textContent).toContain("共有 137 条待处理记录，当前展示最早的 100 条");
    expect(section("待处理与识别失败").textContent).toContain("Synthetic available");
    assertNoWrites();
  });

  it.each([null, 0, 100])("does not invent overflow for a pending count of %s", async (pendingCount) => {
    await render({ pendingCount });
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain("目前没有待处理或识别失败的记录");
    assertNoWrites();
  });
});

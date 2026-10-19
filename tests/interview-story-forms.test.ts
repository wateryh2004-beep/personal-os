// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const actions = vi.hoisted(() => ({ create: vi.fn<(data: FormData) => Promise<void>>(), update: vi.fn<(data: FormData) => Promise<void>>(), archive: vi.fn<(data: FormData) => Promise<void>>() }));
vi.mock("@/features/interview/actions", () => ({ createInterviewStory: actions.create, updateInterviewStory: actions.update, archiveInterviewStory: actions.archive }));
import { StoryFormDialog } from "@/components/career/interview/story-form-dialog";
import { StoryArchiveDialog } from "@/components/career/interview/story-archive-dialog";
import type { EditableStory } from "@/features/interview/story-library";
let host: HTMLDivElement, root: Root;
const story: EditableStory = { id: "s1", title: "原始故事", status: "usable", experience_id: "missing", one_line: "原始概括", situation_markdown: "背景原文", task_markdown: "任务原文", action_markdown: "行动原文", result_markdown: "结果原文", reflection_markdown: "反思原文" };
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === text)!;
const form = () => document.querySelector<HTMLFormElement>('[role="dialog"] form')!;
const field = (name: string) => form().querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
async function changeTitle(value: string) {
  const input = field("title");
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  vi.clearAllMocks();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function openEdit() { await act(async () => root.render(createElement(StoryFormDialog, { story, experiences: [] }))); await act(async () => button("编辑故事").click()); }

describe("Story mutation dialogs", () => {
  it("opens without writing and protects dirty input until the user explicitly discards", async () => {
    await openEdit();
    expect(actions.update).not.toHaveBeenCalled();
    expect(new FormData(form()).get("experience_id")).toBe("missing");
    await changeTitle("尚未保存的标题");
    const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    await act(async () => button("取消").click());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("放弃尚未保存");
    expect(actions.update).not.toHaveBeenCalled();
    await act(async () => button("继续编辑").click());
    expect(field("title").value).toBe("尚未保存的标题");
    await act(async () => button("取消").click());
    await act(async () => button("放弃修改").click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(actions.update).not.toHaveBeenCalled();
  });

  it("blocks repeated saves and dismissal while pending, then retains every field on failure", async () => {
    let rejectSave!: (error: Error) => void;
    actions.update.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectSave = reject; }));
    await openEdit(); await changeTitle("待保存的故事");
    const initial = Object.fromEntries(new FormData(form()));
    await act(async () => { form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(actions.update).toHaveBeenCalledTimes(1);
    expect(form().querySelector("fieldset")?.disabled).toBe(true);
    expect(button("取消").matches(":disabled")).toBe(true);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(Object.fromEntries(actions.update.mock.calls[0][0])).toEqual(initial);
    await act(async () => rejectSave(new Error("unknown result")));
    expect(form().querySelector("fieldset")?.disabled).toBe(false);
    expect(Object.fromEntries(new FormData(form()))).toEqual(initial);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("未能确认保存结果");
    actions.update.mockResolvedValueOnce();
    await act(async () => form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).toContain("故事已保存");
  });

  it("creates a draft through the original action without inventing STAR content", async () => {
    actions.create.mockRejectedValueOnce(new Error("failed"));
    await act(async () => root.render(createElement(StoryFormDialog, { experiences: [] })));
    await act(async () => button("新建故事").click()); await changeTitle("新故事");
    await act(async () => form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(actions.create.mock.calls[0][0].get("status")).toBe("draft");
    expect(actions.create.mock.calls[0][0].get("action_markdown")).toBe("");
    expect(field("title").value).toBe("新故事");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("输入已保留");
  });

  it("requires explicit archive confirmation, supports cancellation, and reports uncertain failure", async () => {
    await act(async () => root.render(createElement(StoryArchiveDialog, { storyId: "s1", title: "原始故事" })));
    await act(async () => button("归档故事").click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("与母题的关联也会一并归档");
    expect(actions.archive).not.toHaveBeenCalled();
    await act(async () => button("取消").click());
    expect(actions.archive).not.toHaveBeenCalled();
    await act(async () => button("归档故事").click());
    actions.archive.mockRejectedValueOnce(new Error("unknown archive result"));
    await act(async () => form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(actions.archive.mock.calls[0][0].get("story_id")).toBe("s1");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("未能确认归档结果");
  });
});

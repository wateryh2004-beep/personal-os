// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn(), navigate: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.navigate }) }));
vi.mock("next/link", () => ({ default: ({ children, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => createElement("a", props, children) }));
vi.mock("@/features/interview/actions", () => ({ createInterviewContext: vi.fn(), createInterviewQuestion: vi.fn(), saveInterviewWorkspace: mocks.save }));
import { InterviewFastWorkspace } from "@/components/career/interview/interview-fast-workspace";
const makeItem = (id: string, contextId: string | null, category = "resume") => ({ preparationId: `prep-${id}`, questionId: id, contextId, prompt: `Question ${id}`, category, categoryLabel: category, style: "standard", subcategory: null, competencies: [], thoughts: `Logic ${id}`, answer: `Answer ${id}`, answerId: null });
const props = { targets: [{ id: "swire", title: "Swire", organization: "太古集团", role: "MT" }], items: [makeItem("general1", null), makeItem("general2", null, "knowledge"), makeItem("swire1", "swire")], initialContextId: "", initialQuestionId: "", initialCategory: "all" };
let host: HTMLDivElement, root: Root;
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((node) => (node.getAttribute("aria-label") ?? node.textContent?.trim()) === text)!;
const detail = () => host.querySelector<HTMLElement>('[data-testid="interview-question-detail"]')!;
const list = () => host.querySelector<HTMLElement>('[data-testid="interview-question-list"]')!;
beforeEach(() => {
  vi.resetAllMocks(); mocks.save.mockResolvedValue({ answerId: null });
  window.history.replaceState(null, "", "/career/interview");
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  Element.prototype.scrollIntoView = vi.fn();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT; });
async function render(overrides = {}) { await act(async () => root.render(createElement(InterviewFastWorkspace, { ...props, ...overrides }))); }
it("starts on the general list and opens even the initially selected question", async () => {
  await render();
  expect(host.querySelector<HTMLSelectElement>('[aria-label="面试岗位"]')!.value).toBe("");
  expect(list().classList.contains("hidden")).toBe(false);
  expect(detail().classList.contains("hidden")).toBe(true);
  await act(async () => button("Question general1").click());
  expect(list().classList.contains("hidden")).toBe(true);
  expect(detail().classList.contains("hidden")).toBe(false);
  expect(detail().querySelector("h1")!.textContent).toBe("Question general1");
  expect(detail().textContent).toContain("Logic general1");
  expect(detail().querySelector("textarea")).toBeNull();
  expect(document.activeElement).toBe(detail());
  expect(window.location.search).toBe("?question=general1");
  expect(mocks.save).not.toHaveBeenCalled();
});
it("restores the list and selected question with browser Back and Forward", async () => {
  await render(); await act(async () => button("Question general2").click());
  await act(async () => { window.history.back(); await new Promise((resolve) => setTimeout(resolve, 30)); });
  expect(detail().classList.contains("hidden")).toBe(true);
  await act(async () => { window.history.forward(); await new Promise((resolve) => setTimeout(resolve, 30)); });
  expect(detail().classList.contains("hidden")).toBe(false);
  expect(detail().querySelector("h1")!.textContent).toBe("Question general2");
});
it("closes a direct-linked detail without leaving the workspace", async () => {
  window.history.replaceState(null, "", "/career/interview?question=general2");
  await render({ initialQuestionId: "general2" });
  await act(async () => button("← 返回题目列表").click());
  expect(detail().classList.contains("hidden")).toBe(true);
  expect(window.location.pathname).toBe("/career/interview");
  expect(window.location.search).toBe("");
});
it("keeps explicit targets and returns to the list when changing target", async () => {
  await render({ initialContextId: "swire", initialQuestionId: "swire1" });
  expect(detail().querySelector("h1")!.textContent).toBe("Question swire1");
  const select = host.querySelector<HTMLSelectElement>('[aria-label="面试岗位"]')!;
  await act(async () => { select.value = ""; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(list().textContent).toContain("Question general1");
  expect(list().textContent).not.toContain("Question swire1");
  expect(detail().classList.contains("hidden")).toBe(true);
  expect(window.location.search).toBe("");
});
it("respects a category on entry instead of selecting a hidden first item", async () => {
  await render({ initialCategory: "knowledge" });
  expect(detail().querySelector("h1")!.textContent).toBe("Question general2");
  expect(list().textContent).not.toContain("Question general1");
});
it("keeps desktop selection inline without adding a mobile history entry", async () => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  await render(); const length = window.history.length;
  await act(async () => button("Question general2").click());
  expect(window.history.length).toBe(length);
  expect(list().className).toContain("md:block");
  expect(detail().querySelector("h1")!.textContent).toBe("Question general2");
});

const draftMeta = { status: "draft", source: "ai_draft", language: "bilingual", confirmed_at: null, version_number: 1 };
async function edit(label: string, value: string) {
  if (!detail().querySelector("textarea")) await act(async () => button("编辑思路与答案").click());
  const input = host.querySelector<HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}
async function flush(input: HTMLTextAreaElement) {
  await act(async () => { input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
}
it("shows bilingual reference answers immediately without a confirmation action", async () => {
  const item = { ...makeItem("draft", null), answerId: "ai-1", answerMeta: draftMeta, answer: "完整中文回答\n\nComplete English answer" };
  await render({ items: [item], initialQuestionId: "draft" });
  expect(detail().textContent).toContain("参考答案 · 待确认");
  expect(detail().textContent).toContain("中英双语");
  expect(detail().textContent).toContain("Complete English answer");
  expect(detail().querySelector("textarea")).toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
});
it("marks thought-only saves as unchanged and preserves draft metadata", async () => {
  mocks.save.mockResolvedValue({ answerId: "ai-1", answerMeta: draftMeta });
  await render({ items: [{ ...makeItem("draft", null), answerId: "ai-1", answerMeta: draftMeta }], initialQuestionId: "draft" });
  await flush(await edit("思路", "New thoughts only"));
  expect(mocks.save).toHaveBeenCalledOnce();
  const submitted = mocks.save.mock.calls[0][0] as FormData;
  expect(submitted.get("answer_changed")).toBe("0");
  expect(submitted.get("answer_id")).toBe("ai-1");
  expect(detail().textContent).toContain("参考答案 · 待确认");
});
it("pins an edited draft after save and after switching away and back", async () => {
  const item = { ...makeItem("general1", null), answerId: "current-1", answerMeta: { ...draftMeta, status: "current" } };
  mocks.save.mockResolvedValue({ answerId: "new-draft", answerMeta: { ...draftMeta, source: "ai_edited", version_number: 2 } });
  window.history.replaceState(null, "", "/career/interview?question=general1");
  await render({ items: [item, makeItem("general2", null)], initialQuestionId: "general1" });
  await flush(await edit("答案", "A revised complete answer"));
  expect((mocks.save.mock.calls[0][0] as FormData).get("answer_changed")).toBe("1");
  expect(new URLSearchParams(window.location.search).get("answer")).toBe("new-draft");
  await act(async () => button("Question general2").click());
  await act(async () => button("Question general1").click());
  expect(new URLSearchParams(window.location.search).get("answer")).toBe("new-draft");
  expect(detail().textContent).toContain("A revised complete answer");
  await flush(await edit("思路", "Other thoughts"));
  expect((mocks.save.mock.calls[1][0] as FormData).get("answer_changed")).toBe("0");
  expect((mocks.save.mock.calls[1][0] as FormData).get("answer_id")).toBe("new-draft");
});
it("serializes edits against the last successful save without replacing newer typing", async () => {
  let finishFirst!: (value: unknown) => void;
  mocks.save.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
  mocks.save.mockResolvedValue({ answerId: "draft-3", answerMeta: { ...draftMeta, version_number: 3 } });
  await render({ items: [{ ...makeItem("draft", null), answerId: "draft-1", answerMeta: draftMeta }], initialQuestionId: "draft" });
  await flush(await edit("答案", "First edit"));
  await flush(await edit("答案", "Second edit"));
  expect(mocks.save).toHaveBeenCalledOnce();
  await act(async () => { finishFirst({ answerId: "draft-2", answerMeta: { ...draftMeta, version_number: 2 } }); });
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect((mocks.save.mock.calls[1][0] as FormData).get("answer_id")).toBe("draft-2");
  expect((mocks.save.mock.calls[1][0] as FormData).get("answer")).toBe("Second edit");
  expect((mocks.save.mock.calls[1][0] as FormData).get("answer_changed")).toBe("1");
  expect(detail().querySelector<HTMLTextAreaElement>('[aria-label="答案"]')?.value).toBe("Second edit");
});
it("shows a clear rejection and blocks confirmation navigation after save failure", async () => {
  mocks.save.mockRejectedValue(new Error("答案不能为空；请归档该版本。"));
  await render({ items: [{ ...makeItem("draft", null), answerId: "draft-1", answerMeta: draftMeta }], initialQuestionId: "draft" });
  await flush(await edit("答案", ""));
  expect(detail().textContent).toContain("答案不能为空");
  const link = [...detail().querySelectorAll("a")].find((node) => node.textContent?.includes("查看版本并确认"))!;
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  await act(async () => { link.dispatchEvent(event); });
  expect(event.defaultPrevented).toBe(true);
});
it("waits for the newest queued save before opening its exact confirmation version", async () => {
  let finishFirst!: (value: unknown) => void, finishSecond!: (value: unknown) => void;
  mocks.save.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
  mocks.save.mockImplementationOnce(() => new Promise((resolve) => { finishSecond = resolve; }));
  await render({ items: [{ ...makeItem("draft", null), answerId: "draft-1", answerMeta: draftMeta }], initialQuestionId: "draft" });
  await flush(await edit("答案", "First edit"));
  await flush(await edit("答案", "Second edit"));
  await act(async () => { finishFirst({ answerId: "draft-2", answerMeta: { ...draftMeta, version_number: 2 } }); });
  expect(detail().textContent).toContain("保存中");
  const link = [...detail().querySelectorAll("a")].find((node) => node.textContent?.includes("查看版本并确认"))!;
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  await act(async () => { link.dispatchEvent(event); });
  expect(event.defaultPrevented).toBe(true); expect(mocks.navigate).not.toHaveBeenCalled();
  await act(async () => { finishSecond({ answerId: "draft-3", answerMeta: { ...draftMeta, version_number: 3 } }); });
  expect(mocks.navigate).toHaveBeenCalledWith("/career/interview/questions/draft?answer=draft-3#answer-versions");
});

async function changeFilter(label: string, value: string) {
  const input = host.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event(input instanceof HTMLInputElement ? "input" : "change", { bubbles: true }));
  });
}
it("searches reference bodies and restores filters after mobile Back/Forward without writes", async () => {
  await render();
  await changeFilter("搜索题库", "Answer general2");
  expect(list().textContent).not.toContain("Question general1");
  await act(async () => button("Question general2").click());
  expect(new URLSearchParams(window.location.search).get("q")).toBe("Answer general2");
  const length = history.length;
  await act(async () => button("参考表达").click());
  expect(history.length).toBe(length);
  expect(history.state?.interviewDetail).toBe(true);
  await act(async () => { history.back(); await new Promise((resolve) => setTimeout(resolve, 30)); });
  expect(detail().classList.contains("hidden")).toBe(true);
  expect(host.querySelector<HTMLInputElement>('[aria-label="搜索题库"]')!.value).toBe("Answer general2");
  await act(async () => { history.forward(); await new Promise((resolve) => setTimeout(resolve, 30)); });
  expect(detail().textContent).toContain("Question general2");
  expect(mocks.save).not.toHaveBeenCalled();
});
it("clears unmatched filters and never mistakes a filter conflict for a different deep-linked question", async () => {
  await render({ initialQuestionId: "general2", initialQuery: "general1" });
  expect(detail().querySelector("h1")!.textContent).toBe("Question general2");
  expect(new URLSearchParams(window.location.search).get("q")).toBeNull();
  await changeFilter("搜索题库", "nothingmatches");
  expect(list().textContent).toContain("没有找到匹配的问题");
  await act(async () => button("清除筛选").click());
  expect(list().textContent).toContain("Question general1");
  expect(mocks.save).not.toHaveBeenCalled();
});
it("searches newly edited content without reload and preserves failed edits after switching", async () => {
  mocks.save.mockRejectedValue(new Error("Offline"));
  await render({ initialQuestionId: "general1" });
  await flush(await edit("答案", "Newly discoverable knowledge"));
  await act(async () => button("Question general2").click());
  expect(host.textContent).toContain("修改还未保存");
  await changeFilter("搜索题库", "discoverable");
  expect(list().textContent).toContain("Question general1");
  await act(async () => button("Question general1").click());
  expect(detail().textContent).toContain("Newly discoverable knowledge");
});
it("recovers navigation after an earlier queued failure followed by the newest successful save", async () => {
  let failFirst!: (error: unknown) => void;
  mocks.save.mockImplementationOnce(() => new Promise((_, reject) => { failFirst = reject; }));
  mocks.save.mockResolvedValue({ answerId: "recovered", answerMeta: draftMeta });
  await render({ initialQuestionId: "general1" });
  await flush(await edit("答案", "First version"));
  await flush(await edit("答案", "Latest version"));
  await act(async () => { failFirst(new Error("Temporary")); });
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(detail().textContent).toContain("已保存");
  expect(host.textContent).not.toContain("修改还未保存");
});
it("keeps reading free of writes and exposes a loading failure instead of an empty success", async () => {
  await render({ unavailable: true, initialQuestionId: "general1" });
  expect(host.textContent).toContain("部分题库数据加载失败");
  await act(async () => button("编辑思路与答案").click());
  await act(async () => button("阅读学习").click());
  expect(mocks.save).not.toHaveBeenCalled();
});
it("restores a newly saved body-search match with Back and Forward", async () => {
  await render({ initialQuestionId: "general1" });
  await flush(await edit("答案", "unique-persisted-keyword"));
  await act(async () => button("← 返回题目列表").click());
  await changeFilter("搜索题库", "unique-persisted-keyword");
  await act(async () => button("Question general1").click());
  await act(async () => { history.back(); await new Promise((resolve) => setTimeout(resolve, 30)); });
  expect(detail().classList.contains("hidden")).toBe(true);
  await act(async () => { history.forward(); await new Promise((resolve) => setTimeout(resolve, 30)); });
  expect(detail().classList.contains("hidden")).toBe(false);
  expect(detail().textContent).toContain("unique-persisted-keyword");
});

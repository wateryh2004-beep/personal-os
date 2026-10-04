// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn(), navigate: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.navigate, refresh: mocks.refresh }) }));
vi.mock("next/link", () => ({ default: ({ children, prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => { void prefetch; return createElement("a", props, children); } }));
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
  window.scrollTo = vi.fn();
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
it("shows bilingual reference answers immediately without a confirmation action", async () => {
  const item = { ...makeItem("draft", null), answerId: "ai-1", answerMeta: draftMeta, answer: "完整中文回答\n\nComplete English answer" };
  await render({ items: [item], initialQuestionId: "draft" });
  expect(detail().textContent).toContain("参考答案 · 待确认");
  expect(detail().textContent).toContain("中英双语");
  expect(detail().textContent).toContain("Complete English answer");
  expect(detail().querySelector("textarea")).toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
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
it("keeps the primary workspace free of manual authoring controls", async () => {
  await render({ initialQuestionId: "general1" });
  expect(host.querySelector("form")).toBeNull();
  expect(host.querySelector("textarea")).toBeNull();
  expect(host.textContent).not.toContain("编辑思路与答案");
  expect(host.textContent).not.toContain("添加自己的问题");
  expect(host.textContent).not.toContain("+ 岗位");
  expect(detail().querySelector('a[href="/career/interview/practice/prep-general1"]')).not.toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
});
it("keeps exact draft and target context on the compatibility version link", async () => {
  const item = { ...makeItem("swire1", "swire"), answerId: "draft-2", answerMeta: draftMeta };
  await render({ items: [item], initialContextId: "swire", initialQuestionId: "swire1" });
  const metadata = detail().querySelector("details")!;
  await act(async () => { metadata.open = true; metadata.dispatchEvent(new Event("toggle")); });
  const versions = [...detail().querySelectorAll("a")].find((node) => node.textContent?.includes("查看答案版本"))!;
  expect(versions.getAttribute("href")).toBe("/career/interview/questions/swire1?context=swire&answer=draft-2#answer-versions");
  expect(host.querySelector('a[href="/career/interview/practice?context=swire"]')).not.toBeNull();
  expect(host.querySelector('a[href="/career/interview/insights?context=swire"]')).not.toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
});
it("preserves selected draft versions after switching away and back", async () => {
  const item = { ...makeItem("general1", null), answerId: "draft-2", answerMeta: draftMeta };
  await render({ items: [item, makeItem("general2", null)], initialQuestionId: "general1" });
  await act(async () => button("Question general2").click());
  await act(async () => button("Question general1").click());
  expect(new URLSearchParams(location.search).get("answer")).toBe("draft-2");
  expect(detail().textContent).toContain("参考答案 · 待确认");
  expect(mocks.save).not.toHaveBeenCalled();
});
it("keeps source-body search and scroll position when returning from a mobile question", async () => {
  Object.defineProperty(window, "scrollY", { configurable: true, value: 480 });
  await render({ items: [{ ...makeItem("general1", null), thoughts: "## 来源核验记录\nSynthetic primary_reference" }] });
  await changeFilter("搜索题库", "primary_reference");
  await act(async () => button("Question general1").click());
  await act(async () => { history.back(); await new Promise((resolve) => setTimeout(resolve, 30)); });
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 480, behavior: "instant" });
  expect(host.querySelector<HTMLInputElement>('[aria-label="搜索题库"]')!.value).toBe("primary_reference");
  expect(mocks.save).not.toHaveBeenCalled();
});
it("shows a recoverable partial load error and refreshes without writes", async () => {
  await render({ unavailable: true, initialQuestionId: "general1" });
  expect(host.textContent).toContain("部分题库数据加载失败");
  await act(async () => button("重新加载").click());
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(mocks.save).not.toHaveBeenCalled();
});

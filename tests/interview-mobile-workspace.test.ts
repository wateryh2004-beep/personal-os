// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => createElement("a", props, children) }));
vi.mock("@/features/interview/actions", () => ({ createInterviewContext: vi.fn(), createInterviewQuestion: vi.fn(), saveInterviewWorkspace: mocks.save }));
import { InterviewFastWorkspace } from "@/components/career/interview/interview-fast-workspace";
const makeItem = (id: string, contextId: string | null, category = "resume") => ({ preparationId: `prep-${id}`, questionId: id, contextId, prompt: `Question ${id}`, category, categoryLabel: category, style: "standard", subcategory: null, competencies: [], thoughts: `Logic ${id}`, answer: `Answer ${id}`, answerId: null });
const props = { targets: [{ id: "swire", title: "Swire", organization: "太古集团", role: "MT" }], items: [makeItem("general1", null), makeItem("general2", null, "knowledge"), makeItem("swire1", "swire")], initialContextId: "", initialQuestionId: "", initialCategory: "all" };
let host: HTMLDivElement, root: Root;
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent?.trim() === text)!;
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
  expect(detail().querySelector("textarea")!.value).toBe("Logic general1");
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

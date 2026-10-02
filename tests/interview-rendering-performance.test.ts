// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkspaceItem } from "@/features/interview/workspace-library";

const mocks = vi.hoisted(() => ({ save: vi.fn(), markdown: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => { void prefetch; return createElement("a", props, children); } }));
vi.mock("@/features/interview/actions", () => ({ createInterviewContext: vi.fn(), createInterviewQuestion: vi.fn(), saveInterviewWorkspace: mocks.save }));
vi.mock("@/components/links/entity-markdown", () => ({ EntityMarkdown: ({ body }: { body: string }) => { mocks.markdown(body); return createElement("div", null, body); } }));
import { InterviewFastWorkspace } from "@/components/career/interview/interview-fast-workspace";

let host: HTMLDivElement;
let root: Root;
const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((node) => (node.getAttribute("aria-label") ?? node.textContent?.trim()) === label)!;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({ answerId: null });
  window.history.replaceState(null, "", "/career/interview");
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  Element.prototype.scrollIntoView = vi.fn();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

function makeItem(index: number): WorkspaceItem {
  return {
    preparationId: `prep-${index}`, questionId: `question-${index}`, contextId: null,
    prompt: `Question ${index}`, shortTitle: `Title ${index}`, category: "knowledge", categoryLabel: "专业",
    style: "standard", subcategory: "技术面 · SQL", competencies: [],
    thoughts: `Reasoning ${index}\n\n${"A detailed explanation. ".repeat(160)}`,
    answer: `Answer ${index}\n\n${"A complete reference answer. ".repeat(160)}`, answerId: null,
  };
}

async function render(items: WorkspaceItem[]) {
  await act(async () => root.render(createElement(InterviewFastWorkspace, {
    targets: [], items, initialContextId: "", initialQuestionId: "", initialCategory: "all",
  })));
}

it("keeps unrelated question bodies and labels out of the answer typing path", async () => {
  const unrelatedReads = vi.fn();
  const items = Array.from({ length: 153 }, (_, index) => {
    const item = makeItem(index);
    if (index) {
      for (const key of ["thoughts", "answer", "shortTitle", "subcategory"] as const) {
        const value = item[key];
        Object.defineProperty(item, key, { enumerable: true, get: () => { unrelatedReads(); return value; } });
      }
    }
    return item;
  });
  await render(items);
  await act(async () => button("Question 0").click());
  await act(async () => button("编辑思路与答案").click());
  unrelatedReads.mockClear();
  const input = host.querySelector<HTMLTextAreaElement>('[aria-label="答案"]')!;
  for (let index = 0; index < 10; index += 1) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, `${items[0].answer} ${index}`);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  // Counts actual work instead of relying on a noisy wall-clock threshold.
  expect(unrelatedReads.mock.calls.length).toBe(0);
  expect(input.value).toBe(`${items[0].answer} 9`);
});

it("does not reparse unchanged study Markdown when opening the selected mobile detail", async () => {
  await render([makeItem(0), makeItem(1)]);
  expect(mocks.markdown).toHaveBeenCalledTimes(2);
  mocks.markdown.mockClear();
  await act(async () => button("Question 0").click());
  expect(mocks.markdown.mock.calls.length).toBe(0);
  expect(host.querySelector<HTMLElement>('[data-testid="interview-question-detail"]')!.classList.contains("hidden")).toBe(false);
});

it("updates save metadata without reparsing the displayed reference bodies", async () => {
  let finishSave!: (value: unknown) => void;
  mocks.save.mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve; }));
  await render([makeItem(0)]);
  await act(async () => button("Question 0").click());
  await act(async () => button("编辑思路与答案").click());
  const input = host.querySelector<HTMLTextAreaElement>('[aria-label="答案"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "An edited reference answer");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button("阅读学习").click());
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain("An edited reference answer");
  mocks.markdown.mockClear();
  await act(async () => finishSave({ answerId: "draft-2", answerMeta: { status: "draft", source: "ai_edited", language: "bilingual", confirmed_at: null, version_number: 2 } }));
  expect(host.textContent).toContain("参考答案 · 待确认");
  expect(host.textContent).toContain("已保存");
  expect(mocks.markdown.mock.calls.length).toBe(0);
});

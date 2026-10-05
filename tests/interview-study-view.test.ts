// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/link", () => ({ default: ({ children, prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => { void prefetch; return createElement("a", props, children); } }));
import { InterviewStudyView } from "@/components/career/interview/interview-study-view";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});
async function render(overrides: Partial<React.ComponentProps<typeof InterviewStudyView>> = {}) {
  await act(async () => root.render(createElement(InterviewStudyView, {
    thoughts: "## 概念白话解释\nSynthetic reasoning.", answer: "Synthetic reference answer.", isDraft: true, related: [], onSelect: vi.fn(), ...overrides,
  })));
}
async function expand(index: number) {
  const details = host.querySelectorAll<HTMLDetailsElement>("footer details")[index];
  await act(async () => { details.open = true; details.dispatchEvent(new Event("toggle")); });
}

it("shows useful answers and reasoning before folded provenance without losing the original", async () => {
  const thoughts = "## 来源与目标岗位\nSynthetic background.\n\n## 概念白话解释\n100−20−15=65，不是90。\n\n## 来源核验记录\n- 来源类型：primary_reference\n- 作者或发布方：未披露";
  const answer = "## 完整参考答案\nStart with the calculation.\n\n## 深入追问与参考应答\nExplain deductions.\n\n## 参考资料\n[Example source](https://example.com/reference)\n\n## 使用边界\nThis is hypothetical.";
  await render({ thoughts, answer });
  expect(host.querySelector("section")!.id).toBe("study-answer");
  expect(host.textContent).not.toContain("100−20−15=65，不是90。");
  expect(host.querySelector("#study-answer")!.textContent).not.toContain("Explain deductions.");
  const explanation = host.querySelector<HTMLDetailsElement>("#study-thinking")!;
  expect(explanation.open).toBe(false);
  await act(async () => { explanation.open = true; explanation.dispatchEvent(new Event("toggle")); });
  expect(host.textContent).toContain("100−20−15=65，不是90。");
  expect(host.textContent).toContain("Explain deductions.");
  expect(host.textContent).not.toContain("primary_reference");
  expect(host.textContent).not.toContain("未披露");
  expect(host.querySelectorAll<HTMLDetailsElement>("footer details")[0].open).toBe(false);
  await expand(0);
  expect(host.querySelector('[data-testid="study-provenance"]')!.textContent).toContain("primary_reference");
  expect(host.textContent).toContain("来源标签用于追溯，不代表内容或个人经历已经核实");
  expect(host.querySelector('a[href="https://example.com/reference"]')).not.toBeNull();
  await expand(1);
  expect([...host.querySelectorAll("pre")].map((node) => node.textContent)).toEqual([answer, thoughts]);
});

it("does not treat current, draft, or primary-reference labels as a truth claim", async () => {
  await render({ isDraft: false, thoughts: "## 来源核验记录\nprimary_reference", answerMeta: { status: "current", source: "ai_draft", language: "zh", version_number: 3, confirmed_at: null } });
  expect(host.textContent).not.toContain("已核实");
  await expand(0);
  expect(host.textContent).toContain("当前选用版本");
  expect(host.textContent).not.toContain("已确认事实");
  expect(host.textContent).toContain("不代表内容或个人经历已经核实");
});

it("keeps unknown structured input accessible as escaped exact original text", async () => {
  const original = JSON.stringify({ provenance_audit: { primary_reference: "unverified" }, unfamiliar_key: "<img src=x onerror=alert(1)>100−20−15=65 vs 90" });
  await render({ thoughts: original });
  expect(host.textContent).toContain("Synthetic reference answer.");
  expect(host.textContent).toContain("结构化格式暂未识别");
  expect(host.textContent).not.toContain("unfamiliar_key");
  await expand(1);
  expect(host.querySelectorAll("pre")[1].textContent).toBe(original);
  expect(host.querySelector("img")).toBeNull();
});

it("sanitizes Markdown links and HTML in both reading and folded source content", async () => {
  const malicious = '[unsafe](javascript:alert%281%29)\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">';
  // HTML conservatively takes the unchanged rendering path; sanitization still applies.
  await render({ thoughts: malicious, answer: "Safe answer.\n\n## 参考资料\n[unsafe source](javascript:alert%283%29)" });
  await expand(0);
  expect(host.querySelector("script")).toBeNull();
  expect(host.querySelector("img[onerror]")).toBeNull();
  expect([...host.querySelectorAll("a")].some((link) => /^(javascript|data):/i.test(link.getAttribute("href") ?? ""))).toBe(false);
  await expand(1);
  expect(host.querySelectorAll("pre")[1].textContent).toBe(malicious);
  expect(host.querySelector("script")).toBeNull();
});

it("leaves unrecognized prose and disclaimer text intact", async () => {
  const original = "Unstructured source note.\n\n免责声明：数字100、20、15和65都仅为算例。\n\n## 不认识的标题\nRetain all of this.";
  await render({ thoughts: original });
  const explanation = host.querySelector<HTMLDetailsElement>("#study-thinking")!;
  await act(async () => { explanation.open = true; explanation.dispatchEvent(new Event("toggle")); });
  expect(host.querySelector("#study-thinking")!.textContent).toContain("免责声明：数字100、20、15和65都仅为算例。");
  expect(host.querySelector("#study-thinking")!.textContent).toContain("Retain all of this.");
});

it("opens explanation from the section button, closes it repeatedly, and keeps the full answer unchanged", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  await render({ answer: "## 标准答案\n完整回答。\n## 思路拆解讲解\n教学解释。", thoughts: "" });
  const answer = host.querySelector("#study-answer")!.textContent;
  const explanation = host.querySelector<HTMLDetailsElement>("#study-thinking")!;
  const jump = [...host.querySelectorAll("nav button")].find((node) => node.textContent === "思路拆解讲解") as HTMLButtonElement;
  expect(explanation.open).toBe(false);
  expect(explanation.querySelector("summary")!.textContent).toBe("思路拆解讲解展开");
  expect(host.textContent).not.toContain("教学解释。");
  for (let i = 0; i < 2; i++) {
    await act(async () => jump.click());
    expect(explanation.open).toBe(true);
    expect(explanation.querySelector("summary")!.textContent).toBe("思路拆解讲解收起");
    expect(explanation.querySelectorAll("h2")).toHaveLength(0);
    expect(explanation.textContent).toContain("教学解释。");
    expect(host.querySelector("#study-answer")!.textContent).toBe(answer);
    await act(async () => { explanation.open = false; explanation.dispatchEvent(new Event("toggle")); });
    expect(host.textContent).not.toContain("教学解释。");
  }
});

it("shows a missing complete answer honestly while making legacy lessons available", async () => {
  await render({ answer: "## 完整推理与参考解析\nLegacy lesson.\n## 简洁复述版\nOnly a recap.", thoughts: "" });
  expect(host.querySelector("#study-answer")!.textContent).toContain("还未整理出完整的标准答案");
  expect(host.querySelector("#study-answer")!.textContent).not.toContain("Only a recap.");
  const explanation = host.querySelector<HTMLDetailsElement>("#study-thinking")!;
  const reveal = host.querySelector<HTMLButtonElement>("#study-answer button")!;
  expect(reveal.textContent).toBe("阅读现有讲解 →");
  await act(async () => reveal.click());
  expect(explanation.open).toBe(true);
  expect(reveal.getAttribute("aria-expanded")).toBe("true");
  expect(explanation.textContent).toContain("Legacy lesson.");
  expect(explanation.textContent).toContain("Only a recap.");
});

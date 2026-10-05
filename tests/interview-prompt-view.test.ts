// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InterviewPrompt } from "@/components/career/interview/interview-prompt";

function render(prompt: string, shortTitle?: string) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(createElement(InterviewPrompt, { prompt, shortTitle }));
  return host;
}
it("uses a short heading and readable complete question, with exact raw text in closed details", () => {
  const raw = "题干：用约90秒介绍自己，并说明哪些真实经历支持你胜任当前岗位。类型：简历/动机；难度：中。";
  const host = render(raw, "自我介绍");
  expect(host.querySelector("h1")!.textContent).toBe("自我介绍");
  expect(host.querySelector('[data-testid="interview-prompt-text"]')!.textContent).toBe("用约90秒介绍自己，并说明哪些真实经历支持你胜任当前岗位。");
  expect(host.querySelector('[data-testid="interview-prompt-text"]')!.className).toContain("font-normal");
  expect(host.querySelector('details[open]')).toBeNull();
  expect(host.querySelector('[data-testid="interview-prompt-original"]')!.textContent).toBe(raw);
});
it("shows substantive clarification conditions outside collapsed notes", () => {
  const host = render("债转股如何影响三表？\n\n需先澄清：本题仅站债务人视角，不猜债权人账面价值或损益。", "债转股");
  const condition = host.querySelector('[aria-label="题设条件与口径"]')!;
  expect(condition.textContent).toContain("仅站债务人视角");
  expect(condition.closest("details")).toBeNull();
});
it("does not interpret an unknown prompt as HTML or hide its original prose", () => {
  const raw = '<script>alert(1)</script>\n未知题设：资产100、负债20。';
  const host = render(raw);
  expect(host.querySelector("script")).toBeNull();
  expect(host.querySelector('[data-testid="interview-prompt-text"]')!.textContent).toBe(raw);
});

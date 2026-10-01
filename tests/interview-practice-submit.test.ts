// @vitest-environment jsdom

import { act, Component, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const save = vi.hoisted(() => vi.fn<(form: FormData) => Promise<void>>());
vi.mock("@/features/interview/actions", () => ({ createPracticeAttempt: save }));

import { PracticeAttemptForm } from "@/components/career/interview/practice-attempt-form";

let container: HTMLDivElement;
let root: Root;

function practiceForm(key = "first-attempt") {
  return createElement(PracticeAttemptForm, {
    key,
    historyHref: "/career/interview/practice/preparation#practice-history",
  }, createElement("textarea", { name: "response_transcript_markdown", "aria-label": "我的回答" }));
}

beforeEach(async () => {
  vi.clearAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(practiceForm()));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  vi.restoreAllMocks();
});

describe("Interview practice submit recovery", () => {
  it("retains all native inputs after rejection and blocks repeated pending submissions", async () => {
    let rejectSave: (error: Error) => void = () => undefined;
    save.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectSave = reject; }));
    const form = container.querySelector("form")!;
    const transcript = form.querySelector<HTMLTextAreaElement>('[name="response_transcript_markdown"]')!;
    const duration = form.querySelector<HTMLInputElement>('[name="duration_seconds"]')!;
    const focus = form.querySelector<HTMLTextAreaElement>('[name="next_focus"]')!;
    const reflection = form.querySelector<HTMLTextAreaElement>('[name="self_review_markdown"]')!;
    const issues = form.querySelectorAll<HTMLInputElement>('input[name="issue_tags"]');
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    transcript.value = "这是我尚未确认保存的回答";
    duration.value = "90";
    focus.value = "先说结论";
    reflection.value = "缩短背景";
    issues[0].click();
    issues[1].click();

    await act(async () => submit.click());
    expect(submit.disabled).toBe(true);
    expect(form.getAttribute("aria-busy")).toBe("true");
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].get("response_transcript_markdown")).toBe(transcript.value);
    expect(save.mock.calls[0][0].getAll("issue_tags")).toEqual(["answer_not_direct", "background_too_long"]);

    await act(async () => rejectSave(new Error("connection lost after possible commit")));
    expect(transcript.value).toBe("这是我尚未确认保存的回答");
    expect(duration.value).toBe("90");
    expect(focus.value).toBe("先说结论");
    expect(reflection.value).toBe("缩短背景");
    expect(issues[0].checked).toBe(true);
    expect(issues[1].checked).toBe(true);
    expect(submit.disabled).toBe(false);
    expect(submit.textContent).toBe("核对后重试保存");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("未能确认保存结果");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("确认没有新增记录后再重试");
    const history = container.querySelector<HTMLAnchorElement>('a[target="_blank"]')!;
    expect(history.getAttribute("href")).toBe("/career/interview/practice/preparation#practice-history");
    expect(history.rel).toContain("noopener");

    save.mockRejectedValueOnce(new Error("still offline"));
    await act(async () => submit.click());
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].get("duration_seconds")).toBe("90");
    expect(transcript.value).toBe("这是我尚未确认保存的回答");
  });

  it("clears the draft only when a confirmed new attempt remounts the form", async () => {
    const transcript = container.querySelector<HTMLTextAreaElement>('[name="response_transcript_markdown"]')!;
    transcript.value = "当前回答";
    await act(async () => root.render(practiceForm("confirmed-saved-attempt")));
    expect(container.querySelector<HTMLTextAreaElement>('[name="response_transcript_markdown"]')!.value).toBe("");
  });

  it("lets Next handle successful receipt redirects instead of showing a save failure", async () => {
    let receiptRedirect: unknown;
    try { redirect("/career/interview/practice/preparation?saved=attempt"); } catch (error) { receiptRedirect = error; }
    const captured = vi.fn();
    class RedirectBoundary extends Component<{ children?: ReactNode }, { redirected: boolean }> {
      state = { redirected: false };
      static getDerivedStateFromError(error: unknown) { captured(error); return { redirected: true }; }
      render() { return this.state.redirected ? createElement("p", null, "Next handles receipt") : this.props.children; }
    }
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await act(async () => root.render(createElement(RedirectBoundary, null, practiceForm())));
    save.mockRejectedValueOnce(receiptRedirect);
    await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(captured).toHaveBeenCalledWith(receiptRedirect);
    expect(container.textContent).toBe("Next handles receipt");
    expect(container.textContent).not.toContain("未能确认保存结果");
  });
});

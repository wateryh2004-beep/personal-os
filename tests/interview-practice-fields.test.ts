// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PracticeReflectionFields } from "@/components/career/interview/practice-reflection-fields";
import { interviewAttemptSchema } from "@/features/interview/schemas";

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement("form", null, createElement(PracticeReflectionFields))));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

function readAttempt() {
  const formData = new FormData(container.querySelector("form")!);
  return interviewAttemptSchema.parse({
    preparation_id: "11111111-1111-4111-8111-111111111111",
    input_mode: "text",
    language: "zh",
    ...Object.fromEntries(formData),
    issue_tags: formData.getAll("issue_tags").join(","),
  });
}

describe("Interview practice reflection inputs", () => {
  it("keeps duration, bottlenecks, and focus optional without inventing defaults", () => {
    const attempt = readAttempt();
    expect(attempt.duration_seconds).toBeNull();
    expect(attempt.issue_tags).toEqual([]);
    expect(attempt.next_focus).toBe("");
    expect(container.textContent).toContain("留空则保留原重点");
    expect(container.textContent).toContain("3 天后");
  });

  it("submits selected bottlenecks and supports deselecting before save", async () => {
    const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    await act(async () => {
      checkboxes[0].click();
      checkboxes[1].click();
    });
    expect(readAttempt().issue_tags).toEqual(["answer_not_direct", "background_too_long"]);
    await act(async () => checkboxes[0].click());
    expect(readAttempt().issue_tags).toEqual(["background_too_long"]);
    expect(new FormData(container.querySelector("form")!).getAll("issue_tags")).toHaveLength(1);
    await act(async () => checkboxes[1].click());
    expect(readAttempt().issue_tags).toEqual([]);
  });

  it("passes actual duration and the user's next focus through the existing schema", () => {
    const duration = container.querySelector<HTMLInputElement>('[name="duration_seconds"]')!;
    const focus = container.querySelector<HTMLTextAreaElement>('[name="next_focus"]')!;
    duration.value = "90";
    focus.value = "先说结论";
    expect(readAttempt()).toMatchObject({ duration_seconds: 90, next_focus: "先说结论" });
    expect(duration.min).toBe("1");
    expect(duration.max).toBe("7200");
    duration.value = "0";
    expect(duration.validity.rangeUnderflow).toBe(true);
    duration.value = "1.5";
    expect(duration.validity.stepMismatch).toBe(true);
    duration.value = "7201";
    expect(duration.validity.rangeOverflow).toBe(true);
  });

  it("disables repeated submission while a save is pending", async () => {
    let finishSave: () => void = () => undefined;
    const saving = new Promise<void>((resolve) => { finishSave = resolve; });
    const save = vi.fn<(formData: FormData) => Promise<void>>(() => saving);
    await act(async () => root.render(createElement("form", { action: save }, createElement(PracticeReflectionFields))));
    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const duration = container.querySelector<HTMLInputElement>('[name="duration_seconds"]')!;
    const issue = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    duration.value = "90";
    issue.click();

    await act(async () => submit.click());
    expect(submit.disabled).toBe(true);
    expect(submit.getAttribute("aria-busy")).toBe("true");
    expect(submit.textContent).toBe("保存中…");
    await act(async () => submit.click());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].get("duration_seconds")).toBe("90");
    expect(save.mock.calls[0][0].getAll("issue_tags")).toEqual(["answer_not_direct"]);

    await act(async () => finishSave());
    expect(submit.disabled).toBe(false);
    expect(duration.value).toBe("");
    expect(issue.checked).toBe(false);
  });
});

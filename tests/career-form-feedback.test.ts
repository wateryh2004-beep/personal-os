// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CareerForm } from "@/components/career/career-form";
import type { CareerFormResult } from "@/features/career/form-state";

vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function render(action: (data: FormData) => Promise<CareerFormResult>, resetOnSuccess = false, defaultValue = "My actual fact") {
  await act(async () => root.render(createElement(CareerForm, { action, resetOnSuccess }, createElement("input", { name: "content", defaultValue }), createElement("button", { type: "submit" }, "保存"))));
}
function submit() { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }

describe("Career form feedback", () => {
  it("clears a successful creation form back to its defaults", async () => {
    const action = vi.fn<(data: FormData) => Promise<CareerFormResult>>().mockResolvedValue({ status: "success", message: "已保存" });
    await render(action, true, "");
    const input = host.querySelector("input")!;
    input.value = "New fact";
    await act(async () => submit());
    expect(action.mock.calls[0][0].get("content")).toBe("New fact");
    expect(input.value).toBe("");
    expect(host.textContent).toContain("已保存");
  });
  it("keeps the saved value in an editing form", async () => {
    await render(async () => ({ status: "success", message: "已保存" }));
    const input = host.querySelector("input")!;
    input.value = "Updated fact";
    await act(async () => submit());
    expect(input.value).toBe("Updated fact");
    expect(host.textContent).toContain("已保存");
  });
  it("keeps uncontrolled input after a server validation error and focuses the visible error", async () => {
    const action = vi.fn<(data: FormData) => Promise<CareerFormResult>>().mockResolvedValue({ status: "error", message: "请检查", fieldErrors: { content: "请补充内容" } });
    await render(action, true);
    const input = host.querySelector("input")!;
    input.value = "A draft that must survive";
    await act(async () => submit());
    expect(input.value).toBe("A draft that must survive");
    expect(action.mock.calls[0][0].get("content")).toBe(input.value);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(host.querySelector('[role="alert"]'));
    await act(async () => host.querySelector<HTMLButtonElement>('li button')!.click());
    expect(document.activeElement).toBe(input);
  });
  it("rejects duplicate submissions while pending and releases the form after completion", async () => {
    let finish!: (result: CareerFormResult) => void;
    const action = vi.fn(() => new Promise<CareerFormResult>((resolve) => { finish = resolve; }));
    await render(action);
    await act(async () => { submit(); submit(); });
    expect(action).toHaveBeenCalledTimes(1);
    expect(host.querySelector("fieldset")!.disabled).toBe(true);
    expect(host.textContent).toContain("正在保存");
    await act(async () => finish({ status: "success", message: "已保存" }));
    expect(host.querySelector("fieldset")!.disabled).toBe(false);
    expect(host.textContent).toContain("已保存");
  });
  it("keeps text and shows recovery feedback after a rejected request", async () => {
    await render(async () => { throw new Error("offline"); });
    await act(async () => submit());
    expect(host.querySelector("input")!.value).toBe("My actual fact");
    expect(host.textContent).toContain("输入已保留");
    expect(host.querySelector("fieldset")!.disabled).toBe(false);
  });
});

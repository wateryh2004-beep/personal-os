// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthPassword, AuthSuccess } from "@/components/auth/auth-interaction";
import { QuestionRecoveryForm } from "@/app/(auth)/forgot-password/question-recovery-form";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), prefetch: vi.fn(), reset: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, prefetch: mocks.prefetch }) }));
vi.mock("@/features/auth/question-recovery-action", () => ({ questionPasswordResetAction: mocks.reset }));
let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function render(node: Parameters<Root["render"]>[0]) { await act(async () => root.render(node)); }

describe("auth interactions", () => {
  it("reveals and re-hides a password with a named keyboard-accessible control", async () => {
    await render(createElement(AuthPassword, { label: "密码", name: "password", defaultValue: "synthetic" }));
    const input = host.querySelector("input")!; const button = host.querySelector("button")!;
    expect(input.type).toBe("password"); expect(button.type).toBe("button");
    await act(async () => button.click());
    expect(input.type).toBe("text"); expect(button.getAttribute("aria-label")).toBe("隐藏密码"); expect(input.value).toBe("synthetic");
    await act(async () => button.click()); expect(input.type).toBe("password");
  });
  it("navigates after confirmed success without depending on animation events", async () => {
    vi.useFakeTimers();
    await render(createElement(AuthSuccess, { title: "欢迎回来", href: "/today", action: "进入我的空间", autoEnter: true }));
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/today");
    expect(mocks.prefetch).toHaveBeenCalledWith("/today");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(host.querySelector("h1"));
    await act(async () => vi.advanceTimersByTime(319)); expect(mocks.replace).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1)); expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/today", { transitionTypes: ["auth-entry"] });
  });
  it("skips the success delay for reduced motion and cancels timers on unmount", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    await render(createElement(AuthSuccess, { title: "欢迎回来", href: "/today", action: "进入", autoEnter: true }));
    await act(async () => vi.advanceTimersByTime(0)); expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/today", { transitionTypes: ["auth-entry"] });
    mocks.replace.mockClear();
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    await render(null);
    await render(createElement(AuthSuccess, { title: "欢迎回来", href: "/today", action: "进入", autoEnter: true }));
    await render(null);
    await act(async () => vi.advanceTimersByTime(2000)); expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("does not verify answers or submit a reset when advancing to password entry", async () => {
    await render(createElement(QuestionRecoveryForm));
    const form = host.querySelector("form")!;
    const first = form.querySelector<HTMLInputElement>('[name="firstWord"]')!;
    const second = form.querySelector<HTMLInputElement>('[name="secondWord"]')!;
    // Validation, not an authentication boundary: the real server receives all fields later.
    first.value = "alpha"; second.value = "beta";
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(form.dataset.step).toBe("password");
    expect(host.querySelector(".auth-success")).toBeNull();
    expect(form.querySelector('[aria-current="step"]')?.textContent).toContain("设置密码");
    expect(document.activeElement).toBe(form.querySelector('[name="password"]'));
    expect(mocks.reset).not.toHaveBeenCalled();
    const back = Array.from(form.querySelectorAll("button")).find(button => button.textContent?.includes("修改答案"))!;
    await act(async () => back.click()); expect(form.dataset.step).toBe("answer");
  });
});

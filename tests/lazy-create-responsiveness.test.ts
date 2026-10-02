// @vitest-environment jsdom
import { act, createElement, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateRequest } from "@/components/shared/global-create-layer";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let finishLoading: () => void;
let finishSaving: () => void;
let GlobalCreateLayer: ComponentType;
const request = (detail: CreateRequest) => window.dispatchEvent(new CustomEvent("personal-os:create-open", { detail }));

beforeEach(async () => {
  vi.resetModules();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false })) });
  const loaded = new Promise<void>((resolve) => { finishLoading = resolve; });
  const saved = new Promise<void>((resolve) => { finishSaving = resolve; });
  vi.doMock("@/components/shared/global-create-layer-impl", async () => {
    await loaded;
    const { DialogContent, DialogTitle } = await import("@/components/ui/dialog");
    return {
      GlobalCreateLayer: ({ initialRequest, onClose }: { initialRequest: CreateRequest; onClose: () => void }) => createElement(DialogContent, { "aria-describedby": undefined },
        createElement(DialogTitle, null, "Ready"),
        createElement("output", { "data-create-kind": initialRequest.kind }, initialRequest.title),
        createElement("input", { "aria-label": "Draft", defaultValue: initialRequest.title }),
        createElement("button", { onClick: () => { void saved.then(onClose); } }, "Save")),
    };
  });
  ({ GlobalCreateLayer } = await import("@/components/shared/global-create-layer"));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(GlobalCreateLayer)));
});
afterEach(async () => { finishLoading(); finishSaving(); await act(async () => root.unmount()); host.remove(); vi.doUnmock("@/components/shared/global-create-layer-impl"); vi.restoreAllMocks(); });

describe("cold quick-create interactions", () => {
  it("shows dismissible chrome immediately, then uses the newest request", async () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: true })) });
    window.history.replaceState({ __NA: true }, "", "/today");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const push = vi.spyOn(window.history, "pushState");
    await act(async () => { request({ kind: "task", title: "First" }); });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('[role="status"]')?.textContent).toContain("正在加载");
    await act(async () => { request({ kind: "calendar", title: "Latest" }); });
    await act(async () => { finishLoading(); });
    expect(document.querySelector("output")?.getAttribute("data-create-kind")).toBe("calendar");
    expect(document.querySelector("output")?.textContent).toBe("Latest");
    expect(push).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    expect(window.history.state.__personalOsMobileLayer).toMatch(/^dialog:/);
  });

  it("stays closed when the import finishes after dismissal", async () => {
    await act(async () => { request({ kind: "task" }); });
    const close = document.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]');
    expect(close).not.toBeNull();
    await act(async () => close?.click());
    await act(async () => { finishLoading(); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector("output")).toBeNull();
  });
  it.each([true, false])("does not let an older save close or erase a newer draft (dismissed: %s)", async (dismissed) => {
    await act(async () => { request({ kind: "task", title: "A" }); finishLoading(); });
    const save = [...document.querySelectorAll("button")].find((button) => button.textContent === "Save")!;
    await act(async () => save.click());
    if (dismissed) await act(async () => document.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')?.click());
    await act(async () => { request({ kind: "calendar", title: "B" }); });
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Draft"]')!;
    input.value = "Unsaved new draft";
    await act(async () => finishSaving());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector("output")?.getAttribute("data-create-kind")).toBe("calendar");
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Draft"]')?.value).toBe("Unsaved new draft");
  });

});

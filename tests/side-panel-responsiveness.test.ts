// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidePanelShell } from "@/components/shared/side-panel-shell";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let frames: Map<number, FrameRequestCallback>;
let nextFrame = 0;
const renderChild = vi.fn();
function Child() { renderChild(); return createElement("p", null, "Panel content"); }
const render = (open = true) => {
  const props = { open, onClose: vi.fn(), title: "Details", children: createElement(Child) };
  root.render(createElement(SidePanelShell, props));
};
const panel = () => host.querySelector("aside")!;
const handle = () => host.querySelector('[role="separator"]')!;
const pointer = (type: string, clientX: number) => new MouseEvent(type, { bubbles: true, clientX, button: 0 });

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false })) });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  frames = new Map();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { frames.delete(id); });
  localStorage.clear();
  renderChild.mockClear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

describe("side-panel geometry and input", () => {
  it("keeps default width when storage is missing or blank", async () => {
    await act(async () => render());
    expect(panel().style.getPropertyValue("--panel-width")).toBe("352px");
    await act(async () => render(false));
    localStorage.setItem("personal-os:panel-width:inspector:v1", " ");
    await act(async () => render());
    expect(panel().style.getPropertyValue("--panel-width")).toBe("352px");
  });

  it("restores a valid saved width before paint", async () => {
    localStorage.setItem("personal-os:panel-width:inspector:v1", "410");
    await act(async () => render());
    expect(panel().style.getPropertyValue("--panel-width")).toBe("410px");
    expect(handle().getAttribute("aria-valuenow")).toBe("410");
  });

  it("coalesces pointer movement into one frame without re-rendering content", async () => {
    await act(async () => render());
    const renders = renderChild.mock.calls.length;
    await act(async () => {
      handle().dispatchEvent(pointer("pointerdown", 500));
      window.dispatchEvent(pointer("pointermove", 480));
      window.dispatchEvent(pointer("pointermove", 450));
      window.dispatchEvent(pointer("pointermove", 420));
    });
    expect(frames.size).toBe(1);
    expect(renderChild.mock.calls.length).toBe(renders);
    for (const callback of frames.values()) callback(0);
    frames.clear();
    expect(panel().style.getPropertyValue("--panel-width")).toBe("432px");
    await act(async () => window.dispatchEvent(pointer("pointerup", 420)));
    expect(localStorage.getItem("personal-os:panel-width:inspector:v1")).toBe("432");
  });

  it("cancels an unfinished drag when the panel closes", async () => {
    await act(async () => render());
    await act(async () => { handle().dispatchEvent(pointer("pointerdown", 500)); window.dispatchEvent(pointer("pointermove", 450)); });
    expect(frames.size).toBe(1);
    await act(async () => render(false));
    expect(frames.size).toBe(0);
    window.dispatchEvent(pointer("pointerup", 450));
    expect(localStorage.getItem("personal-os:panel-width:inspector:v1")).toBe(null);
  });

  it("supports keyboard resizing and reset without pointer input", async () => {
    await act(async () => render());
    await act(async () => handle().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    expect(panel().style.getPropertyValue("--panel-width")).toBe("368px");
    await act(async () => handle().dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    expect(panel().style.getPropertyValue("--panel-width")).toBe("352px");
  });

  it("opens on its heading instead of the width control and restores desktop focus", async () => {
    const trigger = document.createElement("button"); trigger.textContent = "Open"; document.body.append(trigger); trigger.focus();
    try {
      await act(async () => render());
      expect(document.activeElement).toBe(panel().querySelector("h2"));
      await act(async () => render(false));
      await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));
      expect(document.activeElement).toBe(trigger);
    } finally { trigger.remove(); }
  });

  it("makes the mobile panel modal without opening an input and closes on browser Back", async () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: true })) });
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    window.history.replaceState({ __NA: true }, "", "/today");
    const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus();
    const onClose = vi.fn();
    try {
      const props = { open: true, onClose, title: "详情", children: createElement("input", { "aria-label": "标题" }) };
      await act(async () => root.render(createElement(SidePanelShell, props)));
      expect(panel().getAttribute("role")).toBe("dialog");
      expect(panel().getAttribute("aria-modal")).toBe("true");
      expect(document.activeElement).toBe(panel().querySelector("h2"));
      expect(handle().getAttribute("tabindex")).toBe("-1");
      expect(trigger.getAttribute("aria-hidden")).toBe("true");
      trigger.focus();
      expect(panel().contains(document.activeElement)).toBe(true);
      expect(window.history.state.__personalOsMobileLayer).toMatch(/^side-panel:inspector:/);
      await act(async () => window.dispatchEvent(new PopStateEvent("popstate", { state: { __NA: true } })));
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => render(false));
      await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));
      expect(document.activeElement).toBe(trigger);
      expect(trigger.hasAttribute("aria-hidden")).toBe(false);
      trigger.remove();
    }
  });
});

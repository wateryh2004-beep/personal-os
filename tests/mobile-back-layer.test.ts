// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { releaseMobileBackLayerForNavigation, useMobileBackLayer } from "@/lib/mobile/use-mobile-back-layer";

function Layer({ open, name, onDismiss }: { open: boolean; name: string; onDismiss: () => void }) {
  useMobileBackLayer(open, onDismiss, name);
  return null;
}
let root: Root;
let container: HTMLDivElement;
const state = { __NA: true, tree: ["test-tree"], retained: "kept" };

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: true })) });
  window.history.replaceState(state, "", "/tasks?task=a");
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove(); vi.useRealTimers(); vi.restoreAllMocks();
});
async function flushBack() {
  await act(async () => { window.history.back(); await vi.runOnlyPendingTimersAsync(); await vi.runOnlyPendingTimersAsync(); });
}

describe("mobile overlay history ownership", () => {
  it("keeps ordinary same-URL manual dismissal on its existing Back behavior", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const onDismiss = vi.fn();
    await act(async () => { root.render(createElement(Layer, { open: true, name: "side-panel:inspector", onDismiss })); });
    await act(async () => { root.render(createElement(Layer, { open: false, name: "side-panel:inspector", onDismiss })); });
    expect(back).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("unwinds nested same-URL layers one Back at a time", async () => {
    const inspector = vi.fn(), dialog = vi.fn();
    const render = (inner: boolean) => root.render(createElement("div", null,
      createElement(Layer, { open: true, name: "side-panel:inspector", onDismiss: inspector }),
      createElement(Layer, { open: inner, name: "dialog:confirm", onDismiss: dialog }),
    ));
    await act(async () => { render(false); });
    const inspectorMarker = window.history.state.__personalOsMobileLayer;
    await act(async () => { render(true); });
    const dialogState = window.history.state;
    expect(dialogState.__personalOsMobileLayer).not.toBe(inspectorMarker);
    releaseMobileBackLayerForNavigation("side-panel:inspector");
    expect(window.history.state).toEqual(dialogState);
    await flushBack();
    expect(dialog).toHaveBeenCalledTimes(1);
    expect(inspector).not.toHaveBeenCalled();
    expect(window.history.state.__personalOsMobileLayer).toBe(inspectorMarker);
    await act(async () => { render(false); });
    await flushBack();
    expect(inspector).toHaveBeenCalledTimes(1);
    expect(window.history.state).toEqual(state);
  });

  it("removes only its marker after a route-changing replace instead of navigating backward", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const onDismiss = vi.fn();
    await act(async () => { root.render(createElement(Layer, { open: true, name: "side-panel:inspector", onDismiss })); });
    window.history.replaceState(window.history.state, "", "/tasks?task=b");
    await act(async () => { root.render(createElement(Layer, { open: false, name: "side-panel:inspector", onDismiss })); });
    expect(back).not.toHaveBeenCalled();
    expect(window.history.state).toEqual(state);
    expect(window.location.search).toBe("?task=b");
  });
});

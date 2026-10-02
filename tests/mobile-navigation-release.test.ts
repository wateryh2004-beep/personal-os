// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { releaseMobileBackLayerForNavigation, useMobileBackLayer } from "@/lib/mobile/use-mobile-back-layer";
function SheetLayer({ open }: { open: boolean }) { useMobileBackLayer(open, () => {}, "sheet"); return null; }

it("lets a confirmed More navigation own a pending URL change without a competing Back", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: true })) });
  const state = { __NA: true, tree: ["current-route"], retained: "kept" };
  window.history.replaceState(state, "", "/today");
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(SheetLayer, { open: true })));
    expect(window.history.state.__personalOsMobileLayer).toMatch(/^sheet:/);
    releaseMobileBackLayerForNavigation("sheet");
    expect(window.location.pathname).toBe("/today"); // router navigation has not committed yet
    await act(async () => root.render(createElement(SheetLayer, { open: false })));
    expect(back).not.toHaveBeenCalled();
    expect(window.history.state).toEqual(state);
    window.history.replaceState(window.history.state, "", "/notes");
    expect(window.location.pathname).toBe("/notes");
    const shell = readFileSync("src/components/layout/app-shell.tsx", "utf8");
    expect(shell).toContain('new URL(href, window.location.href).href !== window.location.href');
    expect(shell.indexOf('releaseMobileBackLayerForNavigation("sheet")')).toBeLessThan(shell.indexOf('    navigate(href);'));
  } finally {
    await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  }
});

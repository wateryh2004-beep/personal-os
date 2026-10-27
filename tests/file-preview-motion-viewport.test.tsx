// @vitest-environment jsdom
import React, { act, useCallback, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useFilePreviewMotion } from "@/components/files/use-file-preview-motion";
let root: Root, host: HTMLDivElement;
let viewport: EventTarget & { offsetLeft: number; offsetTop: number; width: number; height: number };
const cancelled = vi.fn();
class Effect { getKeyframes() { return [{ transform: "scale(.96)" }]; } }
function Harness() {
  const launcher = useRef<HTMLElement | null>(null), attach = useFilePreviewMotion(true, launcher, "synthetic-document");
  const ref = useCallback((node: HTMLDivElement | null) => { if (node) { Object.defineProperty(node, "offsetWidth", { configurable: true, get: () => viewport.width }); Object.defineProperty(node, "offsetHeight", { configurable: true, get: () => viewport.height - 24 }); node.getAnimations = () => [{ effect: new Effect(), cancel: cancelled }] as unknown as Animation[]; } attach(node); }, [attach]);
  return <div ref={ref} data-testid="surface"/>;
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks();
  viewport = Object.assign(new EventTarget(), { offsetLeft: 0, offsetTop: 0, width: 360, height: 600 });
  vi.stubGlobal("innerWidth", 360); vi.stubGlobal("innerHeight", 600); vi.stubGlobal("visualViewport", viewport); vi.stubGlobal("KeyframeEffect", Effect); vi.stubGlobal("ResizeObserver", undefined);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root.render(<Harness/>));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it("sets the actual resting viewport variables and contained mobile transform before and after a virtual viewport resize", async () => {
  const node = host.firstElementChild as HTMLDivElement;
  expect(node.style.getPropertyValue("--file-viewport-height")).toBe("600px"); expect(node.style.getPropertyValue("--file-origin-y")).toBe("-40px");
  await act(async () => { Object.assign(viewport, { offsetLeft: 17, offsetTop: 73, width: 320, height: 440 }); viewport.dispatchEvent(new Event("resize")); });
  expect(node.style.getPropertyValue("--file-viewport-left")).toBe("17px"); expect(node.style.getPropertyValue("--file-viewport-top")).toBe("73px"); expect(node.style.getPropertyValue("--file-viewport-bottom")).toBe("87px"); expect(cancelled).toHaveBeenCalledOnce();
  await act(async () => { viewport.height = 600; viewport.dispatchEvent(new Event("resize")); });
  expect(node.style.getPropertyValue("--file-viewport-bottom")).toBe("-73px"); expect(cancelled).toHaveBeenCalledTimes(2);
});
it("unmount releases the viewport observers without mutating the detached viewer", async () => {
  const node = host.firstElementChild as HTMLDivElement, previous = node.getAttribute("style");
  await act(async () => root.render(null));
  Object.assign(viewport, { width: 280, height: 400 }); viewport.dispatchEvent(new Event("resize")); window.dispatchEvent(new Event("resize"));
  expect(node.getAttribute("style")).toBe(previous); expect(cancelled).not.toHaveBeenCalled();
});

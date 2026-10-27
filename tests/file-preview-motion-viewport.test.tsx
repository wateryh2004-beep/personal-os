// @vitest-environment jsdom
import React, { act, useCallback, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useFilePreviewMotion } from "@/components/files/use-file-preview-motion";
let root: Root, host: HTMLDivElement;
let viewport: EventTarget & { offsetLeft: number; offsetTop: number; width: number; height: number };
let contentHeight: number, resized: () => void;
const cancelled = vi.fn();
class Effect { getKeyframes() { return [{ transform: "scale(.96)" }]; } getComputedTiming() { return { endTime: 460 }; } }
function Harness({ open = true }: { open?: boolean }) {
  const launcher = useRef<HTMLElement | null>(null), attach = useFilePreviewMotion(open, launcher, "synthetic-document");
  const ref = useCallback((node: HTMLDivElement | null) => { if (node) { Object.defineProperty(node, "offsetWidth", { configurable: true, get: () => viewport.width }); Object.defineProperty(node, "offsetHeight", { configurable: true, get: () => contentHeight }); node.getAnimations = () => [{ effect: new Effect(), cancel: cancelled, playState: "running", currentTime: 100 }] as unknown as Animation[]; } attach(node); }, [attach]);
  return <div ref={ref} data-testid="surface"/>;
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks();
  viewport = Object.assign(new EventTarget(), { offsetLeft: 0, offsetTop: 0, width: 360, height: 600 });
  contentHeight = 120;
  vi.stubGlobal("innerWidth", 360); vi.stubGlobal("innerHeight", 600); vi.stubGlobal("visualViewport", viewport); vi.stubGlobal("KeyframeEffect", Effect); vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resized = callback; } observe() {} disconnect() {} });
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
it("retargets image decode height growth from the current pose within the original remaining budget, instead of cancelling to rest", async () => {
  const node = host.firstElementChild as HTMLDivElement;
  const actualStyle = getComputedStyle;
  vi.stubGlobal("getComputedStyle", (element: Element) => {
    const actual = actualStyle(element);
    return new Proxy(actual, { get(target, key) { if (key === "transform") return "matrix(0.96, 0, 0, 0.96, 0, -10)"; if (key === "transitionProperty") return "transform, opacity"; if (key === "transitionDuration") return "460ms, 180ms"; return Reflect.get(target, key, target); } });
  });
  vi.stubGlobal("DOMMatrixReadOnly", class { is2D = true; a = .96; b = 0; c = 0; d = .96; e = 0; f = -10; });
  const write = vi.spyOn(node.style, "setProperty");
  await act(async () => { contentHeight = 500; resized(); });
  expect(cancelled).not.toHaveBeenCalled();
  expect(node.style.transitionDuration).toBe("360ms, 180ms");
  expect(node.style.transform).toBe("");
  expect(node.style.getPropertyValue("--file-viewport-height")).toBe("600px");
  // The original 460ms transition has already used 100ms. No new full-duration
  // animation or timer is installed, and the real opacity duration is retained.
  expect(write.mock.calls.some(([name, value]) => name === "--file-origin-scale-x" && value === "0.96")).toBe(true);
  const ended = new Event("transitionend"); Object.defineProperty(ended, "propertyName", { value: "transform" });
  await act(async () => node.dispatchEvent(ended)); expect(node.style.transitionDuration).toBe("");
});
it("restores CSS ownership when decode-retargeted motion is closed or its viewer unmounts", async () => {
  const node = host.firstElementChild as HTMLDivElement;
  const actualStyle = getComputedStyle;
  vi.stubGlobal("getComputedStyle", (element: Element) => new Proxy(actualStyle(element), { get(target, key) { if (key === "transform") return "matrix(0.96, 0, 0, 0.96, 0, -10)"; if (key === "transitionProperty") return "transform, opacity"; if (key === "transitionDuration") return "460ms, 180ms"; return Reflect.get(target, key, target); } }));
  vi.stubGlobal("DOMMatrixReadOnly", class { is2D = true; a = .96; b = 0; c = 0; d = .96; e = 0; f = -10; });
  await act(async () => { contentHeight = 500; resized(); }); expect(node.style.transitionDuration).toBe("360ms, 180ms");
  await act(async () => root.render(<Harness open={false} />)); expect(host.firstElementChild).toBe(node); expect(node.style.transitionDuration).toBe("");
  await act(async () => root.render(<Harness />)); expect(host.firstElementChild).toBe(node); expect(node.style.transitionDuration).toBe("");
  await act(async () => root.render(null)); expect(node.style.transitionDuration).toBe("");
});

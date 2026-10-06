// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
let root: Root; let host: HTMLDivElement;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState(null, "", "/settings");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(SettingsWorkspace, { storage: createElement("input", { defaultValue: "", "aria-label": "draft" }), ai: "AI panel", connections: "Connections panel", general: "General panel" })));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it("shows one section and keeps unsaved input across section changes", async () => {
  expect(host.querySelectorAll('[aria-label][hidden]')).toHaveLength(3);
  const input = host.querySelector("input")!; input.value = "unsaved";
  await act(async () => host.querySelector<HTMLAnchorElement>('a[href="#ai"]')!.click());
  expect(host.querySelector('[aria-label="AI 与隐私"]')?.hasAttribute("hidden")).toBe(false);
  await act(async () => host.querySelector<HTMLAnchorElement>('a[href="#storage"]')!.click());
  expect(host.querySelector("input")?.value).toBe("unsaved");
});
it("responds to hash navigation and falls back on unknown sections", async () => {
  await act(async () => { window.history.replaceState(null, "", "#connections"); window.dispatchEvent(new HashChangeEvent("hashchange")); });
  expect(host.querySelector('a[aria-current="page"]')?.getAttribute("href")).toBe("#connections");
  await act(async () => { window.history.replaceState(null, "", "#unknown"); window.dispatchEvent(new HashChangeEvent("hashchange")); });
  expect(host.querySelector('a[aria-current="page"]')?.getAttribute("href")).toBe("#storage");
});

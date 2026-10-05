// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LeisureExperience } from "@/features/leisure/types";
vi.mock("next/link", () => ({ default: ({ onNavigate, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { onNavigate?: (event: { preventDefault: () => void }) => void }) => createElement("a", { ...props, onClick: (event: React.MouseEvent) => { onNavigate?.(event); event.preventDefault(); } }) }));
vi.mock("next/image", () => ({ default: ({ fill, preload, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; preload?: boolean }) => { void fill; void preload; return createElement("img", props); } }));
vi.mock("@/features/leisure/actions", () => ({ saveLeisureFeedback: vi.fn() }));
import { LeisureDetail } from "@/components/leisure/leisure-detail";
const base: LeisureExperience = { id: "a", title: "Synthetic detail", kind: "film", why: "Synthetic editorial description", body_markdown: "## A first chapter\n\nOnly verified content belongs here.", how_to_start: "Read the official introduction", duration_minutes: 90, platform: null, location: null, starts_at: null, cost_text: null, setting: null, company: null, budget: "unknown", sources: [], ratings: [], content_revision: 1, created_at: "2026-10-05T00:00:00Z", updated_at: "2026-10-05T00:00:00Z", feedback: null };
let host: HTMLDivElement, root: Root;
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT; });
async function render(item = base) { await act(async () => root.render(createElement(LeisureDetail, { experience: item, neighbors: [item, { ...item, id: "b", title: "Synthetic next" }], now: Date.parse("2026-10-05T12:00:00Z"), from: "kind=film", backHref: "/leisure?kind=film#leisure-collection" }))); }
it("provides working chapter anchors, only known facts, and adjacent collection links", async () => {
  await render();
  for (const link of host.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) expect(host.querySelector(link.hash)).not.toBeNull();
  expect(host.querySelectorAll("h1")).toHaveLength(1);
  expect(host.querySelector("dl")?.textContent).toContain("约 1 小时 30 分钟");
  expect(host.querySelector("dl")?.textContent).not.toContain("平台");
  expect(host.querySelector('[aria-label="继续逛逛"] a')?.getAttribute("href")).toBe("/leisure/b?from=kind%3Dfilm");
  expect(host.querySelector('[aria-label="继续逛逛"]')?.textContent).toContain("下一份灵感");
});
it("supports sparse detail content without dangling story/start links or invented actions", async () => {
  await render({ ...base, body_markdown: "", how_to_start: null, duration_minutes: null });
  expect(host.querySelector('a[href="#leisure-story"]')).toBeNull();
  expect(host.querySelector('a[href="#leisure-start"]')).toBeNull();
  expect(host.querySelector("dl")).toBeNull();
  expect(host.querySelector('a[target="_blank"]')).toBeNull();
  expect(host.querySelector("article")?.getAttribute("data-edition")).toBe("film");
});
it("keeps unsaved notes on a canceled adjacent navigation and protects reload", async () => {
  await render();
  const note = host.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(note, "Keep this thought"); note.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(host.querySelector('[data-leisure-navigation-block="draft"]')).not.toBeNull();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await act(async () => host.querySelector<HTMLAnchorElement>('[aria-label="继续逛逛"] a')!.click());
  expect(confirm).toHaveBeenCalledOnce();
  expect(note.value).toBe("Keep this thought");
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});

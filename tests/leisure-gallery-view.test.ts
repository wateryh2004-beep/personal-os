// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LeisureSummary } from "@/features/leisure/types";
import { getLeisureArtwork, leisureArtwork } from "@/features/leisure/artwork";
vi.mock("next/link", () => ({ default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("next/image", () => ({ default: ({ fill, preload, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; preload?: boolean }) => { void fill; void preload; return createElement("img", props); } }));
import { LeisureHome } from "@/components/leisure/leisure-home";
import { LeisureArtwork } from "@/components/leisure/leisure-artwork";
const base: LeisureSummary = { id: "1", title: "Synthetic film", kind: "film", why: "Synthetic description", how_to_start: "Synthetic start", duration_minutes: 120, platform: null, location: null, starts_at: null, cost_text: null, setting: "home", company: "either", budget: "paid", content_revision: 1, created_at: "2026-10-04T00:00:00Z", updated_at: "2026-10-04T00:00:00Z", feedback: null };
const items: LeisureSummary[] = [base, { ...base, id: "2", title: "Synthetic game", kind: "game", duration_minutes: 25, budget: "free" }, { ...base, id: "3", title: "Synthetic disliked", feedback: { status: "completed", reaction: "not_for_me", personal_note: "", linked_note_id: null, linked_note_title: null, linked_note_available: false, revision: 1, updated_at: base.updated_at } }, { ...base, id: "4", title: "Synthetic liked", feedback: { status: "completed", reaction: "liked", personal_note: "", linked_note_id: null, linked_note_title: null, linked_note_available: false, revision: 1, updated_at: base.updated_at } }];
let host: HTMLDivElement, root: Root;
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent?.trim() === text)!;
beforeEach(() => { window.history.replaceState(null, "", "/leisure"); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT; });
async function render() { await act(async () => root.render(createElement(LeisureHome, { experiences: items }))); }
it("keeps all titles browseable, filters locally and never mutates input feedback", async () => {
  const original = JSON.stringify(items);
  await render();
  expect(host.querySelectorAll("#leisure-collection li")).toHaveLength(4);
  await act(async () => button("游戏").click());
  expect(host.querySelectorAll("#leisure-collection li")).toHaveLength(1);
  expect(button("游戏").getAttribute("aria-pressed")).toBe("true");
  await act(async () => button("全部").click());
  const select = host.querySelector<HTMLSelectElement>("select")!;
  await act(async () => { select.value = "30"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(host.querySelectorAll("#leisure-collection li")).toHaveLength(1);
  expect(host.querySelector("article h3")?.textContent).toBe("Synthetic game");
  await act(async () => button("清除选择").click());
  expect(host.querySelectorAll("#leisure-collection li")).toHaveLength(4);
  expect(JSON.stringify(items)).toBe(original);
});
it("cycles only eligible features and keeps the shuffle control stable", async () => {
  await render();
  const shuffle = button("换个灵感");
  shuffle.focus();
  await act(async () => shuffle.click());
  expect(host.querySelector("article h3")?.textContent).toBe("Synthetic game");
  expect(document.activeElement).toBe(shuffle);
  await act(async () => shuffle.click());
  expect(host.querySelector("article h3")?.textContent).toBe("Synthetic film");
});
it("retains both personal status and reaction in the complete collection", async () => {
  await render();
  const gallery = host.querySelector("#leisure-collection")!;
  const disliked = [...gallery.querySelectorAll("li")].find((node) => node.textContent?.includes("Synthetic disliked"))!;
  expect(disliked.textContent).toContain("已体验");
  expect(disliked.textContent).toContain("不太适合我");
  const liked = [...gallery.querySelectorAll("li")].find((node) => node.textContent?.includes("Synthetic liked"))!;
  expect(liked.textContent).toContain("已体验");
  expect(liked.textContent).toContain("喜欢");
});
it("matches only curated titles/kinds, including a display continuation suffix", () => {
  expect(leisureArtwork).toHaveLength(28);
  for (const art of leisureArtwork) expect(getLeisureArtwork(art)?.src).toBe(art.src);
  expect(getLeisureArtwork({ title: "无耻之徒（美版）· 继续看", kind: "series" })?.src).toBe(leisureArtwork[0].src);
  expect(getLeisureArtwork({ title: leisureArtwork[0].title, kind: "game" })).toBeUndefined();
  expect(getLeisureArtwork({ title: "https://attacker.example/tracker", kind: "film" })).toBeUndefined();
});
it("reveals a decoded image and degrades to a text-safe fallback on failure", async () => {
  const art = leisureArtwork[0];
  await act(async () => root.render(createElement(LeisureArtwork, { item: art, sizes: "300px" })));
  expect(host.querySelector("[data-artwork-state]")?.getAttribute("data-artwork-state")).toBe("loading");
  await act(async () => host.querySelector("img")!.dispatchEvent(new Event("load")));
  expect(host.querySelector("[data-artwork-state]")?.getAttribute("data-artwork-state")).toBe("ready");
  await act(async () => host.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(host.querySelector("[data-artwork-state]")?.getAttribute("data-artwork-state")).toBe("fallback");
  expect(host.querySelector("img")).toBeNull();
  expect(host.textContent).toContain(art.title);
});
it("initializes the collection from validated URL filters and preserves them in detail links", async () => {
  window.history.replaceState(null, "", "/leisure?kind=game&minutes=30&setting=home");
  await render();
  expect(button("游戏").getAttribute("aria-pressed")).toBe("true");
  expect(host.querySelectorAll("#leisure-collection li")).toHaveLength(1);
  expect(host.querySelector("#leisure-collection a")?.getAttribute("href")).toBe("/leisure/2?from=kind%3Dgame%26minutes%3D30%26setting%3Dhome");
  await act(async () => button("全部").click());
  expect(new URLSearchParams(window.location.search).get("kind")).toBeNull();
  expect(new URLSearchParams(window.location.search).get("minutes")).toBe("30");
});

// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { leisureArtwork } from "@/features/leisure/artwork";
const mock = vi.hoisted(() => ({ privateSrc: undefined as string | undefined }));
vi.mock("@/features/leisure/use-private-artwork", () => ({
  usePrivateLeisureArtworkSource: (original: string | undefined) => mock.privateSrc ?? original,
  isPrivateLeisureArtworkSource: (src: string) => src.startsWith("/api/leisure/artwork/"),
  privateLeisureArtworkLoader: ({ src, width }: { src: string; width: number }) => `${src}?w=${width <= 640 ? 640 : 1280}`,
}));
vi.mock("next/image", () => ({ default: ({ fill, preload, loader, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; preload?: boolean; loader?: (input: { src: string; width: number }) => string }) => { void fill; void preload; return createElement("img", { ...props, src: loader && typeof props.src === "string" ? loader({ src: props.src, width: 640 }) : props.src }); } }));
import { LeisureArtwork } from "@/components/leisure/leisure-artwork";
let host: HTMLDivElement, root: Root;
beforeEach(() => { mock.privateSrc = undefined; (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT; });
async function render() { await act(async () => root.render(createElement(LeisureArtwork, { item: leisureArtwork[0], sizes: "300px" }))); }
it("uses official optimized art until a verified private mapping is supplied", async () => {
  await render();
  expect(host.querySelector("img")?.getAttribute("src")).toBe(leisureArtwork[0].src);
  mock.privateSrc = "/api/leisure/artwork/shameless";
  await render();
  expect(host.querySelector("img")?.getAttribute("src")).toBe("/api/leisure/artwork/shameless?w=640");
});
it("falls from private to original then to designed text without retry loops", async () => {
  mock.privateSrc = "/api/leisure/artwork/shameless";
  await render();
  await act(async () => host.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(host.querySelector("img")?.getAttribute("src")).toBe(leisureArtwork[0].src);
  await act(async () => host.querySelector("img")!.dispatchEvent(new Event("load")));
  expect(host.querySelector("[data-artwork-state]")?.getAttribute("data-artwork-state")).toBe("ready");
  await act(async () => host.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(host.querySelector("img")).toBeNull();
  expect(host.querySelector("[data-artwork-state]")?.getAttribute("data-artwork-state")).toBe("fallback");
  await render();
  expect(host.querySelector("img")).toBeNull();
});

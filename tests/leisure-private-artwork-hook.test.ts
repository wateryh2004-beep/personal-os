// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { artworkImportRegistry } from "@/features/leisure/artwork-import-registry";
import { isPrivateLeisureArtworkSource, privateLeisureArtworkLoader, refreshPrivateLeisureArtwork, usePrivateLeisureArtworkSource } from "@/features/leisure/use-private-artwork";
let root: Root | undefined;
const src = artworkImportRegistry[0].src;
const route = `/api/leisure/artwork/${artworkImportRegistry[0].id}`;
const fetchMock = vi.fn();
function Display({ source }: { source?: string }) { return createElement("span", null, usePrivateLeisureArtworkSource(source) ?? "none"); }
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); refreshPrivateLeisureArtwork(); });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function mount(source?: string) {
  const element = document.createElement("div"); document.body.append(element); root = createRoot(element);
  await act(async () => { root!.render(createElement(Display, { source })); }); return element;
}
describe("private artwork client mapping", () => {
  it("does not request a private mapping for absent or new collection artwork", async () => {
    await mount(); expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => { root!.render(createElement(Display, { source: "https://new.example/image.jpg" })); });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("refreshes even during an older lookup, and an old response cannot replace the new map", async () => {
    const resolve: Array<(value: Response) => void> = [];
    fetchMock.mockImplementation(() => new Promise<Response>((done) => resolve.push(done)));
    const element = await mount(src);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => refreshPrivateLeisureArtwork());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => resolve[1](Response.json({ sources: { [src]: route } })));
    expect(element.textContent).toBe(route);
    await act(async () => resolve[0](Response.json({ sources: {} })));
    expect(element.textContent).toBe(route);
  });
  it("rejects arbitrary mapping destinations and arbitrary private loader paths", async () => {
    fetchMock.mockResolvedValue(Response.json({ sources: { [src]: "https://attacker.example" } }));
    const element = await mount(src);
    expect(element.textContent).toBe(src);
    expect(isPrivateLeisureArtworkSource(route)).toBe(true);
    expect(isPrivateLeisureArtworkSource("/api/files/private/download")).toBe(false);
    expect(privateLeisureArtworkLoader({ src: route, width: 390 })).toBe(`${route}?w=640`);
    expect(privateLeisureArtworkLoader({ src: route, width: 2400 })).toBe(`${route}?w=1280`);
    expect(() => privateLeisureArtworkLoader({ src: "/api/files/private/download", width: 640 })).toThrow();
  });
});

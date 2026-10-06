// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilePhoto } from "@/components/files/file-photo";
import type { FileRecord } from "@/features/files/queries";
import { photoThumbnailLoadTimeoutMs } from "@/features/files/thumbnail-load-queue";

const observers: FakeObserver[] = [];
class FakeObserver {
  callback: IntersectionObserverCallback;
  target?: Element;
  stopped = false;
  constructor(callback: IntersectionObserverCallback) { this.callback = callback; observers.push(this); }
  observe(target: Element) { this.target = target; }
  disconnect() { this.stopped = true; }
  emit(visible: boolean) {
    if (!this.stopped && this.target) this.callback([{ target: this.target, isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

let root: Root;
let host: HTMLDivElement;
const file = (id: string, overrides: Partial<FileRecord> = {}): FileRecord => ({
  id, title: `Photo ${id}`, original_filename: `${id}.png`, mime_type: "image/png", file_size: 100,
  folder_id: null, uploaded_at: "2026-10-06", created_at: "2026-10-06", archived_at: null,
  ai_visibility: "normal", text_extraction_status: "unsupported", extracted_character_count: 0, ...overrides,
});
const source = (id: string) => `/api/files/${id}/thumbnail`;
const images = () => [...host.querySelectorAll("img")];
const sources = () => images().map(image => image.getAttribute("src"));
async function render(ids: string[]) {
  await act(async () => root.render(createElement("section", null, ids.map(id => createElement(FilePhoto, { key: id, file: file(id), className: "aspect-square w-full" })))));
}
async function enterAll() { await act(async () => observers.forEach(observer => observer.emit(true))); }
async function fire(image: HTMLImageElement, type: "load" | "error") { await act(async () => image.dispatchEvent(new Event(type))); }

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  observers.length = 0;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("viewport-gated photo thumbnails", () => {
  it("does not assign any source before visibility, then admits only three eager thumbnails", async () => {
    await render(["0", "1", "2", "3", "4"]);
    expect(images()).toHaveLength(0);
    await enterAll();
    expect(sources()).toEqual([source("0"), source("1"), source("2")]);
    expect(images().every(image => image.getAttribute("loading") === "eager")).toBe(true);
    expect(images().every(image => !image.src.includes("/download"))).toBe(true);
    await fire(images()[0], "load");
    expect(sources()).toEqual([source("0"), source("1"), source("2"), source("3")]);
    await fire(images()[1], "error");
    expect(sources()).toEqual([source("0"), source("2"), source("3"), source("4")]);
    expect(host.textContent).toContain("缩略图暂不可用");
  });

  it("removes a waiting card from admission when it leaves the viewport", async () => {
    await render(["0", "1", "2", "3", "4"]); await enterAll();
    await act(async () => observers[3].emit(false));
    await fire(images()[0], "load");
    expect(sources()).not.toContain(source("3"));
    expect(sources()).toContain(source("4"));
    await act(async () => observers[3].emit(true));
    await fire(images()[1], "load");
    expect(sources()).toContain(source("3"));
  });

  it("clears a native request before admitting another card after unmount", async () => {
    await render(["0", "1", "2", "3"]); await enterAll();
    const removed = images()[0];
    await render(["1", "2", "3"]);
    expect(removed.getAttribute("src")).toBeNull();
    expect(sources()).toEqual([source("1"), source("2"), source("3")]);
    await fire(removed, "load");
    expect(sources()).toHaveLength(3);
  });

  it("times out hung images, clears their sources, and advances the queue", async () => {
    await render(["0", "1", "2", "3"]); await enterAll();
    const hung = images();
    await act(async () => vi.advanceTimersByTime(photoThumbnailLoadTimeoutMs));
    expect(hung.every(image => image.getAttribute("src") === null)).toBe(true);
    expect(sources()).toEqual([source("3")]);
    expect(host.textContent?.match(/缩略图暂不可用/g)).toHaveLength(3);
  });

  it("does not timeout or clear a successfully loaded image", async () => {
    await render(["0"]); await enterAll();
    const loaded = images()[0];
    await fire(loaded, "load");
    await act(async () => vi.advanceTimersByTime(photoThumbnailLoadTimeoutMs * 2));
    expect(loaded.getAttribute("src")).toBe(source("0"));
    expect(host.textContent).not.toContain("缩略图暂不可用");
  });

  it("resets a replaced file and ignores events from the previous image", async () => {
    await act(async () => root.render(createElement(FilePhoto, { file: file("old") })));
    await enterAll(); const oldImage = images()[0];
    await act(async () => root.render(createElement(FilePhoto, { file: file("new") })));
    expect(oldImage.getAttribute("src")).toBeNull();
    expect(images()).toHaveLength(0);
    await enterAll();
    await fire(oldImage, "error");
    expect(sources()).toEqual([source("new")]);
  });

  it("uses the existing fallback for unsupported or over-budget photos without observing them", async () => {
    await act(async () => root.render(createElement(FilePhoto, { file: file("heic", { mime_type: "image/heic" }) })));
    expect(images()).toHaveLength(0);
    expect(observers).toHaveLength(0);
    expect(host.textContent).toContain("可下载原件查看");
    await act(async () => root.render(createElement(FilePhoto, { file: file("big", { file_size: 13 * 1024 * 1024 }) })));
    expect(images()).toHaveLength(0);
    expect(observers).toHaveLength(0);
  });

  it("does not leak admission slots across StrictMode setup and cleanup", async () => {
    await act(async () => root.render(createElement(StrictMode, null,
      ["0", "1", "2", "3"].map(id => createElement(FilePhoto, { key: id, file: file(id) })))));
    await enterAll();
    expect(sources()).toEqual([source("0"), source("1"), source("2")]);
    await fire(images()[0], "load");
    expect(sources()).toContain(source("3"));
  });

  it("falls back to viewport geometry and eagerly advances without IntersectionObserver", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    let visible = false;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() => ({
      top: visible ? 0 : 2000, bottom: visible ? 100 : 2100, left: 0, right: 100,
      width: 100, height: 100, x: 0, y: visible ? 0 : 2000, toJSON() { return {}; },
    }));
    await render(["0", "1", "2", "3"]);
    expect(images()).toHaveLength(0);
    visible = true;
    await act(async () => { window.dispatchEvent(new Event("scroll")); vi.advanceTimersByTime(20); });
    expect(sources()).toEqual([source("0"), source("1"), source("2")]);
    expect(images().every(image => image.getAttribute("loading") === "eager")).toBe(true);
    await fire(images()[0], "load");
    expect(sources()).toContain(source("3"));
  });

  it("uses the same three-slot fallback in a zero-layout environment", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    await render(["0", "1", "2", "3"]);
    expect(images()).toHaveLength(3);
    await fire(images()[0], "error");
    expect(sources()).toEqual([source("1"), source("2"), source("3")]);
  });

  it("keeps fallback image sources intact through StrictMode effect replay", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    await act(async () => root.render(createElement(StrictMode, null,
      ["0", "1", "2", "3"].map(id => createElement(FilePhoto, { key: id, file: file(id) })))));
    expect(sources()).toEqual([source("0"), source("1"), source("2")]);
    await fire(images()[0], "load");
    expect(sources()).toContain(source("3"));
  });
});

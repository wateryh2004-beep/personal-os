// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilePdfCover, maxPdfCoverBytes, maxPdfCoverImageBytes, maxPdfCoverRequests, pdfCoverTimeoutMs } from "@/components/files/file-pdf-cover";
import type { FileRecord } from "@/features/files/queries";

const observers: FakeObserver[] = [];
class FakeObserver {
  target?: Element; stopped = false;
  constructor(public callback: IntersectionObserverCallback) { observers.push(this); }
  observe(target: Element) { this.target = target; }
  disconnect() { this.stopped = true; }
  emit(visible: boolean) { if (!this.stopped && this.target) this.callback([{ target: this.target, isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const file = (id: string, file_size = 1024): FileRecord => ({ id, file_size, title: `PDF ${id}`, original_filename: `${id}.pdf`, mime_type: "application/pdf", folder_id: null, uploaded_at: "2026-10-06", created_at: "2026-10-06", archived_at: null, ai_visibility: "normal", text_extraction_status: "completed", extracted_character_count: 0 });
const webp = (size = 16, status = 200, type = "image/webp", actualSize = 16) => new Response(new Uint8Array(actualSize), { status, headers: { "content-length": String(size), "content-type": type } });
const pending = () => new Response("{}", { status: 202, headers: { "retry-after": "3" } });
let root: Root, host: HTMLDivElement;
const makeUrl = vi.fn(() => "blob:private-cover"), revokeUrl = vi.fn();
async function show(ids = ["a"]) { await act(async () => root.render(createElement("div", null, ids.map(id => createElement(FilePdfCover, { key: id, file: file(id) }))))); }
async function enter() { await act(async () => observers.forEach(observer => observer.emit(true))); }
async function decoded() { await act(async () => host.querySelectorAll("img").forEach(image => image.dispatchEvent(new Event("load")))); await act(async () => vi.advanceTimersByTimeAsync(40)); }
const ready = () => host.querySelectorAll('img[data-pdf-cover-rendered="true"]');
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("IntersectionObserver", FakeObserver); observers.length = 0;
  vi.stubGlobal("fetch", vi.fn(async () => webp()));
  makeUrl.mockClear(); revokeUrl.mockClear();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: makeUrl });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeUrl });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("private cached PDF first-page covers", () => {
  it("fetches nothing offscreen, then only an authenticated small image with cache revalidation", async () => {
    await show(); expect(fetch).not.toHaveBeenCalled();
    await enter();
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/files/a/pdf-cover", expect.objectContaining({ credentials: "same-origin", cache: "no-cache" }));
    expect(host.querySelector("canvas")).toBeNull(); expect(ready()).toHaveLength(0);
    await decoded(); expect(ready()).toHaveLength(1);
  });
  it("limits network admission to three and advances without any PDF parsing", async () => {
    const response = deferred<void>(); vi.mocked(fetch).mockImplementation(async () => { await response.promise; return webp(); });
    await show(["a", "b", "c", "d"]); await enter(); expect(fetch).toHaveBeenCalledTimes(3);
    vi.mocked(fetch).mockImplementation(async () => webp());
    await act(async () => response.resolve());
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("releases admission during pending wait and polls only the small-image endpoint", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(pending());
    await show(); await enter(); expect(makeUrl).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    await decoded(); expect(ready()).toHaveLength(1); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("stops bounded polling on persistent pending", async () => {
    vi.mocked(fetch).mockImplementation(async () => pending());
    await show(); await enter(); await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(fetch).toHaveBeenCalledTimes(maxPdfCoverRequests);
    expect(host.textContent).toContain("封面暂不可用");
  });
  it.each([[401, 16, "image/webp"], [404, 16, "image/webp"], [422, 16, "image/webp"], [503, 16, "image/webp"], [200, maxPdfCoverImageBytes + 1, "image/webp"], [200, 16, "text/html"], [200, 0, "image/webp"], [200, 17, "image/webp"]])("quietly falls back on status %s size %s type %s", async (status, size, type) => {
    vi.mocked(fetch).mockResolvedValue(webp(size, status, type)); await show(); await enter();
    expect(makeUrl).not.toHaveBeenCalled(); expect(host.textContent).toContain("封面暂不可用");
    await act(async () => vi.advanceTimersByTimeAsync(40_000)); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("enforces the actual body budget even if content-length lies", async () => {
    vi.mocked(fetch).mockResolvedValue(webp(16, 200, "image/webp", maxPdfCoverImageBytes + 1));
    await show(); await enter(); expect(makeUrl).not.toHaveBeenCalled(); expect(host.textContent).toContain("封面暂不可用");
  });
  it("does not request oversized or archived PDFs", async () => {
    await act(async () => root.render(createElement(FilePdfCover, { file: file("large", maxPdfCoverBytes + 1) })));
    await enter(); expect(fetch).not.toHaveBeenCalled(); expect(host.textContent).toContain("点击预览 PDF");
    await act(async () => root.render(createElement(FilePdfCover, { file: { ...file("archived"), archived_at: "2026-10-07" } })));
    await enter(); expect(fetch).not.toHaveBeenCalled();
  });
  it("times out a hung request and releases its queue slot", async () => {
    vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {}));
    await show(); await enter(); const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    await act(async () => vi.advanceTimersByTime(pdfCoverTimeoutMs));
    expect(signal?.aborted).toBe(true); expect(host.textContent).toContain("封面暂不可用");
  });
  it("revokes image bytes and stops retry after dismissal", async () => {
    await show(); await enter(); await decoded(); const image = ready()[0];
    await show([]); expect(revokeUrl).toHaveBeenCalledWith("blob:private-cover"); expect(image.getAttribute("src")).toBeNull();
    vi.mocked(fetch).mockResolvedValueOnce(pending()); await show(["b"]); await enter(); await show([]);
    const count = vi.mocked(fetch).mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(40_000)); expect(fetch).toHaveBeenCalledTimes(count);
  });
  it("ignores stale responses when switching files", async () => {
    const response = deferred<Response>(); vi.mocked(fetch).mockReturnValueOnce(response.promise);
    await show(["old"]); await enter(); await show(["new"]); await enter();
    await act(async () => response.resolve(webp())); await decoded();
    expect(makeUrl).toHaveBeenCalledTimes(1); expect(ready()).toHaveLength(1);
  });
  it("does not retain a cross-navigation or cross-account module image cache", async () => {
    await show(); await enter(); await decoded(); await show([]); await show(); await enter(); await decoded();
    expect(fetch).toHaveBeenCalledTimes(2); expect(revokeUrl).toHaveBeenCalledTimes(1);
  });
  it("falls back on native image decoding failure and revokes its object URL", async () => {
    await show(); await enter(); await act(async () => host.querySelector("img")?.dispatchEvent(new Event("error")));
    expect(revokeUrl).toHaveBeenCalledOnce(); expect(ready()).toHaveLength(0); expect(host.textContent).toContain("封面暂不可用");
  });
  it("survives StrictMode with no stale request or admission leak", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    await act(async () => root.render(createElement(StrictMode, null, ["a", "b"].map(id => createElement(FilePdfCover, { key: id, file: file(id) })))));
    await decoded(); expect(ready()).toHaveLength(2); expect(fetch).toHaveBeenCalledTimes(2);
  });
});

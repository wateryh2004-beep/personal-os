// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("unpdf/pdfjs", () => ({ getDocument: mocks.getDocument }));
import { FilePdfCover, maxPdfCoverBytes, maxPdfCoverPixels, pdfCoverTimeoutMs } from "@/components/files/file-pdf-cover";
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
const head = (size = 1024, status = 200, type = "application/pdf") => new Response(null, { status, headers: { "content-length": String(size), "content-type": type } });
let root: Root, host: HTMLDivElement;
let page: { getViewport: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn>; cleanup: ReturnType<typeof vi.fn> };
let pdf: { numPages: number; getPage: ReturnType<typeof vi.fn> };
let task: { promise: Promise<typeof pdf>; destroy: ReturnType<typeof vi.fn>; onProgress?: (value: { loaded: number; total: number }) => void };
async function show(ids = ["a"]) { await act(async () => root.render(createElement("div", null, ids.map(id => createElement(FilePdfCover, { key: id, file: file(id) }))))); }
async function enter() { await act(async () => observers.forEach(observer => observer.emit(true))); }
const ready = () => host.querySelectorAll('canvas[data-pdf-cover-rendered="true"]');
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("IntersectionObserver", FakeObserver); observers.length = 0;
  vi.stubGlobal("fetch", vi.fn(async () => head()));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  page = { getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale })), render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })), cleanup: vi.fn() };
  pdf = { numPages: 2, getPage: vi.fn(async () => page) };
  task = { promise: Promise.resolve(pdf), destroy: vi.fn(async () => {}) };
  mocks.getDocument.mockReset().mockImplementation(() => task);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("bounded private PDF first-page covers", () => {
  it("fetches nothing offscreen and paints only page one after a bounded authenticated preflight", async () => {
    await show(); expect(fetch).not.toHaveBeenCalled(); expect(mocks.getDocument).not.toHaveBeenCalled();
    await enter();
    expect(fetch).toHaveBeenCalledWith("/api/files/a/preview", expect.objectContaining({ method: "HEAD", credentials: "same-origin", cache: "no-store" }));
    expect(pdf.getPage).toHaveBeenCalledExactlyOnceWith(1);
    expect(mocks.getDocument).toHaveBeenCalledWith(expect.objectContaining({ disableStream: true, disableAutoFetch: true, enableXfa: false, useWorkerFetch: false, url: "/api/files/a/preview" }));
    expect(page.render).toHaveBeenCalledWith(expect.objectContaining({ annotationMode: 0 }));
    const canvas = ready()[0] as HTMLCanvasElement;
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(maxPdfCoverPixels);
    expect(task.destroy).toHaveBeenCalledOnce(); expect(page.cleanup).toHaveBeenCalledOnce();
    expect(canvas.width).toBeGreaterThan(0);
  });
  it("admits one PDF and waits for actual paint and document destruction before advancing", async () => {
    const paint = deferred<void>(), destruction = deferred<void>();
    page.render.mockReturnValueOnce({ promise: paint.promise, cancel: vi.fn() });
    task.destroy.mockReturnValueOnce(destruction.promise);
    await show(["a", "b", "c"]); await enter();
    expect(fetch).toHaveBeenCalledTimes(1); expect(ready()).toHaveLength(0);
    await act(async () => paint.resolve()); expect(ready()).toHaveLength(1); expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => destruction.resolve()); expect(fetch).toHaveBeenCalledTimes(3); expect(ready()).toHaveLength(3);
  });
  it("removes offscreen waiting covers from admission", async () => {
    const preflight = deferred<Response>(); vi.mocked(fetch).mockReturnValueOnce(preflight.promise);
    await show(["a", "b", "c"]); await enter();
    await act(async () => observers[1].emit(false));
    await act(async () => preflight.resolve(head()));
    expect(vi.mocked(fetch).mock.calls.map(call => call[0])).toEqual(["/api/files/a/preview", "/api/files/c/preview"]);
  });
  it.each([[401, 1024, "application/pdf"], [404, 1024, "application/pdf"], [200, maxPdfCoverBytes + 1, "application/pdf"], [200, 1024, "text/html"], [200, 0, "application/pdf"]])("falls back safely on preflight status %s size %s type %s", async (status, size, type) => {
    vi.mocked(fetch).mockResolvedValue(head(size, status, type)); await show(); await enter();
    expect(mocks.getDocument).not.toHaveBeenCalled(); expect(host.textContent).toContain("封面暂不可用");
  });
  it("does not download a known oversized PDF", async () => {
    await act(async () => root.render(createElement(FilePdfCover, { file: file("large", maxPdfCoverBytes + 1) })));
    await enter(); expect(fetch).not.toHaveBeenCalled(); expect(observers).toHaveLength(0); expect(host.textContent).toContain("点击预览 PDF");
  });
  it.each(["PasswordException", "InvalidPDFException"])("falls back for %s and releases its document", async name => {
    mocks.getDocument.mockImplementation(() => ({ ...task, promise: Promise.reject(Object.assign(new Error("bad pdf"), { name })) }));
    await show(); await enter(); expect(host.textContent).toContain("封面暂不可用"); expect(ready()).toHaveLength(0); expect(task.destroy).toHaveBeenCalledOnce();
  });
  it("times out a hung HEAD, aborts it, and advances to the next visible cover", async () => {
    vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {}));
    await show(["a", "b"]); await enter(); const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    await act(async () => vi.advanceTimersByTime(pdfCoverTimeoutMs));
    expect(signal?.aborted).toBe(true); expect(fetch).toHaveBeenCalledTimes(2); expect(ready()).toHaveLength(1);
  });
  it("cancels a timed-out render before admitting another PDF", async () => {
    const paint = deferred<void>(); const cancel = vi.fn(() => paint.resolve());
    page.render.mockReturnValueOnce({ promise: paint.promise, cancel });
    await show(["a", "b"]); await enter(); expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(pdfCoverTimeoutMs));
    expect(cancel).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledTimes(2);
    expect(ready()).toHaveLength(1); expect(host.textContent).toContain("封面暂不可用");
  });
  it("cancels active painting when the grid is dismissed and ignores its late completion", async () => {
    const paint = deferred<void>(); const cancel = vi.fn(() => paint.resolve());
    page.render.mockReturnValueOnce({ promise: paint.promise, cancel });
    await show(); await enter(); const canvas = host.querySelector("canvas")!;
    await show([]); expect(cancel).toHaveBeenCalledOnce(); expect(task.destroy).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(0); expect(canvas.dataset.pdfCoverRendered).toBeUndefined();
  });
  it.each([[792, 612], [100000, 200000], [1, 100000]])("preserves a bounded complete page for geometry %s × %s", async (width, height) => {
    page.getViewport.mockImplementation(({ scale }: { scale: number }) => ({ width: width * scale, height: height * scale }));
    await show(); await enter(); const canvas = ready()[0] as HTMLCanvasElement;
    expect(canvas.width).toBeGreaterThan(0); expect(canvas.height).toBeGreaterThan(0);
    expect(canvas.width).toBeLessThanOrEqual(512); expect(canvas.height).toBeLessThanOrEqual(512);
  });
  it("rejects invalid page dimensions without rendering", async () => {
    page.getViewport.mockReturnValue({ width: Infinity, height: 0 }); await show(); await enter();
    expect(page.render).not.toHaveBeenCalled(); expect(host.textContent).toContain("封面暂不可用");
  });
  it("bounds page count and cumulative loading bytes", async () => {
    pdf.numPages = 501; await show(); await enter(); expect(pdf.getPage).not.toHaveBeenCalled(); expect(ready()).toHaveLength(0);
    pdf.numPages = 2; task.promise = new Promise(() => {}); await show(["b"]); await enter();
    await act(async () => task.onProgress?.({ loaded: maxPdfCoverBytes + 1, total: 0 }));
    expect(host.textContent).toContain("封面暂不可用"); expect(task.destroy).toHaveBeenCalledTimes(2);
  });
  it("ignores stale loads after switching files and clears canvas pixels on unmount", async () => {
    const preflight = deferred<Response>(); vi.mocked(fetch).mockReturnValueOnce(preflight.promise);
    await show(["old"]); await enter(); await show(["new"]); await enter();
    await act(async () => preflight.resolve(head()));
    expect(mocks.getDocument).toHaveBeenCalledTimes(1); expect(mocks.getDocument.mock.calls[0][0].url).toBe("/api/files/new/preview");
    const canvas = ready()[0] as HTMLCanvasElement; await show([]); expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
  });
  it("survives StrictMode and geometry fallback without leaking admission", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    await act(async () => root.render(createElement(StrictMode, null, ["a", "b"].map(id => createElement(FilePdfCover, { key: id, file: file(id) })))));
    expect(ready()).toHaveLength(2); expect(fetch).toHaveBeenCalledTimes(2);
    expect([...ready()].every(canvas => (canvas as HTMLCanvasElement).width > 0)).toBe(true);
  });
});

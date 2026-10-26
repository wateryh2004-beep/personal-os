// @vitest-environment jsdom
import { act, createElement, lazy, StrictMode, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDocument: vi.fn(), getProgress: vi.fn(), saveProgress: vi.fn() }));
vi.mock("@/features/files/reading-progress-actions", () => ({ getReadingProgress: mocks.getProgress, saveReadingProgress: mocks.saveProgress }));
vi.mock("unpdf/pdfjs", () => ({ getDocument: mocks.getDocument }));
vi.mock("next/dynamic", () => ({ default: (loader: () => Promise<React.ComponentType>) => lazy(async () => ({ default: await loader() })) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/components/layout/workspace-panel-provider", () => ({ useWorkspacePanel: () => ({ isOpen: false, toggle: vi.fn(), close: vi.fn() }) }));
vi.mock("@/components/shared/inspector", () => ({ Inspector: () => null }));
import {
  FilePdfPreview, maxInlinePdfBytes, maxInlinePdfPages, maxPdfCanvasPixels, pdfLoadTimeoutMs, pdfRenderTimeoutMs,
} from "@/components/files/file-pdf-preview";
import { NoteDocumentShell } from "@/components/notes/note-document-shell";
import { WorkbenchActivityContext } from "@/components/workbench/workbench-activity";
import { captureWorkbenchPosition, restoreWorkbenchPosition } from "@/components/workbench/workbench-position";
import { photoPreviewMime, isPdfFile } from "@/features/files/preview-format";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function page(width = 600, height = 800) {
  return {
    getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: width * scale, height: height * scale })),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })), cleanup: vi.fn(),
  };
}
const head = (size = 1000, status = 200) => new Response(null, { status, headers: { "content-type": "application/pdf", "content-length": String(size) } });
let host: HTMLDivElement; let root: Root;
let firstPage: ReturnType<typeof page>;
let documentProxy: { numPages: number; getPage: ReturnType<typeof vi.fn> };
let task: { promise: Promise<typeof documentProxy>; destroy: ReturnType<typeof vi.fn>; onProgress?: (value: { loaded: number; total: number }) => void };
async function show(id = "id") {
  await act(async () => root.render(createElement(FilePdfPreview, { documentId: id, title: "合成 PDF" })));
}
function button(label: string) {
  return [...host.querySelectorAll("button")].find(element => element.textContent === label || element.getAttribute("aria-label") === label)!;
}
async function click(label: string) { await act(async () => button(label).click()); }
const renderedCanvas = () => host.querySelector<HTMLCanvasElement>('canvas[data-pdf-rendered="true"]');

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", undefined);
  vi.stubGlobal("fetch", vi.fn(async () => head()));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 624, height: 800, top: 0, bottom: 800, left: 0, right: 624, x: 0, y: 0, toJSON() {} });
  firstPage = page();
  documentProxy = { numPages: 3, getPage: vi.fn(async () => firstPage) };
  task = { promise: Promise.resolve(documentProxy), destroy: vi.fn(async () => {}) };
  mocks.getProgress.mockReset().mockResolvedValue(null);
  mocks.saveProgress.mockReset().mockResolvedValue({ status: "saved", progress: { page: 2, totalPages: 3, revision: 2, updatedAt: "now" } });
  mocks.getDocument.mockReset().mockImplementation(() => task);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("private PDF canvas preview UI", () => {
  it("preflights HEAD and only marks a canvas ready after the actual render promise", async () => {
    const preflight = deferred<Response>();
    const paint = deferred<void>();
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn(() => preflight.promise));
    firstPage.render.mockReturnValue({ promise: paint.promise, cancel });
    await show();
    expect(mocks.getDocument).not.toHaveBeenCalled();
    expect(host.textContent).toContain("正在准备");
    expect(fetch).toHaveBeenCalledWith("/api/files/id/preview", expect.objectContaining({ method: "HEAD", credentials: "same-origin", cache: "no-store" }));
    await act(async () => preflight.resolve(head()));
    expect(host.querySelector("iframe")).toBeNull();
    expect(renderedCanvas()).toBeNull();
    expect(host.querySelector("canvas")?.style.visibility).toBe("hidden");
    expect(mocks.getDocument).toHaveBeenCalledWith(expect.objectContaining({
      url: "/api/files/id/preview", withCredentials: true, disableStream: true, disableAutoFetch: true,
      rangeChunkSize: 65536, useSystemFonts: true, enableXfa: false, maxImageSize: maxPdfCanvasPixels,
      canvasMaxAreaInBytes: 16_000_000, useWorkerFetch: false, useWasm: false,
    }));
    expect(firstPage.render).toHaveBeenCalledWith(expect.objectContaining({ canvas: host.querySelector("canvas"), annotationMode: 0 }));
    await act(async () => paint.resolve());
    expect(renderedCanvas()?.getAttribute("aria-label")).toContain("第 1 页");
    expect(renderedCanvas()?.style.visibility).toBe("visible");
    expect(host.querySelector('a[target="_blank"]')?.getAttribute("href")).toBe("/api/files/id/preview");
    expect(host.querySelector('a[target="_blank"]')?.getAttribute("rel")).toContain("noopener");
    expect(host.querySelector('a[href="/api/files/id/download"]')).not.toBeNull();
  });

  it.each([401, 403, 404, 415, 422, 503])("shows a readable HEAD %s failure without starting PDF.js", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => head(1000, status)));
    await show();
    expect(mocks.getDocument).not.toHaveBeenCalled();
    expect(host.querySelector("canvas")).toBeNull();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector('a[target="_blank"]')).toBeNull();
  });

  it("keeps native and download fallbacks for over-budget PDFs without fetching their body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => head(maxInlinePdfBytes + 1)));
    await show();
    expect(host.textContent).toContain("25 MiB");
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector('a[target="_blank"]')).not.toBeNull();
    expect(mocks.getDocument).not.toHaveBeenCalled();
  });

  it.each([undefined, "NaN", "-1", "0", "7", "8.5"])("rejects an unknown or impossible HEAD length: %s", async (length) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { headers: { "content-type": "application/pdf", ...(length ? { "content-length": length } : {}) } })));
    await show();
    expect(mocks.getDocument).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("does not use an error document mislabeled by a successful HEAD", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { headers: { "content-type": "application/json", "content-length": "1000" } })));
    await show(); expect(mocks.getDocument).not.toHaveBeenCalled();
  });

  it("aborts preflight when closed and ignores a late successful reply", async () => {
    const preflight = deferred<Response>();
    let signal!: AbortSignal;
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => { signal = init.signal!; return preflight.promise; }));
    await show();
    await act(async () => root.render(null));
    expect(signal.aborted).toBe(true);
    await act(async () => preflight.resolve(head()));
    expect(mocks.getDocument).not.toHaveBeenCalled();
  });

  it("destroys a pending document load when closed", async () => {
    const loading = deferred<typeof documentProxy>(); task.promise = loading.promise;
    await show();
    await act(async () => root.render(null));
    expect(task.destroy).toHaveBeenCalledOnce();
    await act(async () => loading.resolve(documentProxy));
    expect(documentProxy.getPage).not.toHaveBeenCalled();
  });

  it("bounds page count before rendering and destroys unsupported documents", async () => {
    documentProxy.numPages = maxInlinePdfPages + 1;
    await show();
    expect(host.textContent).toContain("页数超出");
    expect(documentProxy.getPage).not.toHaveBeenCalled();
    expect(task.destroy).toHaveBeenCalledOnce();
  });

  it("does not expose provider error details from load or render failures", async () => {
    mocks.getDocument.mockImplementation(() => { throw new Error("private-storage-detail"); });
    await show();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("下载原件");
    expect(host.textContent).not.toContain("private-storage-detail");
  });

  it("shows the encrypted-file fallback instead of waiting for a password callback", async () => {
    const failure = new Error("private-password-detail"); failure.name = "PasswordException";
    task.promise = Promise.reject(failure);
    await show();
    expect(host.textContent).toContain("需要密码");
    expect(task.destroy).toHaveBeenCalledOnce();
  });

  it("cancels the previous page render before showing a new page", async () => {
    const oldPaint = deferred<void>();
    const cancel = vi.fn(() => oldPaint.reject(new Error("RenderingCancelledException")));
    firstPage.render.mockReturnValue({ promise: oldPaint.promise, cancel });
    const second = page();
    documentProxy.getPage.mockImplementation(async (number: number) => number === 1 ? firstPage : second);
    await show();
    const previousCanvas = host.querySelector("canvas");
    await click("下一页");
    expect(cancel).toHaveBeenCalledOnce();
    expect(firstPage.cleanup).toHaveBeenCalledOnce();
    expect(previousCanvas?.getAttribute("data-pdf-rendered")).toBeNull();
    expect(renderedCanvas()?.getAttribute("data-pdf-page")).toBe("2");
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelectorAll("canvas")).toHaveLength(1);
  });

  it("changes pages, zooms and fits width without reloading the document", async () => {
    await show();
    expect(button("上一页").disabled).toBe(true);
    const originalWidth = renderedCanvas()!.width;
    await click("放大 PDF");
    expect(renderedCanvas()!.width).toBeGreaterThan(originalWidth);
    expect(host.textContent).toContain("125%");
    await click("适合宽度");
    expect(renderedCanvas()!.width).toBe(originalWidth);
    await click("下一页"); await click("下一页");
    expect(button("下一页").disabled).toBe(true);
    expect(host.textContent).toContain("第 3 / 3 页");
    await click("上一页");
    expect(renderedCanvas()?.getAttribute("data-pdf-page")).toBe("2");
    expect(mocks.getDocument).toHaveBeenCalledOnce();
  });

  it("caps backing canvas pixels and dimensions for large pages at high pixel density", async () => {
    vi.stubGlobal("devicePixelRatio", 3);
    documentProxy.getPage.mockResolvedValue(page(12_000, 18_000));
    await show(); await click("放大 PDF"); await click("放大 PDF"); await click("放大 PDF"); await click("放大 PDF");
    const canvas = renderedCanvas()!;
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(maxPdfCanvasPixels);
    expect(Math.max(canvas.width, canvas.height)).toBeLessThanOrEqual(4096);
    expect(button("放大 PDF").disabled).toBe(true);
  });

  it("destroys a hung document load at its deadline", async () => {
    task.promise = new Promise(() => {});
    await show();
    await act(async () => vi.advanceTimersByTime(pdfLoadTimeoutMs));
    expect(host.textContent).toContain("加载超时");
    expect(task.destroy).toHaveBeenCalledOnce();
  });

  it("cancels a hung page render and destroys its document at the render deadline", async () => {
    const painting = deferred<void>();
    const cancel = vi.fn(() => painting.reject(new Error("cancelled")));
    firstPage.render.mockReturnValue({ promise: painting.promise, cancel });
    await show();
    await act(async () => vi.advanceTimersByTime(pdfRenderTimeoutMs));
    expect(host.textContent).toContain("渲染超时");
    expect(cancel).toHaveBeenCalledOnce();
    expect(task.destroy).toHaveBeenCalledOnce();
    expect(renderedCanvas()).toBeNull();
  });

  it("destroys a document if loading progress exceeds the declared inline byte budget", async () => {
    task.promise = new Promise(() => {});
    await show();
    await act(async () => task.onProgress?.({ loaded: maxInlinePdfBytes + 1, total: maxInlinePdfBytes + 1 }));
    expect(task.destroy).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("25 MiB");
  });

  it("never paints the old document after the user changes selection", async () => {
    const pending = deferred<typeof documentProxy>();
    task.promise = pending.promise;
    const oldTask = task;
    await show("old");
    const nextPage = page();
    const nextDocument = { numPages: 1, getPage: vi.fn(async () => nextPage) };
    task = { promise: Promise.resolve(nextDocument), destroy: vi.fn(async () => {}) };
    await show("new");
    expect(oldTask.destroy).toHaveBeenCalledOnce();
    await act(async () => pending.resolve(documentProxy));
    expect(documentProxy.getPage).not.toHaveBeenCalled();
    expect(host.querySelector('a[target="_blank"]')?.getAttribute("href")).toBe("/api/files/new/preview");
    expect(renderedCanvas()).not.toBeNull();
  });

  it("releases the canvas and PDF document on close", async () => {
    await show();
    const canvas = renderedCanvas()!;
    await act(async () => root.render(null));
    expect(task.destroy).toHaveBeenCalledOnce();
    expect(firstPage.cleanup).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it("renders through StrictMode setup and cleanup without stale success or leaked tasks", async () => {
    await act(async () => root.render(createElement(StrictMode, null, createElement(FilePdfPreview, { documentId: "id", title: "Strict PDF" }))));
    expect(renderedCanvas()).not.toBeNull();
    expect(renderedCanvas()!.width).toBeGreaterThan(0);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("recognizes generic legacy metadata without accepting active image formats", () => {
    expect(photoPreviewMime("application/octet-stream", "IMAGE.JPG")).toBe("image/jpeg");
    expect(photoPreviewMime("application/octet-stream", "image.svg")).toBeNull();
    expect(photoPreviewMime("text/html", "image.jpg")).toBeNull();
    expect(isPdfFile({ mime_type: "application/octet-stream", original_filename: "Document.PDF" })).toBe(true);
    expect(isPdfFile({ mime_type: "text/html", original_filename: "Document.pdf" })).toBe(false);
  });
});


describe("durable reading continuity", () => {
  const sourceVersion = "11111111-1111-4111-8111-111111111111";
  function prepare(page = 2) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { headers: {
      "content-type": "application/pdf", "content-length": "1000", "X-Reading-Source-Version": sourceVersion,
    } })));
    mocks.getProgress.mockResolvedValue({ sourceVersion, progress: { page, totalPages: 3, revision: 1, updatedAt: "now" } });
  }
  it("reopens on the persisted page without overwriting it during load or zoom", async () => {
    prepare(); await show();
    expect(renderedCanvas()?.dataset.pdfPage).toBe("2");
    expect(host.textContent).toContain("已接续第 2 页");
    expect(mocks.saveProgress).not.toHaveBeenCalled();
    await click("放大 PDF"); expect(mocks.saveProgress).not.toHaveBeenCalled();
    await click("从头阅读");
    expect(mocks.saveProgress).toHaveBeenCalledWith(expect.objectContaining({ page: 1, expectedRevision: 1, sourceVersion }));
  });
  it("does not write an unrendered page and keeps latest device position on conflict", async () => {
    prepare(1); await show();
    mocks.saveProgress.mockResolvedValue({ status: "conflict", progress: { page: 3, totalPages: 3, revision: 8, updatedAt: "now" } });
    const paint = deferred<void>(); firstPage.render.mockReturnValue({ promise: paint.promise, cancel: vi.fn() });
    await click("下一页"); expect(mocks.saveProgress).not.toHaveBeenCalled();
    await act(async () => paint.resolve());
    expect(host.textContent).toContain("另一设备已更新到第 3 页");
    await click("接续最新进度"); expect(renderedCanvas()?.dataset.pdfPage).toBe("3");
    expect(mocks.saveProgress).toHaveBeenCalledTimes(1);
    mocks.saveProgress.mockResolvedValue({ status: "saved", progress: { page: 2, totalPages: 3, revision: 9, updatedAt: "now" } });
    await click("上一页");
    expect(mocks.saveProgress).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, expectedRevision: 8 }));
  });
  it("will not restore or write a stale source or mismatched page count", async () => {
    prepare(); mocks.getProgress.mockResolvedValue({ sourceVersion: "stale", progress: { page: 2, totalPages: 3, revision: 1 } });
    await show(); await click("下一页");
    expect(host.textContent).toContain("阅读进度暂不可用"); expect(mocks.saveProgress).not.toHaveBeenCalled();
  });
  it("finishes an already issued save across close, without updating an unmounted reader", async () => {
    prepare(); await show(); const saved = deferred<unknown>(); mocks.saveProgress.mockReturnValue(saved.promise);
    await click("下一页"); await act(async () => root.render(null));
    await act(async () => saved.resolve({ status: "saved", progress: { page: 3, revision: 2 } }));
    expect(host.textContent).toBe(""); expect(task.destroy).toHaveBeenCalled();
  });
});


it("quicklook PDF never reads or writes the authoritative reading position", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { headers: { "content-type": "application/pdf", "content-length": "1000", "X-Reading-Source-Version": "00000000-0000-4000-8000-000000000001" } })));
  await act(async () => root.render(createElement(FilePdfPreview, { documentId: "quicklook", title: "只读", persistProgress: false, initialPage: 2, initialSourceVersion: "00000000-0000-4000-8000-000000000001" })));
  expect(mocks.getProgress).not.toHaveBeenCalled();
  await click("下一页");
  expect(mocks.saveProgress).not.toHaveBeenCalled();
  expect(renderedCanvas()?.getAttribute("aria-label")).toContain("第 3 页");
});
it("a hidden workbench PDF pauses heavy loading and destroys its task, then resumes its page", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { headers: { "content-type": "application/pdf", "content-length": "1000", "X-Reading-Source-Version": "00000000-0000-4000-8000-000000000001" } })));
  await act(async () => root.render(createElement(FilePdfPreview, { documentId: "paused", title: "暂停", persistProgress: false, active: false, initialPage: 2, initialSourceVersion: "00000000-0000-4000-8000-000000000001" })));
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => root.render(createElement(FilePdfPreview, { documentId: "paused", title: "暂停", persistProgress: false, active: true, initialPage: 2, initialSourceVersion: "00000000-0000-4000-8000-000000000001" })));
  expect(renderedCanvas()?.getAttribute("aria-label")).toContain("第 2 页");
  await click("下一页");
  await act(async () => root.render(createElement(FilePdfPreview, { documentId: "paused", title: "暂停", persistProgress: false, active: false, initialPage: 2, initialSourceVersion: "00000000-0000-4000-8000-000000000001" })));
  expect(task.destroy).toHaveBeenCalled(); expect(host.querySelector("canvas")).toBeNull();
  await act(async () => root.render(createElement(FilePdfPreview, { documentId: "paused", title: "暂停", persistProgress: false, active: true, initialPage: 2, initialSourceVersion: "00000000-0000-4000-8000-000000000001" })));
  expect(renderedCanvas()?.getAttribute("aria-label")).toContain("第 3 页");
});

it("resumes with a fresh PDF proxy and ignores a destroyed proxy's late getPage rejection", async () => {
  let destroyed = false;
  const oldGetPage = vi.fn(async () => { if (destroyed) throw new Error("destroyed proxy"); return firstPage; });
  const oldTask = { promise: Promise.resolve({ numPages: 3, getPage: oldGetPage }), destroy: vi.fn(async () => { destroyed = true; }) };
  const freshGetPage = vi.fn(async () => firstPage);
  const freshTask = { promise: Promise.resolve({ numPages: 3, getPage: freshGetPage }), destroy: vi.fn(async () => {}) };
  mocks.getDocument.mockReset().mockReturnValueOnce(oldTask).mockReturnValueOnce(freshTask);
  const props = { documentId: "fresh-resume", title: "Synthetic resume", persistProgress: false };
  await act(async () => root.render(createElement(FilePdfPreview, { ...props, active: true })));
  expect(renderedCanvas()).not.toBeNull();
  await act(async () => root.render(createElement(FilePdfPreview, { ...props, active: false })));
  expect(oldTask.destroy).toHaveBeenCalledOnce();
  const oldCalls = oldGetPage.mock.calls.length;
  await act(async () => root.render(createElement(FilePdfPreview, { ...props, active: true })));
  expect(oldGetPage).toHaveBeenCalledTimes(oldCalls);
  expect(freshGetPage).toHaveBeenCalled(); expect(freshTask.destroy).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')).toBeNull(); expect(renderedCanvas()).not.toBeNull();
});

it("recovers a failed session on pause/resume and can read when progress retrieval fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(head(1000, 503)).mockResolvedValueOnce(new Response(null, { headers: { "content-type": "application/pdf", "content-length": "1000", "X-Reading-Source-Version": "00000000-0000-4000-8000-000000000001" } })));
  const props = { documentId: "retry-after-pause", title: "Synthetic recover" };
  await act(async () => root.render(createElement(FilePdfPreview, { ...props, active: true })));
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => root.render(createElement(FilePdfPreview, { ...props, active: false })));
  mocks.getProgress.mockRejectedValueOnce(new Error("offline progress read"));
  await act(async () => root.render(createElement(FilePdfPreview, { ...props, active: true })));
  expect(host.querySelector('[role="alert"]')).toBeNull(); expect(renderedCanvas()).not.toBeNull();
  expect(host.textContent).toContain("阅读进度暂不可用");
});


it("captures a hidden main PDF's page/source without retaining its session or borrowing another document's position", async () => {
  const documentId = "70000000-0000-4000-8000-000000000001";
  const otherId = "70000000-0000-4000-8000-000000000002";
  const sourceVersion = "71000000-0000-4000-8000-000000000001";
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { headers: { "content-type": "application/pdf", "content-length": "1000", "X-Reading-Source-Version": sourceVersion } })));
  const showReader = async (id: string, active: boolean) => act(async () => root.render(createElement("section", { "data-note-reader-view": "pdf" }, createElement(FilePdfPreview, { documentId: id, title: "Hidden source capture", persistProgress: false, active }))));
  await showReader(documentId, true); await click("下一页");
  expect(renderedCanvas()?.dataset.pdfPage).toBe("2");
  await showReader(documentId, false); host.hidden = true;
  expect(host.querySelector("canvas")).toBeNull(); expect(task.destroy).toHaveBeenCalled();
  const snapshot = await captureWorkbenchPosition(host, "main");
  expect(snapshot).toMatchObject({ noteReaderView: "pdf", pdfDocumentId: documentId, pdfSourceVersion: sourceVersion, pdfPage: 2 });
  await showReader(otherId, false);
  const other = await captureWorkbenchPosition(host, "main");
  expect(other.pdfDocumentId).toBe(otherId); expect(other.pdfPage).toBeUndefined(); expect(other.pdfSourceVersion).toBeUndefined();
  host.hidden = false; await showReader(documentId, true); await click("上一页");
  await act(async () => { restoreWorkbenchPosition(host, snapshot, { scope: "main" }); });
  expect(renderedCanvas()?.dataset.pdfPage).toBe("2");
  expect(mocks.getProgress).not.toHaveBeenCalled(); expect(mocks.saveProgress).not.toHaveBeenCalled();
  // A retained but inactive PDF must not override the current Markdown reader.
  host.querySelector<HTMLElement>("[data-note-reader-view]")!.dataset.noteReaderView = "markdown";
  const markdown = await captureWorkbenchPosition(host, "main");
  expect(markdown.pdfPage).toBeUndefined(); expect(markdown.pdfDocumentId).toBeUndefined(); expect(markdown.pdfSourceVersion).toBeUndefined();
});

it("keeps a visited document-tab reader warm without refetch, but destroys it when the outer workbench pane pauses", async () => {
  const id = "10000000-0000-4000-8000-000000000002";
  const source = "11000000-0000-4000-8000-000000000002";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { headers: { "content-type": "application/pdf", "content-length": "1000", "X-Reading-Source-Version": source } })));
  const sessions: Array<{ destroy: ReturnType<typeof vi.fn> }> = [];
  mocks.getDocument.mockImplementation(() => {
    let destroyed = false;
    const session = { promise: Promise.resolve({ numPages: 2, getPage: vi.fn(async () => { if (destroyed) throw new Error("destroyed proxy"); return firstPage; }) }), destroy: vi.fn(async () => { destroyed = true; }) };
    sessions.push(session); return session;
  });
  let hiddenWidth = false;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, hiddenWidth ? 0 : 624, hiddenWidth ? 0 : 800));
  const showShell = async (active: boolean) => act(async () => root.render(createElement(Suspense, { fallback: null }, createElement(WorkbenchActivityContext.Provider, { value: active }, createElement(NoteDocumentShell, {
    noteId: "warm-note", editor: createElement("textarea", { defaultValue: "Draft remains alive" }), inspector: null,
    attachments: [{ id, title: "合成 PDF", original_filename: "synthetic.pdf", mime_type: "application/pdf", file_size: 1000, role: "pdf_snapshot" }],
  })))));
  await showShell(true);
  expect(fetch).not.toHaveBeenCalled(); expect(mocks.getDocument).not.toHaveBeenCalled(); expect(host.querySelector("canvas")).toBeNull();
  const draft = host.querySelector("textarea")!; draft.value = "Unsaved draft";
  await click("PDF"); await click("下一页");
  const reader = host.querySelector(".file-pdf-preview"); const canvas = renderedCanvas();
  expect(canvas?.dataset.pdfPage).toBe("2");
  const paints = firstPage.render.mock.calls.length;
  hiddenWidth = true; await click("正文");
  await act(async () => window.dispatchEvent(new Event("resize")));
  expect(host.querySelector(".notes-document-pdf-pane")?.hasAttribute("hidden")).toBe(true);
  expect(host.querySelector(".file-pdf-preview")).toBe(reader); expect(renderedCanvas()).toBe(canvas);
  expect(sessions[0].destroy).not.toHaveBeenCalled(); expect(firstPage.render).toHaveBeenCalledTimes(paints);
  hiddenWidth = false; await click("PDF");
  await act(async () => window.dispatchEvent(new Event("resize")));
  expect(renderedCanvas()).toBe(canvas); expect(canvas?.dataset.pdfPage).toBe("2");
  expect(fetch).toHaveBeenCalledTimes(1); expect(mocks.getDocument).toHaveBeenCalledTimes(1);
  expect(host.querySelector("textarea")).toBe(draft); expect(draft.value).toBe("Unsaved draft");
  await showShell(false);
  expect(sessions[0].destroy).toHaveBeenCalledOnce(); expect(host.querySelector("canvas")).toBeNull();
  await showShell(true);
  expect(fetch).toHaveBeenCalledTimes(2); expect(mocks.getDocument).toHaveBeenCalledTimes(2);
  expect(renderedCanvas()).not.toBe(canvas); expect(renderedCanvas()?.dataset.pdfPage).toBe("2");
  expect(host.querySelector('[role="alert"]')).toBeNull();
  const resumed = renderedCanvas(); await click("重新加载 PDF");
  expect(sessions[1].destroy).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledTimes(3); expect(mocks.getDocument).toHaveBeenCalledTimes(3);
  expect(renderedCanvas()).not.toBe(resumed); expect(renderedCanvas()?.dataset.pdfPage).toBe("1");
  await act(async () => root.render(null));
  expect(sessions[2].destroy).toHaveBeenCalledOnce(); expect(host.querySelector("canvas")).toBeNull();
});

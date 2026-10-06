// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilePdfPreview } from "@/components/files/file-pdf-preview";
import { photoPreviewMime, isPdfFile } from "@/features/files/preview-format";
let host: HTMLDivElement; let root: Root;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
describe("private PDF preview UI", () => {
  it("preflights HEAD before mounting a same-origin native reader", async () => {
    let finish!: (value: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(FilePdfPreview, { documentId: "id", title: "合成 PDF" })));
    expect(host.querySelector("iframe")).toBeNull(); expect(host.textContent).toContain("正在准备");
    expect(fetcher).toHaveBeenCalledWith("/api/files/id/preview", expect.objectContaining({ method: "HEAD", cache: "no-store" }));
    await act(async () => finish(new Response(null, { status: 200 })));
    expect(host.querySelector("iframe")?.getAttribute("src")).toBe("/api/files/id/preview");
    expect(host.querySelector("iframe")?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(host.querySelector("a")?.getAttribute("rel")).toContain("noopener");
    expect(host.textContent).toContain("浏览器自带阅读器");
  });
  it("shows a readable failure without mounting an error JSON iframe", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 422 })));
    await act(async () => root.render(createElement(FilePdfPreview, { documentId: "id", title: "Invalid PDF" })));
    expect(host.querySelector("iframe")).toBeNull(); expect(host.querySelector('[role="alert"]')?.textContent).toContain("下载原件");
  });
  it("aborts preflight when closed", async () => {
    let signal!: AbortSignal;
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => { signal = init.signal!; return new Promise(() => {}); }));
    await act(async () => root.render(createElement(FilePdfPreview, { documentId: "id", title: "PDF" })));
    await act(async () => root.render(null)); expect(signal.aborted).toBe(true);
  });
  it("recognizes generic legacy metadata without accepting active image formats", () => {
    expect(photoPreviewMime("application/octet-stream", "IMAGE.JPG")).toBe("image/jpeg");
    expect(photoPreviewMime("application/octet-stream", "image.svg")).toBeNull();
    expect(photoPreviewMime("text/html", "image.jpg")).toBeNull();
    expect(isPdfFile({ mime_type: "application/octet-stream", original_filename: "Document.PDF" })).toBe(true);
    expect(isPdfFile({ mime_type: "text/html", original_filename: "Document.pdf" })).toBe(false);
  });
});

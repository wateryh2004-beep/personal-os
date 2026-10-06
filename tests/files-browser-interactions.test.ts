// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilesWorkspace } from "@/components/files/files-workspace";
import { defaultFileBrowserState } from "@/features/files/browser-state";
import type { FileRecord } from "@/features/files/queries";
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/components/shared/action-feedback", () => ({ useActionFeedback: () => ({ show: vi.fn() }) }));
vi.mock("@/features/files/actions", () => ({ archiveFile: vi.fn(), createFileFolder: vi.fn(), moveFile: vi.fn(), renameFile: vi.fn(), restoreFile: vi.fn(), setFileAiVisibility: vi.fn() }));
const files: FileRecord[] = [
  { id: "photo", title: "旅行照片", original_filename: "trip.jpg", mime_type: "image/jpeg", file_size: 200, folder_id: null, uploaded_at: "2026-10-03", created_at: "2026-10-03", archived_at: null, ai_visibility: "normal", text_extraction_status: "unsupported", extracted_character_count: 0 },
  { id: "pdf", title: "报告", original_filename: "report.pdf", mime_type: "application/pdf", file_size: 100, folder_id: null, uploaded_at: "2026-10-01", created_at: "2026-10-01", archived_at: null, ai_visibility: "normal", text_extraction_status: "completed", extracted_character_count: 10 },
];
let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); window.history.replaceState(null, "", "/files");
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, writable: true, value: vi.fn() });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(extra = {}) { await act(async () => root.render(createElement(FilesWorkspace, { files, folders: [], ...extra }))); }
function button(text: string) { return Array.from(host.querySelectorAll("button")).find(node => node.textContent?.startsWith(text))!; }
describe("Files filters/photo view", () => {
  it("filters to photos in a grid without requesting original file URLs", async () => {
    await render(); await act(async () => button("照片").click());
    expect(host.querySelectorAll('ul[aria-label="文件网格"] > li')).toHaveLength(1);
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/api/files/photo/thumbnail");
    expect(host.querySelector("img")?.getAttribute("src")).not.toContain("/download");
    expect(host.textContent).toContain("不是拍摄时间"); expect(window.location.search).toContain("type=photo");
    await act(async () => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.textContent).toContain("缩略图暂不可用");
  });
  it("shows an honest filter-empty state and clears it without deleting files", async () => {
    await render(); await act(async () => button("视频").click());
    expect(host.textContent).toContain("没有符合条件的文件");
    await act(async () => button("清除筛选").click());
    expect(host.querySelectorAll('ul[aria-label="文件列表"] > li')).toHaveLength(2);
  });
  it("restores filter/sort/view on popstate and honors a direct file link", async () => {
    await render();
    window.history.pushState(null, "", "/files?type=photo&view=grid&sort=size-desc");
    await act(async () => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(host.querySelectorAll('ul[aria-label="文件网格"] > li')).toHaveLength(1);
    window.history.pushState(null, "", "/files?file=pdf&type=photo&q=missing");
    await act(async () => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(host.querySelector("#file-pdf")).not.toBeNull(); expect(host.querySelector('ul[aria-label="文件列表"]')).not.toBeNull();
  });
  it("reveals an explicitly linked file even if initial filters exclude it", async () => {
    await render({ initialFileId: "pdf", initialBrowserState: { ...defaultFileBrowserState, type: "photo", query: "missing", view: "grid" } });
    expect(host.querySelector("#file-pdf")).not.toBeNull();
  });
  it("paginates long lists and reveals linked files on the correct page", async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ ...files[1], id: `doc-${String(i).padStart(3, "0")}`, title: `Document ${i}` }));
    await render({ files: many });
    expect(host.querySelectorAll('ul[aria-label="文件列表"] > li')).toHaveLength(100);
    await act(async () => button("下一页").click());
    expect(host.querySelectorAll('ul[aria-label="文件列表"] > li')).toHaveLength(50);
    expect(window.location.search).toContain("page=2");
    await render({ files: many, initialFileId: "doc-149" });
    expect(host.querySelector("#file-doc-149")).not.toBeNull();
    expect(host.querySelector('[aria-label="文件分页"]')?.textContent).toContain("第 2 / 2 页");
  });
  it("does not offer a broken direct download for archived files", async () => {
    await render({ files: [], archivedFiles: [{ ...files[0], archived_at: "2026-10-04" }] });
    expect(host.textContent).toContain("恢复后下载");
    expect(host.querySelector('a[href="/api/files/photo/download"]')).toBeNull();
  });
});

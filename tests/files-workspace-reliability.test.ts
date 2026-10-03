// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilesWorkspace } from "@/components/files/files-workspace";
import { FileMutationForm } from "@/components/files/file-mutation-form";
import { useFileRows } from "@/components/files/use-file-rows";
import type { FileRecord } from "@/features/files/queries";

vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/components/shared/action-feedback", () => ({ useActionFeedback: () => ({ show: vi.fn() }) }));
vi.mock("@/features/files/actions", () => ({ archiveFile: vi.fn(), createFileFolder: vi.fn(), moveFile: vi.fn(), renameFile: vi.fn(), restoreFile: vi.fn(), setFileAiVisibility: vi.fn() }));

const file: FileRecord = {
  id: "file-a", title: "旧标题", original_filename: "fixture.pdf", mime_type: "application/pdf", file_size: 4,
  folder_id: null, uploaded_at: "2026-10-03T00:00:00Z", created_at: "2026-10-03T00:00:00Z", archived_at: null,
  ai_visibility: "normal", text_extraction_status: "completed", extracted_character_count: 10,
};
const folders = [{ id: "folder-a", name: "示例目录", parent_id: null }];
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function renderFiles(files: FileRecord[], archivedFiles: FileRecord[] = [], initialFileId?: string) {
  return act(async () => root.render(createElement(FilesWorkspace, { folders, files, archivedFiles, initialFileId })));
}

function click(text: string) {
  const button = [...host.querySelectorAll("button")].find((item) => item.textContent === text)!;
  return act(async () => button.click());
}

// jsdom does not implement scrollIntoView.
Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: () => {} });

describe("file workspace refreshes", () => {
  it("reflects a rename, move and restoration after server refresh without remounting", async () => {
    await renderFiles([file]);
    await renderFiles([{ ...file, title: "新标题", folder_id: "folder-a" }]);
    expect(host.querySelector("#file-file-a")?.textContent).toContain("新标题");
    expect(host.querySelector("#file-file-a")?.textContent).not.toContain("旧标题");
    await click("示例目录");
    expect(host.querySelector("#file-file-a")).not.toBeNull();
    await renderFiles([], [{ ...file, archived_at: "2026-10-03T01:00:00Z" }]);
    expect(host.querySelector("#file-file-a")).toBeNull();
    expect(host.textContent).toContain("已归档");
    await renderFiles([{ ...file, title: "已恢复", folder_id: "folder-a" }], []);
    expect(host.querySelector("#file-file-a")?.textContent).toContain("已恢复");
    expect(host.textContent).not.toContain("已归档");
  });

  it("follows another file link in the same route and shows all folders under all files", async () => {
    const child = { ...file, id: "file-b", title: "子目录文件", folder_id: "folder-a" };
    const files = [file, child];
    await renderFiles(files, [], file.id);
    expect(host.querySelector("#file-file-b")).not.toBeNull();
    await renderFiles(files, [], child.id);
    expect(host.querySelector("h1")?.textContent).toBe("示例目录");
    expect(host.querySelector("#file-file-a")).toBeNull();
    expect(host.querySelector("#file-file-b")?.className).toContain("accent-soft");
  });

  it("retains completed local uploads when server data refreshes during a batch", async () => {
    const added = { ...file, id: "uploaded", title: "刚上传的文件" };
    function Rows({ source, add = false }: { source: FileRecord[]; add?: boolean }) {
      const [rows, setRows] = useFileRows(source, true);
      return createElement("div", null, rows.map((row) => createElement("p", { key: row.id }, row.title)),
        createElement("button", { onClick: () => { if (add) setRows((current) => [added, ...current]); } }, "增加"));
    }
    await act(async () => root.render(createElement(Rows, { source: [file], add: true })));
    await click("增加");
    await act(async () => root.render(createElement(Rows, { source: [{ ...file, title: "已刷新" }] })));
    expect([...host.querySelectorAll("p")].map((p) => p.textContent)).toEqual(["刚上传的文件", "已刷新"]);
    await act(async () => root.render(createElement(Rows, { source: [added, { ...file, title: "已刷新" }] })));
    expect(host.querySelectorAll("p")).toHaveLength(2);
  });
});

describe("file mutations", () => {
  it("prevents repeated submissions, preserves input on failure, and permits a successful retry", async () => {
    let reject!: (reason: Error) => void;
    const action = vi.fn<(data: FormData) => Promise<void>>(() => new Promise<void>((_, fail) => { reject = fail; }));
    const success = vi.fn();
    await act(async () => root.render(createElement(FileMutationForm, { action, onSuccess: success },
      createElement("input", { name: "title", defaultValue: "未保存的标题" }), createElement("button", null, "保存"))));
    const form = host.querySelector("form")!;
    const input = host.querySelector("input")!;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0][0].get("title")).toBe("未保存的标题");
    expect(host.querySelector("fieldset")?.disabled).toBe(true);
    await act(async () => reject(new Error("网络断开，请重试")));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("网络断开，请重试");
    expect(input.value).toBe("未保存的标题");
    expect(host.querySelector("fieldset")?.disabled).toBe(false);
    action.mockImplementation(async () => {});
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(success).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});

describe("upload confirmation and indexing", () => {
  it("keeps a confirmed upload successful when extraction times out and protects an active upload", async () => {
    let completePut!: () => void;
    const put = vi.fn();
    class UploadRequest {
      upload = {}; status = 200; timeout = 0; onload?: () => void;
      open() {} setRequestHeader() {}
      send() { put(); completePut = () => this.onload?.(); }
    }
    vi.stubGlobal("XMLHttpRequest", UploadRequest);
    vi.stubGlobal("crypto", { subtle: { digest: vi.fn(async () => new ArrayBuffer(32)) } });
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/extract")) throw new DOMException("Timed out", "TimeoutError");
      if (options?.method === "PATCH") return Response.json({ extractionStatus: "pending" });
      return Response.json({ documentId: "uploaded", uploadUrl: "https://example.invalid/upload", file: {
        id: "uploaded", title: "fixture.pdf", originalFilename: "fixture.pdf", mimeType: "application/pdf", fileSize: 4, folderId: null, textExtractionStatus: "pending",
      } });
    });
    vi.stubGlobal("fetch", fetchMock);
    await renderFiles([]);
    const uploadFile = new File(["test"], "fixture.pdf", { type: "application/pdf" });
    Object.defineProperty(uploadFile, "arrayBuffer", { value: async () => new ArrayBuffer(4) });
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [uploadFile] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(put).toHaveBeenCalledTimes(1);
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving); expect(leaving.defaultPrevented).toBe(true);
    await act(async () => completePut());
    expect(host.textContent).toContain("已上传 1 个文件");
    expect(host.textContent).toContain("文本索引将由后台逐步完成");
    expect(host.textContent).not.toContain("个未完成");
    expect(host.querySelector("#file-uploaded")).not.toBeNull();
    const finished = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(finished); expect(finished.defaultPrevented).toBe(false);
  });

  it("reports partial failures accurately even if failed-upload cleanup is also offline", async () => {
    class UploadRequest {
      upload = {}; status = 200; timeout = 0; onload?: () => void;
      open() {} setRequestHeader() {}
      send(file: File) { if (file.name === "bad.pdf") this.status = 403; queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("XMLHttpRequest", UploadRequest);
    vi.stubGlobal("crypto", { subtle: { digest: vi.fn(async () => new ArrayBuffer(32)) } });
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "DELETE") throw new Error("cleanup offline");
      if (options?.method === "PATCH") return Response.json({ extractionStatus: "completed" });
      const body = JSON.parse(options!.body as string) as { filename: string };
      return Response.json({ documentId: body.filename, uploadUrl: "https://example.invalid/upload", file: {
        id: body.filename, title: body.filename, originalFilename: body.filename, mimeType: "application/pdf", fileSize: 4, folderId: null, textExtractionStatus: "completed",
      } });
    }));
    await renderFiles([]);
    const files = ["good.pdf", "bad.pdf"].map((name) => {
      const item = new File(["test"], name, { type: "application/pdf" });
      Object.defineProperty(item, "arrayBuffer", { value: async () => new ArrayBuffer(4) });
      return item;
    });
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: files });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    const feedback = host.querySelector('[role="status"]')!;
    expect(feedback.textContent).toContain("已上传 1 个，1 个未完成");
    expect(feedback.className).toContain("danger");
    expect(host.querySelectorAll('li[id^="file-"]')).toHaveLength(1);
  });

  it("rejects oversized files before hashing or preparing a network upload", async () => {
    const digest = vi.fn(); vi.stubGlobal("crypto", { subtle: { digest } });
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await renderFiles([]);
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [{ name: "large.pdf", type: "application/pdf", size: 101 * 1024 * 1024, arrayBuffer: vi.fn() }] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(host.textContent).toContain("超过 100 MB");
    expect(digest).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
});

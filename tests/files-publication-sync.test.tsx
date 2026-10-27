// @vitest-environment jsdom
import { createHash, randomUUID, webcrypto } from "node:crypto";
import { Buffer } from "node:buffer";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), show: vi.fn(), recognize: vi.fn() }));
vi.mock("@/lib/adapters/private-ocr-browser", () => ({ recognizePrivateDocument: mocks.recognize }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), useRouter: () => ({ refresh: mocks.refresh, push: vi.fn(), replace: vi.fn() }), usePathname: () => "/files" }));
vi.mock("@/components/shared/action-feedback", () => ({ useActionFeedback: () => ({ show: mocks.show }) }));
vi.mock("@/features/files/actions", () => ({ archiveFile: vi.fn(), createFileFolder: vi.fn(), moveFile: vi.fn(), renameFile: vi.fn(), restoreFile: vi.fn(), setFileAiVisibility: vi.fn() }));
vi.mock("@/features/workbench/operation-actions", () => ({ readWorkbenchReceiptState: vi.fn() }));
import { FilesWorkspace } from "@/components/files/files-workspace";
import type { FileRecord } from "@/features/files/queries";
import { defaultFileBrowserState } from "@/features/files/browser-state";
import { getFilePublications, getFilePublicationOverflow, maxFilePublications, publishFileRecordChange } from "@/features/files/publication";
import { startFileUpload } from "@/features/files/upload-runner";
import { captureWorkspaceScope, clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { getBackgroundOperations } from "@/features/workflow-continuity/background-operations";
const id = "11111111-1111-4111-8111-111111111111", folderId = "22222222-2222-4222-8222-222222222222";
const canonical: FileRecord = { id, title: "Canonical sealed file", original_filename: "original.txt", mime_type: "text/plain", file_size: 4, folder_id: folderId, uploaded_at: "2026-10-27T00:00:00Z", created_at: "2026-10-27T00:00:00Z", archived_at: null, ai_visibility: "normal", text_extraction_status: "pending", extracted_character_count: 0, mutation_revision: 4 };
const folders = [{ id: folderId, name: "Target folder", parent_id: null }];
let host: HTMLDivElement, root: Root;
let finishSeal: (response: Response) => void;
let record: FileRecord | null;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); clearWorkspaceResources(); mocks.refresh.mockReset(); mocks.show.mockReset();
 vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
 vi.stubGlobal("crypto", { randomUUID, subtle: { digest: (algorithm: AlgorithmIdentifier, data: ArrayBuffer) => webcrypto.subtle.digest(algorithm, Buffer.from(new Uint8Array(data))) } });
 Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
 window.history.replaceState({}, "", "/files");
 record = canonical;
 const sealing = new Promise<Response>(resolve => { finishSeal = resolve; });
 fetcher = vi.fn<typeof fetch>(async (input, init) => {
  const url = String(input);
  if (url.endsWith("/record")) return Response.json({ file: record });
  if (url.endsWith("/extract")) return Response.json({ status: "completed", characterCount: 123 });
  if (url === "/api/files/upload-url" && init?.method === "PATCH") return sealing;
  if (url === "/api/files/upload-url") return Response.json({ documentId: id, file: { id, title: "Plan title differs", originalFilename: "original.txt", mimeType: "text/plain", fileSize: 4, folderId, textExtractionStatus: "pending" } });
  if (url === "/api/files/multipart") return Response.json([]);
  throw new Error(`Unexpected synthetic read: ${url}`);
 });
 vi.stubGlobal("fetch", fetcher);
 host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function render(files: FileRecord[] = [], browser = defaultFileBrowserState) {
 return act(async () => root.render(createElement(FilesWorkspace, { folders, files, initialBrowserState: browser })));
}
function beginUpload() { return startFileUpload({ id, file: new File(["test"], "original.txt", { type: "text/plain" }), title: "Plan title differs", folderId, checksum: "a".repeat(64) }); }
async function sealed() { await act(async () => finishSeal(Response.json({ extractionStatus: "pending" }))); }
function row() { return host.querySelector(`#file-${id}`); }

it("adds the server canonical row only after the real upload runner confirms sealing, without whole-page refresh", async () => {
 await render(); const published = vi.fn(); window.addEventListener("personal-os:file-upload-published", published);
 let operation!: ReturnType<typeof beginUpload>; await act(async () => { operation = beginUpload(); });
 expect(row()).toBeNull(); expect(getFilePublications()).toEqual([]); expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/record"))).toBe(false);
 await sealed(); await act(async () => operation.completion);
 expect(row()?.textContent).toContain("Canonical sealed file"); expect(row()?.textContent).not.toContain("Plan title differs");
 expect(row()?.textContent).toContain("正在建立全文索引"); expect(mocks.refresh).not.toHaveBeenCalled();
 expect(getBackgroundOperations()[0].status).toBe("succeeded");
 expect(published).toHaveBeenCalledOnce(); expect((published.mock.calls[0][0] as CustomEvent).detail).toEqual({ documentId: id });
 window.removeEventListener("personal-os:file-upload-published", published);
});

it("finishes off-route and reconciles on return even with an old prefetched server list", async () => {
 await render(); let operation!: ReturnType<typeof beginUpload>; await act(async () => { operation = beginUpload(); });
 await act(async () => root.render(createElement("p", null, "Another workspace")));
 await sealed(); await operation.completion;
 expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/record"))).toBe(false);
 expect(getFilePublications()).toHaveLength(1);
 await render([]);
 expect(row()?.textContent).toContain("Canonical sealed file"); expect(mocks.refresh).not.toHaveBeenCalled();
});

it.each(["failed", "unknown", "cancelled"])("does not publish a %s upload as an available original", async outcome => {
 await render(); let operation!: ReturnType<typeof beginUpload>; await act(async () => { operation = beginUpload(); });
 if (outcome === "cancelled") operation.cancel();
 await act(async () => finishSeal(Response.json({ error: "Synthetic unconfirmed seal" }, { status: outcome === "failed" ? 422 : 503 })));
 await act(async () => operation.completion);
 expect(row()).toBeNull(); expect(getFilePublications()).toEqual([]); expect(mocks.refresh).not.toHaveBeenCalled();
 expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/record"))).toBe(false);
});

it("keeps folder, filter, sort, page, search focus and scroll while reconciling an extraction publication", async () => {
 const files = Array.from({ length: 101 }, (_, i) => ({ ...canonical, id: i === 100 ? id : `existing-${i}`, title: `Canonical ${String(i).padStart(3, "0")}`, mutation_revision: 3 }));
 await render(files, { ...defaultFileBrowserState, folderId, query: "Canonical", sort: "name", page: 2 });
 const input = host.querySelector<HTMLInputElement>('[aria-label="搜索文件名称"]')!; input.focus();
 const section = host.querySelector("section")!; section.scrollTop = 47;
 const history = window.location.href; record = { ...canonical, title: "Canonical 100", text_extraction_status: "completed", extracted_character_count: 123 };
 await act(async () => publishFileRecordChange(id, captureWorkspaceScope()));
 expect(row()?.textContent).toContain("已索引 123 字"); expect(input.value).toBe("Canonical"); expect(document.activeElement).toBe(input);
 expect(host.querySelector<HTMLSelectElement>('[aria-label="文件排序"]')?.value).toBe("name");
 expect(host.querySelector("h1")?.textContent).toBe("Target folder"); expect(host.querySelector('[aria-label="文件分页"]')?.textContent).toContain("2 / 2");
 expect(section.scrollTop).toBe(47); expect(window.location.href).toBe(history); expect(mocks.refresh).not.toHaveBeenCalled();
});

it("reconciles actual extraction retry through canonical rows rather than assuming the result's count", async () => {
 await render([{ ...canonical, text_extraction_status: "failed" }]);
 record = { ...canonical, text_extraction_status: "completed", extracted_character_count: 321, mutation_revision: 5 };
 await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "解析文本")!.click());
 expect(row()?.textContent).toContain("已索引 321 字"); expect(row()?.textContent).not.toContain("已索引 123 字"); expect(mocks.refresh).not.toHaveBeenCalled();
});

it("ignores old-owner publication and late canonical read when a new scope mounts", async () => {
 let resolve!: (response: Response) => void;
 fetcher.mockImplementation(async () => new Promise<Response>(done => { resolve = done; }));
 await render(); const oldScope = captureWorkspaceScope();
 await act(async () => publishFileRecordChange(id, oldScope));
 await act(async () => { clearWorkspaceResources(); root.render(createElement("p", null, "Scope boundary")); });
 await render([]);
 await act(async () => { resolve(Response.json({ file: canonical })); publishFileRecordChange(id, oldScope); });
 expect(row()).toBeNull(); expect(getFilePublications()).toEqual([]); expect(mocks.refresh).not.toHaveBeenCalled();
});

it("retains a failed canonical reread for return/focus retry without fabricating a row", async () => {
 await render(); fetcher.mockResolvedValueOnce(Response.json({ error: "Synthetic read offline" }, { status: 503 }));
 await act(async () => publishFileRecordChange(id, captureWorkspaceScope()));
 expect(row()).toBeNull(); expect(mocks.show).toHaveBeenCalled(); expect(getFilePublications()).toHaveLength(1);
 await act(async () => window.dispatchEvent(new Event("focus")));
 expect(row()?.textContent).toContain(canonical.title); expect(mocks.refresh).not.toHaveBeenCalled();
});


it("publishes actual accepted OCR off-route and restores the canonical index count on return", async () => {
 const scan = { ...canonical, original_filename: "scan.pdf", mime_type: "application/pdf" };
 const bytes = new TextEncoder().encode("test"), sha = createHash("sha256").update(bytes).digest("hex");
 let finishRecognition!: (result: { text: string; pages: number; emptyPages: number }) => void;
 mocks.recognize.mockImplementation(() => new Promise(done => { finishRecognition = done; }));
 const accepted: Record<string, unknown>[] = [];
 fetcher.mockImplementation(async (input, init) => {
  const url = String(input);
  if (url.endsWith("/record")) return Response.json({ file: record });
  if (url.endsWith("/ocr?source=1")) return new Response(bytes, { headers: { "X-Ocr-Sha256": sha } });
  if (url.endsWith("/ocr") && init?.method === "POST") return Response.json({ token: "synthetic-lease" });
  if (url.endsWith("/ocr") && init?.method === "PATCH") { accepted.push(JSON.parse(init.body as string)); return Response.json({ characterCount: 123 }); }
  if (url.endsWith("/ocr")) return Response.json({ job: null });
  if (url.endsWith("/multipart")) return Response.json([]);
  throw new Error("Unexpected synthetic OCR request");
 });
 await render([scan]);
 await act(async () => host.querySelector<HTMLButtonElement>(`[aria-label="识别图片文字：${scan.title}"]`)!.click());
 await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "开始 / 重新识别")!.click());
 await vi.waitFor(() => expect(mocks.recognize).toHaveBeenCalledOnce());
 await act(async () => root.render(createElement("p", null, "Other workspace")));
 record = { ...scan, text_extraction_status: "completed", extracted_character_count: 321, mutation_revision: 5 };
 await act(async () => finishRecognition({ text: "Synthetic OCR result", pages: 1, emptyPages: 0 }));
 expect(accepted).toEqual([expect.objectContaining({ action: "complete", text: "Synthetic OCR result", sha256: sha })]);
 expect(getFilePublications()).toHaveLength(1);
 await render([scan]);
 expect(row()?.textContent).toContain("已索引 321 字"); expect(mocks.refresh).not.toHaveBeenCalled();
});

it("reconciles changed IDs after a stale same-route RSC update and retires hints once server rows agree", async () => {
 await render([]); await act(async () => publishFileRecordChange(id, captureWorkspaceScope()));
 expect(row()?.textContent).toContain(canonical.title); expect(getFilePublications()).toHaveLength(1);
 await render([]); expect(row()?.textContent).toContain(canonical.title);
 const reads = fetcher.mock.calls.filter(([url]) => String(url).endsWith("/record")).length;
 await render([canonical]);
 expect(row()?.textContent).toContain(canonical.title); expect(getFilePublications()).toEqual([]);
 expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/record"))).toHaveLength(reads);
 expect(mocks.refresh).not.toHaveBeenCalled();
});

it("does not publish an old owner's real upload completion after the scope boundary", async () => {
 await render(); let operation!: ReturnType<typeof beginUpload>; await act(async () => { operation = beginUpload(); });
 await act(async () => { clearWorkspaceResources(); root.render(createElement("p", null, "Owner changed")); });
 await render([]); await sealed(); await operation.completion;
 expect(row()).toBeNull(); expect(getFilePublications()).toEqual([]); expect(mocks.refresh).not.toHaveBeenCalled();
 expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/record"))).toBe(false);
});


it("bounds 5001 off-route publications without silently claiming overflow is reconciled", () => {
 const current = captureWorkspaceScope();
 for (let n = 0; n < 5001; n++) publishFileRecordChange(`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, current);
 expect(getFilePublications()).toHaveLength(maxFilePublications); expect(maxFilePublications).toBe(200); expect(getFilePublicationOverflow()).toBe(true);
 expect(getFilePublications()[0].documentId).toBe("00000000-0000-4000-8000-000000000000");
 clearWorkspaceResources(); expect(getFilePublications()).toEqual([]); expect(getFilePublicationOverflow()).toBe(false);
});

it("recovers an omitted overflow file through an explicit default paged directory after an old-prefetch return", async () => {
 const current = captureWorkspaceScope();
 for (let n = 0; n < 201; n++) publishFileRecordChange(`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, current);
 const omitted = { ...canonical, id: "00000000-0000-4000-8000-000000000200", title: "Recovered omitted file" };
 expect(getFilePublications().some(item => item.documentId === omitted.id)).toBe(false);
 const pages: string[] = [];
 fetcher.mockImplementation(async input => {
  const url = String(input);
  if (url.includes("publication-directory")) { pages.push(url); return Response.json({ files: [omitted], next: pages.length === 1 ? omitted.id : null }); }
  if (url.endsWith("/record")) return Response.json({ file: null });
  if (url.endsWith("/multipart")) return Response.json([]);
  throw new Error("Unexpected bounded recovery read");
 });
 await render([]); expect(host.textContent).toContain("部分文件尚未核对"); expect(pages).toEqual([]);
 const search = host.querySelector<HTMLInputElement>('[aria-label="搜索文件名称"]')!; search.focus(); const section = host.querySelector("section")!; section.scrollTop = 53;
 await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "分批核对文件")!.click());
 expect(pages).toEqual([]);
 await act(async () => host.querySelector('[aria-label="后台文件变更核对"] form')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
 expect(pages).toEqual(["/api/files/publication-directory?"]); expect(host.querySelector(`#file-${omitted.id}`)?.textContent).toContain("Recovered omitted file");
 expect(section.scrollTop).toBe(53); expect(search.value).toBe(""); expect(mocks.refresh).not.toHaveBeenCalled();
 expect(getFilePublicationOverflow()).toBe(true); expect(host.textContent).toContain("部分文件尚未核对");
 await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "核对下一批")!.click());
 expect(pages).toHaveLength(2); expect(pages[1]).toContain(`after=${omitted.id}`); expect(getFilePublicationOverflow()).toBe(true);
 expect(host.textContent).toContain("不代表所有并发变更已核对");
});

it("preserves a newer actual undo row against delayed null, then safely reconciles a truly missing row once", async () => {
 const { readWorkbenchReceiptState } = await import("@/features/workbench/operation-actions");
 const pending: ((response: Response) => void)[] = [];
 fetcher.mockImplementation(async input => String(input).endsWith("/record") ? new Promise<Response>(resolve => pending.push(resolve)) : Response.json([]));
 await render([{ ...canonical, title: "Old revision", mutation_revision: 4 }]); await act(async () => publishFileRecordChange(id, captureWorkspaceScope()));
 vi.mocked(readWorkbenchReceiptState).mockResolvedValueOnce({ kind: "document", rows: [{ ...canonical, title: "Canonical undo restored", mutation_revision: 6 }] });
 await act(async () => window.dispatchEvent(new CustomEvent("personal-os:operation-undone", { detail: { receiptId: "33333333-3333-4333-8333-333333333333" } })));
 expect(row()?.textContent).toContain("Canonical undo restored");
 await act(async () => pending[0](Response.json({ file: null })));
 expect(row()?.textContent).toContain("Canonical undo restored"); expect(pending).toHaveLength(2);
 await act(async () => pending[1](Response.json({ file: null })));
 expect(row()).toBeNull(); expect(pending).toHaveLength(2); // A fresh unchanged baseline can genuinely disappear.
});

it("protects a second same-turn undo from null and does not falsely acknowledge its rejected response", async () => {
 const { readWorkbenchReceiptState } = await import("@/features/workbench/operation-actions");
 const pending: ((response: Response) => void)[] = [];
 fetcher.mockImplementation(async input => String(input).endsWith("/record") ? new Promise<Response>(resolve => pending.push(resolve)) : Response.json([]));
 const old = { ...canonical, title: "Old revision", mutation_revision: 4 };
 await render([old]); await act(async () => publishFileRecordChange(id, captureWorkspaceScope()));
 await act(async () => pending[0](Response.json({ file: null }))); expect(pending).toHaveLength(2);
 vi.mocked(readWorkbenchReceiptState).mockResolvedValueOnce({ kind: "document", rows: [{ ...canonical, title: "Newest canonical", mutation_revision: 7 }] });
 await act(async () => {
  window.dispatchEvent(new CustomEvent("personal-os:operation-undone", { detail: { receiptId: "33333333-3333-4333-8333-333333333333" } }));
  // Same turn: receipt Promise continuation and the delayed null both enqueue updates.
  await Promise.resolve(); pending[1](Response.json({ file: null }));
 });
 expect(row()?.textContent).toContain("Newest canonical"); expect(pending).toHaveLength(2);
 expect(getFilePublications()[0].confirmed).toBeUndefined();
 await render([]); expect(getFilePublications()).toHaveLength(1); expect(pending).toHaveLength(3);
 await act(async () => pending[2](Response.json({ file: { ...canonical, title: "Latest server canonical", mutation_revision: 8 } })));
 expect(row()?.textContent).toContain("Latest server canonical");
});

it("does not acknowledge a rejected lower-revision non-null row across a stale source render", async () => {
 const pending: ((response: Response) => void)[] = [];
 fetcher.mockImplementation(async input => String(input).endsWith("/record") ? new Promise<Response>(resolve => pending.push(resolve)) : Response.json([]));
 await render([{ ...canonical, title: "Current revision", mutation_revision: 6 }]); await act(async () => publishFileRecordChange(id, captureWorkspaceScope()));
 await act(async () => pending[0](Response.json({ file: canonical })));
 expect(row()?.textContent).toContain("Current revision"); expect(getFilePublications()[0].confirmed).toBeUndefined();
 await render([canonical]); expect(getFilePublications()).toHaveLength(1); expect(pending).toHaveLength(2);
 await act(async () => pending[1](Response.json({ file: { ...canonical, title: "Real newest revision", mutation_revision: 9 } })));
 expect(row()?.textContent).toContain("Real newest revision");
});

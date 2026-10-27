// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FileRecord } from "@/features/files/queries";

const mocks = vi.hoisted(() => ({ getDocument: vi.fn(), show: vi.fn() }));
vi.mock("unpdf/pdfjs", () => ({ getDocument: mocks.getDocument }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => "/files" }));
vi.mock("@/components/shared/action-feedback", () => ({ useActionFeedback: () => ({ show: mocks.show }) }));
vi.mock("@/features/files/reading-progress-actions", () => ({ getReadingProgress: vi.fn(), saveReadingProgress: vi.fn() }));
vi.mock("@/features/workbench/operation-actions", () => ({ readWorkbenchReceiptState: vi.fn(), readMetadataOperationTargets: vi.fn(), applyMetadataOperation: vi.fn() }));
vi.mock("@/features/files/actions", () => ({ archiveFile: vi.fn(), createFileFolder: vi.fn(), moveFile: vi.fn(), renameFile: vi.fn(), restoreFile: vi.fn(), setFileAiVisibility: vi.fn() }));
vi.mock("@/components/files/file-photo", () => ({ FilePhoto: () => createElement("div", { "data-photo-fixture": "true" }, "合成照片") }));
import { FilesWorkspace } from "@/components/files/files-workspace";

const files: FileRecord[] = ["a", "b", "c"].map((suffix, index) => ({
  id: `preview-${suffix}`, title: `合成资料 ${suffix}`, original_filename: `${suffix}.${index === 2 ? "jpg" : "pdf"}`, mime_type: index === 2 ? "image/jpeg" : "application/pdf", file_size: 1000, folder_id: null,
  uploaded_at: "2026-10-26", created_at: "2026-10-26", archived_at: null, ai_visibility: "normal", text_extraction_status: "completed", extracted_character_count: 100,
}));
let host: HTMLDivElement; let root: Root;
let sessions: { destroy: ReturnType<typeof vi.fn> }[];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("ResizeObserver", undefined);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { headers: { "Content-Type": "application/pdf", "Content-Length": "1000" } })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 624, height: 800, top: 0, bottom: 800, left: 0, right: 624, x: 0, y: 0, toJSON() {} });
  sessions = [];
  mocks.getDocument.mockReset().mockImplementation(() => {
    const session = { destroy: vi.fn(async () => {}), promise: Promise.resolve({ numPages: 2, getPage: async () => ({ getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }), render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }), cleanup: vi.fn() }) }) };
    sessions.push(session); return session;
  });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); document.body.innerHTML = "";
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
function control(name: string) { return [...dialog().querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === name)!; }

it("switches filtered files in one live viewer and destroys each replaced PDF session", async () => {
  await act(async () => root.render(createElement(FilesWorkspace, { files, folders: [] })));
  const launcher = host.querySelector<HTMLButtonElement>('[aria-label="预览 合成资料 a"]')!;
  await act(async () => launcher.click());
  const surface = dialog();
  const navigation = surface.querySelector('[aria-label="文件切换"]');
  const firstCanvas = surface.querySelector('canvas[data-pdf-rendered="true"]');
  expect(firstCanvas).not.toBeNull(); expect(sessions).toHaveLength(1);
  expect(control("上一文件").disabled).toBe(true);
  await act(async () => control("下一文件").click());
  expect(dialog()).toBe(surface); expect(surface.querySelector('[aria-label="文件切换"]')).toBe(navigation);
  expect(surface.querySelector('[data-slot="dialog-title"]')?.textContent).toBe("合成资料 b");
  expect(surface.querySelector('canvas[data-pdf-rendered="true"]')).not.toBe(firstCanvas);
  expect(sessions[0].destroy).toHaveBeenCalledOnce(); expect(sessions).toHaveLength(2);
  await act(async () => surface.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })));
  expect(dialog()).toBe(surface); expect(surface.querySelector('[data-photo-fixture]')).not.toBeNull();
  expect(control("下一文件").disabled).toBe(true); expect(sessions[1].destroy).toHaveBeenCalledOnce();
  await act(async () => surface.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true })));
  expect(dialog()).toBe(surface); expect(surface.querySelector('canvas[data-pdf-rendered="true"]')).not.toBeNull(); expect(sessions).toHaveLength(3);
  await act(async () => [...surface.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "关闭")!.click());
  expect(sessions[2].destroy).toHaveBeenCalledOnce(); expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(launcher);
});

it("uses the displayed filter/sort as the queue without remounting the viewer shell", async () => {
  await act(async () => root.render(createElement(FilesWorkspace, { files, folders: [], initialBrowserState: { folderId: null, query: "合成资料 b", type: "all", sort: "name", view: "list", page: 1 } })));
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="预览 合成资料 b"]')!.click());
  expect(control("上一文件").disabled).toBe(true); expect(control("下一文件").disabled).toBe(true);
  expect(dialog().querySelector("output")?.textContent).toBe("1 / 1");
});

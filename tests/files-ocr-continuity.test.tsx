// @vitest-environment jsdom
import { createHash, randomUUID, webcrypto } from "node:crypto";
import { Buffer } from "node:buffer";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ recognize: vi.fn(), complete: vi.fn(), active: 0, released: vi.fn(), actions: [] as string[], posts: 0, loseCompletion: false, completeBoundary: null as null | (() => void) }));
vi.mock("@/lib/adapters/private-ocr-browser", () => ({ recognizePrivateDocument: io.recognize }));
import { FileOcrControl } from "@/components/files/file-ocr-control";
import type { FileRecord } from "@/features/files/queries";
import { clearWorkspaceResources, reconcileWorkspaceScope } from "@/lib/workspace-resource-cache";
import { getBackgroundOperations, startBackgroundOperation } from "@/features/workflow-continuity/background-operations";
const bytes = new TextEncoder().encode("synthetic unchanged OCR original"), digest = createHash("sha256").update(bytes).digest("hex");
const file = { id: "22222222-2222-4222-8222-222222222222", title: "Synthetic OCR original", original_filename: "scan.png", mime_type: "image/png", file_size: bytes.length } as FileRecord;
const href = `/files?file=${file.id}`, token = "33333333-3333-4333-8333-333333333333";
let root: Root, host: HTMLDivElement, finish: (value: { text: string; pages: number; emptyPages: number }) => void;
const button = (label: string) => [...document.querySelectorAll("button")].find(node => node.textContent === label)!;
const job = () => getBackgroundOperations().find(row => row.kind === "ocr" && row.href === href)!;
async function open() { await act(async () => button("OCR").click()); }
async function start() { await open(); await act(async () => { button("开始 / 重新识别").click(); await vi.waitFor(() => expect(io.recognize).toHaveBeenCalledOnce()); }); }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); clearWorkspaceResources(); reconcileWorkspaceScope("owner-A", "r1"); vi.clearAllMocks();
  vi.stubGlobal("crypto", { randomUUID, subtle: { digest: (algorithm: AlgorithmIdentifier, data: ArrayBuffer) => webcrypto.subtle.digest(algorithm, Buffer.from(new Uint8Array(data))) } }); io.active = 0; io.actions = []; io.posts = 0; io.loseCompletion = false; io.completeBoundary = null;
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  io.recognize.mockReset().mockImplementation(({ signal, onProgress }: { signal: AbortSignal; onProgress: (value: { page: number; total: number; progress: number; phase: string }) => void }) => new Promise((resolve, reject) => {
    io.active++; let settled = false;
    const release = () => { if (settled) return false; settled = true; io.active--; io.released(); return true; };
    signal.addEventListener("abort", () => { if (release()) reject(new Error("ocr_cancelled")); }, { once: true });
    onProgress({ page: 1, total: 2, progress: .5, phase: "recognizing" });
    finish = value => { if (release()) resolve(value); };
  }));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") { io.posts++; return Response.json({ token }); }
    if (init?.method === "PATCH") { const data = JSON.parse(String(init.body)); io.actions.push(data.action); if (data.action === "complete") { io.completeBoundary?.(); if (io.loseCompletion) return Response.json({ code: "synthetic_response_lost" }, { status: 503 }); } return Response.json({ ok: true, characterCount: 16 }); }
    if (url.endsWith("?source=1")) return new Response(bytes, { headers: { "X-Ocr-Sha256": digest } });
    return Response.json({ job: null });
  }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(FileOcrControl, { file, onComplete: io.complete })));
});
afterEach(async () => { await act(async () => { clearWorkspaceResources(); await Promise.resolve(); }); await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it("closing/reopening reattaches the same real operation and progress; production Stop aborts that run without another POST", async () => {
  await start(); const id = job().id; expect(io.active).toBe(1);
  await act(async () => button("关闭").click()); expect(io.active).toBe(1); expect(job().status).toBe("running");
  await open(); expect(document.querySelector("[data-ocr-operation-id]")?.getAttribute("data-ocr-operation-id")).toBe(id);
  const progress = document.querySelector<HTMLProgressElement>('progress[aria-label="OCR 进度"]')!;
  expect(progress.value).toBe(.5); expect(progress.max).toBe(2); expect(io.posts).toBe(1); expect(io.recognize).toHaveBeenCalledOnce();
  await act(async () => { button("取消识别").click(); await vi.waitFor(() => expect(io.active).toBe(0)); });
  expect(io.released).toHaveBeenCalledOnce(); expect(io.actions).toEqual(["cancel"]); expect(io.posts).toBe(1); expect(job().status).toBe("needs-check"); expect(io.complete).not.toHaveBeenCalled();
});
it("a missing runtime does not fabricate progress or start on dialog open", async () => {
  await open(); expect(document.querySelector("[data-ocr-operation-id]")).toBeNull(); expect(button("取消识别")).toBeUndefined(); expect(io.posts).toBe(0); expect(io.recognize).not.toHaveBeenCalled();
});
it("known completion stays completed across reopen without another recognition", async () => {
  await start(); await act(async () => { finish({ text: "synthetic result", pages: 1, emptyPages: 0 }); await vi.waitFor(() => expect(job().status).toBe("succeeded")); });
  expect(io.actions).toEqual(["complete"]); expect(io.complete).toHaveBeenCalledOnce();
  await act(async () => button("关闭").click()); await open(); expect(io.posts).toBe(1); expect(io.recognize).toHaveBeenCalledOnce(); expect(document.body.textContent).toContain("已识别并加入全文搜索");
});
it("a canonical saved response wins a cancellation arriving at that completion boundary", async () => {
  await start(); io.completeBoundary = () => { const id = job().id; const node = document.querySelector('[data-ocr-operation-id="'+id+'"]'); expect(node).not.toBeNull(); button("取消识别").click(); };
  await act(async () => { finish({ text: "synthetic result", pages: 1, emptyPages: 0 }); await vi.waitFor(() => expect(job().status).toBe("succeeded")); });
  expect(io.complete).toHaveBeenCalledOnce(); expect(io.actions).toEqual(["complete"]);
});
it("an unconfirmed completion preserves needs-check on reopen without rewriting a completed lease as failed or restarting", async () => {
  await start(); io.loseCompletion = true;
  await act(async () => { finish({ text: "synthetic result", pages: 1, emptyPages: 0 }); await vi.waitFor(() => expect(job().status).toBe("needs-check")); });
  expect(io.actions).toEqual(["complete"]); expect(io.complete).not.toHaveBeenCalled();
  await act(async () => button("关闭").click()); await open(); expect(io.posts).toBe(1); expect(io.recognize).toHaveBeenCalledOnce(); expect(document.body.textContent).toContain("写入状态待核对");
});
it("a still-mounted old owner cannot open or start a new OCR request", async () => {
  await act(async () => reconcileWorkspaceScope("owner-B", "r1")); await act(async () => button("OCR").click());
  expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(io.posts).toBe(0); expect(io.recognize).not.toHaveBeenCalled();
});
it("same-owner server revision refresh keeps the original running identity and accepts its canonical completion", async () => {
  await start(); const id = job().id;
  await act(async () => reconcileWorkspaceScope("owner-A", "r2")); expect(job().id).toBe(id); expect(io.active).toBe(1); expect(io.posts).toBe(1);
  await act(async () => { finish({ text: "synthetic result", pages: 1, emptyPages: 0 }); await vi.waitFor(() => expect(job().status).toBe("succeeded")); });
  expect(io.complete).toHaveBeenCalledOnce(); expect(io.posts).toBe(1);
});
it("a failed recognition remains a visible terminal observation on reopen and never restarts itself", async () => {
  io.recognize.mockRejectedValueOnce(new Error("ocr_failed")); await open();
  await act(async () => { button("开始 / 重新识别").click(); await vi.waitFor(() => expect(job().status).toBe("failed")); });
  expect(io.actions).toEqual(["fail"]); await act(async () => button("关闭").click()); await open();
  expect(io.posts).toBe(1); expect(io.recognize).toHaveBeenCalledOnce(); expect(io.complete).not.toHaveBeenCalled(); expect(document.body.textContent).toContain("未完成，可返回查看原因");
});
it("an old Stop click cannot cancel a new owner's same-document operation during an event-boundary scope change", async () => {
  await start(); const stop = button("取消识别"), newAbort = vi.fn();
  stop.addEventListener("click", () => { reconcileWorkspaceScope("owner-B", "r1"); startBackgroundOperation({ kind: "ocr", label: "Synthetic new owner", href, run: async ({ signal }) => { await new Promise<void>(resolve => signal.addEventListener("abort", () => { newAbort(); resolve(); }, { once: true })); } }); }, { capture: true, once: true });
  await act(async () => stop.click()); expect(newAbort).not.toHaveBeenCalled(); expect(io.posts).toBe(1); expect(getBackgroundOperations().find(row => row.label === "Synthetic new owner")?.status).toBe("running");
});

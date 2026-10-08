"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OCR_MAX_BYTES, OCR_TIMEOUT_MS, awaitOcr, ocrErrorMessage, ocrKind } from "@/features/files/ocr-policy";
import type { FileRecord } from "@/features/files/queries";
import type { OcrProgress } from "@/lib/adapters/private-ocr-browser";

let activeDocument: string | null = null;
const button = "pressable min-h-9 rounded-[8px] px-3 text-[12px] text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-40";
export function FileOcrControl({ file, onComplete }: { file: FileRecord; onComplete: (count: number) => void }) {
  const [open, setOpen] = useState(false);
  if (!ocrKind(file.original_filename, file.mime_type)) return null;
  return <>
    <button type="button" className={button} onClick={() => setOpen(true)} aria-label={`识别图片文字：${file.title}`}>OCR</button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>识别扫描件文字</DialogTitle><DialogDescription>{file.title}</DialogDescription></DialogHeader>
      {open ? <OcrSession file={file} onComplete={onComplete} /> : null}
    </DialogContent></Dialog>
  </>;
}
function OcrSession({ file, onComplete }: { file: FileRecord; onComplete: (count: number) => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [provenance, setProvenance] = useState<string>("");
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(true);
  const attempted = useRef(false);
  const url = `/api/files/${file.id}/ocr`;
  useEffect(() => {
    active.current = true;
    const query = new AbortController();
    void fetch(url, { cache: "no-store", signal: query.signal }).then(async response => {
      if (!response.ok) return;
      const { job, provenance: saved } = await response.json();
      if (active.current && saved?.method === "ocr_local") setProvenance(`当前索引：${saved.engine} · ${saved.models} · ${saved.pages} 页${saved.emptyPages ? `，${saved.emptyPages} 页未检出文字` : ""}${saved.sourceSha256 ? ` · SHA-256 ${saved.sourceSha256.slice(0, 12)}…` : ""}`);
      if (active.current && !attempted.current && job) setMessage(job.status === "completed" ? `上次已完成 ${job.total} 页识别${job.emptyPages ? `，其中 ${job.emptyPages} 页未检出文字` : ""}` :
        job.status === "processing" ? "有一项识别正在运行；可等待完成或租约到期后重试" :
        job.status === "interrupted" ? "上次识别已中断，可重新开始" : ocrErrorMessage(job.error ?? "ocr_cancelled"));
    }).catch(() => {});
    return () => { active.current = false; query.abort(); controller.current?.abort(); };
  }, [url]);
  async function run() {
    if (controller.current) return;
    if (activeDocument) { setMessage(ocrErrorMessage("ocr_busy")); return; }
    attempted.current = true;
    const abort = new AbortController(); controller.current = abort; activeDocument = file.id;
    let token: string | undefined, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; abort.abort(); }, OCR_TIMEOUT_MS);
    const patch = async (value: Record<string, unknown>, signal?: AbortSignal) => {
      const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...value }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.code ?? "ocr_failed");
      return result;
    };
    setBusy(true); setMessage(""); setProgress(null);
    try {
      // Let the small start request settle so cancellation can release its exact token.
      const response = await fetch(url, { method: "POST", signal: AbortSignal.timeout(15_000) });
      const started = await response.json();
      if (!response.ok) throw new Error(started.code ?? "ocr_failed");
      token = started.token; abort.signal.throwIfAborted();
      const source = await fetch(`${url}?source=1`, { headers: { "X-Ocr-Run": token! }, cache: "no-store", signal: abort.signal });
      if (!source.ok) { const result = await source.json(); throw new Error(result.code ?? "ocr_failed"); }
      const sha256 = source.headers.get("X-Ocr-Sha256");
      // Proxies may omit Content-Length or report compressed transfer bytes.
      // Verify the decoded source's actual length and digest instead.
      if (!sha256) throw new Error("ocr_source_changed");
      const buffer = await source.arrayBuffer();
      if (buffer.byteLength !== file.file_size || buffer.byteLength > OCR_MAX_BYTES) throw new Error("ocr_source_changed");
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)), byte => byte.toString(16).padStart(2, "0")).join("");
      if (digest !== sha256) throw new Error("ocr_source_changed");
      const { recognizePrivateDocument } = await awaitOcr(import("@/lib/adapters/private-ocr-browser"), abort.signal);
      const result = await awaitOcr(recognizePrivateDocument({ bytes: new Uint8Array(buffer), filename: file.original_filename, mimeType: file.mime_type, signal: abort.signal,
        onProgress: value => { if (active.current) setProgress(value); },
        onPage: (pages, total) => patch({ action: "progress", pages, total }, abort.signal).then(() => {}),
      }), abort.signal);
      abort.signal.throwIfAborted();
      const saved = await patch({ action: "complete", text: result.text, pages: result.pages, total: result.pages, emptyPages: result.emptyPages, sha256 }, abort.signal);
      if (active.current) { setMessage(`已识别并加入全文搜索：${saved.characterCount.toLocaleString("zh-CN")} 字${result.emptyPages ? `；${result.emptyPages} 页未检出文字` : ""}。OCR 可能有误，请以原件为准。`); onComplete(saved.characterCount); }
    } catch (error) {
      const code = timedOut ? "ocr_timeout" : abort.signal.aborted ? "ocr_cancelled" : error instanceof Error ? error.message : "ocr_failed";
      if (token) await patch({ action: abort.signal.aborted ? "cancel" : "fail", error: code }).catch(() => {});
      if (active.current) setMessage(ocrErrorMessage(code));
    } finally {
      clearTimeout(timer); controller.current = null; activeDocument = null;
      if (active.current) setBusy(false);
    }
  }
  return <div className="space-y-3 text-[12px] leading-6">
    <p>使用设备上的 Tesseract 离线引擎识别简体中文和英文；语言包从本站加载，文件不会发送给外部 OCR 或 AI 服务。完成后将识别文本存入你的私有搜索索引。</p>
    <p className="text-[var(--text-secondary)]">支持 PDF、PNG、JPEG、WebP；最多 20 MiB、10 页，图片最多 2000 万像素。识别最多运行 5 分钟，请保持此页面和窗口打开；关闭会取消，重试将重新识别整份文件。优先使用已有 PDF 文字层。</p>
    {progress && busy ? <div role="status" aria-live="polite">
      <p>{progress.phase === "loading" ? "正在加载本地识别引擎…" : `第 ${progress.page} / ${progress.total} 页 · ${Math.round(progress.progress * 100)}%`}</p>
      <progress className="w-full" aria-label="OCR 进度" max={100} value={Math.round(((Math.max(1, progress.page) - 1 + progress.progress) / progress.total) * 100)} />
    </div> : null}
    {provenance ? <p className="break-words text-[10px] text-[var(--text-secondary)]">{provenance}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {file.file_size > OCR_MAX_BYTES ? <p role="alert">文件超过 20 MiB，请先拆分或压缩副本。</p> : null}
    <div className="flex gap-2"><button type="button" className={button} disabled={busy || file.file_size > OCR_MAX_BYTES} onClick={() => void run()}>{busy ? "正在识别…" : "开始 / 重新识别"}</button>
      {busy ? <button type="button" className={button} onClick={() => controller.current?.abort()}>取消识别</button> : null}</div>
  </div>;
}

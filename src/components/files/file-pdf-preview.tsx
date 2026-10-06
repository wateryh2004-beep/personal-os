"use client";
import { useEffect, useState } from "react";

export function FilePdfPreview({ documentId, title }: { documentId: string; title: string }) {
  const url = `/api/files/${documentId}/preview`;
  const [status, setStatus] = useState<{ source: string; ready: boolean; error: string }>({ source: url, ready: false, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(url, { method: "HEAD", cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]) });
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "请重新登录后预览。" : response.status === 404 ? "文件已不可用或已归档，请刷新后检查。" : response.status === 415 || response.status === 422 ? "此文件暂时无法作为 PDF 预览，可下载原件查看。" : "PDF 预览暂不可用，可稍后重试或下载原件。");
        if (!controller.signal.aborted) setStatus({ source: url, ready: true, error: "" });
      } catch (error) { if (!controller.signal.aborted) setStatus({ source: url, ready: false, error: error instanceof Error ? error.message : "PDF 预览暂不可用。" }); }
    })();
    return () => controller.abort();
  }, [url]);
  const current = status.source === url ? status : { ready: false, error: "" };
  return <div className="min-w-0 space-y-2">
    {current.error ? <p role="alert" className="rounded-[9px] bg-[var(--surface-control)] p-3 text-[12px] leading-5">{current.error}</p> : current.ready ? <iframe title={`PDF 预览：${title}`} src={url} referrerPolicy="no-referrer" className="h-[50dvh] min-h-64 w-full rounded-[10px] border border-[var(--separator)] bg-white" /> : <p role="status" className="flex min-h-64 items-center justify-center text-[13px] text-[var(--text-secondary)]">正在准备 PDF 预览…</p>}
    <p className="text-[11px] leading-5 text-[var(--text-secondary)]">使用浏览器自带阅读器。如果此浏览器没有显示 PDF，可在新窗口预览或下载原件；文件不会发送给第三方阅读服务。</p>
    {current.ready ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center text-[12px] text-[var(--accent)]">在新窗口预览 PDF</a> : null}
  </div>;
}

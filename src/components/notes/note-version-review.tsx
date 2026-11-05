"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { diffLines } from "diff";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { applyReviewedNoteVersion } from "@/features/notes/actions";
import { versionReviewPayloadSchema } from "@/features/notes/versions/review";
import type { z } from "zod";

type Comparison = z.infer<typeof versionReviewPayloadSchema>;

function readableError(status: string) {
  if (status === "conflict") return "云端内容已经发生变化。没有覆盖原文，请关闭窗口并重新对比。";
  if (status === "not_found") return "无法找到此版本，可能已被移动或删除。";
  if (status === "invalid") return "合并内容无效或超过长度限制。";
  return "版本恢复暂时失败，原始笔记未被主动覆盖。";
}

export function NoteVersionReview({ noteId, versionId, onClose }: {
  noteId: string; versionId: string; onClose: () => void;
}) {
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [mergedTitle, setMergedTitle] = useState("");
  const [mergedBody, setMergedBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/notes/${encodeURIComponent(noteId)}/versions/compare?versionId=${encodeURIComponent(versionId)}`, {
      credentials: "same-origin", cache: "no-store", signal: abort.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("history_read_failed");
      const parsed = versionReviewPayloadSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("invalid_history_response");
      if (abort.signal.aborted) return;
      setComparison(parsed.data);
      setMergedTitle(parsed.data.current.title);
      setMergedBody(parsed.data.current.body);
      setError("");
    }).catch(() => {
      if (!abort.signal.aborted) setError("历史版本暂时无法读取；现有笔记未发生变化。");
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [noteId, versionId, attempt]);

  // Compute a bounded, line-oriented comparison; huge documents remain usable
  // through their read-only source panes rather than hanging the main thread.
  const diff = useMemo(() => comparison &&
    comparison.current.body.length + comparison.historical.body.length <= 80_000
    ? diffLines(comparison.historical.body, comparison.current.body) : null, [comparison]);
  const changed = comparison && (
    mergedTitle !== comparison.current.title || mergedBody !== comparison.current.body
  );

  const apply = () => {
    if (!comparison || pending || !changed) return;
    const editor = document.querySelector<HTMLElement>('[data-note-editor-id="' + noteId + '"]');
    if (editor && editor.dataset.noteSaveState !== "已保存") {
      setError("编辑器仍有未保存内容或正在保存。请先保存并确认“已保存”，再恢复历史版本。");
      return;
    }
    if (mergedTitle.length > 240 || mergedBody.length > 200_000) {
      setError("合并后的标题或正文超过长度限制。");
      return;
    }
    startTransition(async () => {
      try {
        const result = await applyReviewedNoteVersion({
          noteId, versionId, expectedRevision: comparison.current.revision,
          title: mergedTitle, bodyMarkdown: mergedBody,
        });
        if (result.status === "restored") {
          window.location.reload(); // authoritative revision and fresh CodeMirror
          return;
        }
        if (result.status === "unchanged") { onClose(); return; }
        setError(readableError(result.status));
      } catch {
        setError("网络或服务暂不可用，请确认云端状态后重试。");
      }
    });
  };

  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent className="max-h-[min(94dvh,960px)] w-[min(96vw,1120px)] max-w-none overflow-y-auto">
      <DialogHeader>
        <DialogTitle>比较并恢复笔记版本</DialogTitle>
        <DialogDescription>
          先查看差异，再手动确认。下方默认保留当前版本；所有修改都需经过服务器修订号校验。
        </DialogDescription>
      </DialogHeader>
      {loading ? <p role="status" className="text-[13px] text-[var(--text-secondary)]">正在读取历史快照…</p> : null}
      {error ? <p role="alert" className="rounded-[8px] bg-[var(--danger-soft)] p-2 text-[13px] text-[var(--danger)]">{error}</p> : null}
      {!loading && !comparison ? <Button type="button" variant="outline" onClick={() => { setLoading(true); setError(""); setAttempt(n => n + 1); }}>重新读取版本</Button> : null}
      {comparison ? <>
        <p className="text-[12px] text-[var(--text-secondary)]">
          当前修订 {comparison.current.revision} · 历史快照 {comparison.historical.versionNumber}
          · {new Date(comparison.historical.createdAt).toLocaleString("zh-CN")}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <section className="min-w-0 space-y-1" aria-label="当前已保存内容">
            <h3 className="font-semibold text-[13px]">当前版本 · {comparison.current.title}</h3>
            <textarea aria-label="当前版本 Markdown" readOnly value={comparison.current.body} rows={8}
              className="w-full resize-y rounded-[8px] border border-[var(--separator)] bg-[var(--surface-control)] p-3 font-mono text-[13px] leading-6" />
          </section>
          <section className="min-w-0 space-y-1" aria-label="历史快照内容">
            <h3 className="font-semibold text-[13px]">历史版本 · {comparison.historical.title}</h3>
            <textarea aria-label="历史版本 Markdown" readOnly value={comparison.historical.body} rows={8}
              className="w-full resize-y rounded-[8px] border border-[var(--separator)] bg-[var(--surface-control)] p-3 font-mono text-[13px] leading-6" />
          </section>
        </div>
        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold">差异预览</h3>
          {!diff ? <p className="text-[12px] text-[var(--text-secondary)]">文档较长，已省略自动逐行比对；可阅读上方原文并在下方手动合并。</p> :
            <div className="max-h-64 overflow-y-auto rounded-[8px] border border-[var(--separator)]">
              {diff.map((part, index) => <div key={index} className={part.added ? "bg-[var(--accent-soft)]" : part.removed ? "bg-[var(--danger-soft)]" : ""}>
                <div className="flex items-start justify-between gap-2 px-2 py-1">
                  <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[12px] leading-5">{part.value}</pre>
                  {part.removed ? <button type="button" className="shrink-0 rounded-[6px] px-2 py-1 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--surface-hover)]" onClick={() => setMergedBody(text => text + (text.trim() ? "\n\n" : "") + part.value)}>追加历史片段</button> : null}
                </div>
              </div>)}
            </div>}
          <p className="text-[12px] text-[var(--text-secondary)]">浅绿代表当前版本新增；浅红代表历史版本独有。可以把历史片段追加到合并稿，再手动编辑。</p>
        </section>
        <section className="space-y-2 border-t border-[var(--separator)] pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold">合并后的正文</h3>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => { setMergedTitle(comparison.current.title); setMergedBody(comparison.current.body); }}>保留当前</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { setMergedTitle(comparison.historical.title); setMergedBody(comparison.historical.body); }}>采用历史全文</Button>
            </div>
          </div>
          <label className="block text-[12px] font-medium" htmlFor="notes-reviewed-title">标题</label>
          <input id="notes-reviewed-title" value={mergedTitle} maxLength={240} onChange={event => setMergedTitle(event.target.value)}
            className="ui-field min-h-11 w-full rounded-[8px] px-3 text-[16px]" />
          <label className="block text-[12px] font-medium" htmlFor="notes-reviewed-markdown">Markdown 正文</label>
          <textarea id="notes-reviewed-markdown" rows={9} value={mergedBody} onChange={event => setMergedBody(event.target.value)}
            className="w-full resize-y rounded-[8px] border border-[var(--separator)] bg-[var(--surface-canvas)] p-3 font-mono text-[16px] leading-6" />
          <p className="text-[12px] text-[var(--text-secondary)]">确认后先保存恢复前快照，再应用合并稿；如其他设备已修改，将拒绝覆盖。</p>
        </section>
      </> : null}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>取消</Button>
        <Button type="button" disabled={pending || !comparison || !changed} onClick={apply}>
          {pending ? "正在核对并恢复…" : "确认应用并保存"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

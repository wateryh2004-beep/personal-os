"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseRemoteNoteDocument } from "@/features/notes/editor/conflict-resolution";

type Snapshot = { title: string; body: string; baseRevision: number };
type RemoteVersion = { title: string; body: string; revision: number };

/** The merge editor never touches Supabase directly. The existing CAS autosave
 * handles the final write only after the user explicitly approves a draft. */
export function NoteConflictResolver({
  noteId,
  localSnapshot,
  onApply,
  onClose,
}: {
  noteId: string;
  localSnapshot: Snapshot;
  onApply: (merged: RemoteVersion, original: Pick<Snapshot, "title" | "body">) => boolean;
  onClose: () => void;
}) {
  const [remote, setRemote] = useState<RemoteVersion | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [requestRevision, setRequestRevision] = useState(0);
  const [mergedTitle, setMergedTitle] = useState(localSnapshot.title);
  const [mergedBody, setMergedBody] = useState(localSnapshot.body);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/notes/${encodeURIComponent(noteId)}/document`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: abort.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("remote_note_unavailable");
      const parsed = parseRemoteNoteDocument(await response.json());
      if (!parsed) throw new Error("invalid_remote_note");
      setRemote(parsed);
      setError("");
    }).catch(() => {
      if (!abort.signal.aborted) setError("无法读取云端版本，请检查网络后重试。当前本地草稿未被替换。");
    }).finally(() => {
      if (!abort.signal.aborted) setBusy(false);
    });
    return () => abort.abort();
  }, [noteId, requestRevision]);

  const confirm = () => {
    if (!remote || busy) return;
    if (mergedTitle.length > 240 || mergedBody.length > 200_000) {
      setError("标题最多 240 字，正文最多 200,000 字；请先缩短合并结果。");
      return;
    }
    if (!onApply({ title: mergedTitle, body: mergedBody, revision: remote.revision }, localSnapshot)) {
      setError("合并期间草稿或云端修订号已变化。请关闭窗口，核对最新草稿后重新比较。");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[min(90dvh,900px)] w-[min(96vw,1040px)] max-w-none overflow-y-auto p-4 sm:p-5">
        <DialogHeader>
          <DialogTitle>核对笔记版本冲突</DialogTitle>
          <DialogDescription>
            左侧是发生冲突时的本地草稿，右侧为最新云端内容。下方可手动合并；关闭窗口不会改写任何一份内容。
          </DialogDescription>
        </DialogHeader>
        {busy ? <p role="status" className="text-[13px] text-[var(--text-secondary)]">正在读取云端版本…</p> : null}
        {error ? <p role="alert" className="text-[13px] text-[var(--danger)]">{error}</p> : null}
        {!busy && !remote ? <Button type="button" variant="outline" onClick={() => { setBusy(true); setError(""); setRequestRevision(n => n + 1); }}>重新读取</Button> : null}
        {remote ? (
          <>
            <p className="text-[12px] text-[var(--text-secondary)]">
              本地基于修订 {localSnapshot.baseRevision} · 云端修订 {remote.revision}
              {remote.title === localSnapshot.title && remote.body === localSnapshot.body ? " · 内容相同" : " · 两份内容存在差异"}
            </p>
            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
              <section className="min-w-0 space-y-2" aria-label="本地草稿">
                <h3 className="text-[13px] font-semibold">本地草稿（只读）</h3>
                <p className="truncate text-[13px]">{localSnapshot.title || "无标题"}</p>
                <textarea aria-label="本地草稿正文" readOnly value={localSnapshot.body} rows={8}
                  className="w-full min-w-0 resize-y rounded-[8px] border border-[var(--separator)] bg-[var(--surface-control)] p-3 font-mono text-[13px] leading-6" />
              </section>
              <section className="min-w-0 space-y-2" aria-label="云端版本">
                <h3 className="text-[13px] font-semibold">云端版本（只读）</h3>
                <p className="truncate text-[13px]">{remote.title || "无标题"}</p>
                <textarea aria-label="云端版本正文" readOnly value={remote.body} rows={8}
                  className="w-full min-w-0 resize-y rounded-[8px] border border-[var(--separator)] bg-[var(--surface-control)] p-3 font-mono text-[13px] leading-6" />
              </section>
            </div>
            <section className="space-y-2 border-t border-[var(--separator)] pt-3" aria-label="手动合并结果">
              <h3 className="text-[13px] font-semibold">手动合并结果</h3>
              <p className="text-[12px] text-[var(--text-secondary)]">默认保留本地草稿；可以从云端复制需要保留的段落。提交后仍需经过服务器修订号检查。</p>
              <label htmlFor="note-merge-title" className="block text-[12px] font-medium">合并后的标题</label>
              <input id="note-merge-title" value={mergedTitle} maxLength={240} onChange={event => setMergedTitle(event.target.value)}
                className="ui-field w-full rounded-[8px] px-3 text-[16px]" />
              <label htmlFor="note-merge-body" className="block text-[12px] font-medium">合并后的 Markdown 正文</label>
              <textarea id="note-merge-body" value={mergedBody} onChange={event => setMergedBody(event.target.value)} rows={8}
                className="w-full min-w-0 resize-y rounded-[8px] border border-[var(--separator)] bg-[var(--surface-canvas)] p-3 font-mono text-[16px] leading-6" />
            </section>
          </>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>取消，保留草稿</Button>
          <Button type="button" disabled={!remote || busy} onClick={confirm}>应用合并结果并保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

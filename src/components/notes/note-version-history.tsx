"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { applySelectedVersionChanges, compareNoteVersions, previewVersionDiffStats } from "@/features/notes/editor/version-review";

type Summary = { id: string; versionNumber: number; reason: string; createdAt: string; revision: number | null };
type Historical = { id: string; versionNumber: number; reason: string; createdAt: string; title: string; body: string };
type Page = { versions: Summary[]; nextBefore: number | null };
type Selected = { version: Historical; checked: Set<number>; historicalTitle: boolean; fullBody: boolean };
const reasonLabels: Record<string, string> = { initial: "初始版本", manual: "手动快照", before_restore: "恢复前留存", restore: "历史恢复" };
function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(date);
}
async function jsonFrom<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", signal });
  if (!response.ok) throw new Error("无法读取历史版本，请检查网络后重试。");
  return await response.json() as T;
}

/** All historical reads are lazy and owner-scoped. The dialog never changes a
 * note itself: the editor must verify the current revision before staging it. */
export function NoteVersionHistory({
  noteId, currentTitle, currentBody, initialVersionId = null, onClose, onApply,
}: {
  noteId: string;
  currentTitle: string;
  currentBody: string;
  initialVersionId?: string | null;
  onClose: () => void;
  onApply: (next: { title: string; body: string }) => Promise<{ ok: boolean; message: string }>;
}) {
  const [versions, setVersions] = useState<Summary[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reading, setReading] = useState(Boolean(initialVersionId));
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Selected | null>(null);
  const [retry, setRetry] = useState(0);
  const baseUrl = "/api/notes/" + encodeURIComponent(noteId) + "/versions";

  useEffect(() => {
    const abort = new AbortController();
    void jsonFrom<Page>(baseUrl, abort.signal).then(page => {
      if (abort.signal.aborted) return;
      setVersions(page.versions); setNextBefore(page.nextBefore); setError("");
    }).catch(() => { if (!abort.signal.aborted) setError("版本列表暂时无法读取。"); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [baseUrl, retry]);

  useEffect(() => {
    if (!initialVersionId) return;
    const abort = new AbortController();
    void jsonFrom<{ version: Historical }>(baseUrl + "/" + encodeURIComponent(initialVersionId), abort.signal)
      .then(value => { if (!abort.signal.aborted) { setPicked({ version: value.version, checked: new Set(), historicalTitle: false, fullBody: false }); setError(""); } })
      .catch(() => { if (!abort.signal.aborted) setError("所选历史版本暂时无法读取。"); })
      .finally(() => { if (!abort.signal.aborted) setReading(false); });
    return () => abort.abort();
  }, [baseUrl, initialVersionId]);

  const parts = useMemo(() => picked ? compareNoteVersions(currentBody, picked.version.body) : null, [currentBody, picked?.version.body]);
  const changes = useMemo(() => parts?.filter(part => part.kind === "changed") ?? [], [parts]);
  const nextBody = picked ? picked.fullBody || parts === null
    ? picked.version.body
    : applySelectedVersionChanges(parts, picked.checked) : currentBody;
  // Large documents have no automatic partial diff. Full replacement must be
  // explicitly selected; opening a preview can never implicitly apply it.
  const resolvedBody = picked && (parts === null && !picked.fullBody) ? currentBody : nextBody;
  const nextTitle = picked?.historicalTitle ? picked.version.title : currentTitle;
  const changed = picked && (resolvedBody !== currentBody || nextTitle !== currentTitle);
  const stats = parts ? previewVersionDiffStats(parts) : null;

  const choose = async (id: string) => {
    if (reading || applying) return;
    setReading(true); setError("");
    try {
      const data = await jsonFrom<{ version: Historical }>(baseUrl + "/" + encodeURIComponent(id));
      setPicked({ version: data.version, checked: new Set(), historicalTitle: false, fullBody: false });
    } catch { setError("历史正文加载失败。当前笔记没有变化。"); }
    finally { setReading(false); }
  };
  const more = async () => {
    if (nextBefore === null || loadingMore) return;
    setLoadingMore(true); setError("");
    try {
      const page = await jsonFrom<Page>(baseUrl + "?before=" + nextBefore);
      setVersions(previous => {
        const ids = new Set(previous.map(item => item.id));
        return [...previous, ...page.versions.filter(item => !ids.has(item.id))];
      });
      setNextBefore(page.nextBefore);
    } catch { setError("无法继续加载历史记录，请重试。"); }
    finally { setLoadingMore(false); }
  };
  const apply = async () => {
    if (!picked || !changed || applying) return;
    setApplying(true); setError("");
    try {
      const outcome = await onApply({ title: nextTitle, body: resolvedBody });
      if (outcome.ok) onClose();
      else setError(outcome.message);
    } catch { setError("恢复操作未完成。原笔记仍保持不变。"); }
    finally { setApplying(false); }
  };

  return <Dialog open onOpenChange={open => { if (!open && !applying) onClose(); }}>
    <DialogContent className="max-h-[min(92dvh,920px)] w-[min(96vw,1100px)] max-w-none overflow-y-auto p-4 sm:p-5">
      <DialogHeader>
        <DialogTitle>笔记版本对比与恢复</DialogTitle>
        <DialogDescription>历史快照只读。选择需要恢复的内容后确认，当前云端版本会先留存为新快照，最终保存仍校验修订号。</DialogDescription>
      </DialogHeader>
      {error ? <p role="alert" className="rounded-[8px] bg-[var(--danger-soft)] p-2 text-[13px] text-[var(--danger)]">{error}</p> : null}
      <div className="grid min-h-0 gap-4 md:grid-cols-[210px_minmax(0,1fr)]">
        <section className="min-w-0 space-y-2" aria-label="版本列表">
          <h3 className="text-[13px] font-semibold">历史快照</h3>
          {loading ? <p role="status" className="text-[13px] text-[var(--text-secondary)]">正在读取版本…</p> : null}
          {!loading && !versions.length ? <p className="text-[13px] text-[var(--text-secondary)]">尚无历史快照。可以在笔记详情中先创建一个。</p> : null}
          <div className="max-h-[220px] space-y-1 overflow-y-auto md:max-h-[580px]">
            {versions.map(item => <button type="button" key={item.id} onClick={() => void choose(item.id)}
              aria-pressed={picked?.version.id === item.id}
              className={"block min-h-11 w-full rounded-[8px] px-3 py-2 text-left text-[13px] hover:bg-[var(--surface-hover)] " + (picked?.version.id === item.id ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-primary)]")}>
              <span className="block font-medium">版本 {item.versionNumber} · {reasonLabels[item.reason] ?? "历史快照"}</span>
              <span className="block text-[12px] text-[var(--text-secondary)]">{timestamp(item.createdAt)}</span>
            </button>)}
          </div>
          {nextBefore !== null ? <Button variant="outline" size="sm" disabled={loadingMore} onClick={() => void more()}>{loadingMore ? "正在加载…" : "加载更早版本"}</Button> : null}
          {!loading && !versions.length && error ? <Button variant="outline" size="sm" onClick={() => { setLoading(true); setRetry(n => n + 1); }}>重试读取</Button> : null}
        </section>
        <section className="min-w-0 space-y-3" aria-label="版本差异">
          {reading ? <p role="status" className="text-[13px] text-[var(--text-secondary)]">正在读取历史正文…</p> : null}
          {!picked ? <p className="rounded-[8px] bg-[var(--surface-control)] p-4 text-[13px] text-[var(--text-secondary)]">选择左侧历史版本，查看与当前笔记的差异。不会自动恢复。</p> : <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold">对照版本 {picked.version.versionNumber}</h3>
              <span className="text-[12px] text-[var(--text-secondary)]">{stats ? stats.changed + " 处文字差异" : "长文档：仅提供全文对照"}</span>
            </div>
            <label className="flex min-h-11 items-center gap-2 rounded-[8px] bg-[var(--surface-control)] px-3 text-[13px]">
              <input type="checkbox" checked={picked.historicalTitle} onChange={event => setPicked(p => p && { ...p, historicalTitle: event.target.checked })} />
              恢复历史标题：{picked.version.title || "无标题"}
            </label>
            {parts ? <>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPicked(p => p && { ...p, checked: new Set(changes.map(part => part.id)), fullBody: false })}>选择全部差异</Button>
                <Button variant="outline" size="sm" onClick={() => setPicked(p => p && { ...p, checked: new Set(), fullBody: false })}>清空选择</Button>
              </div>
              <div className="max-h-[400px] space-y-2 overflow-y-auto rounded-[8px] border border-[var(--separator)] p-2">
                {parts.map(part => part.kind === "equal"
                  ? <details key={part.id} className="rounded-[7px] bg-[var(--surface-control)] px-2 py-1">
                      <summary className="cursor-pointer text-[12px] text-[var(--text-secondary)]">未修改内容 · {part.current.length} 字</summary>
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all p-2 text-[12px]">{part.current}</pre>
                    </details>
                  : <div key={part.id} className="rounded-[8px] border border-[var(--separator)] p-2">
                    <label className="flex min-h-9 items-center gap-2 text-[13px] font-medium">
                      <input type="checkbox" checked={picked.checked.has(part.id)}
                        onChange={event => setPicked(p => {
                          if (!p) return p;
                          const checked = new Set(p.checked);
                          if (event.target.checked) checked.add(part.id); else checked.delete(part.id);
                          return { ...p, checked, fullBody: false };
                        })} />
                      恢复这一处历史内容
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="min-w-0"><p className="text-[12px] font-medium text-[var(--text-secondary)]">当前</p><pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all rounded bg-[var(--surface-control)] p-2 text-[12px]">{part.current || "（无）"}</pre></div>
                      <div className="min-w-0"><p className="text-[12px] font-medium text-[var(--text-secondary)]">历史</p><pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all rounded bg-[var(--accent-soft)] p-2 text-[12px]">{part.historical || "（无）"}</pre></div>
                    </div>
                  </div>)}
              </div>
            </> : <>
              <p className="text-[13px] leading-6 text-[var(--text-secondary)]">文档较长，为避免对比卡顿，提供全文对照与整篇恢复。不会截断 Markdown 源码。</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="min-w-0 text-[12px] font-medium">当前正文<textarea readOnly value={currentBody} rows={10} className="mt-1 block w-full resize-y rounded-[8px] border border-[var(--separator)] bg-[var(--surface-control)] p-2 font-mono text-[13px]" /></label>
                <label className="min-w-0 text-[12px] font-medium">历史正文<textarea readOnly value={picked.version.body} rows={10} className="mt-1 block w-full resize-y rounded-[8px] border border-[var(--separator)] bg-[var(--surface-control)] p-2 font-mono text-[13px]" /></label>
              </div>
              <label className="flex min-h-11 items-center gap-2 text-[13px]"><input type="checkbox" checked={picked.fullBody} onChange={event => setPicked(p => p && { ...p, fullBody: event.target.checked })} />确认恢复整篇历史正文</label>
            </>}
          </>}
        </section>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={applying}>关闭，不做修改</Button>
        <Button onClick={() => void apply()} disabled={!changed || applying || reading}>{applying ? "正在核对并留存版本…" : "应用所选内容"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

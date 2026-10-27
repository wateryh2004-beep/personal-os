"use client";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { z } from "zod";
import { captureWorkspaceScope, clearWorkspaceResources, registerWorkspaceScopeCleanup, WorkspaceAuthenticationError } from "@/lib/workspace-resource-cache";
import { getFilePublicationOverflow, getFilePublicationOverflowServerSnapshot, subscribeFilePublications } from "@/features/files/publication";
import { readFileMetadata } from "@/features/files/metadata-read";
import { fileRecordSchema } from "@/features/files/record-schema";
import type { FileRecord } from "@/features/files/queries";
const pageSchema = z.object({ files: z.array(fileRecordSchema).max(20), next: z.string().uuid().nullable() });
export function FilePublicationRecovery({ setFileRows, archivedRows = [], currentRows = [] }: { setFileRows: Dispatch<SetStateAction<FileRecord[]>>; archivedRows?: FileRecord[]; currentRows?: FileRecord[] }) {
  const overflow = useSyncExternalStore(subscribeFilePublications, getFilePublicationOverflow, getFilePublicationOverflowServerSnapshot);
  const [scopeIsCurrent] = useState(captureWorkspaceScope);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [query, setQuery] = useState("");
  const [page, setPage] = useState<z.infer<typeof pageSchema> | null>(null), [message, setMessage] = useState("");
  const archived = useRef(archivedRows);
  useLayoutEffect(() => { archived.current = archivedRows; }, [archivedRows]);
  const latestQuery = useRef(query);
  useLayoutEffect(() => { latestQuery.current = query; }, [query]);
  const active = useRef(true), request = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    const invalidate = () => { request.current?.abort(); };
    const unregister = registerWorkspaceScopeCleanup(invalidate);
    return () => { active.current = false; invalidate(); unregister(); };
  }, []);
  async function load(after?: string) {
    if (!scopeIsCurrent() || request.current || latestQuery.current !== query) return;
    const baseline = new Map(currentRows.map(row => [row.id, row]));
    const controller = new AbortController(); request.current = controller; setBusy(true); setMessage("");
    const current = () => active.current && scopeIsCurrent() && request.current === controller && !controller.signal.aborted && latestQuery.current === query;
    try {
      const params = new URLSearchParams(); if (after) params.set("after", after); if (query.trim()) params.set("q", query.trim());
      const value = pageSchema.parse(await readFileMetadata<unknown>(`/api/files/publication-directory?${params}`, controller.signal));
      if (!current()) return;
      if (value.next && after && value.next <= after) throw new Error("directory_cursor_stalled");
      setFileRows(rows => {
        if (!active.current || !scopeIsCurrent() || controller.signal.aborted) return rows;
        const updated = new Map(rows.map(row => [row.id, row]));
        for (const file of value.files) {
          const before = baseline.get(file.id), existing = updated.get(file.id), hidden = archived.current.find(row => row.id === file.id);
          if (hidden && (hidden.mutation_revision === undefined || hidden.mutation_revision >= file.mutation_revision)) continue;
          if (before && !existing && (before.mutation_revision ?? -1) >= file.mutation_revision) continue;
          if ((existing?.mutation_revision ?? -1) <= file.mutation_revision) updated.set(file.id, file);
        }
        return [...updated.values()];
      });
      setPage(value); setMessage(value.next ? "本批已核对，可继续下一批。" : "本批目录已到末尾；自动更新的遗漏提醒仍保留，不代表所有并发变更已核对。");
    } catch (error) {
      if (!current()) return;
      if (error instanceof WorkspaceAuthenticationError) { clearWorkspaceResources(); window.dispatchEvent(new Event("personal-os:workspace-auth-failed")); }
      else setMessage("本批文件尚未核对，请重试；原列表和筛选已保留。");
    } finally { if (request.current === controller) { request.current = null; if (active.current && scopeIsCurrent()) setBusy(false); } }
  }
  if (!overflow || !scopeIsCurrent()) return null;
  return <section className="my-3 rounded-[10px] border border-[var(--separator)] p-3 text-[13px]" aria-label="后台文件变更核对">
    <p role="status">后台文件变更较多，自动同步记录已达上限，部分文件尚未核对。</p>
    <button type="button" className="min-h-11 text-[var(--accent)]" onClick={() => { setOpen(value => !value); }}>{open ? "收起核对目录" : "分批核对文件"}</button>
    {open ? <div className="space-y-2">
      <p className="text-[var(--text-secondary)]">每次最多读取 20 个文件，不更改原列表的筛选、排序或位置。无需知道文件 ID 或完整名称。</p>
      <form onSubmit={event => { event.preventDefault(); void load(); }} className="flex flex-wrap gap-2">
        <input aria-label="核对目录显示名称（可选）" className="ui-field min-h-11 min-w-0 flex-1 text-base" value={query} maxLength={200} disabled={busy} onChange={event => { setQuery(event.target.value); setPage(null); }} placeholder="显示名称（可选）" />
        <button className="min-h-11 rounded-md border px-3" disabled={busy}>{busy ? "核对中…" : "读取一批文件"}</button>
      </form>
      {page ? <><ul aria-label="本批已核对文件">{page.files.map(file => <li key={file.id} className="break-words py-1">{file.title}</li>)}</ul>{page.next ? <button type="button" className="min-h-11 rounded-md border px-3" disabled={busy} onClick={() => void load(page.next!)}>核对下一批</button> : null}</> : null}
      {message ? <p role="status">{message}</p> : null}
    </div> : null}
  </section>;
}

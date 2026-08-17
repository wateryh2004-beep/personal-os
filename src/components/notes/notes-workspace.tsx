"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWorkspacePanel } from "@/components/layout/workspace-panel-provider";
import { FilePlus2, LoaderCircle, MoreHorizontal, Pin, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FolderPicker } from "@/components/notes/folder-picker";
import { createNoteInFolder, moveNote, renameNote, toggleNotePinned, trashNote } from "@/features/notes/actions";
import type { NoteListItem } from "@/features/notes/types";
import { formatNoteTimestamp } from "@/features/notes/utils";

type Folder = { id: string; name: string; parent_id: string | null };
type WorkspaceState = "ready" | "base" | "unavailable";

function folderPath(note: NoteListItem, folders: Folder[]) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const names: string[] = [];
  let current = note.folder_id ? byId.get(note.folder_id) : undefined;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) { names.unshift(current.name); seen.add(current.id); current = current.parent_id ? byId.get(current.parent_id) : undefined; }
  return names.length ? names.join(" / ") : "根目录";
}

function AskNotesButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"><Sparkles className="size-3.5 text-[var(--accent)]" />问笔记库</button>;
}

// 笔记库 AI 是独立子 AI；懒加载避免给笔记列表页带来 AI SDK 体积。
const NotesLibraryAI = dynamic(
  () => import("@/components/assistant/notes-library-agent").then((module) => module.NotesLibraryAI),
  { ssr: false },
);

function NoteRow({ note, folders, timezone, renaming, renameValue, onRenameChange, onRenameCommit, onRenameCancel, onRename, onMove, onTogglePinned, onTrash, showExcerpt }: { note: NoteListItem; folders: Folder[]; timezone: string; renaming: boolean; renameValue: string; onRenameChange: (value: string) => void; onRenameCommit: () => void; onRenameCancel: () => void; onRename: (note: NoteListItem) => void; onMove: (note: NoteListItem) => void; onTogglePinned: (note: NoteListItem) => void; onTrash: (note: NoteListItem) => void; showExcerpt: boolean }) {
  return <article className="group relative border-b border-[var(--border-subtle)] last:border-b-0">
    <div className="block max-w-4xl rounded-[var(--radius-md)] px-3 py-3.5 pr-12 transition-colors hover:bg-[var(--surface-hover)] focus-within:bg-[var(--surface-hover)]">
      <div className="flex min-w-0 items-center gap-2">{renaming ? <input autoFocus value={renameValue} onChange={(event) => onRenameChange(event.target.value)} onBlur={onRenameCommit} onKeyDown={(event) => { if (event.key === "Enter") onRenameCommit(); if (event.key === "Escape") onRenameCancel(); }} className="h-7 min-w-0 flex-1 border-b border-[var(--accent)] bg-transparent px-0 text-[15px] font-medium outline-none" aria-label="笔记标题" /> : <Link href={`/notes/${note.id}`} className="truncate text-[15px] font-medium text-[var(--text-primary)] hover:text-[var(--accent)] after:absolute after:inset-0 after:content-['']">{note.title || "无标题笔记"}</Link>}{note.pinned_at ? <Pin className="size-3.5 shrink-0 text-[var(--accent)]" aria-label="已收藏" /> : null}</div>
      {showExcerpt && note.excerpt ? <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">{note.excerpt}</p> : null}
      <p className="mt-2 truncate text-xs text-[var(--text-tertiary)]">{folderPath(note, folders)} · {formatNoteTimestamp(note.updated_at, timezone)}</p>
    </div>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="absolute right-2 top-3 z-10 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 focus-visible:opacity-100" aria-label={`管理 ${note.title || "无标题笔记"}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onRename(note)}>重命名</DropdownMenuItem><DropdownMenuItem onSelect={() => onMove(note)}>移动到…</DropdownMenuItem><DropdownMenuItem onSelect={() => onTogglePinned(note)}>{note.pinned_at ? "取消收藏" : "加入收藏"}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => onTrash(note)}>移到回收站</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
  </article>;
}

export function NotesWorkspace({ notes, folders, timezone, state, selectedFolder, initialView, dailyError, initialHasMore }: { notes: NoteListItem[]; folders: Folder[]; timezone: string; state: WorkspaceState; selectedFolder: Folder | null; initialView: "all" | "favorites" | "recent"; dailyError: boolean; initialHasMore: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [scope, setScope] = useState<"context" | "all">(params.get("scope") === "all" ? "all" : "context");
  const [results, setResults] = useState<NoteListItem[] | null>(null);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "error">("idle");
  const [additional, setAdditional] = useState<NoteListItem[]>([]);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const { isOpen: notesLibraryOpen, open: openNotesLibrary, close: closeNotesLibrary } = useWorkspacePanel("notes-library");
  const [renaming, setRenaming] = useState<NoteListItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moving, setMoving] = useState<NoteListItem | null>(null);
  const [, startTransition] = useTransition();
  const requestRef = useRef<AbortController | null>(null);
  const normalizedQuery = query.trim();
  const activeFolderId = scope === "context" ? selectedFolder?.id ?? null : null;
  const allNotes = useMemo(() => { const byId = new Map(notes.map((note) => [note.id, note])); additional.forEach((note) => byId.set(note.id, note)); return [...byId.values()]; }, [additional, notes]);
  const visible = useMemo(() => {
    if (normalizedQuery) return results ?? [];
    const source = selectedFolder ? allNotes.filter((note) => note.folder_id === selectedFolder.id) : initialView === "favorites" ? allNotes.filter((note) => note.pinned_at) : initialView === "recent" ? [...allNotes].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 50) : allNotes;
    return source;
  }, [allNotes, initialView, normalizedQuery, results, selectedFolder]);
  const title = selectedFolder?.name ?? (initialView === "favorites" ? "收藏" : initialView === "recent" ? "最近编辑" : "全部笔记");

  useEffect(() => {
    if (!normalizedQuery) { requestRef.current?.abort(); return; }
    const controller = new AbortController(); requestRef.current?.abort(); requestRef.current = controller;
    const timer = window.setTimeout(async () => {
      setSearchState("loading");
      try {
        const search = new URLSearchParams({ q: normalizedQuery, limit: "30" });
        if (activeFolderId) search.set("folderId", activeFolderId);
        const response = await fetch(`/api/notes/search?${search}`, { signal: controller.signal });
        const body = await response.json() as { results?: NoteListItem[]; error?: string };
        if (!response.ok) throw new Error(body.error);
        if (!controller.signal.aborted) { setResults(body.results ?? []); setSearchState("idle"); }
      } catch { if (!controller.signal.aborted) { setResults([]); setSearchState("error"); } }
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [activeFolderId, normalizedQuery]);

  const updateQuery = (value: string) => { setQuery(value); const next = new URLSearchParams(params.toString()); if (value.trim()) next.set("q", value); else next.delete("q"); if (scope === "all") next.set("scope", "all"); else next.delete("scope"); router.replace(`/notes?${next.toString()}`, { scroll: false }); };
  const mutate = (action: (form: FormData) => Promise<void>, form: FormData) => startTransition(async () => { await action(form); router.refresh(); });
  const loadMore = async () => { setLoadingMore(true); try { const response = await fetch(`/api/notes/list?offset=${allNotes.length}&limit=50`); const body = await response.json() as { notes?: NoteListItem[]; hasMore?: boolean }; if (!response.ok) throw new Error(); setAdditional((current) => [...current, ...(body.notes ?? [])]); setHasMore(Boolean(body.hasMore)); } finally { setLoadingMore(false); } };

  return <main className="workspace-scroll h-full overflow-y-auto bg-[var(--surface-canvas)] px-4 pt-14 pb-5 md:pt-5 sm:px-7 lg:px-10">
    <div className="mx-auto max-w-5xl">
      {state === "base" ? <p role="status" className="mb-5 border-l-2 border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-800">笔记基础功能正在使用兼容模式；文件夹与链接功能会在迁移启用后完整可用。</p> : null}
      {state === "unavailable" ? <p role="alert" className="mb-5 border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">暂时无法读取笔记库。请检查 Supabase 环境变量、登录状态和数据库连接。</p> : null}
      {dailyError ? <p role="alert" className="mb-5 border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">今日日记暂时未能创建。刷新后重试；已有日记不会被删除。</p> : null}
      <header className="flex flex-wrap items-center gap-2 border-b pb-4"><h1 className="mr-auto text-xl font-semibold tracking-tight text-[var(--text-primary)]">{title}<span className="ml-2 text-sm font-normal text-[var(--text-tertiary)]">· {visible.length}</span></h1><AskNotesButton onClick={openNotesLibrary} /></header>
      <div className="mt-4 flex max-w-3xl items-center gap-2"><label className="relative min-w-0 flex-1"><span className="sr-only">搜索笔记</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]" /><input autoComplete="off" value={query} onChange={(event) => updateQuery(event.target.value)} placeholder={selectedFolder && scope === "context" ? `在「${selectedFolder.name}」中搜索…` : "搜索标题或正文…"} className="h-9 w-full rounded-[var(--radius-md)] border bg-[var(--surface-app)] pl-9 pr-3 text-sm focus:bg-white" /></label>{selectedFolder ? <button type="button" onClick={() => { const next = scope === "context" ? "all" : "context"; setScope(next); const q = new URLSearchParams(params.toString()); if (next === "all") q.set("scope", "all"); else q.delete("scope"); router.replace(`/notes?${q}`, { scroll: false }); }} className="h-9 shrink-0 rounded-[var(--radius-md)] px-2.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">{scope === "context" ? "当前文件夹" : "全部笔记"}</button> : null}</div>
      {searchState === "loading" ? <div role="status" className="flex items-center justify-center gap-2 py-24 text-sm text-[var(--text-secondary)]"><LoaderCircle className="size-4 animate-spin" />正在搜索…</div> : searchState === "error" ? <div role="alert" className="py-24 text-center text-sm text-[var(--danger)]">搜索暂时不可用。</div> : visible.length ? <section className="mt-4">{visible.map((note) => <NoteRow key={note.id} note={note} folders={folders} timezone={timezone} renaming={renaming?.id === note.id} renameValue={renaming?.id === note.id ? renameValue : note.title} onRenameChange={setRenameValue} onRenameCommit={() => { if (renaming?.id !== note.id) return; const title = renameValue.trim(); if (title && title !== note.title) { const form = new FormData(); form.set("note_id", note.id); form.set("title", title); mutate(renameNote, form); } setRenaming(null); }} onRenameCancel={() => setRenaming(null)} onRename={(item) => { setRenaming(item); setRenameValue(item.title); }} onMove={setMoving} onTogglePinned={(item) => { const form = new FormData(); form.set("note_id", item.id); mutate(toggleNotePinned, form); }} onTrash={(item) => { const form = new FormData(); form.set("note_id", item.id); mutate(trashNote, form); }} showExcerpt={Boolean(normalizedQuery)} />)}{!normalizedQuery && hasMore ? <div className="py-5 text-center"><Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? <LoaderCircle className="animate-spin" /> : null}{loadingMore ? "正在加载…" : "加载更多"}</Button></div> : null}</section> : <div className="py-24 text-center"><p className="text-base font-medium text-[var(--text-primary)]">{normalizedQuery ? "没有找到匹配的笔记" : "这里还没有笔记"}</p><p className="mt-2 text-sm text-[var(--text-secondary)]">{normalizedQuery ? "尝试不同的关键词，或切换搜索范围。" : "点击右下角的新建按钮，或从左侧导航创建第一篇笔记。"}</p></div>}
    </div>
    {moving ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/10 p-4"><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); mutate(moveNote, form); setMoving(null); }} className="w-full max-w-sm rounded-xl border bg-white p-4 shadow-xl"><input type="hidden" name="note_id" value={moving.id} /><FolderPicker folders={folders} initialFolderId={moving.folder_id} idPrefix={`move-${moving.id}`} label="移动到" /><div className="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setMoving(null)}>取消</Button><Button type="submit">移动</Button></div></form></div> : null}
    <form action={createNoteInFolder} className="fixed bottom-[calc(var(--tab-bar-height)+1rem)] right-4 z-30 md:hidden"><input type="hidden" name="folder_id" value={selectedFolder?.id ?? ""} /><button type="submit" aria-label="新建笔记" className="flex size-14 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-lg active:scale-95"><FilePlus2 className="size-6" aria-hidden="true" /></button></form>
    {notesLibraryOpen ? <NotesLibraryAI open onClose={closeNotesLibrary} folderName={selectedFolder?.name} /> : null}
  </main>;
}

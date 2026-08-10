"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Clock3,
  FilePlus2,
  FolderPlus,
  LoaderCircle,
  MoreHorizontal,
  Pin,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FolderPicker } from "@/components/notes/folder-picker";
import { FolderTree } from "@/components/notes/folder-tree";
import { NotesKnowledgeEntry } from "@/components/notes/notes-knowledge-entry";
import {
  createFolder,
  createNoteInFolder,
  deleteEmptyFolder,
  moveNote,
  openDailyNote,
  renameNote,
  renameFolder,
  toggleNotePinned,
  trashNote,
} from "@/features/notes/actions";
import { lastOpenedNoteSessionKey, recentNoteHref } from "@/features/notes/navigation";
import { loadWorkspaceSession } from "@/lib/workspace-session";
import type { NoteListItem } from "@/features/notes/types";
import { formatNoteTimestamp } from "@/features/notes/utils";
import { useGlobalSearch } from "@/features/search/use-global-search";
import type { GlobalSearchResult, SearchDomain } from "@/features/search/types";

type Folder = { id: string; name: string; parent_id: string | null };
type WorkspaceState = "ready" | "base" | "unavailable";
const noteSearchDomains: readonly SearchDomain[] = ["notes"];

function folderLabel(note: NoteListItem, folders: Folder[]) {
  if (!note.folder_id) return "未分类";
  return folders.find((item) => item.id === note.folder_id)?.name ?? "未分类";
}

function NoteActions({
  note,
  onRename,
  onMove,
  onTogglePinned,
  onTrash,
}: {
  note: NoteListItem;
  onRename: () => void;
  onMove: () => void;
  onTogglePinned: () => void;
  onTrash: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute right-2 top-3 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`管理 ${note.title || "无标题笔记"}`}
          onClick={(event) => event.preventDefault()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuItem onSelect={onRename}>重命名</DropdownMenuItem>
        <DropdownMenuItem onSelect={onMove}>移动到…</DropdownMenuItem>
        <DropdownMenuItem onSelect={onTogglePinned}>
          {note.pinned_at ? "取消收藏" : "加入收藏"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onTrash}>
          移到回收站
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SearchResultRow({
  result,
  timezone,
}: {
  result: GlobalSearchResult;
  timezone: string;
}) {
  return (
    <article className="group relative">
      <Link
        href={result.href}
        className="block rounded-md px-3 py-4 transition-colors hover:bg-white focus-visible:bg-white"
      >
        <p className="truncate text-[15px] font-medium text-zinc-900">
          {result.title || "无标题笔记"}
        </p>
        {result.snippet ? (
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-500">
            {result.snippet}
          </p>
        ) : (
          <p className="mt-1 text-sm text-zinc-400">未找到可显示的摘要</p>
        )}
        {result.sourceUpdatedAt ? (
          <p className="mt-2 text-xs text-zinc-400">
            {formatNoteTimestamp(result.sourceUpdatedAt, timezone)}
          </p>
        ) : null}
      </Link>
    </article>
  );
}

export function NotesWorkspace({
  notes,
  folders,
  timezone,
  state,
  selectedFolder,
  initialView,
  dailyError,
  initialHasMore,
  restoreRecentNote,
}: {
  notes: NoteListItem[];
  folders: Folder[];
  timezone: string;
  state: WorkspaceState;
  selectedFolder: Folder | null;
  initialView: "all" | "favorites" | "recent";
  dailyError: boolean;
  initialHasMore: boolean;
  restoreRecentNote: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "oldest" | "title">("recent");
  const [additionalNotes, setAdditionalNotes] = useState<NoteListItem[]>([]);
  const [loadedHasMore, setLoadedHasMore] = useState<boolean | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [renameFolderTarget, setRenameFolderTarget] = useState<Folder | null>(null);
  const [renameTarget, setRenameTarget] = useState<NoteListItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<NoteListItem | null>(null);
  const [, startTransition] = useTransition();
  const normalizedQuery = query.trim();
  const search = useGlobalSearch({
    query,
    domains: noteSearchDomains,
    limit: 30,
    debounceMs: 200,
  });
  const activeView = selectedFolder ? "folder" : initialView;
  const currentFolderId = selectedFolder?.id ?? "";

  useEffect(() => {
    if (!restoreRecentNote) return;
    const href = recentNoteHref(loadWorkspaceSession(lastOpenedNoteSessionKey));
    if (href !== "/notes") router.replace(href);
  }, [restoreRecentNote, router]);

  const listedNotes = useMemo(() => {
    const byId = new Map(notes.map((note) => [note.id, note]));
    for (const note of additionalNotes) byId.set(note.id, note);
    return [...byId.values()];
  }, [additionalNotes, notes]);
  const hasMore = loadedHasMore ?? initialHasMore;

  const visibleNotes = useMemo(() => {
    const source = selectedFolder
      ? listedNotes.filter((note) => note.folder_id === selectedFolder.id)
      : initialView === "favorites"
        ? listedNotes.filter((note) => note.pinned_at)
        : initialView === "recent"
          ? listedNotes.slice(0, 20)
          : listedNotes;
    return [...source].sort((left, right) => {
      if (sort === "title") {
        return (left.title || "无标题笔记").localeCompare(
          right.title || "无标题笔记",
          "zh-CN",
        );
      }
      const difference =
        new Date(left.updated_at).getTime() - new Date(right.updated_at).getTime();
      return sort === "oldest" ? difference : -difference;
    });
  }, [initialView, listedNotes, selectedFolder, sort]);

  const title =
    selectedFolder?.name ??
    (initialView === "favorites"
      ? "收藏"
      : initialView === "recent"
        ? "最近编辑"
        : "全部笔记");
  const displayedCount = normalizedQuery ? search.results.length : visibleNotes.length;

  const submitAction = (
    action: (formData: FormData) => Promise<void>,
    data: FormData,
  ) => {
    startTransition(async () => {
      await action(data);
      setAdditionalNotes([]);
      setLoadedHasMore(null);
      router.refresh();
    });
  };

  async function loadMore() {
    setLoadingMore(true);
    setListError(null);
    try {
      const response = await fetch(
        `/api/notes/list?offset=${listedNotes.length}&limit=50`,
      );
      const body = (await response.json()) as {
        notes?: NoteListItem[];
        hasMore?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "暂时无法加载更多笔记。");
      setAdditionalNotes((current) => {
        const byId = new Map(current.map((note) => [note.id, note]));
        for (const note of body.notes ?? []) byId.set(note.id, note);
        return [...byId.values()];
      });
      setLoadedHasMore(Boolean(body.hasMore));
    } catch (error) {
      setListError(
        error instanceof Error ? error.message : "暂时无法加载更多笔记。",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="grid min-h-[calc(var(--app-viewport-height)-var(--toolbar-height))] md:grid-cols-[var(--context-sidebar-width)_minmax(0,1fr)]">
      <aside className="border-b bg-[var(--surface-sidebar)] p-4 md:sticky md:top-[var(--toolbar-height)] md:h-[calc(var(--app-viewport-height)-var(--toolbar-height))] md:overflow-y-auto md:border-r md:border-b-0">
        <div className="mb-5 flex items-center justify-between px-2">
          <h1 className="text-sm font-semibold tracking-tight text-zinc-900">笔记</h1>
          <form action={createNoteInFolder}>
            <input type="hidden" name="folder_id" value={currentFolderId} />
            <Button size="icon-xs" aria-label="新建笔记"><FilePlus2 /></Button>
          </form>
        </div>
        <nav className="space-y-0.5">
          <Link href="/notes?view=all" className={`flex h-8 items-center justify-between rounded-md px-2 text-sm ${activeView === "all" ? "bg-[#EDF3F6] font-medium text-[#365F78]" : "text-zinc-600 hover:bg-white hover:text-zinc-900"}`}>
            <span>全部笔记</span>
            <span className="font-mono text-xs text-zinc-400">{listedNotes.length}{hasMore ? "+" : ""}</span>
          </Link>
          <form action={openDailyNote}>
            <button className="flex h-8 w-full items-center rounded-md px-2 text-left text-sm text-zinc-600 hover:bg-white hover:text-zinc-900">今日日记</button>
          </form>
          <Link href="/notes?view=favorites" className={`flex h-8 items-center justify-between rounded-md px-2 text-sm ${activeView === "favorites" ? "bg-[#EDF3F6] font-medium text-[#365F78]" : "text-zinc-600 hover:bg-white hover:text-zinc-900"}`}>
            <span className="flex items-center gap-1.5"><Star className="size-3.5" />收藏</span>
            <span className="font-mono text-xs text-zinc-400">{listedNotes.filter((note) => note.pinned_at).length}</span>
          </Link>
          <Link href="/notes?view=recent" className={`flex h-8 items-center justify-between rounded-md px-2 text-sm ${activeView === "recent" ? "bg-[var(--surface-selected)] font-medium text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}>
            <span className="flex items-center gap-1.5"><Clock3 className="size-3.5" aria-hidden="true" />最近编辑</span>
          </Link>
        </nav>
        <div className="mt-7">
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="text-xs font-medium text-zinc-500">文件夹</p>
            {state === "ready" ? <button onClick={() => setCreateFolderOpen(true)} className="text-xs text-[#365F78] hover:underline">新建文件夹</button> : null}
          </div>
          {state === "ready" ? (
            <nav className="space-y-0.5"><FolderTree folders={folders} notes={listedNotes} selectedId={selectedFolder?.id ?? null} onRename={setRenameFolderTarget} /></nav>
          ) : (
            <p className="px-2 text-xs leading-5 text-zinc-400">文件夹将在 Notes Workspace migration 启用后显示。</p>
          )}
        </div>
        <Link href="/notes/trash" className="mt-7 flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-zinc-500 hover:bg-white hover:text-zinc-900">
          <Trash2 className="size-3.5" />回收站
        </Link>
      </aside>

      <main className="min-w-0 bg-[var(--surface-canvas)] px-4 py-5 sm:px-7 lg:px-9">
        {state === "base" ? <p role="status" className="mb-5 rounded-md border-l-2 border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-800">笔记基础功能正在使用兼容模式；新建、编辑和日记均可用。</p> : null}
        {state === "unavailable" ? <p role="alert" className="mb-5 rounded-md border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">暂时无法读取笔记库。请检查 Supabase 环境变量、登录状态和数据库连接。</p> : null}
        {dailyError ? <p role="alert" className="mb-5 rounded-md border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">今日日记暂时未能创建或归位。刷新后重试；已有日记不会被删除。</p> : null}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-start gap-1">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-900">{title}</h2>
              <p className="mt-1 text-sm text-zinc-500">
                {search.status === "loading" ? "正在搜索…" : `${displayedCount} 篇笔记`}
              </p>
            </div>
            {selectedFolder ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`管理文件夹 ${selectedFolder.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="start"><DropdownMenuItem onSelect={() => setRenameFolderTarget(selectedFolder)}>重命名文件夹</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => { const data = new FormData(); data.set("folder_id", selectedFolder.id); submitAction(deleteEmptyFolder, data); }}>删除空文件夹</DropdownMenuItem></DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="排序" className="h-8 rounded-md border bg-white px-2 text-sm text-zinc-600" disabled={Boolean(normalizedQuery)}>
              <option value="recent">最近更新</option><option value="oldest">最早更新</option><option value="title">标题</option>
            </select>
            <form action={createNoteInFolder}><input type="hidden" name="folder_id" value={currentFolderId} /><Button>新建笔记</Button></form>
          </div>
        </header>
        <NotesKnowledgeEntry folderName={selectedFolder?.name} />
        <label className="relative mt-4 block max-w-2xl">
          <span className="sr-only">搜索笔记</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
          <input name="notes-search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题或正文…" className="h-9 w-full rounded-[var(--radius-md)] border bg-[var(--surface-app)] pl-9 pr-3 text-sm placeholder:text-[var(--text-tertiary)] focus:bg-white" />
        </label>

        {normalizedQuery ? (
          search.status === "loading" ? (
            <div role="status" className="flex items-center justify-center gap-2 py-24 text-sm text-[var(--text-secondary)]"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />正在搜索笔记正文…</div>
          ) : search.status === "error" ? (
            <div role="alert" className="py-24 text-center"><p className="text-sm text-[var(--danger)]">{search.error}</p><button type="button" onClick={() => setQuery("")} className="mt-3 text-sm text-[var(--accent)] hover:underline">清除搜索</button></div>
          ) : search.results.length ? (
            <div className="mt-2 divide-y divide-zinc-200/80">{search.results.map((result) => <SearchResultRow key={result.id} result={result} timezone={timezone} />)}</div>
          ) : (
            <div className="py-24 text-center"><p className="text-base font-medium text-zinc-900">没有找到匹配的笔记</p><p className="mt-2 text-sm text-[var(--text-secondary)]">尝试更短或不同的关键词。</p></div>
          )
        ) : visibleNotes.length ? (
          <>
            <div className="mt-2 divide-y divide-zinc-200/80">
              {visibleNotes.map((note) => (
                <article key={note.id} className="group relative">
                  <Link href={`/notes/${note.id}`} className="block rounded-md px-3 py-4 pr-12 transition-colors hover:bg-white focus-visible:bg-white">
                    <div className="flex min-w-0 items-center gap-2"><p className="truncate text-[15px] font-medium text-zinc-900">{note.title || "无标题笔记"}</p>{note.pinned_at ? <Pin className="size-3.5 shrink-0 text-[#365F78]" aria-label="已收藏" /> : null}</div>
                    {note.excerpt ? <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-500">{note.excerpt}</p> : <p className="mt-1 text-sm text-zinc-400">尚未开始记录</p>}
                    <p className="mt-2 truncate text-xs text-zinc-400">{folderLabel(note, folders)} · {formatNoteTimestamp(note.updated_at, timezone)}</p>
                  </Link>
                  <NoteActions
                    note={note}
                    onRename={() => setRenameTarget(note)}
                    onMove={() => setMoveTarget(note)}
                    onTogglePinned={() => { const data = new FormData(); data.set("note_id", note.id); submitAction(toggleNotePinned, data); }}
                    onTrash={() => { const data = new FormData(); data.set("note_id", note.id); submitAction(trashNote, data); }}
                  />
                </article>
              ))}
            </div>
            {hasMore ? <div className="border-t py-5 text-center"><Button type="button" variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? <LoaderCircle className="animate-spin" /> : null}{loadingMore ? "正在加载…" : "加载更多"}</Button></div> : null}
            {listError ? <p role="alert" className="pb-4 text-center text-xs text-[var(--danger)]">{listError}</p> : null}
          </>
        ) : (
          <div className="py-24 text-center"><p className="text-base font-medium text-zinc-900">这里还没有笔记</p><form action={createNoteInFolder} className="mt-4"><input type="hidden" name="folder_id" value={currentFolderId} /><Button>新建笔记</Button></form></div>
        )}
      </main>

      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}><DialogContent><DialogHeader><DialogTitle>新建文件夹</DialogTitle><DialogDescription>可选择一个父文件夹，也可以直接创建在根目录。</DialogDescription></DialogHeader><form action={async (formData) => { await createFolder(formData); setCreateFolderOpen(false); router.refresh(); }} className="grid gap-4"><label className="grid gap-1.5 text-sm font-medium">文件夹名称<input name="name" required autoFocus className="h-8 rounded-md border bg-white px-2 text-sm font-normal" /></label><label className="grid gap-1.5 text-sm font-medium">父文件夹<select name="parent_id" className="h-8 rounded-md border bg-white px-2 text-sm font-normal"><option value="">根目录</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><DialogFooter><DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose><Button type="submit"><FolderPlus />创建</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={Boolean(renameFolderTarget)} onOpenChange={(open) => !open && setRenameFolderTarget(null)}><DialogContent><DialogHeader><DialogTitle>重命名文件夹</DialogTitle><DialogDescription>只修改名称，不会移动或改动其中的笔记。</DialogDescription></DialogHeader>{renameFolderTarget ? <form action={async (formData) => { await renameFolder(formData); setRenameFolderTarget(null); router.refresh(); }} className="grid gap-4"><input type="hidden" name="folder_id" value={renameFolderTarget.id} /><label className="grid gap-1.5 text-sm font-medium">文件夹名称<input name="name" required maxLength={120} defaultValue={renameFolderTarget.name} autoFocus className="h-8 rounded-md border bg-white px-2 text-sm font-normal" /></label><DialogFooter><DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose><Button type="submit">保存名称</Button></DialogFooter></form> : null}</DialogContent></Dialog>
      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}><DialogContent><DialogHeader><DialogTitle>重命名笔记</DialogTitle></DialogHeader>{renameTarget ? <form action={async (formData) => { await renameNote(formData); setRenameTarget(null); setAdditionalNotes([]); setLoadedHasMore(null); router.refresh(); }} className="grid gap-4"><input type="hidden" name="note_id" value={renameTarget.id} /><label className="grid gap-1.5 text-sm font-medium">标题<input name="title" required maxLength={240} defaultValue={renameTarget.title || "无标题笔记"} autoFocus className="h-8 rounded-md border bg-white px-2 text-sm font-normal" /></label><DialogFooter><DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose><Button type="submit">保存</Button></DialogFooter></form> : null}</DialogContent></Dialog>
      <Dialog open={Boolean(moveTarget)} onOpenChange={(open) => !open && setMoveTarget(null)}><DialogContent><DialogHeader><DialogTitle>移动笔记</DialogTitle><DialogDescription>选择此笔记要归属的文件夹。</DialogDescription></DialogHeader>{moveTarget ? <form action={async (formData) => { await moveNote(formData); setMoveTarget(null); setAdditionalNotes([]); setLoadedHasMore(null); router.refresh(); }} className="grid gap-4"><input type="hidden" name="note_id" value={moveTarget.id} /><FolderPicker folders={folders} initialFolderId={moveTarget.folder_id} idPrefix={`move-${moveTarget.id}`} label="目标文件夹" /><DialogFooter><DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose><Button type="submit">移动</Button></DialogFooter></form> : null}</DialogContent></Dialog>
    </section>
  );
}

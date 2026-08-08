"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock3, FilePlus2, FolderPlus, MoreHorizontal, Pin, Search, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FolderPicker } from "@/components/notes/folder-picker";
import { FolderTree } from "@/components/notes/folder-tree";
import { NotesKnowledgeEntry } from "@/components/notes/notes-knowledge-entry";
import { createFolder, createNoteInFolder, deleteEmptyFolder, moveNote, openDailyNote, renameNote, toggleNotePinned, trashNote } from "@/features/notes/actions";
import { formatNoteTimestamp } from "@/features/notes/utils";

type Note = { id: string; title: string; body_markdown: string; updated_at: string; pinned_at: string | null; folder_id: string | null };
type Folder = { id: string; name: string; parent_id: string | null };
type WorkspaceState = "ready" | "base" | "unavailable";

function notePreview(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/[`#>*_~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function folderLabel(note: Note, folders: Folder[]) {
  if (!note.folder_id) return "未分类";
  const folder = folders.find((item) => item.id === note.folder_id);
  return folder?.name ?? "未分类";
}

export function NotesWorkspace({ notes, folders, timezone, state, selectedFolder, initialView, dailyError }: {
  notes: Note[];
  folders: Folder[];
  timezone: string;
  state: WorkspaceState;
  selectedFolder: Folder | null;
  initialView: "all" | "favorites" | "recent";
  dailyError: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "oldest" | "title">("recent");
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Note | null>(null);
  const [moveTarget, setMoveTarget] = useState<Note | null>(null);
  const [, startTransition] = useTransition();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const activeView = selectedFolder ? "folder" : initialView;
  const currentFolderId = selectedFolder?.id ?? "";

  const visibleNotes = useMemo(() => {
    const source = selectedFolder
      ? notes.filter((note) => note.folder_id === selectedFolder.id)
      : initialView === "favorites"
        ? notes.filter((note) => note.pinned_at)
        : initialView === "recent"
          ? notes.slice(0, 20)
          : notes;
    return source
      .filter((note) => !normalizedQuery || `${note.title} ${note.body_markdown}`.toLocaleLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        if (sort === "title") return (a.title || "无标题笔记").localeCompare(b.title || "无标题笔记", "zh-CN");
        const difference = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        return sort === "oldest" ? difference : -difference;
      });
  }, [initialView, normalizedQuery, notes, selectedFolder, sort]);

  const title = selectedFolder?.name ?? (initialView === "favorites" ? "收藏" : initialView === "recent" ? "最近编辑" : "全部笔记");
  const submitAction = (action: (formData: FormData) => Promise<void>, data: FormData) => {
    startTransition(async () => {
      await action(data);
      router.refresh();
    });
  };

  return (
    <section className="grid min-h-[calc(100dvh-var(--toolbar-height))] md:grid-cols-[var(--context-sidebar-width)_minmax(0,1fr)]">
      <aside className="border-b bg-[var(--surface-sidebar)] p-4 md:sticky md:top-[var(--toolbar-height)] md:h-[calc(100dvh-var(--toolbar-height))] md:overflow-y-auto md:border-r md:border-b-0">
        <div className="mb-5 flex items-center justify-between px-2">
          <h1 className="text-sm font-semibold tracking-tight text-zinc-900">笔记</h1>
          <form action={createNoteInFolder}><input type="hidden" name="folder_id" value={currentFolderId} /><Button size="icon-xs" aria-label="新建笔记"><FilePlus2 /></Button></form>
        </div>
        <nav className="space-y-0.5">
          <Link href="/notes" className={`flex h-8 items-center justify-between rounded-md px-2 text-sm ${activeView === "all" ? "bg-[#EDF3F6] font-medium text-[#365F78]" : "text-zinc-600 hover:bg-white hover:text-zinc-900"}`}><span>全部笔记</span><span className="font-mono text-xs text-zinc-400">{notes.length}</span></Link>
          <form action={openDailyNote}><button className="flex h-8 w-full items-center rounded-md px-2 text-left text-sm text-zinc-600 hover:bg-white hover:text-zinc-900">今日日记</button></form>
          <Link href="/notes?view=favorites" className={`flex h-8 items-center justify-between rounded-md px-2 text-sm ${activeView === "favorites" ? "bg-[#EDF3F6] font-medium text-[#365F78]" : "text-zinc-600 hover:bg-white hover:text-zinc-900"}`}><span className="flex items-center gap-1.5"><Star className="size-3.5" />收藏</span><span className="font-mono text-xs text-zinc-400">{notes.filter((note) => note.pinned_at).length}</span></Link>
          <Link href="/notes?view=recent" className={`flex h-8 items-center justify-between rounded-md px-2 text-sm ${activeView === "recent" ? "bg-[var(--surface-selected)] font-medium text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" aria-hidden="true" />最近编辑</span></Link>
        </nav>
        <div className="mt-7">
          <div className="mb-2 flex items-center justify-between px-2"><p className="text-xs font-medium text-zinc-500">文件夹</p>{state === "ready" ? <button onClick={() => setCreateFolderOpen(true)} className="text-xs text-[#365F78] hover:underline">新建文件夹</button> : null}</div>
          {state === "ready" ? <nav className="space-y-0.5"><FolderTree folders={folders} notes={notes} selectedId={selectedFolder?.id ?? null} /></nav> : <p className="px-2 text-xs leading-5 text-zinc-400">文件夹将在 Notes Workspace migration 启用后显示。</p>}
        </div>
        <Link href="/notes/trash" className="mt-7 flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-zinc-500 hover:bg-white hover:text-zinc-900"><Trash2 className="size-3.5" />回收站</Link>
      </aside>

      <main className="min-w-0 bg-[var(--surface-canvas)] px-4 py-5 sm:px-7 lg:px-9">
        {state === "base" ? <p role="status" className="mb-5 rounded-md border-l-2 border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-800">笔记基础功能正在使用兼容模式；新建、编辑和日记均可用。</p> : null}
        {state === "unavailable" ? <p role="alert" className="mb-5 rounded-md border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">暂时无法读取笔记库。请检查 Supabase 环境变量、登录状态和数据库连接。</p> : null}
        {dailyError ? <p role="alert" className="mb-5 rounded-md border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">今日日记暂时未能创建或归位。刷新后重试；已有日记不会被删除。</p> : null}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-start gap-1"><div><h2 className="text-xl font-semibold tracking-tight text-zinc-900">{title}</h2><p className="mt-1 text-sm text-zinc-500">{visibleNotes.length} 篇笔记</p></div>{selectedFolder ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`管理文件夹 ${selectedFolder.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem variant="destructive" onSelect={() => { const data = new FormData(); data.set("folder_id", selectedFolder.id); submitAction(deleteEmptyFolder, data); }}>删除空文件夹</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}</div>
          <div className="flex items-center gap-2"><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="排序" className="h-8 rounded-md border bg-white px-2 text-sm text-zinc-600"><option value="recent">最近更新</option><option value="oldest">最早更新</option><option value="title">标题</option></select><form action={createNoteInFolder}><input type="hidden" name="folder_id" value={currentFolderId} /><Button>新建笔记</Button></form></div>
        </header>
        <NotesKnowledgeEntry folderName={selectedFolder?.name} />
        <label className="relative mt-4 block max-w-2xl"><span className="sr-only">搜索笔记</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" /><input name="notes-search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题或正文…" className="h-9 w-full rounded-[var(--radius-md)] border bg-[var(--surface-app)] pl-9 pr-3 text-sm placeholder:text-[var(--text-tertiary)] focus:bg-white" /></label>
        {visibleNotes.length ? <div className="mt-2 divide-y divide-zinc-200/80">{visibleNotes.map((note) => <article key={note.id} className="group relative"><Link href={`/notes/${note.id}`} className="block rounded-md px-3 py-4 pr-12 transition-colors hover:bg-white focus-visible:bg-white"><div className="flex min-w-0 items-center gap-2"><p className="truncate text-[15px] font-medium text-zinc-900">{note.title || "无标题笔记"}</p>{note.pinned_at ? <Pin className="size-3.5 shrink-0 text-[#365F78]" aria-label="已收藏" /> : null}</div>{notePreview(note.body_markdown) ? <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-500">{notePreview(note.body_markdown)}</p> : <p className="mt-1 text-sm text-zinc-400">尚未开始记录</p>}<p className="mt-2 truncate text-xs text-zinc-400">{folderLabel(note, folders)} · {formatNoteTimestamp(note.updated_at, timezone)}</p></Link><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="absolute right-2 top-3 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" aria-label={`管理 ${note.title || "无标题笔记"}`} onClick={(event) => event.preventDefault()}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-36"><DropdownMenuItem onSelect={() => setRenameTarget(note)}>重命名</DropdownMenuItem><DropdownMenuItem onSelect={() => setMoveTarget(note)}>移动到…</DropdownMenuItem><DropdownMenuItem onSelect={() => { const data = new FormData(); data.set("note_id", note.id); submitAction(toggleNotePinned, data); }}>{note.pinned_at ? "取消收藏" : "加入收藏"}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => { const data = new FormData(); data.set("note_id", note.id); submitAction(trashNote, data); }}>移到回收站</DropdownMenuItem></DropdownMenuContent></DropdownMenu></article>)}</div> : <div className="py-24 text-center"><p className="text-base font-medium text-zinc-900">{normalizedQuery ? "没有找到匹配的笔记" : "这里还没有笔记"}</p>{!normalizedQuery ? <form action={createNoteInFolder} className="mt-4"><input type="hidden" name="folder_id" value={currentFolderId} /><Button>新建笔记</Button></form> : null}</div>}
      </main>

      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}><DialogContent><DialogHeader><DialogTitle>新建文件夹</DialogTitle><DialogDescription>可选择一个父文件夹，也可以直接创建在根目录。</DialogDescription></DialogHeader><form action={async (formData) => { await createFolder(formData); setCreateFolderOpen(false); router.refresh(); }} className="grid gap-4"><label className="grid gap-1.5 text-sm font-medium">文件夹名称<input name="name" required autoFocus className="h-8 rounded-md border bg-white px-2 text-sm font-normal" /></label><label className="grid gap-1.5 text-sm font-medium">父文件夹<select name="parent_id" className="h-8 rounded-md border bg-white px-2 text-sm font-normal"><option value="">根目录</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><DialogFooter><DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose><Button type="submit"><FolderPlus />创建</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}><DialogContent><DialogHeader><DialogTitle>重命名笔记</DialogTitle></DialogHeader>{renameTarget ? <form action={async (formData) => { await renameNote(formData); setRenameTarget(null); router.refresh(); }} className="grid gap-4"><input type="hidden" name="note_id" value={renameTarget.id} /><label className="grid gap-1.5 text-sm font-medium">标题<input name="title" required maxLength={240} defaultValue={renameTarget.title || "无标题笔记"} autoFocus className="h-8 rounded-md border bg-white px-2 text-sm font-normal" /></label><DialogFooter><DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose><Button type="submit">保存</Button></DialogFooter></form> : null}</DialogContent></Dialog>
      <Dialog open={Boolean(moveTarget)} onOpenChange={(open) => !open && setMoveTarget(null)}><DialogContent><DialogHeader><DialogTitle>移动笔记</DialogTitle><DialogDescription>选择此笔记要归属的文件夹。</DialogDescription></DialogHeader>{moveTarget ? <form action={async (formData) => { await moveNote(formData); setMoveTarget(null); router.refresh(); }} className="grid gap-4"><input type="hidden" name="note_id" value={moveTarget.id} /><FolderPicker folders={folders} initialFolderId={moveTarget.folder_id} idPrefix={`move-${moveTarget.id}`} label="目标文件夹" /><DialogFooter><DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose><Button type="submit">移动</Button></DialogFooter></form> : null}</DialogContent></Dialog>
    </section>
  );
}

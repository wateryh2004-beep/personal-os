"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, FilePlus2, FileText, Folder, FolderPlus, Menu, MoreHorizontal, Star, Trash2, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { createFolder, createNoteInFolder, moveFolder, moveNote, renameFolder } from "@/features/notes/actions";
import { openDailyNote } from "@/features/notes/actions";
import { canMoveFolderTo, expandedFolderPath, visibleExpandedFolders } from "@/features/notes/folder-tree";

export type NotesNavigatorFolder = { id: string; name: string; parent_id: string | null };
export type NotesNavigatorNote = { id: string; title: string; folder_id: string | null; updated_at: string };
type DraggedNavigatorItem = { kind: "note" | "folder"; id: string; title: string; parentId: string | null };

function NotesNavigator({ folders, notes, onNavigate }: { folders: NotesNavigatorFolder[]; notes: NotesNavigatorNote[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedFolderId = searchParams.get("folder");
  const [expanded, setExpanded] = useState<Set<string>>(() => expandedFolderPath(folders, selectedFolderId));
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined);
  const [folderName, setFolderName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [optimisticMove, setOptimisticMove] = useState<{ item: DraggedNavigatorItem; targetId: string | null } | null>(null);
  const [dragging, setDragging] = useState<DraggedNavigatorItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | "root" | null>(null);
  const [notice, setNotice] = useState("");
  const [, startTransition] = useTransition();
  const activeNoteId = /^\/notes\/([0-9a-f-]{36})$/i.exec(pathname)?.[1] ?? null;

  const navigatorFolders = useMemo(() => optimisticMove?.item.kind === "folder"
    ? folders.map((folder) => folder.id === optimisticMove.item.id ? { ...folder, parent_id: optimisticMove.targetId } : folder)
    : folders, [folders, optimisticMove]);
  const navigatorNotes = useMemo(() => optimisticMove?.item.kind === "note"
    ? notes.map((note) => note.id === optimisticMove.item.id ? { ...note, folder_id: optimisticMove.targetId } : note)
    : notes, [notes, optimisticMove]);

  const children = useMemo(() => {
    const map = new Map<string | null, NotesNavigatorFolder[]>();
    navigatorFolders.forEach((folder) => map.set(folder.parent_id, [...(map.get(folder.parent_id) ?? []), folder]));
    return map;
  }, [navigatorFolders]);
  const notesByFolder = useMemo(() => {
    const map = new Map<string | null, NotesNavigatorNote[]>();
    navigatorNotes.forEach((note) => map.set(note.folder_id, [...(map.get(note.folder_id) ?? []), note]));
    return map;
  }, [navigatorNotes]);

  const openFolders = useMemo(() => visibleExpandedFolders(navigatorFolders, expanded, selectedFolderId, collapsed), [collapsed, expanded, navigatorFolders, selectedFolderId]);

  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (openFolders.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleFolder = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (openFolders.has(id)) next.add(id); else next.delete(id);
      return next;
    });
    toggle(id);
  };
  const createFolderInline = () => {
    const name = folderName.trim();
    if (!name) { setCreatingIn(undefined); return; }
    const form = new FormData();
    form.set("name", name);
    if (creatingIn) form.set("parent_id", creatingIn);
    startTransition(async () => {
      await createFolder(form);
      setExpanded((current) => new Set(creatingIn ? [...current, creatingIn] : current));
      setCreatingIn(undefined);
      setFolderName("");
      router.refresh();
    });
  };
  const commitRename = (folder: NotesNavigatorFolder) => {
    const name = renameValue.trim();
    if (!name || name === folder.name) { setRenaming(null); return; }
    const form = new FormData(); form.set("folder_id", folder.id); form.set("name", name);
    startTransition(async () => { await renameFolder(form); setRenaming(null); router.refresh(); });
  };
  const beginDrag = (event: React.DragEvent<HTMLElement>, item: DraggedNavigatorItem) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
    setDragging(item);
    setNotice(`正在移动${item.kind === "note" ? "笔记" : "文件夹"}“${item.title}”`);
  };
  const canDropOn = (targetId: string | null) => {
    if (!dragging) return false;
    if (dragging.kind === "note") return dragging.parentId !== targetId;
    return targetId ? canMoveFolderTo(navigatorFolders, dragging.id, targetId) : dragging.parentId !== null;
  };
  const clearDrag = () => { setDragging(null); setDropTarget(null); };
  const moveDraggedTo = (targetId: string | null, targetName: string) => {
    const item = dragging;
    if (!item || !canDropOn(targetId)) { clearDrag(); return; }
    setOptimisticMove({ item, targetId });
    if (targetId) setExpanded((current) => new Set([...current, targetId]));
    clearDrag();
    setNotice(`已将“${item.title}”移至${targetName}`);
    const form = new FormData();
    form.set(item.kind === "note" ? "note_id" : "folder_id", item.id);
    form.set(item.kind === "note" ? "folder_id" : "parent_id", targetId ?? "");
    startTransition(async () => {
      try {
        if (item.kind === "note") await moveNote(form); else await moveFolder(form);
        router.refresh();
      } catch {
        setOptimisticMove(null);
        setNotice(`未能移动“${item.title}”，已恢复原位置。`);
      }
    });
  };
  const createFolderRow = (parentId: string | null, depth: number) => creatingIn === parentId ? <form onSubmit={(event) => { event.preventDefault(); createFolderInline(); }} className="flex h-8 items-center gap-1.5" style={{ paddingLeft: `${12 + depth * 16}px` }}>
    <Folder className="size-3.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
    <input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setCreatingIn(undefined); setFolderName(""); } }} placeholder="新建文件夹" className="h-6 min-w-0 flex-1 border-b border-[var(--accent)] bg-transparent px-0 text-sm outline-none" />
  </form> : null;
  const renderBranch = (parentId: string | null, depth = 0): React.ReactNode => <>
    {(children.get(parentId) ?? []).map((folder) => {
      const childFolders = children.get(folder.id) ?? [];
      const directNotes = notesByFolder.get(folder.id) ?? [];
      const expandable = childFolders.length > 0 || directNotes.length > 0;
      const isOpen = openFolders.has(folder.id);
      return <div key={folder.id}>
        <div draggable={renaming !== folder.id} onDragStart={(event) => beginDrag(event, { kind: "folder", id: folder.id, title: folder.name, parentId: folder.parent_id })} onDragEnd={clearDrag} onDragOver={(event) => { if (!canDropOn(folder.id)) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(folder.id); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node) && dropTarget === folder.id) setDropTarget(null); }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); moveDraggedTo(folder.id, `文件夹“${folder.name}”`); }} className={`group flex h-8 items-center rounded-[var(--radius-sm)] transition-colors ${dropTarget === folder.id ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] ring-1 ring-inset ring-[var(--accent)]" : ""}`} style={{ paddingLeft: `${depth * 16}px` }}>
          <button type="button" onClick={() => expandable && toggleFolder(folder.id)} aria-label={`${isOpen ? "收起" : "展开"} ${folder.name}`} aria-expanded={expandable ? isOpen : undefined} className="flex size-5 shrink-0 items-center justify-center rounded text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)]">{expandable ? isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" /> : null}</button>
          {renaming === folder.id ? <input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onBlur={() => commitRename(folder)} onKeyDown={(event) => { if (event.key === "Enter") commitRename(folder); if (event.key === "Escape") setRenaming(null); }} className="h-6 min-w-0 flex-1 border-b border-[var(--accent)] bg-transparent px-1 text-sm outline-none" /> : <Link onClick={onNavigate} href={`/notes?folder=${folder.id}`} className={`flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 text-sm ${selectedFolderId === folder.id ? "bg-[var(--surface-selected)] font-medium text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}><Folder className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{folder.name}</span></Link>}
          <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] opacity-100 transition-opacity ui-transition hover:bg-[var(--surface-hover)] focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100" aria-label={`管理文件夹 ${folder.name}`}><MoreHorizontal className="size-3.5" /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => { setRenaming(folder.id); setRenameValue(folder.name); }}>重命名</DropdownMenuItem><DropdownMenuItem onSelect={() => { setCreatingIn(folder.id); setFolderName(""); setExpanded((current) => new Set([...current, folder.id])); }}>新建子文件夹</DropdownMenuItem><DropdownMenuItem asChild><form action={createNoteInFolder}><input type="hidden" name="folder_id" value={folder.id} /><button className="w-full text-left">新建笔记</button></form></DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>
        {isOpen ? <>{renderBranch(folder.id, depth + 1)}{directNotes.map((note) => <Link key={note.id} draggable onDragStart={(event) => beginDrag(event, { kind: "note", id: note.id, title: note.title || "无标题笔记", parentId: note.folder_id })} onDragEnd={clearDrag} onClick={onNavigate} href={`/notes/${note.id}`} className={`flex h-8 cursor-grab items-center gap-1.5 truncate rounded-[var(--radius-md)] pr-2 text-sm transition-[background-color,color] ui-transition active:cursor-grabbing ${dragging?.kind === "note" && dragging.id === note.id ? "opacity-45" : ""} ${activeNoteId === note.id ? "bg-[var(--surface-selected)] font-medium text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`} style={{ paddingLeft: `${37 + depth * 16}px` }}><FileText className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{note.title || "无标题笔记"}</span></Link>)}{createFolderRow(folder.id, depth + 1)}</> : null}
      </div>;
    })}
    {parentId === null ? <>{(notesByFolder.get(null) ?? []).map((note) => <Link key={note.id} draggable onDragStart={(event) => beginDrag(event, { kind: "note", id: note.id, title: note.title || "无标题笔记", parentId: note.folder_id })} onDragEnd={clearDrag} onClick={onNavigate} href={`/notes/${note.id}`} className={`flex h-8 cursor-grab items-center gap-1.5 truncate rounded-[var(--radius-md)] px-3 text-sm transition-[background-color,color] ui-transition active:cursor-grabbing ${dragging?.kind === "note" && dragging.id === note.id ? "opacity-45" : ""} ${activeNoteId === note.id ? "bg-[var(--surface-selected)] font-medium text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}><FileText className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{note.title || "无标题笔记"}</span></Link>)}{createFolderRow(null, 0)}</> : null}
  </>;
  return <div className="flex h-full min-h-0 flex-col bg-[var(--surface-sidebar)] px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
    <div className="mb-4 flex items-center justify-between px-1"><span className="text-sm font-semibold">Notes</span><form action={createNoteInFolder}><input type="hidden" name="folder_id" value={selectedFolderId ?? ""} /><Button size="icon-xs" aria-label="新建笔记"><FilePlus2 /></Button></form></div>
    <nav className="space-y-0.5" aria-label="笔记视图"><Link onClick={onNavigate} href="/notes" className={`flex h-8 items-center gap-2 rounded px-2 text-sm ${pathname === "/notes" && !selectedFolderId ? "bg-[var(--surface-selected)] font-medium text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}><FileText className="size-3.5" />全部笔记</Link><form action={openDailyNote}><button className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">今日日记</button></form><Link onClick={onNavigate} href="/notes?view=favorites" className="flex h-8 items-center gap-2 rounded px-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"><Star className="size-3.5" />收藏</Link><Link onClick={onNavigate} href="/notes?view=recent" className="flex h-8 items-center gap-2 rounded px-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"><Clock3 className="size-3.5" />最近编辑</Link></nav>
    <div className="mt-6 flex min-h-0 flex-1 flex-col"><div className="mb-2 flex items-center justify-between px-2"><span className="text-[11px] font-medium text-[var(--text-tertiary)]">文件</span><button type="button" onClick={() => { setCreatingIn(null); setFolderName(""); }} className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)]" aria-label="新建根文件夹"><FolderPlus className="size-3.5" /></button></div><div onDragOver={(event) => { if (!canDropOn(null)) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget("root"); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node) && dropTarget === "root") setDropTarget(null); }} onDrop={(event) => { if (event.target !== event.currentTarget) return; event.preventDefault(); moveDraggedTo(null, "根目录"); }} className={`workspace-scroll min-h-0 flex-1 overflow-y-auto rounded-[var(--radius-sm)] ${dropTarget === "root" ? "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] ring-1 ring-inset ring-[var(--accent)]" : ""}`}>{renderBranch(null)}</div></div>
    <Link onClick={onNavigate} href="/notes/trash" className="mt-4 flex h-8 items-center gap-2 rounded px-2 text-sm text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)]"><Trash2 className="size-3.5" />回收站</Link>
    <p aria-live="polite" className="sr-only">{notice}</p>
  </div>;
}

export function NotesWorkspaceShell({ folders, notes, children }: { folders: NotesNavigatorFolder[]; notes: NotesNavigatorNote[]; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navigatorWidth, setNavigatorWidth] = useState(272);
  const navigatorWidthRef = useRef(272);
  const pathname = usePathname();
  const isEditorRoute = /^\/notes\/[0-9a-f-]{36}$/i.test(pathname);
  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        const stored = Number(localStorage.getItem("personal-os:notes-navigator-width:v1"));
        if (Number.isFinite(stored)) {
          const next = Math.max(220, Math.min(360, stored));
          navigatorWidthRef.current = next;
          setNavigatorWidth(next);
        }
      } catch { /* Keep the useful default when storage is unavailable. */ }
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);
  const resizeNavigator = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = navigatorWidthRef.current;
    const onMove = (move: PointerEvent) => {
      const next = Math.max(220, Math.min(360, startWidth + move.clientX - startX));
      navigatorWidthRef.current = next;
      setNavigatorWidth(next);
    };
    const onEnd = () => {
      try { localStorage.setItem("personal-os:notes-navigator-width:v1", String(Math.round(navigatorWidthRef.current))); } catch { /* no-op */ }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
  };
  const resetNavigator = () => {
    navigatorWidthRef.current = 272;
    setNavigatorWidth(272);
    try { localStorage.removeItem("personal-os:notes-navigator-width:v1"); } catch { /* no-op */ }
  };
  return <section className="flex h-[calc(var(--app-viewport-height)-var(--toolbar-height)-var(--tab-bar-height))] min-h-0 overflow-hidden bg-[var(--surface-canvas)]">
    <aside style={{ width: navigatorWidth }} className="relative hidden h-full shrink-0 border-r md:block"><NotesNavigator folders={folders} notes={notes} /><button type="button" onPointerDown={resizeNavigator} onDoubleClick={resetNavigator} className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none" aria-label="调整笔记导航宽度，双击恢复默认" /></aside>
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="left" showCloseButton className="w-[min(86vw,320px)] p-0"><SheetTitle className="sr-only">Notes 文件</SheetTitle><NotesNavigator folders={folders} notes={notes} onNavigate={() => setMobileOpen(false)} /></SheetContent></Sheet>
    <div className="relative min-w-0 flex-1">{isEditorRoute ? null : <button type="button" onClick={() => setMobileOpen(true)} className="absolute left-3 top-3 z-10 flex h-8 items-center gap-1.5 rounded-full bg-[var(--surface-canvas)] px-3 text-xs font-medium text-[var(--text-secondary)] shadow-sm md:hidden" aria-label="打开笔记文件"><Menu className="size-4" />文件夹</button>}{children}</div>
  </section>;
}

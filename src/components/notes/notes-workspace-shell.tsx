"use client";
import {useDeclaredFormDraft,readDeclaredDraftFields} from "@/features/workflow-continuity/draft-adapters";
import {useDraftResumeOpeners,isDraftHostReady,type DraftResumeTarget} from "@/features/workflow-continuity/draft-resume";
import {OrdinaryOutcomeRecovery} from "@/components/workflow-continuity/ordinary-outcome-recovery";
import {DraftRecoveryStatus} from "@/components/workflow-continuity/draft-recovery-status";
import { workbenchDragMime } from "@/features/workbench/contracts";
import { publishOperationReceipt } from "@/features/workbench/operation-contracts";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { announceNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
import { useEffect,useLayoutEffect,useCallback, useId, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Clock3, FilePlus2, FileText, Folder, FolderPlus, Menu, MoreHorizontal, Search, Sparkles, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { createFolder, createNoteInFolder, moveFolder, moveNote, renameFolder } from "@/features/notes/actions";
import { openDailyNote } from "@/features/notes/actions";
import { notesDragAutoScrollDelta } from "@/features/notes/drag-auto-scroll";
import { canMoveFolderTo, expandedFolderPath, visibleExpandedFolders } from "@/features/notes/folder-tree";
import { isNotesSearchShortcut } from "@/features/notes/search-shortcut";
import { lastNotesListSessionKey, notesListHref } from "@/features/notes/navigation";
import { loadWorkspaceSession } from "@/lib/workspace-session";
import { filterNotesByMetadata, createNoteFolderPathResolver } from "@/features/notes/local-search";
import { captureWorkspaceScope, useWorkspaceResourceLease } from "@/lib/workspace-resource-cache";
import { notesWorkspaceResource } from "@/features/notes/workspace-resource";
import { NotesNavigationContext } from "./notes-navigation-context";
import { releaseMobileBackLayerForNavigation } from "@/lib/mobile/use-mobile-back-layer";

export type NotesNavigatorFolder = { id: string; name: string; parent_id: string | null };
export type NotesNavigatorNote = { id: string; title: string; folder_id: string | null; updated_at: string; content_origin: string | null; mutation_revision?: number };
type DraggedNavigatorItem = { kind: "note" | "folder"; id: string; title: string; parentId: string | null; mutation_revision?: number };

type NavigatorResume={target:DraftResumeTarget;nonce:string;current:()=>boolean};
function NotesNavigator({ folders, notes, onNavigate,resumeRequest }: {resumeRequest?:NavigatorResume|null; folders: NotesNavigatorFolder[]; notes: NotesNavigatorNote[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const notesResource=useWorkspaceResourceLease(notesWorkspaceResource);
  const searchParams = useSearchParams();
  const router = useRouter();
  const closeForNavigation = (href: string) => {
    if (!onNavigate) return;
    // A route change owns the history step; drawer cleanup must not race it with Back.
    if (new URL(href, window.location.href).href !== window.location.href) releaseMobileBackLayerForNavigation("sheet");
    onNavigate();
  };
  const selectedFolderId = searchParams.get("folder");
  const activeView = searchParams.get("view");
  const [expanded, setExpanded] = useState<Set<string>>(() => expandedFolderPath(folders, selectedFolderId));
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined);
  const [folderName, setFolderName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [navigatorQuery, setNavigatorQuery] = useState("");
  const hostRef=useRef<HTMLDivElement>(null),createBusy=useRef(false),renameBusy=useRef(false),renameCancelled=useRef(false);
  const {formRef:createFormRef,...createDraft}=useDeclaredFormDraft({operation:"note.folder-create",id:creatingIn??"root",href:"/notes",label:"新建笔记文件夹"},fields=>{if(typeof fields.name==="string")setFolderName(fields.name);});
  const {formRef:renameFormRef,...renameDraft}=useDeclaredFormDraft(renaming?{operation:"note.folder-rename",id:renaming,href:"/notes",label:"笔记文件夹重命名"}:undefined,fields=>{if(typeof fields.name==="string")setRenameValue(fields.name);});
  const openDraft=useCallback((target:DraftResumeTarget)=>{setNavigatorQuery("");if(target.kind==="note.folder-create"){const parent=target.id==="root"?null:folders.find(folder=>folder.id===target.id)?.id;if(parent===undefined)return false;setCreatingIn(parent);if(parent)setExpanded(ids=>new Set([...ids,...expandedFolderPath(folders,parent)]));return;}if(target.kind==="note.folder-rename"){const folder=folders.find(folder=>folder.id===target.id);if(!folder)return false;renameCancelled.current=false;if(renaming!==folder.id){setRenameValue(folder.name);setRenaming(folder.id);}setExpanded(ids=>new Set([...ids,...expandedFolderPath(folders,folder.parent_id)]));return;}return false;},[folders,renaming]);
  useDraftResumeOpeners([{kind:"note.folder-create",id:"root"},...folders.flatMap(folder=>[{kind:"note.folder-create" as const,id:folder.id},{kind:"note.folder-rename" as const,id:folder.id}])],openDraft,{priority:1,ready:()=>isDraftHostReady(hostRef.current)});
  const openDraftRef=useRef(openDraft);useLayoutEffect(()=>{openDraftRef.current=openDraft;},[openDraft]);
  useEffect(()=>{if(!resumeRequest)return;const frame=requestAnimationFrame(()=>{if(resumeRequest.current())openDraftRef.current(resumeRequest.target);});return()=>cancelAnimationFrame(frame);},[resumeRequest]);
  const quickOpenInput = useRef<HTMLInputElement>(null);
  const quickOpenResults = useRef<HTMLDivElement>(null);
  const quickOpenId = useId();
  const [optimisticMove, setOptimisticMove] = useState<{ item: DraggedNavigatorItem; targetId: string | null } | null>(null);
  const [dragging, setDragging] = useState<DraggedNavigatorItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | "root" | null>(null);
  const [notice, setNotice] = useState("");
  const [, startTransition] = useTransition();
  const treeScrollRef = useRef<HTMLDivElement>(null);
  const dragPointerYRef = useRef<number | null>(null);
  const dragScrollFrameRef = useRef<number | null>(null);
  const activeNoteId = /^\/notes\/([0-9a-f-]{36})$/i.exec(pathname)?.[1] ?? null;

  const stopDragAutoScroll = () => {
    dragPointerYRef.current = null;
    if (dragScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(dragScrollFrameRef.current);
      dragScrollFrameRef.current = null;
    }
  };
  const updateDragAutoScroll = (pointerY: number) => {
    dragPointerYRef.current = pointerY;
    if (dragScrollFrameRef.current !== null) return;
    const scroll = () => {
      const container = treeScrollRef.current;
      const currentPointerY = dragPointerYRef.current;
      if (!container || currentPointerY === null) { stopDragAutoScroll(); return; }
      const bounds = container.getBoundingClientRect();
      const delta = notesDragAutoScrollDelta(currentPointerY, bounds.top, bounds.bottom);
      if (!delta) { dragScrollFrameRef.current = null; return; }
      const before = container.scrollTop;
      container.scrollTop += delta;
      if (container.scrollTop === before) { dragScrollFrameRef.current = null; return; }
      dragScrollFrameRef.current = window.requestAnimationFrame(scroll);
    };
    dragScrollFrameRef.current = window.requestAnimationFrame(scroll);
  };
  useEffect(() => () => stopDragAutoScroll(), []);

  const navigatorFolders = useMemo(() => optimisticMove?.item.kind === "folder"
    ? folders.map((folder) => folder.id === optimisticMove.item.id ? { ...folder, parent_id: optimisticMove.targetId } : folder)
    : folders, [folders, optimisticMove]);
  const navigatorNotes = useMemo(() => optimisticMove?.item.kind === "note"
    ? notes.map((note) => note.id === optimisticMove.item.id ? { ...note, folder_id: optimisticMove.targetId } : note)
    : notes, [notes, optimisticMove]);
  const navigatorMatches = useMemo(
    () => filterNotesByMetadata(navigatorNotes, navigatorFolders, navigatorQuery, 60),
    [navigatorFolders, navigatorNotes, navigatorQuery],
  );
  const resolveFolderPath = useMemo(() => createNoteFolderPathResolver(navigatorFolders), [navigatorFolders]);
  const searchActive = Boolean(navigatorQuery.trim());

  const children = useMemo(() => {
    const map = new Map<string | null, NotesNavigatorFolder[]>();
    navigatorFolders.forEach((folder) => { const siblings = map.get(folder.parent_id); if (siblings) siblings.push(folder); else map.set(folder.parent_id, [folder]); });
    return map;
  }, [navigatorFolders]);
  const notesByFolder = useMemo(() => {
    const map = new Map<string | null, NotesNavigatorNote[]>();
    navigatorNotes.forEach((note) => { const siblings = map.get(note.folder_id); if (siblings) siblings.push(note); else map.set(note.folder_id, [note]); });
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
    const name=folderName.trim();if(!name){setCreatingIn(undefined);return;}if(createBusy.current||createDraft.uncertain||!createFormRef.current)return;
    if(!createDraft.isCurrent())return;const node=createFormRef.current,raw=createDraft.capture(),current=createDraft.captureGuard(),parent=creatingIn;const form=new FormData();form.set("name",name);if(parent)form.set("parent_id",parent);createBusy.current=true;
    startTransition(async()=>{try{await createFolder(form);if(!current())return;const unchanged=JSON.stringify(readDeclaredDraftFields(node,"note.folder-create"))===JSON.stringify(raw);createDraft.complete(raw,{reset:true});setExpanded(ids=>new Set(parent?[...ids,parent]:ids));if(unchanged){setCreatingIn(undefined);setFolderName("");}else setNotice("原文件夹已创建，当前新名称尚未保存。");router.refresh();}catch{if(current()){createDraft.markUncertain();setNotice("文件夹创建结果尚未确认，原名称已保留，请先核对文件树。");}}finally{createBusy.current=false;}});
  };
  const commitRename=(folder:NotesNavigatorFolder)=>{
    if(!renameDraft.isCurrent()||renameCancelled.current||renameBusy.current||renameDraft.uncertain||!renameFormRef.current)return;const name=renameValue.trim();if(!name||name===folder.name){setRenaming(null);return;}const node=renameFormRef.current,raw=renameDraft.capture(),current=renameDraft.captureGuard(),form=new FormData();form.set("folder_id",folder.id);form.set("name",name);renameBusy.current=true;
    startTransition(async()=>{try{await renameFolder(form);if(!current())return;const unchanged=JSON.stringify(readDeclaredDraftFields(node,"note.folder-rename"))===JSON.stringify(raw);renameDraft.complete(raw);if(unchanged)setRenaming(null);else setNotice("原名称已保存，当前新输入尚未保存。");router.refresh();}catch{if(current()){renameDraft.markUncertain();setNotice("重命名结果尚未确认，原输入已保留，请先核对文件树。");}}finally{renameBusy.current=false;}});
  };
  const createNoteForFolder = (folder: NotesNavigatorFolder) => {
    const form = new FormData();
    form.set("folder_id", folder.id);
    setNotice(`正在在文件夹“${folder.name}”中新建笔记`);
    // A native form nested in DropdownMenuItem is unmounted as the Radix menu
    // closes, so invoke the Server Action directly instead.
    announceNavigationIntent();
    startTransition(async () => { await createNoteInFolder(form); });
  };
  const beginDrag = (event: React.DragEvent<HTMLElement>, item: DraggedNavigatorItem) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
    if(item.kind==="note")event.dataTransfer.setData(workbenchDragMime,JSON.stringify({kind:"note",id:item.id}));
    setDragging(item);
    setNotice(`正在移动${item.kind === "note" ? "笔记" : "文件夹"}“${item.title}”`);
  };
  const canDropOn = (targetId: string | null) => {
    if (!dragging) return false;
    if (dragging.kind === "note") return dragging.parentId !== targetId;
    return targetId ? canMoveFolderTo(navigatorFolders, dragging.id, targetId) : dragging.parentId !== null;
  };
  const clearDrag = () => { stopDragAutoScroll(); setDragging(null); setDropTarget(null); };
  const moveDraggedTo = (targetId: string | null, targetName: string) => {
    const item = dragging;
    if (!item || !canDropOn(targetId)) { clearDrag(); return; }
    setOptimisticMove({ item, targetId });
    if (targetId) setExpanded((current) => new Set([...current, targetId]));
    clearDrag();
    setNotice(`正在将“${item.title}”移至${targetName}…`);
    const form = new FormData();
    form.set(item.kind === "note" ? "note_id" : "folder_id", item.id);
    form.set(item.kind === "note" ? "folder_id" : "parent_id", targetId ?? "");
    if(item.kind === "note")form.set("expected_revision",String(item.mutation_revision ?? ""));
    const current=captureWorkspaceScope();
    startTransition(async () => {
      let committed=false;
      try {
        if (item.kind === "note") {const result=await moveNote(form);if(current()&&result.receiptId)publishOperationReceipt({receiptId:result.receiptId,message:"笔记归属已更新"});} else await moveFolder(form);
        committed=true;
        if(!current())return;
        notesResource.invalidate();
        await notesResource.revalidate({force:true});
        if(!current())return;
        setOptimisticMove(null);
        setNotice(`已将“${item.title}”移至${targetName}`);
      } catch {
        if(!current())return;
        if(committed){setNotice(`已将“${item.title}”移至${targetName}；列表暂未重新读取，请稍后重试。`);return;}
        setOptimisticMove(null);
        setNotice(`未能移动“${item.title}”，已恢复原位置。`);
      }
    });
  };
  const createFolderRow = (parentId: string | null, depth: number) => creatingIn === parentId ? <form ref={createFormRef} {...createDraft.attributes} onInputCapture={createDraft.capture} onChangeCapture={createDraft.capture} onSubmit={(event) => { event.preventDefault(); createFolderInline(); }} className="flex h-11 md:h-[30px] items-center gap-1.5" style={{ paddingLeft: `${12 + depth * 16}px` }}>
    <Folder className="size-3.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
    <input name="name" maxLength={120} aria-label="文件夹名称" autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setCreatingIn(undefined); } }} placeholder="新建文件夹" className="h-6 min-w-0 flex-1 border-b border-[var(--accent)] bg-transparent px-0 text-[12.5px] text-[var(--text-primary)] outline-none" />
  </form> : null;
  const renderBranch = (parentId: string | null, depth = 0): React.ReactNode => <>
    {(children.get(parentId) ?? []).map((folder) => {
      const childFolders = children.get(folder.id) ?? [];
      const directNotes = notesByFolder.get(folder.id) ?? [];
      const expandable = childFolders.length > 0 || directNotes.length > 0;
      const isOpen = openFolders.has(folder.id);
      return <div key={folder.id}>
        <div draggable={renaming !== folder.id} onDragStart={(event) => beginDrag(event, { kind: "folder", id: folder.id, title: folder.name, parentId: folder.parent_id })} onDragEnd={clearDrag} onDragOver={(event) => { if (!dragging) return; updateDragAutoScroll(event.clientY); if (!canDropOn(folder.id)) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(folder.id); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node) && dropTarget === folder.id) setDropTarget(null); }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); moveDraggedTo(folder.id, `文件夹“${folder.name}”`); }} className={`group flex h-11 md:h-[30px] items-center rounded-[8px] transition-colors ${dropTarget === folder.id ? "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--accent)_32%,transparent)]" : ""}`} style={{ paddingLeft: `${depth * 16}px` }}>
          <button type="button" onClick={() => expandable && toggleFolder(folder.id)} aria-label={`${isOpen ? "收起" : "展开"} ${folder.name}`} aria-expanded={expandable ? isOpen : undefined} className="pressable flex size-11 shrink-0 md:size-5 items-center justify-center rounded-[6px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">{expandable ? isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" /> : null}</button>
          {renaming === folder.id ? <form ref={renameFormRef} {...renameDraft.attributes} onInputCapture={renameDraft.capture} onChangeCapture={renameDraft.capture} onSubmit={event=>{event.preventDefault();commitRename(folder);}} className="min-w-0 flex-1"><input name="name" maxLength={120} aria-label="文件夹名称" autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onBlur={() => commitRename(folder)} onKeyDown={(event) => { if (event.key === "Enter") commitRename(folder); if (event.key === "Escape") {renameCancelled.current=true;setRenaming(null);} }} className="h-6 w-full min-w-0 border-b border-[var(--accent)] bg-transparent px-1 text-[12.5px] text-[var(--text-primary)] outline-none" /></form> : <Link  onNavigate={() => closeForNavigation(`/notes?folder=${folder.id}`)} href={`/notes?folder=${folder.id}`} className={`flex h-11 min-w-0 md:h-7 flex-1 items-center gap-1.5 rounded-[7px] px-1.5 text-[12.5px] transition-colors ui-transition ${selectedFolderId === folder.id ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)] [&>svg]:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`}><Folder  className="size-3.5 shrink-0" aria-hidden="true" /><span  className="truncate">{folder.name}</span></Link>}
          <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="pressable flex size-11 shrink-0 md:size-6 items-center justify-center rounded-[7px] text-[var(--text-tertiary)] opacity-100 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" aria-label={`管理文件夹 ${folder.name}`}><MoreHorizontal className="size-3.5" /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => { renameCancelled.current=false;setRenaming(folder.id); setRenameValue(folder.name); }}>重命名</DropdownMenuItem><DropdownMenuItem onSelect={() => { setCreatingIn(folder.id); setFolderName(""); setExpanded((current) => new Set([...current, folder.id])); }}>新建子文件夹</DropdownMenuItem><DropdownMenuItem onSelect={() => createNoteForFolder(folder)}>新建笔记</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>
        {isOpen ? <>{renderBranch(folder.id, depth + 1)}{directNotes.map((note) => <Link key={note.id} draggable onDragStart={(event) => beginDrag(event, { kind: "note", id: note.id, title: note.title || "无标题笔记", parentId: note.folder_id, mutation_revision: note.mutation_revision })} onDragEnd={clearDrag} onNavigate={() => closeForNavigation(`/notes/${note.id}`)} href={`/notes/${note.id}`} className={`pressable flex h-11 md:h-[30px] cursor-grab items-center gap-1.5 truncate rounded-[8px] pr-2 text-[12.5px] active:cursor-grabbing ${dragging?.kind === "note" && dragging.id === note.id ? "opacity-45" : ""} ${activeNoteId === note.id ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)] [&>svg]:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`} style={{ paddingLeft: `${37 + depth * 16}px` }}><FileText className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{note.title || "无标题笔记"}</span>{note.content_origin === "ai_generated" ? <Sparkles className="size-3 shrink-0 text-[var(--ai-accent)]" aria-label="AI 生成" /> : null}</Link>)}{createFolderRow(folder.id, depth + 1)}</> : null}
      </div>;
    })}
    {parentId === null ? <>{(notesByFolder.get(null) ?? []).map((note) => <Link key={note.id} draggable onDragStart={(event) => beginDrag(event, { kind: "note", id: note.id, title: note.title || "无标题笔记", parentId: note.folder_id, mutation_revision: note.mutation_revision })} onDragEnd={clearDrag} onNavigate={() => closeForNavigation(`/notes/${note.id}`)} href={`/notes/${note.id}`} className={`pressable flex h-11 md:h-[30px] cursor-grab items-center gap-1.5 truncate rounded-[8px] px-3 text-[12.5px] active:cursor-grabbing ${dragging?.kind === "note" && dragging.id === note.id ? "opacity-45" : ""} ${activeNoteId === note.id ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)] [&>svg]:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`}><FileText className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{note.title || "无标题笔记"}</span>{note.content_origin === "ai_generated" ? <Sparkles className="size-3 shrink-0 text-[var(--ai-accent)]" aria-label="AI 生成" /> : null}</Link>)}{createFolderRow(null, 0)}</> : null}
  </>;

  return <div ref={hostRef} className="notes-navigator flex h-full min-h-0 flex-col bg-[var(--surface-sidebar)] px-2.5 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.625rem)]">
    <div className="flex min-h-8 items-center justify-between px-1"><span className="text-[13.5px] font-semibold tracking-[-0.012em] text-[var(--text-primary)]">笔记</span><form onSubmit={announceNavigationIntent} action={createNoteInFolder} className={onNavigate ? "mr-[52px]" : undefined}><input type="hidden" name="folder_id" value={selectedFolderId ?? ""} /><Button size="icon-xs" className={onNavigate ? "size-11" : undefined} aria-label="新建笔记"><FilePlus2 /></Button></form></div>
    <label className="relative mt-2.5 block">
      <span className="sr-only">快速打开</span>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
      <input
        ref={quickOpenInput}
        aria-label="快速打开"
        aria-controls={searchActive ? quickOpenId : undefined}
        aria-describedby={searchActive ? `${quickOpenId}-hint` : undefined}
        value={navigatorQuery}
        onChange={(event) => setNavigatorQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
          if (event.key === "Escape" && navigatorQuery) { event.preventDefault(); event.stopPropagation(); setNavigatorQuery(""); }
          if (!searchActive) return;
          const choices = quickOpenResults.current?.querySelectorAll<HTMLAnchorElement>("a[href]");
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            choices?.[event.key === "ArrowDown" ? 0 : choices.length - 1]?.focus();
          } else if (event.key === "Enter" && choices?.length) { event.preventDefault(); choices[0].click(); }
        }}
        autoComplete="off"
        placeholder="快速打开…"
        className="ui-field min-h-11 w-full rounded-[9px] border border-transparent bg-[var(--surface-control)] pl-8 pr-11 text-[16px] text-[var(--text-primary)] outline-none transition-[background-color,box-shadow] ui-transition placeholder:text-[var(--text-tertiary)] hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)] md:min-h-8 md:pr-8 md:text-[12px]"
      />
      {navigatorQuery ? <button type="button" onClick={() => { setNavigatorQuery(""); quickOpenInput.current?.focus(); }} className="pressable absolute right-0 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] md:right-1 md:size-6" aria-label="清空切换搜索"><X className="size-3" aria-hidden="true" /></button> : null}
    </label>
    <nav className="mt-2.5 space-y-px" aria-label="笔记视图">
      <Link onNavigate={() => closeForNavigation("/notes")} href="/notes" className={`pressable flex h-11 md:h-[30px] items-center gap-2 rounded-[8px] px-2 text-[12.5px] ${pathname === "/notes" && !selectedFolderId && !activeView ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)] [&>svg]:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`}><FileText className="size-3.5" />全部笔记</Link>
      <form onSubmit={announceNavigationIntent} action={openDailyNote}><button className="pressable flex h-11 md:h-[30px] w-full items-center gap-2 rounded-[8px] px-2 text-left text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">今日日记</button></form>
      <Link onNavigate={() => closeForNavigation("/notes?view=favorites")} href="/notes?view=favorites" className={`pressable flex h-11 md:h-[30px] items-center gap-2 rounded-[8px] px-2 text-[12.5px] ${activeView === "favorites" ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)] [&>svg]:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`}><Star className="size-3.5" />收藏</Link>
      <Link onNavigate={() => closeForNavigation("/notes?view=recent")} href="/notes?view=recent" className={`pressable flex h-11 md:h-[30px] items-center gap-2 rounded-[8px] px-2 text-[12.5px] ${activeView === "recent" ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)] [&>svg]:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`}><Clock3 className="size-3.5" />最近编辑</Link>
    </nav>
    <div className="mt-4.5 flex min-h-0 flex-1 flex-col">
      <div className="mb-1.5 flex h-6 items-center justify-between px-2">
        <span className="text-[12px] font-medium text-[var(--text-tertiary)]">{searchActive ? `匹配 · ${navigatorMatches.length}` : "文件"}</span>
        {!searchActive ? <button type="button" onClick={() => { setCreatingIn(null); setFolderName(""); }} className="pressable inline-flex size-11 items-center justify-center rounded-[6px] p-1 md:size-7 text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]" aria-label="新建根文件夹"><FolderPlus className="size-3.5" /></button> : null}
      </div>
      {searchActive ? (
        <div id={quickOpenId} ref={quickOpenResults} aria-label="快速打开结果" className="workspace-scroll min-h-0 flex-1 overflow-y-auto" onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setNavigatorQuery(""); quickOpenInput.current?.focus(); return; }
          const choices = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>("a[href]"));
          const index = choices.indexOf(event.target as HTMLAnchorElement);
          if (index < 0) return;
          if (event.key === "ArrowUp" && index === 0) { event.preventDefault(); quickOpenInput.current?.focus(); }
          else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const next = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : Math.max(0, Math.min(choices.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
            choices[next]?.focus();
          }
        }}>
          <p id={`${quickOpenId}-hint`} className="px-2 pb-2 text-[12px] leading-5 text-[var(--text-secondary)]"><span className="hidden md:inline">↑ ↓ 选择 · Enter 打开 · </span>Esc 回到文件树</p>
          {navigatorMatches.length ? navigatorMatches.map((note) => (
            <Link
              key={note.id}
              href={`/notes/${note.id}`}
              onNavigate={() => { setNavigatorQuery(""); closeForNavigation(`/notes/${note.id}`); }}
              transitionTypes={["note-open"]}
              scroll={false}
              className={`notes-quick-open-result group flex min-h-11 items-center gap-2 rounded-[8px] px-2 py-1.5 transition-colors ui-transition focus-visible:bg-[var(--surface-selected)] md:min-h-10 ${activeNoteId === note.id ? "bg-[var(--surface-selected)] text-[var(--text-primary)] [&>svg]:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`}
            >
              <FileText className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium">{note.title || "无标题笔记"}</span>
                <span className="mt-0.5 block truncate text-[12px] text-[var(--text-tertiary)]">{resolveFolderPath(note.folder_id)}</span>
              </span>
              {note.content_origin === "ai_generated" ? <Sparkles className="size-3 shrink-0 text-[var(--ai-accent)]" aria-label="AI 生成" /> : null}
            </Link>
          )) : <p className="px-2 py-5 text-center text-[12px] leading-5 text-[var(--text-tertiary)]">没有匹配的笔记。<br />按 Esc 回到文件树。</p>}
        </div>
      ) : (
        <div ref={treeScrollRef} onDragOver={(event) => { if (!dragging) return; updateDragAutoScroll(event.clientY); if (event.target !== event.currentTarget || !canDropOn(null)) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget("root"); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) { stopDragAutoScroll(); if (dropTarget === "root") setDropTarget(null); } }} onDrop={(event) => { if (event.target !== event.currentTarget) return; event.preventDefault(); moveDraggedTo(null, "根目录"); }} className={`workspace-scroll min-h-0 flex-1 overflow-y-auto rounded-[8px] ${dropTarget === "root" ? "bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]" : ""}`}>{renderBranch(null)}</div>
      )}
    </div>
    {creatingIn!==undefined&&createDraft.uncertain?<OrdinaryOutcomeRecovery key={createDraft.key} uncertain target={createDraft.target} href="/notes" captureGuard={createDraft.captureGuard} onCompared={createDraft.adoptComparedBaseline}/>:renaming&&renameDraft.uncertain?<OrdinaryOutcomeRecovery key={renameDraft.key} uncertain target={renameDraft.target} href="/notes" captureGuard={renameDraft.captureGuard} onCompared={renameDraft.adoptComparedBaseline}/>:null}
    {creatingIn!==undefined?<DraftRecoveryStatus dirty={createDraft.dirty} restored={createDraft.restored} recoveryUnavailable={createDraft.recoveryUnavailable}/>:renaming?<DraftRecoveryStatus dirty={renameDraft.dirty} restored={renameDraft.restored} recoveryUnavailable={renameDraft.recoveryUnavailable}/>:null}
    <Link onNavigate={() => closeForNavigation("/notes/trash")} href="/notes/trash" className={`pressable mt-3 flex h-11 md:h-[30px] items-center gap-2 rounded-[8px] px-2 text-[12.5px] ${pathname === "/notes/trash" ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)] [&>svg]:text-[var(--accent)]" : "text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"}`}><Trash2 className="size-3.5" />回收站</Link>
    <p aria-live="polite" className="sr-only">{notice}</p>
  </div>;
}

export function NotesWorkspaceShell({ folders, notes, children, documentView }: { folders: NotesNavigatorFolder[]; notes: NotesNavigatorNote[]; children: React.ReactNode; documentView?: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [draftRequest,setDraftRequest]=useState<NavigatorResume|null>(null);
  useDraftResumeOpeners([{kind:"note.folder-create",id:"root"},...folders.flatMap(folder=>[{kind:"note.folder-create" as const,id:folder.id},{kind:"note.folder-rename" as const,id:folder.id}])],(target,context)=>{setDraftRequest({target,nonce:crypto.randomUUID(),current:context.current});setMobileOpen(true);});
  const [navigatorWidth, setNavigatorWidth] = useState(272);
  const navigatorWidthRef = useRef(272);
  const pathname = usePathname();
  const isEditorRoute = documentView ?? /^\/notes\/[0-9a-f-]{36}$/i.test(pathname);
  const router = useRouter();
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (!isNotesSearchShortcut(event) || document.querySelector('[role="dialog"], [role="menu"]')) return;
      event.preventDefault();
      announceNavigationIntent();
      const input = document.getElementById("notes-library-search");
      if (input instanceof HTMLInputElement) { input.focus(); return; }
      const href = notesListHref(loadWorkspaceSession(lastNotesListSessionKey));
      const url = new URL(href, window.location.origin);
      url.searchParams.set("focusSearch", "1");
      router.push(`${url.pathname}${url.search}`);
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [router]);
  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem("personal-os:notes-navigator-width:v1");
        const stored = saved?.trim() ? Number(saved) : NaN;
        if (Number.isFinite(stored) && stored > 0) {
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
  return <NotesNavigationContext value={() => setMobileOpen(true)}><section className="notes-workspace-shell flex h-[calc(var(--app-viewport-height)-var(--toolbar-height)-var(--tab-bar-height))] min-h-0 overflow-hidden bg-[var(--surface-canvas)]">
    <aside style={{ width: navigatorWidth }} className="notes-navigator-panel relative hidden h-full shrink-0 border-r border-[var(--separator)] bg-[var(--surface-sidebar)] md:block"><NotesNavigator folders={folders} notes={notes} /><button type="button" onPointerDown={resizeNavigator} onDoubleClick={resetNavigator} className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none" aria-label="调整笔记导航宽度，双击恢复默认" /></aside>
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="left" showCloseButton className="notes-navigation-sheet w-[min(88vw,340px)] p-0"><SheetTitle className="sr-only">笔记文件</SheetTitle><NotesNavigator resumeRequest={draftRequest} folders={folders} notes={notes} onNavigate={() => setMobileOpen(false)} /></SheetContent></Sheet>
    <div className="relative min-w-0 flex-1">{isEditorRoute ? null : <button type="button" onClick={() => setMobileOpen(true)} className="notes-folder-trigger pressable absolute left-3 top-2 z-10 flex h-11 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--separator)] bg-[var(--surface-canvas)] px-3 text-[13px] font-medium text-[var(--text-secondary)] md:hidden" aria-label="打开笔记文件"><Menu className="size-4" />文件夹</button>}{children}</div>
  </section></NotesNavigationContext>;
}

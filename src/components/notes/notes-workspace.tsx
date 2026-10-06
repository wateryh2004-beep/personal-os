"use client";

import { useWorkspaceResourceLease } from "@/lib/workspace-resource-cache";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { unstable_rethrow, useRouter, useSearchParams } from "next/navigation";
import { FilePlus2, LoaderCircle, MoreHorizontal, Pin, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FolderPicker } from "@/components/notes/folder-picker";
import {
  createNoteInFolder,
  moveNote,
  renameNote,
  toggleNotePinned,
  trashNote,
} from "@/features/notes/actions";
import type { NoteListItem } from "@/features/notes/types";
import { formatNoteTimestamp } from "@/features/notes/utils";
import { filterNotesByMetadata, mergeNoteSearchResults, noteFolderPath, splitNoteSearchHighlights } from "@/features/notes/local-search";
import { useWorkspaceScrollRestoration } from "@/components/shared/use-workspace-scroll-restoration";
import { notesWorkspaceResource as notesResource } from "@/features/notes/workspace-resource";
import { useActionFeedback } from "@/components/shared/action-feedback";
import { useNotesSearch } from "@/features/notes/use-notes-search";
import { lastNotesListSessionKey, lastNotesListTtlMs } from "@/features/notes/navigation";
import { saveWorkspaceSession } from "@/lib/workspace-session";
import { useNotesListing } from "@/features/notes/use-notes-listing";
import { NotesChildFolders, NotesFolderBreadcrumbs } from "@/components/notes/notes-folder-navigation";

type Folder = { id: string; name: string; parent_id: string | null };
type WorkspaceState = "ready" | "base" | "unavailable";

function folderPath(note: NoteListItem, folders: Folder[]) {
  return noteFolderPath(note.folder_id, folders);
}

function SearchText({ text, query }: { text: string; query: string }) {
  return splitNoteSearchHighlights(text, query).map((part, index) => part.matched
    ? <mark key={index} className="rounded-[2px] bg-[var(--accent-soft)] text-inherit">{part.text}</mark>
    : part.text);
}

function AskNotesButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable inline-flex h-8 items-center gap-1.5 rounded-[9px] px-2 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
    >
      <Sparkles className="size-3.5 text-[var(--accent)]" aria-hidden="true" />
      问笔记库
    </button>
  );
}

function NoteRow({
  note,
  folders,
  timezone,
  renaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onRename,
  onMove,
  onTogglePinned,
  onTrash,
  showExcerpt,
  searchQuery,
  onOpen,
  pending,
}: {
  note: NoteListItem;
  folders: Folder[];
  timezone: string;
  renaming: boolean;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onRename: (note: NoteListItem) => void;
  onMove: (note: NoteListItem) => void;
  onTogglePinned: (note: NoteListItem) => void;
  onTrash: (note: NoteListItem) => void;
  showExcerpt: boolean;
  searchQuery: string;
  onOpen: () => void;
  pending: boolean;
}) {
  return (
    <article className="notes-list-row group relative -mx-2 rounded-[var(--radius-md)] px-2 transition-[background-color] ui-transition after:absolute after:bottom-0 after:left-2 after:right-2 after:h-px after:bg-[var(--separator)] last:after:hidden hover:bg-[var(--surface-hover)]">
      <div className="notes-list-row-content relative min-h-16 py-3 pr-12 md:pr-10">
        <div className="flex min-w-0 items-center gap-2">
          {renaming ? (
            <input
              autoFocus
              disabled={pending}
              maxLength={240}
              value={renameValue}
              onChange={(event) => onRenameChange(event.target.value)}
              onBlur={onRenameCommit}
              onKeyDown={(event) => {
                if (event.key === "Enter") onRenameCommit();
                if (event.key === "Escape") onRenameCancel();
              }}
              className="h-7 min-w-0 flex-1 border-b border-[var(--accent)] bg-transparent px-0 text-[14px] font-medium leading-[22px] text-[var(--text-primary)] outline-none"
              aria-label="笔记标题"
            />
          ) : (
            <Link
              href={`/notes/${note.id}`}
              data-note-result
              onClick={onOpen}
              className="truncate text-[14px] font-medium leading-[22px] text-[var(--text-primary)] transition-colors ui-transition hover:text-[var(--accent)] focus-visible:outline-none focus-visible:after:rounded-[var(--radius-md)] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[var(--accent)] after:absolute after:inset-0 after:content-['']"
            >
              <SearchText text={note.title || "无标题笔记"} query={searchQuery} />
            </Link>
          )}
          {note.content_origin === "ai_generated" ? (
            <Sparkles className="size-3 shrink-0 text-[var(--ai-accent)]" aria-label="AI 生成" />
          ) : null}
          {note.pinned_at ? (
            <Pin className="size-3 shrink-0 text-[var(--text-tertiary)]" aria-label="已收藏" />
          ) : null}
        </div>
        {showExcerpt && note.excerpt ? (
          <p className="mt-1 line-clamp-2 max-w-[66ch] text-[13px] leading-[22px] text-[var(--text-secondary)]">
            <SearchText text={note.excerpt} query={searchQuery} />
          </p>
        ) : null}
        <p className="mt-1 truncate text-[12px] leading-5 text-[var(--text-tertiary)]">
          <SearchText text={folderPath(note, folders)} query={searchQuery} />{!showExcerpt ? ` · ${formatNoteTimestamp(note.updated_at, timezone)}` : null}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute right-0 top-2 z-10 max-md:size-11 text-[var(--text-tertiary)] ui-more-action"
            aria-label={`管理 ${note.title || "无标题笔记"}`}
            disabled={pending}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onRename(note)}>重命名</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onMove(note)}>移动到…</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onTogglePinned(note)}>
            {note.pinned_at ? "取消收藏" : "加入收藏"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => onTrash(note)}>
            移到回收站
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
}: {
  notes: NoteListItem[];
  folders: Folder[];
  timezone: string;
  state: WorkspaceState;
  selectedFolder: Folder | null;
  initialView: "all" | "favorites" | "recent";
  dailyError: boolean;
  initialHasMore: boolean;
}) {

  const notesWorkspaceResource = useWorkspaceResourceLease(notesResource);
  const router = useRouter();
  const feedback = useActionFeedback();
  const params = useSearchParams();
  // Keep input updates urgent while Next applies native-history changes in a
  // transition. A different URL query (including Back/Forward) remains authoritative.
  const routeQuery = params.get("q") ?? "";
  const [searchDraft, setSearchDraft] = useState({ routeQuery, value: routeQuery });
  if (searchDraft.routeQuery !== routeQuery) setSearchDraft({ routeQuery, value: routeQuery });
  const query = searchDraft.routeQuery === routeQuery ? searchDraft.value : routeQuery;
  const scope = params.get("scope") === "all" ? "all" : "context";
  const searchInput = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const mutationInFlight = useRef(false);
  const [renaming, setRenaming] = useState<NoteListItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moving, setMoving] = useState<NoteListItem | null>(null);
  const [pending, startTransition] = useTransition();
  const listing = useNotesListing({ notes, hasMore: initialHasMore, folderId: selectedFolder?.id, view: initialView });
  const normalizedQuery = query.trim();
  const activeFolderId = scope === "context" ? selectedFolder?.id ?? null : null;
  const { results, state: searchState, retry: retrySearch } = useNotesSearch(normalizedQuery, activeFolderId);
  const listScrollRef = useWorkspaceScrollRestoration("notes:list", normalizedQuery ? searchState !== "loading" : listing.loaded);

  const allNotes = listing.notes;

  const localSearchResults = useMemo(() => {
    if (!normalizedQuery) return [];
    const candidates = activeFolderId ? allNotes.filter((note) => note.folder_id === activeFolderId) : allNotes;
    return filterNotesByMetadata(candidates, folders, normalizedQuery, 30);
  }, [activeFolderId, allNotes, folders, normalizedQuery]);
  const combinedSearchResults = useMemo(
    () => mergeNoteSearchResults(localSearchResults, results ?? [], 50, normalizedQuery, folders),
    [localSearchResults, results, normalizedQuery, folders],
  );

  const visible = useMemo(() => {
    if (normalizedQuery) return combinedSearchResults;
    return allNotes;
  }, [allNotes, combinedSearchResults, normalizedQuery]);

  const title = selectedFolder?.name ?? (initialView === "favorites" ? "收藏" : initialView === "recent" ? "最近编辑" : "全部笔记");
  const childFolders = selectedFolder ? folders.filter((folder) => folder.parent_id === selectedFolder.id) : [];

  useEffect(() => {
    if (params.get("focusSearch") !== "1") return;
    searchInput.current?.focus({ preventScroll: true });
    const url = new URL(window.location.href);
    url.searchParams.delete("focusSearch");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [params]);

  const resultLinks = () => Array.from(resultsRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-note-result]") ?? []);
  const rememberList = () => {
    const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    saveWorkspaceSession(lastNotesListSessionKey, { href }, lastNotesListTtlMs);
    saveWorkspaceSession(`scroll:notes:list:${window.location.pathname}${window.location.search}`, { scrollTop: listScrollRef.current?.scrollTop ?? 0 });
  };

  const syncSearchUrl = (nextQuery: string, nextScope: "context" | "all") => {
    // Next copies its internal history state itself. Passing __NA would bypass
    // its useSearchParams synchronization and leave the controlled input stale.
    const url = new URL(window.location.href);
    if (nextQuery.trim()) url.searchParams.set("q", nextQuery);
    else url.searchParams.delete("q");
    if (nextScope === "all") url.searchParams.set("scope", "all");
    else url.searchParams.delete("scope");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const updateQuery = (value: string) => {
    setSearchDraft({ routeQuery, value });
    syncSearchUrl(value, scope);
  };

  const mutate = (action: (form: FormData) => Promise<void>, form: FormData, message: string, onSuccess?: () => void) => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setMutationError(null);
    startTransition(async () => {
      try {
        await action(form);
        onSuccess?.();
        feedback.show({ message, tone: "success" });
        notesWorkspaceResource.invalidate();
        // A refresh failure must not relabel an acknowledged write as failed.
        void notesWorkspaceResource.revalidate().catch(() => {
          setMutationError("操作已保存，列表暂时未能更新。请重新读取列表。");
        });
      } catch (error) {
        unstable_rethrow(error);
        setMutationError("操作未能确认。请重新读取列表核对结果，再重试；重命名和移动中的输入会保留。");
      } finally {
        mutationInFlight.current = false;
      }
    });
  };

  const refreshList = () => {
    startTransition(async () => {
      try {
        await notesWorkspaceResource.revalidate({ force: true });
        setMutationError(null);
      } catch {
        setMutationError("列表暂时无法读取。请检查网络后重试，已有笔记仍保留。");
      }
    });
  };

  const newNoteForm = (className?: string, compact = false) => (
    <form action={createNoteInFolder} className={className}>
      <input type="hidden" name="folder_id" value={selectedFolder?.id ?? ""} />
      <Button type="submit" size="sm" aria-label="新建笔记" title="新建笔记" className={compact ? "max-md:size-11 max-md:px-0" : undefined}><FilePlus2 aria-hidden="true" /><span className={compact ? "hidden md:inline" : undefined}>新建笔记</span></Button>
    </form>
  );

  return (
    <main
      ref={listScrollRef}
      data-searching={Boolean(normalizedQuery)}
      className="notes-library notes-list-workspace workspace-scroll h-full overflow-y-auto bg-[var(--surface-canvas)] px-4 pb-24 pt-16 sm:px-7 md:pb-6 md:pt-7 lg:px-10"
    >
      <div className="mx-auto max-w-[748px]">
        {state === "base" ? (
          <p role="status" className="mb-4 rounded-[9px] bg-amber-50 px-3 py-2 text-[11.5px] leading-5 text-amber-800">
            笔记基础功能正在使用兼容模式；文件夹与链接功能会在迁移启用后完整可用。
          </p>
        ) : null}
        {state === "unavailable" ? (
          <p role="alert" className="mb-4 rounded-[9px] bg-red-50 px-3 py-2 text-[11.5px] leading-5 text-[var(--danger)]">
            暂时无法读取笔记库。请检查 Supabase 环境变量、登录状态和数据库连接。
          </p>
        ) : null}
        {dailyError ? (
          <p role="alert" className="mb-5 border-l-2 border-[var(--danger)] px-3 py-1.5 text-[12px] leading-5 text-[var(--danger)]">
            今日日记暂时未能创建。刷新后重试；已有日记不会被删除。
          </p>
        ) : null}

        {mutationError ? <div role="alert" className="mb-4 rounded-[9px] bg-red-50 px-3 py-2 text-[11.5px] leading-5 text-[var(--danger)]">
          <p>{mutationError}</p>
          <Button variant="ghost" size="sm" disabled={pending} onClick={refreshList}>重新读取列表</Button>
        </div> : null}
        {pending ? <p role="status" className="mb-2 text-[11px] text-[var(--text-tertiary)]">正在处理，请稍候…</p> : null}

        {selectedFolder ? <NotesFolderBreadcrumbs folder={selectedFolder} folders={folders} /> : null}
        <header className="flex min-h-11 flex-wrap items-end gap-2.5">
          <div className="mr-auto min-w-0">
            <h1 className="page-title break-words">
              {title}
            </h1>
            <p className="mt-1 text-[12px] leading-5 tabular-nums text-[var(--text-tertiary)]">
              {normalizedQuery ? `${visible.length} 个搜索结果` : <>{childFolders.length ? `${childFolders.length} 个子文件夹 · ` : ""}{!listing.loaded ? "正在读取当前层级…" : `${selectedFolder ? "当前层级 " : ""}${listing.hasMore ? "已加载 " : ""}${visible.length} 篇笔记`}</>}
            </p>
          </div>
          <AskNotesButton onClick={() => router.push("/notes/ask")} />
          {newNoteForm("shrink-0", true)}
        </header>
        <div aria-live="polite" className="mt-1 min-h-5 text-[12px] leading-5 text-[var(--text-secondary)]">
          {!normalizedQuery && listing.loaded && listing.error ? <>列表暂未更新，保留上次内容。<button type="button" onClick={listing.retry} className="ml-2 rounded-[var(--radius-sm)] text-[var(--accent)] underline underline-offset-2">重试更新</button></> : !normalizedQuery && listing.refreshing ? "正在更新列表…" : null}
        </div>

        <div className="mt-5 flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">搜索内容</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
            <input
              id="notes-library-search"
              ref={searchInput}
              autoComplete="off"
              maxLength={200}
              title="搜索笔记（/）"
              aria-keyshortcuts="/"
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                if (event.key === "Escape" && query) { event.preventDefault(); updateQuery(""); }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  const links = resultLinks();
                  if (links.length) { event.preventDefault(); links[event.key === "ArrowDown" ? 0 : links.length - 1].focus(); }
                }
                if (event.key === "Enter" && normalizedQuery) { event.preventDefault(); resultLinks()[0]?.click(); }
              }}
              placeholder={selectedFolder && scope === "context" ? `搜索内容 · ${selectedFolder.name}` : "搜索内容 · 标题、正文或文件夹"}
              className="h-11 w-full rounded-[10px] border border-transparent bg-[var(--surface-control)] pl-8 pr-16 text-[16px] md:h-9 md:text-[13px] text-[var(--text-primary)] outline-none transition-[background-color,box-shadow] ui-transition placeholder:text-[var(--text-tertiary)] hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]"
            />
            <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
              {!query ? <kbd aria-hidden="true" className="mr-2 hidden text-[12px] text-[var(--text-tertiary)] md:inline">/</kbd> : null}
              {searchState === "loading" ? <LoaderCircle className="size-3.5 animate-spin text-[var(--text-tertiary)]" aria-label="正在补充全文搜索结果" /> : null}
              {query ? (
                <button type="button" onClick={() => { updateQuery(""); searchInput.current?.focus(); }} className="pressable inline-flex size-11 md:size-7 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]" aria-label="清空搜索">
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </span>
          </label>
          {selectedFolder ? (
            <button
              type="button"
              onClick={() => {
                const next = scope === "context" ? "all" : "context";
                syncSearchUrl(query, next);
              }}
              className="pressable h-11 md:h-9 shrink-0 rounded-[9px] px-2.5 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-control)] hover:text-[var(--text-primary)]"
            >
              {scope === "context" ? "当前文件夹" : "全部笔记"}
            </button>
          ) : null}
        </div>
        {normalizedQuery ? (
          <p role={searchState === "error" ? "status" : undefined} className={`mt-1.5 min-h-4 text-[10.5px] leading-4 ${searchState === "error" ? "text-[var(--danger)]" : "text-[var(--text-tertiary)]"}`}>
            {searchState === "error"
              ? "搜索暂未更新，已保留可用结果。"
              : searchState === "loading"
                ? "已先显示本地匹配，正在补充正文全文结果…"
                : null}
            {searchState === "error" ? <button type="button" onClick={retrySearch} className="pressable ml-2 min-h-8 rounded-[6px] px-1 text-[var(--accent)] underline underline-offset-2">重试全文搜索</button> : null}
          </p>
        ) : null}

        {!normalizedQuery ? <NotesChildFolders folders={childFolders} /> : null}
        {selectedFolder && !normalizedQuery && visible.length ? <h2 className="mt-5 text-[12px] font-medium text-[var(--text-secondary)]">当前层级的笔记</h2> : null}
        {visible.length ? (
          <section ref={resultsRef} aria-label={normalizedQuery ? "搜索结果" : "笔记列表"} className="mt-4.5" onKeyDown={(event) => {
            if ((event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) || !(event.target instanceof HTMLAnchorElement) || !event.target.hasAttribute("data-note-result")) return;
            const links = resultLinks();
            const current = links.indexOf(event.target);
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const next = current + (event.key === "ArrowDown" ? 1 : -1);
              if (next < 0) searchInput.current?.focus();
              else links[Math.min(next, links.length - 1)]?.focus();
            }
            if (event.key === "Escape") { event.preventDefault(); searchInput.current?.focus(); }
          }}>
            {visible.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                folders={folders}
                timezone={timezone}
                renaming={renaming?.id === note.id}
                renameValue={renaming?.id === note.id ? renameValue : note.title}
                onRenameChange={setRenameValue}
                onRenameCommit={() => {
                  if (renaming?.id !== note.id) return;
                  const nextTitle = renameValue.trim();
                  if (nextTitle && nextTitle !== note.title) {
                    const form = new FormData();
                    form.set("note_id", note.id);
                    form.set("title", nextTitle);
                    mutate(renameNote, form, "笔记标题已保存", () => setRenaming(null));
                  } else {
                    setRenaming(null);
                  }
                }}
                onRenameCancel={() => setRenaming(null)}
                onRename={(item) => {
                  setRenaming(item);
                  setRenameValue(item.title);
                }}
                onMove={setMoving}
                onTogglePinned={(item) => {
                  const form = new FormData();
                  form.set("note_id", item.id);
                  mutate(toggleNotePinned, form, item.pinned_at ? "已取消收藏" : "已加入收藏");
                }}
                onTrash={(item) => {
                  const form = new FormData();
                  form.set("note_id", item.id);
                  mutate(trashNote, form, "已移到回收站");
                }}
                searchQuery={normalizedQuery}
                onOpen={rememberList}
                showExcerpt={Boolean(normalizedQuery)}
                pending={pending}
              />
            ))}
          </section>
        ) : !normalizedQuery && !listing.loaded ? (
          <div role={listing.error ? "alert" : "status"} className="py-10 text-center text-[13px] leading-6 text-[var(--text-secondary)]">
            {listing.error ? <>当前范围暂时无法读取，已有笔记仍保留。<div className="mt-2"><Button variant="outline" onClick={listing.retry}>重试读取</Button></div></> : "正在读取笔记…"}
          </div>
        ) : (
          <div className={childFolders.length && !normalizedQuery ? "py-7 text-left" : "py-16 text-center"}>
            <p className="text-[13.5px] font-medium tracking-[-0.006em] text-[var(--text-primary)]">
              {normalizedQuery ? "没有找到匹配的笔记" : childFolders.length ? "当前层级没有直接存放的笔记" : "这里还没有笔记"}
            </p>
            <p className={`${childFolders.length && !normalizedQuery ? "" : "mx-auto "}mt-1 max-w-sm text-[12px] leading-5 text-[var(--text-secondary)]`}>
              {normalizedQuery ? "换一个关键词，或切换搜索范围。" : childFolders.length ? "打开上方子文件夹继续浏览，也可以在此新建笔记。" : "新建一篇笔记，直接开始写。"}
            </p>
            <div className={`mt-3.5 flex ${childFolders.length && !normalizedQuery ? "" : "justify-center"}`}>
              {normalizedQuery ? <Button variant="outline" size="sm" onClick={() => updateQuery("")}>清空搜索</Button> : newNoteForm()}
            </div>
          </div>
        )}
        {!normalizedQuery && listing.hasMore ? (
          <div className="py-5 text-center">
            {listing.error ? <p role="alert" className="mb-1 text-[12px] text-[var(--danger)]">加载失败，已显示的笔记仍保留。</p> : null}
            <Button variant="ghost" disabled={listing.loadingMore} onClick={() => void listing.loadMore()}>
              {listing.loadingMore ? <LoaderCircle className="animate-spin" /> : null}
              {listing.loadingMore ? "正在加载…" : listing.error ? "重试加载更多" : "加载更多"}
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog open={Boolean(moving)} onOpenChange={(open) => { if (!open && !pending) setMoving(null); }}>
        {moving ? <DialogContent showCloseButton={!pending} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onPointerDownOutside={(event) => { if (pending) event.preventDefault(); }}>
          <DialogHeader><DialogTitle>移动笔记</DialogTitle><DialogDescription>为“{moving.title || "无标题笔记"}”选择文件夹。</DialogDescription></DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              mutate(moveNote, form, "笔记位置已更新", () => setMoving(null));
            }}
            className="grid gap-2"
          >
            <input type="hidden" name="note_id" value={moving.id} />
            {mutationError ? <div role="alert" className="mb-3 text-[11px] leading-5 text-[var(--danger)]"><p>{mutationError}</p><Button type="button" variant="ghost" size="sm" disabled={pending} onClick={refreshList}>重新读取列表</Button></div> : null}
            <FolderPicker folders={folders} initialFolderId={moving.folder_id} idPrefix={`move-${moving.id}`} label="移动到" />
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setMoving(null)}>取消</Button>
              <Button type="submit" disabled={pending}>{pending ? "正在移动…" : "移动"}</Button>
            </div>
          </form>
        </DialogContent> : null}
      </Dialog>

    </main>
  );
}

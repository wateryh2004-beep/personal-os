"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { unstable_rethrow, useRouter, useSearchParams } from "next/navigation";
import { FilePlus2, LoaderCircle, MoreHorizontal, Pin, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { filterNotesByMetadata, mergeNoteSearchResults, noteFolderPath } from "@/features/notes/local-search";
import { useWorkspaceScrollRestoration } from "@/components/shared/use-workspace-scroll-restoration";
import { notesWorkspaceResource } from "@/features/notes/workspace-resource";
import { useActionFeedback } from "@/components/shared/action-feedback";

type Folder = { id: string; name: string; parent_id: string | null };
type WorkspaceState = "ready" | "base" | "unavailable";

function folderPath(note: NoteListItem, folders: Folder[]) {
  return noteFolderPath(note.folder_id, folders);
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
  pending: boolean;
}) {
  return (
    <article className="group relative -mx-2 rounded-[10px] px-2 transition-[background-color] ui-transition after:absolute after:bottom-0 after:left-2 after:right-2 after:h-px after:bg-[var(--separator)] last:after:hidden hover:bg-[var(--surface-hover)]">
      <div className="relative py-[13px] pr-10">
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
              className="h-7 min-w-0 flex-1 border-b border-[var(--accent)] bg-transparent px-0 text-[13.5px] font-medium tracking-[-0.008em] text-[var(--text-primary)] outline-none"
              aria-label="笔记标题"
            />
          ) : (
            <Link
              href={`/notes/${note.id}`}
              className="truncate text-[13.5px] font-medium tracking-[-0.008em] text-[var(--text-primary)] transition-colors ui-transition hover:text-[var(--accent)] after:absolute after:inset-0 after:content-['']"
            >
              {note.title || "无标题笔记"}
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
          <p className="mt-1 line-clamp-2 max-w-[66ch] text-[12px] leading-[1.55] text-[var(--text-secondary)]">
            {note.excerpt}
          </p>
        ) : null}
        <p className="mt-1 truncate text-[10.5px] leading-4 text-[var(--text-tertiary)]">
          {folderPath(note, folders)} · {formatNoteTimestamp(note.updated_at, timezone)}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute right-1 top-[10px] z-10 text-[var(--text-tertiary)] md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-visible:opacity-100"
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
  const router = useRouter();
  const feedback = useActionFeedback();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [scope, setScope] = useState<"context" | "all">(params.get("scope") === "all" ? "all" : "context");
  const [remoteSearch, setRemoteSearch] = useState<{ key: string; results: NoteListItem[]; state: "idle" | "error" } | null>(null);
  const [additional, setAdditional] = useState<NoteListItem[]>([]);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const mutationInFlight = useRef(false);
  const loadMoreInFlight = useRef(false);
  const [renaming, setRenaming] = useState<NoteListItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moving, setMoving] = useState<NoteListItem | null>(null);
  const [pending, startTransition] = useTransition();
  const requestRef = useRef<AbortController | null>(null);
  const listScrollRef = useWorkspaceScrollRestoration("notes:list");
  const normalizedQuery = query.trim();
  const activeFolderId = scope === "context" ? selectedFolder?.id ?? null : null;
  const searchKey = JSON.stringify([activeFolderId, normalizedQuery, searchAttempt]);
  const currentSearch = remoteSearch?.key === searchKey ? remoteSearch : null;
  const results = currentSearch?.results ?? null;
  const searchState = !normalizedQuery ? "idle" : currentSearch?.state ?? "loading";

  const allNotes = useMemo(() => {
    const byId = new Map(notes.map((note) => [note.id, note]));
    additional.forEach((note) => byId.set(note.id, note));
    return [...byId.values()];
  }, [additional, notes]);

  const localSearchResults = useMemo(() => {
    if (!normalizedQuery) return [];
    const candidates = activeFolderId ? allNotes.filter((note) => note.folder_id === activeFolderId) : allNotes;
    return filterNotesByMetadata(candidates, folders, normalizedQuery, 30);
  }, [activeFolderId, allNotes, folders, normalizedQuery]);
  const combinedSearchResults = useMemo(
    () => mergeNoteSearchResults(localSearchResults, results ?? [], 50),
    [localSearchResults, results],
  );

  const visible = useMemo(() => {
    if (normalizedQuery) return combinedSearchResults;
    if (selectedFolder) return allNotes.filter((note) => note.folder_id === selectedFolder.id);
    if (initialView === "favorites") return allNotes.filter((note) => note.pinned_at);
    if (initialView === "recent") {
      return [...allNotes]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 50);
    }
    return allNotes;
  }, [allNotes, combinedSearchResults, initialView, normalizedQuery, selectedFolder]);

  const title = selectedFolder?.name ?? (initialView === "favorites" ? "收藏" : initialView === "recent" ? "最近编辑" : "全部笔记");

  useEffect(() => {
    if (!normalizedQuery) {
      requestRef.current?.abort();
      return;
    }
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    const timer = window.setTimeout(async () => {
      try {
        const search = new URLSearchParams({ q: normalizedQuery, limit: "30" });
        if (activeFolderId) search.set("folderId", activeFolderId);
        const response = await fetch(`/api/notes/search?${search}`, { signal: controller.signal });
        const body = (await response.json()) as { results?: NoteListItem[]; error?: string };
        if (!response.ok) throw new Error(body.error);
        if (!controller.signal.aborted) {
          setRemoteSearch({ key: searchKey, results: body.results ?? [], state: "idle" });
        }
      } catch {
        if (!controller.signal.aborted) {
          setRemoteSearch({ key: searchKey, results: [], state: "error" });
        }
      }
    }, 160);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [activeFolderId, normalizedQuery, searchKey]);

  const syncSearchUrl = (nextQuery: string, nextScope: "context" | "all") => {
    const url = new URL(window.location.href);
    if (nextQuery.trim()) url.searchParams.set("q", nextQuery);
    else url.searchParams.delete("q");
    if (nextScope === "all") url.searchParams.set("scope", "all");
    else url.searchParams.delete("scope");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const updateQuery = (value: string) => {
    setQuery(value);
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

  const loadMore = async () => {
    if (loadMoreInFlight.current) return;
    loadMoreInFlight.current = true;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const response = await fetch(`/api/notes/list?offset=${allNotes.length}&limit=50`);
      const body = (await response.json()) as { notes?: NoteListItem[]; hasMore?: boolean };
      if (!response.ok) throw new Error();
      setAdditional((current) => [...current, ...(body.notes ?? [])]);
      setHasMore(Boolean(body.hasMore));
    } catch {
      setLoadMoreError(true);
    } finally {
      loadMoreInFlight.current = false;
      setLoadingMore(false);
    }
  };

  const newNoteForm = (className?: string) => (
    <form action={createNoteInFolder} className={className}>
      <input type="hidden" name="folder_id" value={selectedFolder?.id ?? ""} />
      <Button type="submit" size="sm"><FilePlus2 />新建笔记</Button>
    </form>
  );

  return (
    <main
      ref={listScrollRef}
      className="notes-library workspace-scroll h-full overflow-y-auto bg-[var(--surface-canvas)] px-4 pb-6 pt-14 sm:px-7 md:pt-7 lg:px-10"
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

        <header className="flex min-h-11 flex-wrap items-end gap-2.5">
          <div className="mr-auto min-w-0">
            <h1 className="truncate text-[27px] font-semibold leading-[1.08] tracking-[-0.042em] text-[var(--text-primary)]">
              {title}
            </h1>
            <p className="mt-0.5 text-[10.5px] leading-4 tabular-nums text-[var(--text-tertiary)]">
              {normalizedQuery ? `${visible.length} 个搜索结果` : `${visible.length} 篇笔记`}
            </p>
          </div>
          <AskNotesButton onClick={() => router.push("/notes/ask")} />
          {newNoteForm("hidden md:block")}
        </header>

        <div className="mt-5 flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">搜索笔记</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
            <input
              autoComplete="off"
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Escape" && query) updateQuery(""); }}
              placeholder={selectedFolder && scope === "context" ? `在「${selectedFolder.name}」中搜索…` : "搜索标题、正文或文件夹…"}
              className="h-9 w-full rounded-[10px] border border-transparent bg-[var(--surface-control)] pl-8 pr-16 text-[13px] text-[var(--text-primary)] outline-none transition-[background-color,box-shadow] ui-transition placeholder:text-[var(--text-tertiary)] hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]"
            />
            <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
              {searchState === "loading" ? <LoaderCircle className="size-3.5 animate-spin text-[var(--text-tertiary)]" aria-label="正在补充全文搜索结果" /> : null}
              {query ? (
                <button type="button" onClick={() => updateQuery("")} className="pressable inline-flex size-7 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]" aria-label="清空搜索">
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
                setScope(next);
                syncSearchUrl(query, next);
              }}
              className="pressable h-9 shrink-0 rounded-[9px] px-2.5 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-control)] hover:text-[var(--text-primary)]"
            >
              {scope === "context" ? "当前文件夹" : "全部笔记"}
            </button>
          ) : null}
        </div>
        {normalizedQuery ? (
          <p role={searchState === "error" ? "status" : undefined} className={`mt-1.5 min-h-4 text-[10.5px] leading-4 ${searchState === "error" ? "text-[var(--danger)]" : "text-[var(--text-tertiary)]"}`}>
            {searchState === "error"
              ? "全文搜索暂时不可用，当前仍显示已加载内容中的标题和文件夹匹配。"
              : searchState === "loading"
                ? "已先显示本地匹配，正在补充正文全文结果…"
                : "标题匹配优先，正文命中随后补充。"}
            {searchState === "error" ? <button type="button" onClick={() => setSearchAttempt((value) => value + 1)} className="pressable ml-2 min-h-8 rounded-[6px] px-1 text-[var(--accent)] underline underline-offset-2">重试全文搜索</button> : null}
          </p>
        ) : null}

        {visible.length ? (
          <section className="mt-4.5">
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
                showExcerpt={Boolean(normalizedQuery)}
                pending={pending}
              />
            ))}
            {!normalizedQuery && hasMore ? (
              <div className="py-5 text-center">
                {loadMoreError ? <p role="alert" className="mb-1 text-[11px] text-[var(--danger)]">加载失败，已显示的笔记仍保留。</p> : null}
                <Button variant="ghost" disabled={loadingMore} onClick={() => void loadMore()}>
                  {loadingMore ? <LoaderCircle className="animate-spin" /> : null}
                  {loadingMore ? "正在加载…" : loadMoreError ? "重试加载更多" : "加载更多"}
                </Button>
              </div>
            ) : null}
          </section>
        ) : (
          <div className="py-16 text-center">
            <p className="text-[13.5px] font-medium tracking-[-0.006em] text-[var(--text-primary)]">
              {normalizedQuery ? "没有找到匹配的笔记" : "这里还没有笔记"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-5 text-[var(--text-secondary)]">
              {normalizedQuery ? "换一个关键词，或切换搜索范围。" : "新建一篇笔记，直接开始写。"}
            </p>
            <div className="mt-3.5 flex justify-center">
              {normalizedQuery ? <Button variant="outline" size="sm" onClick={() => updateQuery("")}>清空搜索</Button> : newNoteForm()}
            </div>
          </div>
        )}
      </div>

      {moving ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/10 p-4 backdrop-blur-[2px]">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              mutate(moveNote, form, "笔记位置已更新", () => setMoving(null));
            }}
            className="w-full max-w-sm rounded-[18px] border border-[var(--separator)] bg-[var(--material-thick)] p-4 shadow-[var(--shadow-dialog)] backdrop-blur-2xl backdrop-saturate-[180%]"
          >
            <input type="hidden" name="note_id" value={moving.id} />
            {mutationError ? <div role="alert" className="mb-3 text-[11px] leading-5 text-[var(--danger)]"><p>{mutationError}</p><Button type="button" variant="ghost" size="sm" disabled={pending} onClick={refreshList}>重新读取列表</Button></div> : null}
            <FolderPicker folders={folders} initialFolderId={moving.folder_id} idPrefix={`move-${moving.id}`} label="移动到" />
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setMoving(null)}>取消</Button>
              <Button type="submit" disabled={pending}>{pending ? "正在移动…" : "移动"}</Button>
            </div>
          </form>
        </div>
      ) : null}

      <form action={createNoteInFolder} className="fixed bottom-[calc(var(--tab-bar-height)+1rem)] right-4 z-30 md:hidden">
        <input type="hidden" name="folder_id" value={selectedFolder?.id ?? ""} />
        <button
          type="submit"
          aria-label="新建笔记"
          className="pressable flex size-12 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_8px_22px_rgba(0,113,227,.18),0_1px_3px_rgba(0,0,0,.08)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)]"
        >
          <FilePlus2 className="size-5" aria-hidden="true" />
        </button>
      </form>
    </main>
  );
}

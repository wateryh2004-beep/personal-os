"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import { ListTree, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { filterOutlineItems, type MarkdownOutlineItem } from "@/features/notes/editor/markdown-outline";

/** Presence may retain this DOM during exit; the owner supplies each opening's query. */
function OutlineContents({ items, listRef, onSelect, onClose, onListChange, query, onQueryChange }: {
  items: MarkdownOutlineItem[];
  listRef: Ref<HTMLUListElement>;
  onSelect: (item: MarkdownOutlineItem) => void;
  onClose: () => void;
  onListChange: () => void;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => filterOutlineItems(items, query), [items, query]);
  useEffect(() => { onListChange(); }, [matches, onListChange]);
  const buttons = () => Array.from(resultsRef.current?.querySelectorAll<HTMLButtonElement>("[data-outline-index]") ?? []);
  return <>
    <div className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-[var(--separator)] pl-2">
      <span className="text-[13px] font-semibold text-[var(--text-primary)]">目录</span>
      <button type="button" onClick={onClose} aria-label="关闭目录" className="pressable inline-flex size-11 shrink-0 items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] md:size-8"><X aria-hidden="true" className="size-4" /></button>
    </div>
    <label className="relative block shrink-0">
      <span className="sr-only">筛选目录</span>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-secondary)]" />
      <input ref={inputRef} aria-label="筛选目录" value={query} onChange={(event) => onQueryChange(event.target.value)} autoComplete="off" placeholder="查找章节…" onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const choices = buttons();
          (event.key === "ArrowDown" ? choices[0] : choices.at(-1))?.focus();
        } else if (event.key === "Enter" && matches.length) {
          event.preventDefault(); onSelect(matches[0]);
        }
      }} className="ui-field min-h-11 w-full rounded-[9px] border border-[var(--border-subtle)] bg-[var(--surface-control)] pl-9 pr-11 text-[16px] text-[var(--text-primary)] md:min-h-9 md:text-[13px]" />
      {query ? <button type="button" aria-label="清空目录筛选" onClick={() => { onQueryChange(""); inputRef.current?.focus(); }} className="pressable absolute right-0 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] md:right-1 md:size-8"><X aria-hidden="true" className="size-3.5" /></button> : null}
    </label>
    <p role="status" className="shrink-0 px-2 text-[12px] text-[var(--text-secondary)]">{query.trim() ? `${matches.length} / ${items.length} 个章节` : `${items.length} 个章节`}</p>
    <div ref={resultsRef} className="workspace-scroll min-h-0 overflow-y-auto overscroll-contain px-0.5 pb-1" onKeyDown={(event) => {
      if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      const choices = buttons();
      const index = choices.indexOf(event.target as HTMLButtonElement);
      if (index < 0) return;
      if (event.key === "ArrowUp" && index === 0) { event.preventDefault(); inputRef.current?.focus(); }
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : Math.max(0, Math.min(choices.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
        choices[next]?.focus();
      }
    }}>
      {!items.length ? <p className="px-2 py-3 text-[13px] leading-6 text-[var(--text-secondary)]">还没有章节标题。以 # 章节名开头的行会出现在这里。</p> : !matches.length ? <p className="px-2 py-3 text-[13px] leading-6 text-[var(--text-secondary)]">没有匹配的章节。换一个关键词，或清空筛选。</p> : <ul ref={listRef} className="space-y-0.5">{matches.map((item) => <li key={item.index}>
        <button type="button" data-outline-index={item.index} onClick={() => onSelect(item)} title={item.text} style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }} className="note-outline-item block min-h-11 w-full break-words rounded-[8px] py-2 pr-2 text-left text-[13px] leading-5 text-[var(--text-secondary)] transition-colors ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] md:min-h-8 md:py-1.5">{item.text || "无文字标题"}</button>
      </li>)}</ul>}
    </div>
    <p className="hidden shrink-0 border-t border-[var(--separator)] px-2 pt-2 text-[12px] text-[var(--text-secondary)] md:block">↑ ↓ 选择 · Enter 跳转 · Esc 关闭</p>
  </>;
}

export function NoteOutline({ open, onOpenChange, disabled, items, listRef, onSelect, onListChange, portalContainer }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
  items: MarkdownOutlineItem[];
  listRef: Ref<HTMLUListElement>;
  onSelect: (item: MarkdownOutlineItem) => boolean;
  onListChange: () => void;
  portalContainer?: HTMLElement | null;
}) {
  const jumped = useRef(false);
  // An externally controlled reopen can reverse Presence without invoking
  // onOpenChange. Clear the previous opening's focus exception before paint.
  useLayoutEffect(() => { if (open) jumped.current = false; }, [open]);
  const [filter, setFilter] = useState({ open, query: "" });
  // A semantic close/open resets filtering even when Radix retains the same
  // content node for a reversible exit animation. Controlled external changes
  // reconcile before rendering children, rather than waiting for unmount/effect.
  if (filter.open !== open) setFilter({ open, query: open ? "" : filter.query });
  const changeOpen = (next: boolean) => {
    // Keep the outgoing filtered view stable while it exits; a new semantic
    // opening resets it before that same retained node becomes interactive.
    setFilter({ open: next, query: next ? "" : filter.query });
    if (next) jumped.current = false;
    onOpenChange(next);
  };
  return <Popover open={open} onOpenChange={changeOpen}>
    <PopoverTrigger asChild><button type="button" disabled={disabled} aria-label="目录" className={`pressable inline-flex size-[30px] shrink-0 items-center justify-center rounded-[7px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-35 ${open ? "bg-[var(--accent-soft)] text-[var(--accent)]" : ""}`}><ListTree aria-hidden="true" className="size-4" /></button></PopoverTrigger>
    <PopoverContent align="end" portalContainer={portalContainer} aria-label="笔记目录" className="note-outline-surface w-[min(320px,calc(100vw-2rem))] max-h-[min(440px,var(--radix-popover-content-available-height))]" onOpenAutoFocus={(event) => {
      if (event.target instanceof HTMLElement) { event.preventDefault(); event.target.querySelector("input")?.focus(); }
    }} onCloseAutoFocus={(event) => {
      if (jumped.current) { event.preventDefault(); jumped.current = false; }
    }}>
      <OutlineContents items={items} listRef={listRef} query={filter.open === open ? filter.query : ""} onQueryChange={(query) => setFilter({ open, query })} onListChange={onListChange} onClose={() => changeOpen(false)} onSelect={(item) => {
        if (onSelect(item)) { jumped.current = true; changeOpen(false); }
      }} />
    </PopoverContent>
  </Popover>;
}

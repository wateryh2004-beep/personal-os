"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BriefcaseBusiness, CalendarPlus, CheckSquare2, FilePlus2, FileText, FolderUp, LayoutDashboard, ShoppingBag, Sparkles, SquareKanban, Plane } from "lucide-react";
import { Command, CommandDialog, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { isWorkbenchCommandCandidate } from "@/features/workbench/operation-command-parser";
import { previewWorkbenchCommand } from "@/features/workbench/operation-command-actions";
import { createNote } from "@/features/notes/actions";
import { useGlobalSearch } from "@/features/search/use-global-search";
import { releaseMobileBackLayerForNavigation } from "@/lib/mobile/use-mobile-back-layer";
import { SearchResultPreview } from "./search-result-preview";
import {
  commandPaletteNavigation,
  parseRecentNavigation,
  RECENT_NAVIGATION_STORAGE_KEY,
  type RecentNavigationItem,
} from "@/lib/navigation-registry";

export type CommandCenterSection = "search" | "quick";
const domainLabels: Record<string, string> = { notes: "笔记", career: "职业", files: "文件", tasks: "任务", calendar: "日历", reviews: "回顾", projects: "项目", shopping: "购物", travel: "旅行", leisure: "闲暇", briefing: "简报", investment: "投资" };

export function GlobalCommandPalette({ open, onOpenChange, initialSection = "search", contentOnly = false, embedded = false, registerPreviewDismiss }: { open: boolean; onOpenChange: (open: boolean) => void; initialSection?: CommandCenterSection; contentOnly?: boolean; embedded?: boolean; registerPreviewDismiss?: (handler: (() => boolean) | null) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [selectedValue, setSelectedValue] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLDivElement>(null);
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const [recents, setRecents] = useState<RecentNavigationItem[]>([]);
  const [commandMessage,setCommandMessage]=useState("");
  const [commandBusy,startCommand]=useTransition();
  const [, startTransition] = useTransition();
  const search = useGlobalSearch({ query, enabled: open, debounceMs: 160 });
  const results = search.results;
  const loading = search.status === "loading";
  const selectedResult = results.find((result) => `result:${result.id}` === selectedValue) ?? null;
  const visiblePreview = open && previewOpen && selectedResult;
  const dismissPreview = useCallback(() => {
    if (!open || !previewOpen || !selectedResult) return false;
    setPreviewOpen(false);
    previewTrigger.current?.focus({ preventScroll: true });
    return true;
  }, [open, previewOpen, selectedResult]);
  useLayoutEffect(() => {
    registerPreviewDismiss?.(dismissPreview);
    return () => registerPreviewDismiss?.(null);
  }, [dismissPreview, registerPreviewDismiss]);
  useLayoutEffect(() => {
    const root = list.current;
    const mark = indicator.current;
    if (!root || !mark || !open) return;
    const update = () => {
      const item = root.querySelector<HTMLElement>('[data-slot="command-item"][aria-selected="true"]');
      if (!item) { delete root.dataset.indicatorReady; return; }
      const bounds = item.getBoundingClientRect();
      const parent = root.getBoundingClientRect();
      mark.style.height = `${bounds.height}px`;
      mark.style.width = `${bounds.width}px`;
      mark.style.transform = `translate(${bounds.left - parent.left + root.scrollLeft}px,${bounds.top - parent.top + root.scrollTop}px)`;
      root.dataset.indicatorReady = "true";
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(root);
    return () => observer?.disconnect();
  }, [open, selectedValue, results]);
  useEffect(() => {
    const clear = () => { setPreviewOpen(false); setSelectedValue(""); setQuery(""); onOpenChange(false); };
    window.addEventListener("personal-os:workspace-auth-failed", clear);
    return () => window.removeEventListener("personal-os:workspace-auth-failed", clear);
  }, [onOpenChange]);
  useLayoutEffect(() => {
    if (open && input.current && window.matchMedia("(min-width: 768px)").matches) input.current.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => { if (!open) return; const timer = window.setTimeout(() => { try { setRecents(parseRecentNavigation(localStorage.getItem(RECENT_NAVIGATION_STORAGE_KEY))); } catch { setRecents([]); } }, 0); return () => window.clearTimeout(timer); }, [initialSection, open]);
  const dismissForNavigation = () => {
    releaseMobileBackLayerForNavigation("dialog");
    onOpenChange(false);
  };
  const go = (href: string) => {
    dismissForNavigation();
    const unhandled = window.dispatchEvent(new CustomEvent("personal-os:navigation-start", { cancelable: true, detail: { href } }));
    if (unhandled) router.push(href);
  };
  const newNote = () => { dismissForNavigation(); startTransition(() => createNote()); };
  const openCreate = (kind?: string) => { onOpenChange(false); window.dispatchEvent(new CustomEvent("personal-os:create-open", { detail: kind ? { kind } : undefined })); };
  const askAgent = (value: string) => {
    onOpenChange(false);
    window.dispatchEvent(new CustomEvent("personal-os:agent-open"));
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("personal-os:agent-submit", { detail: { query: value } })), 0);
  };
  const groups = Object.entries(Object.groupBy(results, (result) => domainLabels[result.domain] ?? result.domain));
  const showQuick = !query && initialSection === "quick";
  const contextActions = pathname.startsWith("/notes") ? [["新建笔记", () => openCreate("note")], ["问笔记库", () => go("/notes/ask")]] as const : pathname === "/calendar" ? [["新建日程", () => openCreate("calendar")], ["回到今天", () => go("/calendar")]] as const : pathname === "/tasks" ? [["新建任务", () => openCreate("task")], ["询问今日任务", () => askAgent("请总结我今天的任务")]] as const : [];

  const content = <Command shouldFilter={!query} label="搜索与导航" value={selectedValue} onValueChange={setSelectedValue}>
      <CommandInput ref={input} value={query} onValueChange={(value) => { setQuery(value); setPreviewOpen(false); }} placeholder={showQuick ? "选择要新建的内容…" : "搜索 Personal OS 或输入命令…"} aria-label="搜索或执行命令" />
      <div className="command-results-layout" data-preview={Boolean(visiblePreview)}>
      <CommandList ref={list} className="command-results-list max-h-[min(68dvh,580px)] py-1">
        <div ref={indicator} className="command-selection-indicator" aria-hidden="true" />
        {isWorkbenchCommandCandidate(query) ? <CommandGroup heading="参数命令"><CommandItem disabled={commandBusy} value={`command ${query}`} onSelect={()=>startCommand(async()=>{try{const preview=await previewWorkbenchCommand(query);if(!preview){setCommandMessage("可输入：周五15点模拟面试45分钟，或把选中任务移到明天。");return;}onOpenChange(false);window.dispatchEvent(new CustomEvent(preview.kind==="calendar"?"personal-os:calendar-command-preview":"personal-os:todo-command-preview",{detail:preview}));}catch{setCommandMessage("命令预览暂不可用，未执行修改。");}})}><CalendarPlus aria-hidden="true"/>{commandBusy?"解析中…":"预览参数命令"}<CommandShortcut>确认后执行</CommandShortcut></CommandItem>{commandMessage?<p role="status" className="px-3 py-2 text-sm">{commandMessage}</p>:null}</CommandGroup>:null}
        {query && loading ? <p role="status" aria-live="polite" className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">正在搜索…</p> : null}
        {query && search.status === "error" ? <p role="alert" className="px-4 py-8 text-center text-sm text-[var(--danger)]">{search.error}</p> : null}
        {query && search.status === "success" && !results.length ? <p role="status" aria-live="polite" className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">没有找到相关内容。尝试更短或不同的关键词。</p> : null}
        {!query && contextActions.length ? <CommandGroup heading="当前页面">{contextActions.map(([label, action]) => <CommandItem key={label} onSelect={action}><Sparkles aria-hidden="true" />{label}</CommandItem>)}</CommandGroup> : null}
        {!query ? <CommandGroup heading="新建">
          <CommandItem onSelect={() => askAgent("我现在最需要关注什么？")}><Sparkles aria-hidden="true" />询问 Personal OS<CommandShortcut>⌘ J</CommandShortcut></CommandItem>
          <CommandItem onSelect={newNote}><FilePlus2 aria-hidden="true" />新建笔记<CommandShortcut>直接进入编辑器</CommandShortcut></CommandItem>
          <CommandItem onSelect={() => openCreate("task")}><CheckSquare2 aria-hidden="true" />新建任务<CommandShortcut>Microsoft To Do</CommandShortcut></CommandItem>
          <CommandItem onSelect={() => openCreate("calendar")}><CalendarPlus aria-hidden="true" />新建日程<CommandShortcut>Outlook</CommandShortcut></CommandItem>
          <CommandItem onSelect={() => openCreate("project")}><SquareKanban aria-hidden="true" />新建项目</CommandItem>
          <CommandItem onSelect={() => openCreate("shopping")}><ShoppingBag aria-hidden="true" />加入待购</CommandItem>
          <CommandItem onSelect={() => openCreate("travel")}><Plane aria-hidden="true" />添加旅行灵感</CommandItem>
          <CommandItem onSelect={() => go("/career/opportunities?create=1")}><BriefcaseBusiness aria-hidden="true" />新建职业机会</CommandItem>
          <CommandItem onSelect={() => go("/career/experiences?create=1")}><LayoutDashboard aria-hidden="true" />添加职业经历</CommandItem>
          <CommandItem onSelect={() => openCreate("inbox")}><FolderUp aria-hidden="true" />记录到 Inbox</CommandItem>
        </CommandGroup> : null}
        {!query && recents.length ? <><CommandSeparator /><CommandGroup heading="最近访问">{recents.slice(0, 6).map((item) => <CommandItem key={item.href} onSelect={() => go(item.href)}><FileText aria-hidden="true" /><span className="min-w-0 truncate">{item.label}</span><CommandShortcut>{item.href}</CommandShortcut></CommandItem>)}</CommandGroup></> : null}
        {!query && !showQuick ? <><CommandSeparator /><CommandGroup heading="导航">{commandPaletteNavigation.map((item) => {
          const Icon = item.icon;
          return <CommandItem key={item.href} onSelect={() => go(item.href)}><Icon aria-hidden="true" />{item.name}<CommandShortcut>{item.href}</CommandShortcut></CommandItem>;
        })}</CommandGroup></> : null}
        {query && !loading ? <CommandGroup heading="询问"><CommandItem value={`ask ${query}`} onSelect={() => askAgent(query)}><Sparkles aria-hidden="true" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">询问 Personal OS</p><p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">“{query}”</p></div><CommandShortcut>AI</CommandShortcut></CommandItem></CommandGroup> : null}
        {query && !loading ? groups.map(([label, items]) => <CommandGroup key={label} heading={label}>{(items ?? []).map((result) => <CommandItem key={result.id} value={`result:${result.id}`} onSelect={() => go(result.href)}><FileText aria-hidden="true" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{result.title}</p>{result.subtitle || result.snippet ? <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-tertiary)]">{result.subtitle ?? result.snippet}</p> : null}</div><CommandShortcut>{label}</CommandShortcut></CommandItem>)}</CommandGroup>) : null}
      </CommandList>
      {visiblePreview ? <aside className="command-result-preview" id="command-result-preview" aria-label="搜索结果预览" onKeyDown={(event) => { if (event.key === "Escape" && dismissPreview()) { event.preventDefault(); event.stopPropagation(); } }}><SearchResultPreview key={visiblePreview.id} result={visiblePreview} onNavigate={(event) => { event.preventDefault(); go(visiblePreview.href); }} /></aside> : null}
      </div>
      {query && results.length ? <div className="command-results-footer"><span className="command-keyboard-hint">↑ ↓ 选择，Enter 打开</span><label className="command-preview-picker"><span className="sr-only">预览内容</span><select aria-label="预览内容" value={selectedResult ? `result:${selectedResult.id}` : ""} onChange={(event) => setSelectedValue(event.target.value)}><option value="" disabled>选择预览内容</option>{results.map((result) => <option key={result.id} value={`result:${result.id}`}>{result.title}</option>)}</select></label><button ref={previewTrigger} type="button" disabled={!selectedResult} aria-expanded={Boolean(visiblePreview)} aria-controls="command-result-preview" onClick={() => setPreviewOpen((value) => !value)}>{visiblePreview ? "收起预览" : "预览所选"}</button></div> : null}
    </Command>;
  return embedded ? content : <CommandDialog contentOnly={contentOnly} open={open} onOpenChange={onOpenChange} onEscapeKeyDown={(event) => { if (dismissPreview()) event.preventDefault(); }} title="搜索" description="搜索、导航或快速新建" className="max-h-[min(78dvh,680px)] sm:max-w-2xl">{content}</CommandDialog>;
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BriefcaseBusiness, CalendarPlus, CheckSquare2, FilePlus2, FileText, FolderUp, LayoutDashboard, Settings, ShoppingBag, Sparkles, SquareKanban, Plane } from "lucide-react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { createNote } from "@/features/notes/actions";
import { useGlobalSearch } from "@/features/search/use-global-search";

export type CommandCenterSection = "search" | "quick";
const recentStorageKey = "personal-os:recent:v1";
const navigation = [
  ["Now", "/today"], ["Inbox", "/inbox"], ["Calendar", "/calendar"], ["Tasks", "/tasks"], ["Projects", "/projects"], ["Shopping", "/shopping"], ["Travel", "/travel"], ["Notes", "/notes"], ["Files", "/files"], ["Career", "/career"], ["Settings", "/settings"],
] as const;
const domainLabels: Record<string, string> = { notes: "Notes", career: "Career", files: "Files", tasks: "Tasks", calendar: "Calendar", reviews: "Reviews", projects: "Projects", shopping: "Shopping", travel: "Travel" };

export function GlobalCommandPalette({ open, onOpenChange, initialSection = "search" }: { open: boolean; onOpenChange: (open: boolean) => void; initialSection?: CommandCenterSection }) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<Array<{ href: string; label: string }>>([]);
  const [, startTransition] = useTransition();
  const search = useGlobalSearch({ query, enabled: open, debounceMs: 160 });
  const results = search.results;
  const loading = search.status === "loading";
  useEffect(() => { if (!open) return; const timer = window.setTimeout(() => { setQuery(""); try { setRecents(JSON.parse(localStorage.getItem(recentStorageKey) || "[]")); } catch { setRecents([]); } }, 0); return () => window.clearTimeout(timer); }, [initialSection, open]);
  const go = (href: string) => { onOpenChange(false); router.push(href); };
  const newNote = () => { onOpenChange(false); startTransition(() => createNote()); };
  const openCreate = (kind?: string) => { onOpenChange(false); window.dispatchEvent(new CustomEvent("personal-os:create-open", { detail: kind ? { kind } : undefined })); };
  const askAgent = (value: string) => {
    onOpenChange(false);
    window.dispatchEvent(new CustomEvent("personal-os:agent-open"));
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("personal-os:agent-submit", { detail: { query: value } })), 0);
  };
  const groups = Object.entries(Object.groupBy(results, (result) => domainLabels[result.domain] ?? result.domain));
  const showQuick = !query && initialSection === "quick";
  const contextActions = pathname.startsWith("/notes") ? [["新建笔记", () => openCreate("note")], ["问笔记库", () => { onOpenChange(false); window.dispatchEvent(new CustomEvent("personal-os:notes-library-open")); }]] as const : pathname === "/calendar" ? [["新建日程", () => openCreate("calendar")], ["回到今天", () => go("/calendar")]] as const : pathname === "/tasks" ? [["新建任务", () => openCreate("task")], ["询问今日任务", () => askAgent("请总结我今天的任务")]] as const : [];

  return <CommandDialog open={open} onOpenChange={onOpenChange} title="Personal OS Command Center" description="搜索、导航或快速新建" className="max-h-[min(78dvh,680px)] border-[var(--border-strong)] bg-[var(--surface-elevated)] sm:max-w-2xl">
    <Command shouldFilter={!query} label="Personal OS Command Center">
      <CommandInput value={query} onValueChange={setQuery} autoFocus placeholder={showQuick ? "选择要新建的内容…" : "搜索 Personal OS 或输入命令…"} aria-label="搜索或执行命令" />
      <CommandList className="max-h-[min(68dvh,580px)] py-1">
        {query && loading ? <p role="status" aria-live="polite" className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">正在搜索…</p> : null}
        {query && search.status === "error" ? <p role="alert" className="px-4 py-8 text-center text-sm text-[var(--danger)]">{search.error}</p> : null}
        {query && search.status === "success" && !results.length ? <CommandEmpty>没有找到相关内容。尝试更短或不同的关键词。</CommandEmpty> : null}
        {!query && contextActions.length ? <CommandGroup heading="Context Actions">{contextActions.map(([label, action]) => <CommandItem key={label} onSelect={action}><Sparkles aria-hidden="true" />{label}</CommandItem>)}</CommandGroup> : null}
        {!query ? <CommandGroup heading="Create">
          <CommandItem onSelect={() => askAgent("我现在最需要关注什么？")}><Sparkles aria-hidden="true" />Ask Personal OS<CommandShortcut>⌘ J</CommandShortcut></CommandItem>
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
        {!query && recents.length ? <><CommandSeparator /><CommandGroup heading="Recent">{recents.slice(0, 6).map((item) => <CommandItem key={item.href} onSelect={() => go(item.href)}><FileText aria-hidden="true" /><span className="min-w-0 truncate">{item.label}</span><CommandShortcut>{item.href}</CommandShortcut></CommandItem>)}</CommandGroup></> : null}
        {!query && !showQuick ? <><CommandSeparator /><CommandGroup heading="Navigation">{navigation.map(([label, href]) => <CommandItem key={href} onSelect={() => go(href)}>{href === "/settings" ? <Settings aria-hidden="true" /> : <LayoutDashboard aria-hidden="true" />}{label}<CommandShortcut>{href}</CommandShortcut></CommandItem>)}</CommandGroup></> : null}
        {query && !loading ? <CommandGroup heading="Ask"><CommandItem value={`ask ${query}`} onSelect={() => askAgent(query)}><Sparkles aria-hidden="true" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">Ask Personal OS</p><p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">“{query}”</p></div><CommandShortcut>AI</CommandShortcut></CommandItem></CommandGroup> : null}
        {query && !loading ? groups.map(([label, items]) => <CommandGroup key={label} heading={label}>{(items ?? []).map((result) => <CommandItem key={result.id} value={`${result.domain} ${result.title} ${result.subtitle ?? ""} ${result.snippet ?? ""}`} onSelect={() => go(result.href)}><FileText aria-hidden="true" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{result.title}</p>{result.subtitle || result.snippet ? <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-tertiary)]">{result.subtitle ?? result.snippet}</p> : null}</div><CommandShortcut>{label}</CommandShortcut></CommandItem>)}</CommandGroup>) : null}
      </CommandList>
    </Command>
  </CommandDialog>;
}

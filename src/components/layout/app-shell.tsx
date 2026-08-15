"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import {
  BriefcaseBusiness, CalendarDays, CheckSquare2, ChevronLeft, ChevronRight,
  FileText, FolderClosed, Inbox, LayoutDashboard, LogOut, Menu, Newspaper,
  Plus, Search, Settings, ShoppingBag, SquareKanban, Star, Plane,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GlobalCommandPalette, type CommandCenterSection } from "@/components/search/global-command-palette";
import { logoutAction } from "@/features/auth/actions";
import { clearWorkspaceSessions } from "@/lib/workspace-session";
import { cn } from "@/lib/utils";
import { isAssistantShortcut } from "@/features/assistant/shortcuts";
import { WorkspacePanelProvider, useWorkspacePanel } from "@/components/layout/workspace-panel-provider";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { navActive } from "@/lib/navigation";

const sidebarStorageKey = "personal-os:shell:v2";
const recentStorageKey = "personal-os:recent:v1";

// The assistant pulls in the AI SDK, Markdown rendering and realtime code.  It
// must not become a cost of simply opening a private workspace page.
const GlobalAgent = dynamic(
  () => import("@/components/assistant/global-agent").then((module) => module.GlobalAgent),
  { ssr: false },
);

const groups: Array<{ label: string | null; items: Array<{ name: string; href: string; icon: typeof LayoutDashboard }> }> = [
  { label: null, items: [{ name: "Now", href: "/today", icon: LayoutDashboard }, { name: "Inbox", href: "/inbox", icon: Inbox }] },
  { label: "Plan", items: [{ name: "Calendar", href: "/calendar", icon: CalendarDays }, { name: "Tasks", href: "/tasks", icon: CheckSquare2 }, { name: "Projects", href: "/projects", icon: SquareKanban }, { name: "Reviews", href: "/reviews", icon: Star }] },
  { label: "Knowledge", items: [{ name: "Notes", href: "/notes", icon: FileText }, { name: "Files", href: "/files", icon: FolderClosed }, { name: "Briefing", href: "/briefing", icon: Newspaper }] },
  { label: "Life", items: [{ name: "Shopping", href: "/shopping", icon: ShoppingBag }, { name: "Travel", href: "/travel", icon: Plane }] },
  { label: null, items: [{ name: "Career", href: "/career", icon: BriefcaseBusiness }] },
];

function Navigation({ pathname, collapsed, onNavigate }: { pathname: string; collapsed: boolean; onNavigate?: () => void }) {
  return <nav aria-label="主导航" className="space-y-5">{groups.map((group, groupIndex) => <div key={group.label ?? groupIndex}>
    {group.label && !collapsed ? <p className="mb-1 px-2 text-[11px] font-medium text-[var(--text-tertiary)]">{group.label}</p> : null}
    <div className="space-y-0.5">{group.items.map(({ name, href, icon: Icon }) => {
      const active = navActive(pathname, href);
      const link = <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} aria-label={collapsed ? name : undefined} className={cn("relative flex h-9 min-w-0 items-center gap-2.5 rounded-[var(--radius-md)] px-2 text-sm transition-[background-color,color]", active ? "bg-[var(--surface-selected)] font-medium text-[var(--accent)] before:absolute before:inset-y-2 before:-left-2 before:w-0.5 before:rounded-full before:bg-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]", collapsed && "justify-center px-0")}><Icon className="size-[17px] shrink-0" aria-hidden="true" />{collapsed ? null : <span className="truncate">{name}</span>}</Link>;
      return collapsed ? <Tooltip key={href}><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">{name}</TooltipContent></Tooltip> : <div key={href}>{link}</div>;
    })}</div>
  </div>)}</nav>;
}

function shellContentClass(pathname: string) {
  if (pathname === "/calendar" || pathname === "/tasks" || pathname === "/files" || pathname === "/career/roadmap") return "p-0";
  if (pathname === "/notes" || /^\/notes\/[0-9a-f-]{36}$/.test(pathname)) return "p-0";
  return "mx-auto w-full max-w-[var(--content-dashboard-width)] px-4 py-6 pb-[calc(var(--tab-bar-height)+1rem)] sm:px-6 md:pb-6 lg:px-8";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return <WorkspacePanelProvider><AppShellInner>{children}</AppShellInner></WorkspacePanelProvider>;
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandSection, setCommandSection] = useState<CommandCenterSection>("search");
  const { isOpen: globalAgentOpen, open: openGlobalAgent, close: closeGlobalAgent } = useWorkspacePanel("global-agent");

  useEffect(() => { const timer = window.setTimeout(() => { try { setCollapsed(JSON.parse(localStorage.getItem(sidebarStorageKey) || "false") === true); } catch { /* Keep the usable default. */ } }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandSection("search"); setCommandOpen(true); }
      if (isAssistantShortcut(event)) { event.preventDefault(); openGlobalAgent(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openGlobalAgent]);
  useEffect(() => {
    const openAgent = () => openGlobalAgent();
    window.addEventListener("personal-os:agent-open", openAgent);
    return () => window.removeEventListener("personal-os:agent-open", openAgent);
  }, [openGlobalAgent]);
  useEffect(() => {
    const label = groups.flatMap((group) => group.items).find((item) => navActive(pathname, item.href))?.name ?? pathname;
    try {
      const previous = JSON.parse(localStorage.getItem(recentStorageKey) || "[]") as Array<{ href: string; label: string }>;
      localStorage.setItem(recentStorageKey, JSON.stringify([{ href: pathname, label }, ...previous.filter((item) => item.href !== pathname)].slice(0, 8)));
    } catch { /* Recents are an enhancement, never a navigation dependency. */ }
  }, [pathname]);
  useEffect(() => {
    // Keep the frequent personal workflow warm without prefetching every
    // private surface at once. AppShell itself stays persistent on navigation.
    const prefetch = () => ["/today", "/calendar", "/tasks", "/notes"].filter((href) => href !== pathname).forEach((href) => router.prefetch(href));
    const idle = window.setTimeout(prefetch, 800);
    return () => window.clearTimeout(idle);
  }, [pathname, router]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const updateViewportHeight = () => {
      const height = viewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-viewport-height", `${Math.round(height)}px`);
    };
    updateViewportHeight();
    viewport?.addEventListener("resize", updateViewportHeight);
    window.addEventListener("orientationchange", updateViewportHeight);
    return () => {
      viewport?.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener("orientationchange", updateViewportHeight);
      document.documentElement.style.removeProperty("--app-viewport-height");
    };
  }, []);
  const toggleCollapsed = () => setCollapsed((value) => { const next = !value; localStorage.setItem(sidebarStorageKey, JSON.stringify(next)); return next; });
  const openCommand = (section: CommandCenterSection) => { setCommandSection(section); setCommandOpen(true); };
  const desktopWidth = collapsed ? "var(--sidebar-collapsed-width)" : "var(--sidebar-width)";

  const desktopSidebar = useMemo(() => <aside style={{ width: desktopWidth }} className="fixed inset-y-0 left-0 z-30 hidden shrink-0 flex-col border-r bg-[var(--surface-sidebar)] md:flex">
    <div className={cn("flex h-14 items-center border-b px-3", collapsed ? "justify-center" : "justify-between")}><Link href="/today" aria-label="Life of HANG，返回 Now" className={cn("wordmark truncate font-semibold", collapsed ? "text-lg" : "text-[18px]")}>{collapsed ? "H" : "Life of HANG"}</Link>{collapsed ? null : <button type="button" onClick={toggleCollapsed} className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)]" aria-label="折叠侧栏"><ChevronLeft className="size-4" aria-hidden="true" /></button>}</div>
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4"><Navigation pathname={pathname} collapsed={collapsed} /></div>
    <div className="space-y-1 border-t p-3">{collapsed ? <Tooltip><TooltipTrigger asChild><button type="button" onClick={toggleCollapsed} className="flex h-9 w-full items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" aria-label="展开侧栏"><ChevronRight className="size-[17px]" aria-hidden="true" /></button></TooltipTrigger><TooltipContent side="right">展开侧栏</TooltipContent></Tooltip> : null}<Link href="/settings" aria-current={pathname === "/settings" ? "page" : undefined} className={cn("flex h-9 items-center gap-2.5 rounded-[var(--radius-md)] text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]", collapsed ? "justify-center" : "px-2")} aria-label={collapsed ? "Settings" : undefined}><Settings className="size-[17px]" aria-hidden="true" />{collapsed ? null : "Settings"}</Link><form action={logoutAction} onSubmit={() => clearWorkspaceSessions()}><button className={cn("flex h-9 w-full items-center gap-2.5 rounded-[var(--radius-md)] text-sm text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]", collapsed ? "justify-center" : "px-2")} aria-label={collapsed ? "退出登录" : undefined}><LogOut className="size-[17px]" aria-hidden="true" />{collapsed ? null : "退出登录"}</button></form></div>
  </aside>, [collapsed, desktopWidth, pathname]);

  return <div className="min-h-[var(--app-viewport-height)] bg-[var(--surface-app)]">{desktopSidebar}
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="left" className="w-[min(86vw,280px)] gap-0 bg-[var(--surface-sidebar)] p-0"><div className="flex min-h-14 items-center border-b px-4 pt-[env(safe-area-inset-top)]"><SheetTitle className="wordmark text-lg">Life of HANG</SheetTitle></div><div className="min-h-0 flex-1 overflow-y-auto p-4"><Navigation pathname={pathname} collapsed={false} onNavigate={() => setMobileOpen(false)} /></div><Link href="/settings" onClick={() => setMobileOpen(false)} className="m-3 flex h-10 items-center gap-2 border-t px-2 pt-3 text-sm text-[var(--text-secondary)]"><Settings className="size-4" aria-hidden="true" />Settings</Link></SheetContent></Sheet>
    <div style={{ "--shell-width": desktopWidth } as React.CSSProperties} className="min-w-0 md:ml-[var(--shell-width)]">
      <header className="sticky top-0 z-20 flex h-[var(--toolbar-height)] items-center gap-3 border-b bg-[color:var(--surface-canvas)]/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-sm sm:px-4">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="打开导航"><Menu aria-hidden="true" /></Button>
        <button type="button" onClick={() => openCommand("search")} className="mx-auto flex h-8 w-full max-w-xl items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-hover)] px-3 text-left text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"><Search className="size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1 truncate sm:hidden">搜索…</span><span className="hidden min-w-0 flex-1 truncate sm:inline">搜索 Personal OS…</span><kbd className="hidden rounded border bg-[var(--surface-canvas)] px-1.5 py-0.5 font-sans text-[10px] sm:inline">⌘ K</kbd></button>
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" onClick={openGlobalAgent} aria-label="询问 Personal OS" className="gap-1.5"><Sparkles className="size-4" aria-hidden="true"/><span className="hidden sm:inline">Ask</span><kbd className="hidden rounded border bg-[var(--surface-canvas)] px-1 py-0.5 font-sans text-[9px] lg:inline">⌘ J</kbd></Button></TooltipTrigger><TooltipContent>Ask Personal OS</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" onClick={() => openCommand("quick")} aria-label="快速新建"><Plus aria-hidden="true" /></Button></TooltipTrigger><TooltipContent>快速新建</TooltipContent></Tooltip>
      </header>
      <div className="min-w-0"><main id="main-content" className={cn("min-w-0", shellContentClass(pathname))}>{children}</main>{globalAgentOpen ? <GlobalAgent open onClose={closeGlobalAgent} /> : null}</div>
    </div>
    <MobileTabBar onOpenMore={() => setMobileOpen(true)} />
    <GlobalCommandPalette open={commandOpen} onOpenChange={setCommandOpen} initialSection={commandSection} />
  </div>;
}

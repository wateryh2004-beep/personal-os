"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GlobalCommandPalette, type CommandCenterSection } from "@/components/search/global-command-palette";
import { logoutAction } from "@/features/auth/actions";
import { clearWorkspaceSessions } from "@/lib/workspace-session";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { tasksWorkspaceResource } from "@/features/tasks/workspace-resource";
import { notesWorkspaceResource } from "@/features/notes/workspace-resource";
import { calendarWorkspaceResource } from "@/features/calendar/workspace-resource";
import { todayWorkspaceResource } from "@/features/today/workspace-resource";
import { cn } from "@/lib/utils";
import { isAssistantShortcut } from "@/features/assistant/shortcuts";
import { WorkspacePanelProvider, useWorkspacePanel } from "@/components/layout/workspace-panel-provider";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { navActive } from "@/lib/navigation";
import {
  contextualCreateKindForPath,
  desktopNavigationGroups,
  getMobileRecentNavigation,
  mergeRecentNavigation,
  navigationItemForPath,
  parseRecentNavigation,
  RECENT_NAVIGATION_STORAGE_KEY,
  type RecentNavigationItem,
} from "@/lib/navigation-registry";
import { perfMark, perfMeasure } from "@/lib/perf";
import { GlobalCreateLayer } from "@/components/shared/global-create-layer";
import { matchesShortcut } from "@/features/shortcuts/registry";
import { ActionFeedbackProvider } from "@/components/shared/action-feedback";
import {
  backgroundWorkspacePrefetchTargets,
  isWorkspacePrefetchHref,
  shouldBackgroundWarmData,
  shouldSkipBackgroundPrefetch,
  type WorkspacePrefetchHref,
} from "@/lib/workspace-prefetch-policy";

const sidebarStorageKey = "personal-os:shell:v2";

const GlobalAgent = dynamic(
  () => import("@/components/assistant/global-agent").then((module) => module.GlobalAgent),
  { ssr: false },
);

type NavigationProps = {
  pathname: string;
  collapsed: boolean;
  pendingHref?: string | null;
  onNavigate?: (href: string) => void;
  onIntent?: (href: string) => void;
};

function pathnameFromHref(href: string | null | undefined) {
  if (!href) return null;
  return href.split(/[?#]/, 1)[0] || "/";
}

function Navigation({ pathname, collapsed, pendingHref, onNavigate, onIntent }: NavigationProps) {
  const pendingPathname = pathnameFromHref(pendingHref);

  return <nav aria-label="主导航" className="space-y-5.5">{desktopNavigationGroups.map((group, groupIndex) => <div key={group.label ?? groupIndex}>
    {group.label && !collapsed ? <p className="mb-1.5 px-2.5 text-[10.5px] font-semibold tracking-[0.015em] text-[var(--text-tertiary)]">{group.label}</p> : null}
    <div className="space-y-px">{group.items.map(({ name, href, icon: Icon }) => {
      const active = navActive(pathname, href);
      const pending = pendingPathname ? navActive(pendingPathname, href) : false;
      const link = <Link
        href={href}
        prefetch={false}
        onClick={() => onNavigate?.(href)}
        onPointerEnter={() => onIntent?.(href)}
        onFocus={() => onIntent?.(href)}
        onPointerDown={() => onIntent?.(href)}
        onTouchStart={() => onIntent?.(href)}
        aria-current={active ? "page" : undefined}
        aria-busy={pending || undefined}
        aria-label={collapsed ? name : undefined}
        className={cn(
          "flex h-[34px] min-w-0 items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 text-[13px] font-medium tracking-[-0.005em] transition-[background-color,color,opacity] ui-transition",
          active || pending
            ? "bg-[var(--surface-selected)] text-[var(--text-primary)] [&>svg]:text-[var(--accent)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]",
          pending && "opacity-60",
          collapsed && "justify-center px-0",
        )}
      >
        <Icon className="size-4 shrink-0 text-[var(--text-tertiary)] transition-colors ui-transition" strokeWidth={active || pending ? 2 : 1.8} aria-hidden="true" />
        {collapsed ? null : <span className="truncate">{name}</span>}
      </Link>;
      return collapsed
        ? <Tooltip key={href}><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">{name}</TooltipContent></Tooltip>
        : <div key={href}>{link}</div>;
    })}</div>
  </div>)}</nav>;
}

function shellContentClass(pathname: string) {
  if (pathname === "/calendar" || pathname === "/tasks" || pathname === "/files" || pathname === "/career/roadmap") return "p-0";
  if (pathname === "/notes" || /^\/notes\/[0-9a-f-]{36}$/.test(pathname)) return "p-0";
  return "mx-auto w-full max-w-[var(--content-dashboard-width)] px-4 py-6 pb-[calc(var(--tab-bar-height)+1rem)] sm:px-6 md:pb-6 lg:px-8";
}

type PrefetchableWorkspaceResource = {
  get: () => { data?: unknown };
  prefetch: () => Promise<unknown>;
};

function networkInformation() {
  return (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
}

function shouldAvoidSpeculativePrefetch() {
  return shouldSkipBackgroundPrefetch(networkInformation());
}

function workspaceResourceForHref(href: WorkspacePrefetchHref): PrefetchableWorkspaceResource {
  if (href === "/tasks") return tasksWorkspaceResource;
  if (href === "/notes") return notesWorkspaceResource;
  if (href === "/calendar") return calendarWorkspaceResource;
  return todayWorkspaceResource;
}

function prefetchWorkspaceData(href: WorkspacePrefetchHref, coldOnly: boolean) {
  const resource = workspaceResourceForHref(href);
  if (coldOnly && !shouldBackgroundWarmData(resource.get().data)) return;
  void resource.prefetch().catch(() => {});
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return <ActionFeedbackProvider><WorkspacePanelProvider><AppShellInner>{children}</AppShellInner></WorkspacePanelProvider></ActionFeedbackProvider>;
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandSection, setCommandSection] = useState<CommandCenterSection>("search");
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [showNavigationProgress, setShowNavigationProgress] = useState(false);
  const [recentNavigation, setRecentNavigation] = useState<RecentNavigationItem[]>([]);
  const backgroundPrefetched = useRef(new Set<WorkspacePrefetchHref>());
  const { isOpen: globalAgentOpen, open: openGlobalAgent, close: closeGlobalAgent } = useWorkspacePanel("global-agent");

  const pendingPathname = pathnameFromHref(pendingHref);
  const visiblePendingHref = pendingPathname === pathname ? null : pendingHref;

  const beginNavigation = useCallback((href: string) => {
    if (pathnameFromHref(href) === pathname) return;
    setShowNavigationProgress(false);
    setPendingHref(href);
    perfMark("navigation-click", { href });
  }, [pathname]);

  const prefetchNavigationTarget = useCallback((href: string) => {
    if (shouldAvoidSpeculativePrefetch()) return;
    router.prefetch(href);
    if (isWorkspacePrefetchHref(href)) prefetchWorkspaceData(href, false);
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setCollapsed(JSON.parse(localStorage.getItem(sidebarStorageKey) || "false") === true);
      } catch {
        /* Keep the usable default. */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!pendingHref || pathnameFromHref(pendingHref) !== pathname) return;
    perfMark("route-commit", { href: pathname });
    perfMeasure("route-commit", "navigation-click", { href: pathname });
    perfMeasure("navigation-ready", "navigation-click", { href: pathname });
    setShowNavigationProgress(false);
    setPendingHref(null);
  }, [pathname, pendingHref]);

  useEffect(() => {
    if (!visiblePendingHref) return;
    const timer = window.setTimeout(() => setShowNavigationProgress(true), 180);
    return () => window.clearTimeout(timer);
  }, [visiblePendingHref]);

  useEffect(() => {
    const handleNavigationStart = (event: Event) => {
      const href = (event as CustomEvent<{ href?: unknown }>).detail?.href;
      if (typeof href === "string") beginNavigation(href);
    };
    window.addEventListener("personal-os:navigation-start", handleNavigationStart);
    return () => window.removeEventListener("personal-os:navigation-start", handleNavigationStart);
  }, [beginNavigation]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (matchesShortcut(event, "command")) {
        event.preventDefault();
        setCommandSection("search");
        setCommandOpen(true);
      }
      if (isAssistantShortcut(event)) {
        event.preventDefault();
        openGlobalAgent();
      }
      if (matchesShortcut(event, "contextual-create")) {
        event.preventDefault();
        const kind = contextualCreateKindForPath(pathname);
        window.dispatchEvent(new CustomEvent("personal-os:create-open", { detail: kind ? { kind } : undefined }));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openGlobalAgent, pathname]);

  useEffect(() => {
    const openAgent = () => openGlobalAgent();
    window.addEventListener("personal-os:agent-open", openAgent);
    return () => window.removeEventListener("personal-os:agent-open", openAgent);
  }, [openGlobalAgent]);

  useEffect(() => {
    const label = navigationItemForPath(pathname)?.name ?? pathname;
    const current = { href: pathname, label };
    try {
      const next = mergeRecentNavigation(
        parseRecentNavigation(localStorage.getItem(RECENT_NAVIGATION_STORAGE_KEY)),
        current,
      );
      localStorage.setItem(RECENT_NAVIGATION_STORAGE_KEY, JSON.stringify(next));
      setRecentNavigation(next);
    } catch {
      setRecentNavigation((previous) => mergeRecentNavigation(previous, current));
    }
  }, [pathname]);

  useEffect(() => {
    if (document.visibilityState !== "visible" || shouldAvoidSpeculativePrefetch()) return;
    const targets = backgroundWorkspacePrefetchTargets(pathname).filter(
      (href) => !backgroundPrefetched.current.has(href),
    );
    if (!targets.length) return;

    let cancelled = false;
    const prefetch = () => {
      if (cancelled || document.visibilityState !== "visible" || shouldAvoidSpeculativePrefetch()) return;
      targets.forEach((href) => {
        backgroundPrefetched.current.add(href);
        router.prefetch(href);
        prefetchWorkspaceData(href, true);
      });
    };

    const idleWindow = window as unknown as {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(prefetch, { timeout: 1_800 });
      return () => {
        cancelled = true;
        idleWindow.cancelIdleCallback?.(handle);
      };
    }
    const timer = window.setTimeout(prefetch, 1_200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
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

  const toggleCollapsed = () => setCollapsed((value) => {
    const next = !value;
    localStorage.setItem(sidebarStorageKey, JSON.stringify(next));
    return next;
  });
  const openCommand = (section: CommandCenterSection) => {
    setCommandSection(section);
    setCommandOpen(true);
  };
  const createKind = contextualCreateKindForPath(pathname);
  const openContextualCreate = () => window.dispatchEvent(new CustomEvent("personal-os:create-open", { detail: createKind ? { kind: createKind } : undefined }));
  const desktopWidth = collapsed ? "var(--sidebar-collapsed-width)" : "var(--sidebar-width)";
  const mobileRecentNavigation = useMemo(
    () => getMobileRecentNavigation(recentNavigation, pathname),
    [pathname, recentNavigation],
  );

  const desktopSidebar = useMemo(() => <aside style={{ width: desktopWidth }} className="fixed inset-y-0 left-0 z-30 hidden shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-sidebar)] md:flex">
    <div className={cn("flex h-12 items-center px-2.5", collapsed ? "justify-center" : "justify-between")}>
      <Link
        href="/today"
        prefetch={false}
        onClick={() => beginNavigation("/today")}
        onPointerEnter={() => prefetchNavigationTarget("/today")}
        onFocus={() => prefetchNavigationTarget("/today")}
        aria-label="Life of HANG，返回 Now"
        className={cn("wordmark truncate text-[15px] text-[var(--text-primary)]", collapsed ? "text-base" : "px-1.5")}
      >
        {collapsed ? "H" : "Life of HANG"}
      </Link>
      {collapsed ? null : <button type="button" onClick={toggleCollapsed} className="grid size-7 place-items-center rounded-[var(--radius-md)] text-[var(--text-tertiary)] transition-[background-color,color] ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)]" aria-label="折叠侧栏"><ChevronLeft className="size-3.5" strokeWidth={1.9} aria-hidden="true" /></button>}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
      <Navigation pathname={pathname} collapsed={collapsed} pendingHref={visiblePendingHref} onNavigate={beginNavigation} onIntent={prefetchNavigationTarget} />
    </div>
    <div className="mx-2.5 space-y-px border-t border-[var(--border-subtle)] py-2.5">
      {collapsed ? <Tooltip><TooltipTrigger asChild><button type="button" onClick={toggleCollapsed} className="flex h-[34px] w-full items-center justify-center rounded-[var(--radius-md)] text-[var(--text-tertiary)] transition-[background-color,color] ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)]" aria-label="展开侧栏"><ChevronRight className="size-4" strokeWidth={1.8} aria-hidden="true" /></button></TooltipTrigger><TooltipContent side="right">展开侧栏</TooltipContent></Tooltip> : null}
      <Link
        href="/settings"
        prefetch={false}
        onClick={() => beginNavigation("/settings")}
        onPointerEnter={() => prefetchNavigationTarget("/settings")}
        onFocus={() => prefetchNavigationTarget("/settings")}
        aria-current={pathname === "/settings" ? "page" : undefined}
        className={cn("flex h-[34px] items-center gap-2.5 rounded-[var(--radius-md)] text-[13px] font-medium text-[var(--text-secondary)] transition-[background-color,color] ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]", collapsed ? "justify-center" : "px-2.5")}
        aria-label={collapsed ? "Settings" : undefined}
      >
        <Settings className="size-4 text-[var(--text-tertiary)]" strokeWidth={1.8} aria-hidden="true" />
        {collapsed ? null : "Settings"}
      </Link>
      <form action={logoutAction} onSubmit={() => { clearWorkspaceSessions(); clearWorkspaceResources(); }}>
        <button className={cn("flex h-[34px] w-full items-center gap-2.5 rounded-[var(--radius-md)] text-[13px] font-medium text-[var(--text-tertiary)] transition-[background-color,color] ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)]", collapsed ? "justify-center" : "px-2.5")} aria-label={collapsed ? "退出登录" : undefined}>
          <LogOut className="size-4" strokeWidth={1.8} aria-hidden="true" />
          {collapsed ? null : "退出登录"}
        </button>
      </form>
    </div>
  </aside>, [beginNavigation, collapsed, desktopWidth, pathname, prefetchNavigationTarget, visiblePendingHref]);

  return <div className="min-h-[var(--app-viewport-height)] bg-[var(--surface-app)]">
    {showNavigationProgress ? <div data-navigation-progress aria-hidden="true" className="fixed inset-x-0 top-0 z-[70] h-px bg-[var(--accent)]" /> : null}
    {desktopSidebar}
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetContent side="left" className="w-[min(84vw,272px)] gap-0 border-r border-[var(--border-subtle)] bg-[var(--surface-sidebar)] p-0">
        <div className="flex min-h-12 items-center px-4 pt-[env(safe-area-inset-top)]"><SheetTitle className="wordmark text-[16px]">Life of HANG</SheetTitle></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {mobileRecentNavigation.length ? <div className="mb-4">
            <p className="mb-1.5 px-2.5 text-[10.5px] font-semibold tracking-[0.015em] text-[var(--text-tertiary)]">最近访问</p>
            <div className="space-y-px">{mobileRecentNavigation.map(({ targetHref, item }) => {
              const Icon = item.icon;
              const pending = pathnameFromHref(visiblePendingHref) === pathnameFromHref(targetHref);
              return <Link
                key={targetHref}
                href={targetHref}
                prefetch={false}
                onClick={() => { beginNavigation(targetHref); setMobileOpen(false); }}
                onPointerEnter={() => prefetchNavigationTarget(targetHref)}
                onFocus={() => prefetchNavigationTarget(targetHref)}
                onPointerDown={() => prefetchNavigationTarget(targetHref)}
                onTouchStart={() => prefetchNavigationTarget(targetHref)}
                aria-busy={pending || undefined}
                className={cn(
                  "flex h-[34px] min-w-0 items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 text-[13px] font-medium text-[var(--text-secondary)] transition-[background-color,color,opacity] ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]",
                  pending && "bg-[var(--surface-selected)] text-[var(--text-primary)] opacity-60 [&>svg]:text-[var(--accent)]",
                )}
              >
                <Icon className="size-4 shrink-0 text-[var(--text-tertiary)]" strokeWidth={pending ? 2 : 1.8} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
              </Link>;
            })}</div>
          </div> : null}
          <Navigation pathname={pathname} collapsed={false} pendingHref={visiblePendingHref} onNavigate={(href) => { beginNavigation(href); setMobileOpen(false); }} onIntent={prefetchNavigationTarget} />
        </div>
        <Link
          href="/settings"
          prefetch={false}
          onClick={() => { beginNavigation("/settings"); setMobileOpen(false); }}
          onPointerEnter={() => prefetchNavigationTarget("/settings")}
          onFocus={() => prefetchNavigationTarget("/settings")}
          className="mx-3 mb-3 flex h-10 items-center gap-2.5 border-t border-[var(--border-subtle)] px-2 pt-2 text-[13px] font-medium text-[var(--text-secondary)]"
        >
          <Settings className="size-4 text-[var(--text-tertiary)]" strokeWidth={1.8} aria-hidden="true" />Settings
        </Link>
      </SheetContent>
    </Sheet>
    <div style={{ "--shell-width": desktopWidth } as React.CSSProperties} className="min-w-0 md:ml-[var(--shell-width)]">
      <header className="sticky top-0 z-20 flex h-[var(--toolbar-height)] items-center gap-2.5 border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface-canvas)_88%,transparent)] px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl sm:px-4">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="打开导航"><Menu aria-hidden="true" /></Button>
        <button type="button" onClick={() => openCommand("search")} className="mx-auto flex h-8 w-full max-w-lg items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-control)] px-2.5 text-left text-[13px] text-[var(--text-tertiary)] transition-[background-color,color] ui-transition hover:bg-[var(--surface-control-hover)] hover:text-[var(--text-secondary)]"><Search className="size-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" /><span className="min-w-0 flex-1 truncate sm:hidden">搜索…</span><span className="hidden min-w-0 flex-1 truncate sm:inline">搜索 Personal OS…</span><kbd className="hidden font-sans text-[10px] font-medium text-[var(--text-tertiary)] sm:inline">⌘K</kbd></button>
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" onClick={openGlobalAgent} aria-label="询问 Personal OS" className="gap-1.5"><Sparkles className="size-3.5" aria-hidden="true"/><span className="hidden sm:inline">Ask</span><kbd className="hidden font-sans text-[9px] font-medium text-[var(--text-tertiary)] lg:inline">⌘J</kbd></Button></TooltipTrigger><TooltipContent>Ask Personal OS</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" onClick={openContextualCreate} aria-label="快速新建"><Plus aria-hidden="true" /></Button></TooltipTrigger><TooltipContent>快速新建（⌘N）</TooltipContent></Tooltip>
      </header>
      <div className="min-w-0"><main id="main-content" className={cn("min-w-0", shellContentClass(pathname))}>{children}</main>{globalAgentOpen ? <GlobalAgent open onClose={closeGlobalAgent} /> : null}</div>
    </div>
    <MobileTabBar onOpenMore={() => setMobileOpen(true)} pendingHref={visiblePendingHref} onNavigate={beginNavigation} onIntent={prefetchNavigationTarget} />
    <GlobalCommandPalette open={commandOpen} onOpenChange={setCommandOpen} initialSection={commandSection} />
    <GlobalCreateLayer />
  </div>;
}

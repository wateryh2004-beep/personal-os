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
import { releaseMobileBackLayerForNavigation } from "@/lib/mobile/use-mobile-back-layer";
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
  mobileMoreNavigationGroups,
  getMobileRecentNavigation,
  mergeRecentNavigation,
  navigationItemForPath,
  parseRecentNavigation,
  RECENT_NAVIGATION_STORAGE_KEY,
  type RecentNavigationItem,
} from "@/lib/navigation-registry";
import { useShellNavigation, type ShellNavigationEvent } from "@/components/layout/use-shell-navigation";
import { GlobalCreateLayer } from "@/components/shared/global-create-layer";
import { matchesShortcut } from "@/features/shortcuts/registry";
import { ActionFeedbackProvider } from "@/components/shared/action-feedback";
import {
  activeWorkspacePrefetchHref,
  afterActiveWorkspaceRead,
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
  onNavigate?: (href: string, event: ShellNavigationEvent) => void;
  onIntent?: (href: string) => void;
  groups?: typeof desktopNavigationGroups;
};

function pathnameFromHref(href: string | null | undefined) {
  if (!href) return null;
  return href.split(/[?#]/, 1)[0] || "/";
}

function Navigation({ pathname, collapsed, pendingHref, onNavigate, onIntent, groups = desktopNavigationGroups }: NavigationProps) {
  const pendingPathname = pathnameFromHref(pendingHref);

  return <nav aria-label="主导航" className="space-y-5.5">{groups.map((group, groupIndex) => <div key={group.label ?? groupIndex}>
    {group.label && !collapsed ? <p className="mb-1.5 px-2.5 text-[10.5px] font-semibold tracking-[0.015em] text-[var(--text-tertiary)]">{group.label}</p> : null}
    <div className="space-y-px">{group.items.map(({ name, href, icon: Icon }) => {
      const active = navActive(pathname, href);
      const pending = pendingPathname ? navActive(pendingPathname, href) : false;
      const selected = pendingPathname ? pending : active;
      const link = <Link
        href={href}
        prefetch={false}
        onNavigate={(event) => onNavigate?.(href, event)}
        onPointerEnter={() => onIntent?.(href)}
        onFocus={() => onIntent?.(href)}
        onPointerDown={() => onIntent?.(href)}
        onTouchStart={() => onIntent?.(href)}
        aria-current={active ? "page" : undefined}
        aria-busy={pending || undefined}
        data-pending={pending || undefined}
        aria-label={collapsed ? name : undefined}
        className={cn(
          "navigation-link pressable relative flex h-[36px] min-w-0 items-center gap-2.5 rounded-[11px] px-2.5 text-[13px] font-medium tracking-[-0.007em]",
          selected
            ? "bg-[var(--surface-selected)] text-[var(--text-primary)] [&>svg]:text-[var(--accent)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]",
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
  if (pathname === "/leisure" || pathname.startsWith("/leisure/")) return "w-full p-0 pb-[calc(var(--tab-bar-height)+1rem)] md:pb-0";
  if (pathname === "/today" || pathname === "/calendar" || pathname === "/tasks" || pathname === "/files" || pathname === "/career/roadmap") return "p-0";
  if (pathname === "/notes" || /^\/notes\/[0-9a-f-]{36}$/.test(pathname)) return "p-0";
  if (pathname.startsWith("/career")) return "career-surface mx-auto w-full max-w-[980px] px-4 py-7 pb-[calc(var(--tab-bar-height)+1rem)] sm:px-6 md:pb-8 lg:px-8";
  return "mx-auto w-full max-w-[var(--content-dashboard-width)] px-4 py-6 pb-[calc(var(--tab-bar-height)+1rem)] sm:px-6 md:pb-6 lg:px-8";
}

type PrefetchableWorkspaceResource = {
  get: () => { data?: unknown; promise?: Promise<unknown>; error?: Error };
  subscribe: (listener: () => void) => () => void;
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

async function prefetchWorkspaceData(href: WorkspacePrefetchHref, coldOnly: boolean) {
  const resource = workspaceResourceForHref(href);
  if (coldOnly && !shouldBackgroundWarmData(resource.get().data)) return;
  await resource.prefetch().catch(() => {});
}

export function AppShell({ children, presentationPathname }: { children: React.ReactNode; presentationPathname?: string }) {
  return <ActionFeedbackProvider><WorkspacePanelProvider><AppShellInner presentationPathname={presentationPathname}>{children}</AppShellInner></WorkspacePanelProvider></ActionFeedbackProvider>;
}

function AppShellInner({ children, presentationPathname }: { children: React.ReactNode; presentationPathname?: string }) {
  const routePathname = usePathname();
  const pathname = presentationPathname ?? routePathname;
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandSection, setCommandSection] = useState<CommandCenterSection>("search");
  const { navigate, pendingHref: visiblePendingHref } = useShellNavigation(pathname, router);
  const [recentNavigation, setRecentNavigation] = useState<RecentNavigationItem[]>([]);
  const backgroundPrefetched = useRef(new Set<WorkspacePrefetchHref>());
  const { isOpen: globalAgentOpen, open: openGlobalAgent, close: closeGlobalAgent } = useWorkspacePanel("global-agent");

  const beginNavigation = useCallback((href: string, event?: ShellNavigationEvent) => {
    event?.preventDefault();
    if (new URL(href, window.location.href).href !== window.location.href) {
      releaseMobileBackLayerForNavigation("sheet");
    }
    const targetPath = pathnameFromHref(href);
    // A requested navigation is not speculation: start its data alongside RSC,
    // including keyboard/command/query links without an earlier pointer hover.
    if (targetPath && isWorkspacePrefetchHref(targetPath)) void prefetchWorkspaceData(targetPath, false);
    navigate(href);
  }, [navigate]);

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
    const handleNavigationStart = (event: Event) => {
      const href = (event as CustomEvent<{ href?: unknown }>).detail?.href;
      if (typeof href !== "string" || !event.cancelable) return;
      event.preventDefault();
      beginNavigation(href);
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
    const timer = window.setTimeout(() => {
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
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (document.visibilityState !== "visible" || shouldAvoidSpeculativePrefetch()) return;
    const targets = backgroundWorkspacePrefetchTargets(pathname).filter(
      (href) => !backgroundPrefetched.current.has(href),
    );
    if (!targets.length) return;

    let cancelled = false;
    const activeHref = activeWorkspacePrefetchHref(pathname);
    const activeResource = activeHref ? workspaceResourceForHref(activeHref) : undefined;
    const prefetch = () => {
      if (cancelled || document.visibilityState !== "visible" || shouldAvoidSpeculativePrefetch()) return;
      void (async () => {
        for (const href of targets) {
          // A foreground refresh can begin between background reads too.
          await activeResource?.get().promise?.catch(() => {});
          if (cancelled || document.visibilityState !== "visible" || shouldAvoidSpeculativePrefetch()) return;
          backgroundPrefetched.current.add(href);
          router.prefetch(href);
          // Idle reads are serial so they do not compete with the active view.
          await prefetchWorkspaceData(href, true);
        }
      })();
    };

    const idleWindow = window as unknown as {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let cancelScheduled = () => {};
    const schedule = () => {
      if (cancelled) return;
      if (idleWindow.requestIdleCallback) {
        const handle = idleWindow.requestIdleCallback(prefetch, { timeout: 1_800 });
        cancelScheduled = () => idleWindow.cancelIdleCallback?.(handle);
      } else {
        const timer = window.setTimeout(prefetch, 1_200);
        cancelScheduled = () => window.clearTimeout(timer);
      }
    };
    // Subscribe before a cold resource starts so an early idle callback cannot
    // race its mount effect. Existing warm snapshots retain idle warming.
    const stopWaiting = activeResource ? afterActiveWorkspaceRead(activeResource, schedule) : undefined;
    if (!activeResource) schedule();
    return () => {
      cancelled = true;
      stopWaiting?.();
      cancelScheduled();
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
    try {
      localStorage.setItem(sidebarStorageKey, JSON.stringify(next));
    } catch {
      /* Sidebar controls still work if browser storage is unavailable. */
    }
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

  const desktopSidebar = useMemo(() => <aside style={{ width: desktopWidth }} className="app-sidebar fixed inset-y-0 left-0 z-30 hidden shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--material-sidebar)] md:flex">
    <div className={cn("flex h-12 items-center px-2.5", collapsed ? "justify-center" : "justify-between")}>
      <Link
        href="/today"
        prefetch={false}
        onNavigate={(event) => beginNavigation("/today", event)}
        onPointerEnter={() => prefetchNavigationTarget("/today")}
        onFocus={() => prefetchNavigationTarget("/today")}
        aria-label="Life of HANG，返回今日"
        className={cn("wordmark truncate text-[15.5px] text-[var(--text-primary)]", collapsed ? "text-base" : "px-1.5")}
      >
        {collapsed ? "H" : "Life of HANG"}
      </Link>
      {collapsed ? null : <button type="button" onClick={toggleCollapsed} className="pressable grid size-7 place-items-center rounded-[var(--radius-md)] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)]" aria-label="折叠侧栏"><ChevronLeft className="size-3.5" strokeWidth={1.9} aria-hidden="true" /></button>}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
      <Navigation pathname={pathname} collapsed={collapsed} pendingHref={visiblePendingHref} onNavigate={beginNavigation} onIntent={prefetchNavigationTarget} />
    </div>
    <div className="mx-2.5 space-y-px border-t border-[var(--border-subtle)] py-2.5">
      {collapsed ? <Tooltip><TooltipTrigger asChild><button type="button" onClick={toggleCollapsed} className="pressable flex h-9 w-full items-center justify-center rounded-[var(--radius-md)] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)]" aria-label="展开侧栏"><ChevronRight className="size-4" strokeWidth={1.8} aria-hidden="true" /></button></TooltipTrigger><TooltipContent side="right">展开侧栏</TooltipContent></Tooltip> : null}
      <Link
        href="/settings"
        prefetch={false}
        onNavigate={(event) => beginNavigation("/settings", event)}
        onPointerEnter={() => prefetchNavigationTarget("/settings")}
        onFocus={() => prefetchNavigationTarget("/settings")}
        aria-current={pathname === "/settings" ? "page" : undefined}
        className={cn(
          "pressable flex h-9 items-center gap-2.5 rounded-[11px] text-[13px] font-medium tracking-[-0.007em]",
          pathname === "/settings"
            ? "bg-[var(--surface-selected)] text-[var(--text-primary)] [&>svg]:text-[var(--accent)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]",
          collapsed ? "justify-center" : "px-2.5",
        )}
        aria-label={collapsed ? "设置" : undefined}
      >
        <Settings className="size-4 text-[var(--text-tertiary)]" strokeWidth={1.8} aria-hidden="true" />
        {collapsed ? null : "设置"}
      </Link>
      <form action={logoutAction} onSubmit={() => { clearWorkspaceSessions(); clearWorkspaceResources(); }}>
        <button className={cn("pressable flex h-9 w-full items-center gap-2.5 rounded-[11px] text-[13px] font-medium tracking-[-0.007em] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)]", collapsed ? "justify-center" : "px-2.5")} aria-label={collapsed ? "退出登录" : undefined}>
          <LogOut className="size-4" strokeWidth={1.8} aria-hidden="true" />
          {collapsed ? null : "退出登录"}
        </button>
      </form>
    </div>
  </aside>, [beginNavigation, collapsed, desktopWidth, pathname, prefetchNavigationTarget, visiblePendingHref]);

  return <div className={cn("min-h-[var(--app-viewport-height)] bg-[var(--surface-app)]", pathname === "/today" && "today-shell")}>
    <a href="#main-content" className="skip-link fixed left-3 top-3 z-[100] rounded-[var(--radius-md)] bg-[var(--surface-canvas)] px-4 py-3 text-sm text-[var(--accent)] shadow-[var(--shadow-popover)] -translate-y-[200%] focus:translate-y-0" onClick={(event) => {
      event.preventDefault();
      document.getElementById("main-content")?.focus({ preventScroll: true });
    }}>跳到正文</a>
    {visiblePendingHref ? <>
      <div data-navigation-progress aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden bg-[var(--accent-soft)]" />
      <p role="status" className="sr-only">正在打开{navigationItemForPath(pathnameFromHref(visiblePendingHref) ?? "")?.name ?? "页面"}…</p>
    </> : null}
    {desktopSidebar}
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetContent side="left" className="w-[min(84vw,282px)] gap-0 border-r border-[var(--border-subtle)] bg-[var(--material-thick)] p-0">
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
                onNavigate={(event) => { beginNavigation(targetHref, event); setMobileOpen(false); }}
                onPointerEnter={() => prefetchNavigationTarget(targetHref)}
                onFocus={() => prefetchNavigationTarget(targetHref)}
                onPointerDown={() => prefetchNavigationTarget(targetHref)}
                onTouchStart={() => prefetchNavigationTarget(targetHref)}
                aria-busy={pending || undefined}
                data-pending={pending || undefined}
                className={cn(
                  "navigation-link relative flex h-[34px] min-w-0 items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 text-[13px] font-medium text-[var(--text-secondary)] transition-[background-color,color,opacity] ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]",
                  pending && "bg-[var(--surface-selected)] text-[var(--text-primary)] [&>svg]:text-[var(--accent)]",
                )}
              >
                <Icon className="size-4 shrink-0 text-[var(--text-tertiary)]" strokeWidth={pending ? 2 : 1.8} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
              </Link>;
            })}</div>
          </div> : null}
          <Navigation groups={mobileMoreNavigationGroups} pathname={pathname} collapsed={false} pendingHref={visiblePendingHref} onNavigate={(href, event) => { beginNavigation(href, event); setMobileOpen(false); }} onIntent={prefetchNavigationTarget} />
        </div>
        <Link
          href="/settings"
          prefetch={false}
          onNavigate={(event) => { beginNavigation("/settings", event); setMobileOpen(false); }}
          onPointerEnter={() => prefetchNavigationTarget("/settings")}
          onFocus={() => prefetchNavigationTarget("/settings")}
          className={cn(
          "mx-3 mb-3 flex h-10 items-center gap-2.5 border-t border-[var(--border-subtle)] px-2 pt-2 text-[13px] font-medium",
          pathname === "/settings" ? "text-[var(--text-primary)] [&>svg]:text-[var(--accent)]" : "text-[var(--text-secondary)]",
        )}
        >
          <Settings className="size-4 text-[var(--text-tertiary)]" strokeWidth={1.8} aria-hidden="true" />设置
        </Link>
      </SheetContent>
    </Sheet>
    <div style={{ "--shell-width": desktopWidth } as React.CSSProperties} className="min-h-[var(--app-viewport-height)] min-w-0 bg-[var(--surface-canvas)] md:ml-[var(--shell-width)]">
      <header className="app-toolbar sticky top-0 z-20 flex h-[var(--toolbar-height)] items-center gap-2.5 border-b border-[var(--border-subtle)] bg-[var(--material-toolbar)] px-3 pt-[env(safe-area-inset-top)] sm:px-4">
        <Button variant="ghost" size="icon-sm" className="today-mobile-menu md:hidden" onClick={() => setMobileOpen(true)} aria-label="打开导航"><Menu aria-hidden="true" /></Button>
        {pathname === "/today" ? <span className="today-mobile-brand" aria-hidden="true">PERSONAL OS</span> : null}
        <button type="button" aria-label="搜索 Personal OS" onClick={() => openCommand("search")} className="today-search pressable mx-auto flex h-8 w-full max-w-lg items-center gap-2 rounded-[11px] bg-[var(--surface-control)] px-2.5 text-left text-[13px] text-[var(--text-tertiary)] shadow-[inset_0_1px_0_rgba(255,255,255,.36)] hover:bg-[var(--surface-control-hover)] hover:text-[var(--text-secondary)]"><Search className="size-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" /><span className="min-w-0 flex-1 truncate sm:hidden">搜索…</span><span className="hidden min-w-0 flex-1 truncate sm:inline">搜索 Personal OS…</span><kbd className="hidden font-sans text-[10px] font-medium text-[var(--text-tertiary)] sm:inline">⌘K</kbd></button>
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" onClick={openGlobalAgent} aria-label="询问 Personal OS" className="gap-1.5"><Sparkles className="size-3.5" aria-hidden="true"/><span className="hidden sm:inline">询问</span><kbd className="hidden font-sans text-[9px] font-medium text-[var(--text-tertiary)] lg:inline">⌘J</kbd></Button></TooltipTrigger><TooltipContent>询问 Personal OS（⌘J）</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" onClick={openContextualCreate} aria-label="快速新建"><Plus aria-hidden="true" /></Button></TooltipTrigger><TooltipContent>快速新建（⌘N）</TooltipContent></Tooltip>
      </header>
      <div className="min-w-0">
        <main id="main-content" tabIndex={-1} className={cn("min-w-0", shellContentClass(pathname))}>{children}</main>
        {globalAgentOpen ? <GlobalAgent open onClose={closeGlobalAgent} /> : null}
      </div>
    </div>
    <MobileTabBar presentationPathname={presentationPathname} onOpenMore={() => setMobileOpen(true)} pendingHref={visiblePendingHref} onNavigate={beginNavigation} onIntent={prefetchNavigationTarget} />
    <GlobalCommandPalette open={commandOpen} onOpenChange={setCommandOpen} initialSection={commandSection} />
    <GlobalCreateLayer />
  </div>;
}

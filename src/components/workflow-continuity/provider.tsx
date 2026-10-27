"use client";

import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useOptionalWorkbenchHost, useWorkbenchHost } from "@/components/workbench/workbench-provider";
import { navigationItemForPath } from "@/lib/navigation-registry";
import { safeWorkbenchHref } from "@/features/workbench/contracts";
import { beginSourceNavigation, cancelSourceNavigation, captureSourceNavigation, consumeSourceTrailEntry, getSourceTrail, getSourceTrailServerSnapshot, requestSourceSearchRestore, subscribeSourceTrail, type SourceSearchState } from "@/features/workflow-continuity/source-trail";
import { SourceNavigationContext } from "./source-link";
export { SourceLink, useSourceNavigation } from "./source-link";

export { WorkflowContinuityControls } from "./tray";

export function WorkflowSourceTrail() {
  const host = useWorkbenchHost(); const pathname = usePathname();
  const entries = useSyncExternalStore(subscribeSourceTrail, getSourceTrail, getSourceTrailServerSnapshot);
  const relevant = entries.filter(entry => entry.destination.split(/[?#]/)[0] === pathname || entries.at(-1)?.destination.split(/[?#]/)[0] === pathname);
  if (!relevant.length) return null;
  return <nav aria-label="来时路径" className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--separator)] px-4 py-1 text-xs text-[var(--text-secondary)]">
    {relevant.map(entry => <button key={entry.id} type="button" className="ui-link inline-flex min-h-9 items-center gap-1" onClick={() => { void host.restore(entry.scene, ack => { if (ack.status !== "applied" && ack.status !== "partial") return; const source = consumeSourceTrailEntry(entry.id); if (source?.search) requestSourceSearchRestore(source.search); }); }}><ArrowLeft className="size-3" aria-hidden="true" />返回{entry.label}</button>)}
  </nav>;
}

export function WorkflowNavigationBoundary({ children }: { children: ReactNode }) {
  const host = useOptionalWorkbenchHost(); const router = useRouter();
  const capture = host?.capture;
  useEffect(() => {
    const linkIntent = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.composedPath().find((node): node is Element => node instanceof Element && node.localName === "a" && node.hasAttribute("href"));
      const target = anchor?.getAttribute("target");
      if (!anchor || (target && target.toLowerCase() !== "_self") || anchor.hasAttribute("download")) return;
      let destination: URL;
      try { destination = new URL(anchor.getAttribute("href")!, document.baseURI); } catch { return; }
      if (destination.origin !== window.location.origin || !["http:", "https:"].includes(destination.protocol)) return;
      // Observe intent before Next's bubbling onClick/onNavigate. Never block a
      // normal link or its save guard; SourceLink starts its fresh epoch later.
      cancelSourceNavigation();
    };
    document.addEventListener("click", linkIntent, true);
    window.addEventListener("popstate", cancelSourceNavigation);
    window.addEventListener("personal-os:navigation-start", cancelSourceNavigation);
    return () => {
      document.removeEventListener("click", linkIntent, true);
      window.removeEventListener("popstate", cancelSourceNavigation);
      window.removeEventListener("personal-os:navigation-start", cancelSourceNavigation);
      cancelSourceNavigation();
    };
  }, []);
  const navigate = useCallback((destination: string, label?: string, search?: SourceSearchState) => {
    const href = safeWorkbenchHref(destination); if (!href || href !== destination) return false;
    const current = beginSourceNavigation();
    if (!capture) return false;
    void captureSourceNavigation({ capture, destination: href, label: label ?? navigationItemForPath(window.location.pathname)?.name ?? "来源页面", current, search, navigate: target => router.push(target) });
    return true;
  }, [router, capture]);
  return <SourceNavigationContext.Provider value={navigate}>{children}</SourceNavigationContext.Provider>;
}

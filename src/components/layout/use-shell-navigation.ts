"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { perfMark, perfMeasure } from "@/lib/perf";

export type ShellNavigationEvent = { preventDefault: () => void };

type ShellRouter = { push: (href: string) => void | Promise<void> };
type NavigationRequest = { href: string; from: string };
const targetPathname = (href: string) => href.split(/[?#]/, 1)[0];

/** Let React own navigation completion, including redirects and interrupted routes. */
export function useShellNavigation(pathname: string, router: ShellRouter) {
  const [request, setRequest] = useState<NavigationRequest | null>(null);
  const [isPending, startTransition] = useTransition();
  const navigation = useRef<NavigationRequest | null>(null);

  const navigate = useCallback((href: string) => {
    const next = { href, from: pathname };
    navigation.current = next;
    // Still push the current URL: it can cancel an older, unfinished navigation.
    const unchanged = new URL(href, window.location.href).href === window.location.href;
    setRequest(unchanged ? null : next);
    perfMark("navigation-click", { href });
    startTransition(() => router.push(href));
  }, [pathname, router]);

  useEffect(() => {
    if (!navigation.current) return;
    const { href, from } = navigation.current;
    const destinationCommitted = pathname !== from && targetPathname(href) === pathname;
    if (isPending && !destinationCommitted) return;
    navigation.current = null;
    if (pathname === from && targetPathname(href) !== pathname) return;
    perfMark("route-commit", { href: pathname });
    perfMeasure("route-commit", "navigation-click", { href: pathname });
    perfMeasure("navigation-ready", "navigation-click", { href: pathname });
  }, [isPending, pathname]);

  useEffect(() => {
    const clearPendingNavigation = () => {
      navigation.current = null;
      setRequest(null);
    };
    window.addEventListener("popstate", clearPendingNavigation);
    return () => window.removeEventListener("popstate", clearPendingNavigation);
  }, []);

  // React may batch overlapping transitions. A committed latest destination is
  // already usable even if an older navigation is still settling in the background.
  const destinationCommitted = request && pathname !== request.from && targetPathname(request.href) === pathname;
  return { navigate, pendingHref: isPending && !destinationCommitted ? request?.href ?? null : null };
}

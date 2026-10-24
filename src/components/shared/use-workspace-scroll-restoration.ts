"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { loadWorkspaceSession, saveWorkspaceSession } from "@/lib/workspace-session";

/** Same-tab scroll recovery for master lists; it never changes browser history. */
export function useWorkspaceScrollRestoration(key: string, ready = true) {
  const ref = useRef<HTMLElement | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const routeKey = useMemo(() => `${pathname}${search ? `?${search}` : ""}`, [pathname, search]);

  useLayoutEffect(() => {
    // A pending async list has no meaningful scroll range. Restoring/saving on
    // that shell would clamp an existing position to zero before rows arrive.
    if (!ready) return;
    const node = ref.current;
    if (!node) return;
    const storageKey = `scroll:${key}:${routeKey}`;
    // Restore before the browser captures a shared-title return transition.
    const saved = loadWorkspaceSession<{ scrollTop?: number }>(storageKey);
    node.scrollTop = typeof saved?.scrollTop === "number" ? saved.scrollTop : 0;
    const save = () => saveWorkspaceSession(storageKey, { scrollTop: node.scrollTop });
    node.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", save);
    // Scroll events already capture user changes. Saving during cleanup can
    // overwrite the old route with zero after a new loading shell shrinks it.
    return () => { node.removeEventListener("scroll", save); window.removeEventListener("pagehide", save); };
  }, [key, ready, routeKey]);
  return ref;
}

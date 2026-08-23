"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { loadWorkspaceSession, saveWorkspaceSession } from "@/lib/workspace-session";

/** Same-tab scroll recovery for master lists; it never changes browser history. */
export function useWorkspaceScrollRestoration(key: string) {
  const ref = useRef<HTMLElement | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const routeKey = useMemo(() => `${pathname}${search ? `?${search}` : ""}`, [pathname, search]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const storageKey = `scroll:${key}:${routeKey}`;
    const restore = window.setTimeout(() => {
      const saved = loadWorkspaceSession<{ scrollTop?: number }>(storageKey);
      node.scrollTop = typeof saved?.scrollTop === "number" ? saved.scrollTop : 0;
    }, 0);
    const save = () => saveWorkspaceSession(storageKey, { scrollTop: node.scrollTop });
    node.addEventListener("scroll", save, { passive: true });
    return () => { window.clearTimeout(restore); save(); node.removeEventListener("scroll", save); };
  }, [key, routeKey]);
  return ref;
}

"use client";

import { useEffect, useRef } from "react";
import { loadWorkspaceSession, saveWorkspaceSession } from "@/lib/workspace-session";

/** Same-tab scroll recovery for master lists; it never changes browser history. */
export function useWorkspaceScrollRestoration(key: string) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const restore = window.setTimeout(() => {
      const saved = loadWorkspaceSession<{ scrollTop?: number }>(`scroll:${key}`);
      if (typeof saved?.scrollTop === "number") node.scrollTop = saved.scrollTop;
    }, 0);
    const save = () => saveWorkspaceSession(`scroll:${key}`, { scrollTop: node.scrollTop });
    node.addEventListener("scroll", save, { passive: true });
    return () => { window.clearTimeout(restore); save(); node.removeEventListener("scroll", save); };
  }, [key]);
  return ref;
}

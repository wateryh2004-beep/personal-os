"use client";

import { useEffect, useState } from "react";
import { reconcileWorkspaceScope } from "@/lib/workspace-resource-cache";

/** Gate a changed identity before any child can read a previous tab snapshot. */
export function WorkspaceIdentityBoundary({ ownerId, revision, children }: { ownerId: string; revision: string; children?: React.ReactNode }) {
  const [readyOwner, setReadyOwner] = useState<string | null>(null);
  useEffect(() => {
    reconcileWorkspaceScope(ownerId, revision);
    // The gate intentionally waits for cache/session eviction before mounting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReadyOwner(ownerId);
  }, [ownerId, revision]);
  useEffect(() => {
    const leave = () => { setReadyOwner(null); window.location.replace("/login"); };
    window.addEventListener("personal-os:workspace-auth-failed", leave);
    return () => window.removeEventListener("personal-os:workspace-auth-failed", leave);
  }, []);
  return readyOwner === ownerId ? children : <div aria-busy="true" aria-label="正在打开工作区" className="min-h-[100dvh] bg-[var(--surface-canvas)]" />;
}

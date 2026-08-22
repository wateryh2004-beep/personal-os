"use client";

import { useEffect, useSyncExternalStore } from "react";
import { NowWorkspaceView } from "@/components/today/now-workspace";
import { perfMark, perfMeasure } from "@/lib/perf";
import { todayWorkspaceResource } from "@/features/today/workspace-resource";
import { useWorkspaceResourceLifecycle } from "@/lib/workspace-resource-cache";
import type { NowWorkspace } from "@/features/today/types";

function TodayShell() { return <div aria-busy="true" className="mx-auto max-w-[var(--content-dashboard-width)] space-y-7 px-4 py-5 sm:px-6 sm:py-6"><div className="h-8 w-48 rounded bg-[var(--surface-hover)]" /><div className="h-32 rounded border bg-[var(--surface-hover)]/50" /><div className="grid gap-7 lg:grid-cols-2"><div className="h-64 rounded border" /><div className="h-64 rounded border" /></div></div>; }

export function TodayWorkspaceLoader({ initialWorkspace }: { initialWorkspace: NowWorkspace }) {
  const snapshot = useSyncExternalStore(todayWorkspaceResource.subscribe, todayWorkspaceResource.get, todayWorkspaceResource.get);
  useWorkspaceResourceLifecycle(todayWorkspaceResource);
  useEffect(() => {
    // Server Components begin this read during route navigation. Seed it into
    // the tab cache after hydration, unless an intent prefetch already won.
    if (!todayWorkspaceResource.get().data) todayWorkspaceResource.set(initialWorkspace);
    perfMark("workspace-visible", { workspace: "today", cached: Boolean(todayWorkspaceResource.get().data) });
    void todayWorkspaceResource.revalidate().then(() => perfMeasure("workspace-data-ready", "navigation-click", { workspace: "today" })).catch(() => {});
  }, [initialWorkspace]);
  const data = snapshot.data ?? initialWorkspace;
  return data ? <NowWorkspaceView workspace={data} /> : <TodayShell />;
}

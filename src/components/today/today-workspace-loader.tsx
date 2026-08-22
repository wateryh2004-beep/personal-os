"use client";

import { useEffect, useSyncExternalStore } from "react";
import { NowWorkspaceView } from "@/components/today/now-workspace";
import { perfMark, perfMeasure } from "@/lib/perf";
import { todayWorkspaceResource } from "@/features/today/workspace-resource";
import { useWorkspaceResourceLifecycle } from "@/lib/workspace-resource-cache";
import type { NowWorkspace } from "@/features/today/types";

function TodayShell() {
  return (
    <div aria-busy="true" className="now-workspace mx-auto w-full max-w-[1080px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <div className="ui-skeleton-shimmer h-3 w-28 rounded-full" />
      <div className="ui-skeleton-shimmer mt-3 h-8 w-24 rounded-[7px]" />
      <div className="ui-skeleton-shimmer mt-4 h-3 w-56 max-w-[70%] rounded-full" />
      <div className="ui-skeleton-shimmer mt-7 h-9 w-full max-w-[680px] rounded-[var(--radius-md)]" />

      <div className="mt-11 border-y border-[var(--separator)] py-5">
        <div className="ui-skeleton-shimmer h-2.5 w-20 rounded-full" />
        <div className="mt-5 space-y-4">
          <div className="ui-skeleton-shimmer h-4 w-[min(440px,76%)] rounded-full" />
          <div className="ui-skeleton-shimmer h-3 w-[min(320px,58%)] rounded-full" />
        </div>
      </div>

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1.32fr)_minmax(300px,.82fr)] lg:gap-16">
        {[0, 1].map((column) => (
          <div key={column}>
            <div className="ui-skeleton-shimmer h-3 w-24 rounded-full" />
            <div className="mt-5 space-y-5 border-t border-[var(--separator)] pt-5">
              {[0, 1, 2].map((row) => (
                <div key={row} className="grid grid-cols-[52px_minmax(0,1fr)] gap-4">
                  <div className="ui-skeleton-shimmer h-3 w-10 rounded-full" />
                  <div className="space-y-2">
                    <div className="ui-skeleton-shimmer h-3.5 w-[min(340px,82%)] rounded-full" />
                    <div className="ui-skeleton-shimmer h-2.5 w-24 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TodayWorkspaceLoader({ initialWorkspace }: { initialWorkspace: NowWorkspace }) {
  const snapshot = useSyncExternalStore(todayWorkspaceResource.subscribe, todayWorkspaceResource.get, todayWorkspaceResource.get);
  useWorkspaceResourceLifecycle(todayWorkspaceResource);
  useEffect(() => {
    const hadCachedData = todayWorkspaceResource.get().data !== undefined;
    todayWorkspaceResource.set(initialWorkspace);
    perfMark("workspace-visible", { workspace: "today", cached: hadCachedData, source: "rsc" });
    void todayWorkspaceResource.revalidate().then(() => perfMeasure("workspace-data-ready", "navigation-click", { workspace: "today" })).catch(() => {});
  }, [initialWorkspace]);
  const data = snapshot.data ?? initialWorkspace;
  return data ? <NowWorkspaceView workspace={data} /> : <TodayShell />;
}

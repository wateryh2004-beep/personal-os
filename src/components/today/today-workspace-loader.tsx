"use client";

import { NowWorkspaceView } from "@/components/today/now-workspace";
import { todayWorkspaceResource } from "@/features/today/workspace-resource";
import { useWorkspaceResource } from "@/lib/workspace-resource-cache";
import { WorkspaceReadError } from "@/components/shared/workspace-read-error";
import { WorkspaceSyncStatus } from "@/components/shared/workspace-sync-status";

export function TodayShell() {
  return <div aria-busy="true" aria-label="正在载入今天" className="today-calm now-workspace">
    <header><div className="ui-skeleton-shimmer h-3 w-28 rounded-full" /><div className="ui-skeleton-shimmer mt-3 h-10 w-20 rounded" /></header>
    <div className="mt-8"><div className="ui-skeleton-shimmer h-3 w-20 rounded" /><div className="ui-skeleton-shimmer mt-4 h-8 w-4/5 rounded" /><div className="ui-skeleton-shimmer mt-3 h-8 w-3/5 rounded" /><div className="ui-skeleton-shimmer mt-6 h-11 w-28 rounded-full" /></div>
    <div className="mt-8 border-t border-[var(--separator)] pt-7">{[0,1].map(row => <div key={row} className="mb-6 flex gap-4"><div className="ui-skeleton-shimmer h-3 w-10 rounded" /><div className="ui-skeleton-shimmer h-4 w-2/3 rounded" /></div>)}</div>
  </div>;
}

export function TodayWorkspaceLoader() {
  const snapshot = useWorkspaceResource(todayWorkspaceResource, "today");

  const data = snapshot.data;
  if (!data && snapshot.error) return <WorkspaceReadError resource={todayWorkspaceResource} />;
  return data ? <>
    <WorkspaceSyncStatus error={snapshot.error} resource={todayWorkspaceResource} />
    <NowWorkspaceView workspace={data} />
  </> : <TodayShell />;
}

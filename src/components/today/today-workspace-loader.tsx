"use client";

import { NowWorkspaceView } from "@/components/today/now-workspace";
import { todayWorkspaceResource } from "@/features/today/workspace-resource";
import { useWorkspaceResource } from "@/lib/workspace-resource-cache";
import { WorkspaceReadError } from "@/components/shared/workspace-read-error";
import { WorkspaceSyncStatus } from "@/components/shared/workspace-sync-status";

export function TodayShell() {
  return <div aria-busy="true" aria-label="正在载入今天" className="now-workspace mx-auto max-w-[1040px] px-5 py-6 sm:px-8 sm:py-9 lg:px-10 lg:py-11">
    <div className="ui-skeleton-shimmer h-3 w-28 rounded-full" />
    <div className="ui-skeleton-shimmer mt-3 h-8 w-20 rounded-lg" />
    <div className="mt-7 rounded-2xl bg-[var(--surface-control)] p-5"><div className="ui-skeleton-shimmer h-4 w-20 rounded" /><div className="ui-skeleton-shimmer mt-5 h-5 w-3/4 rounded" /><div className="ui-skeleton-shimmer mt-3 h-3 w-1/3 rounded" /></div>
    <div className="mt-8 grid gap-8 lg:grid-cols-2">{[0, 1].map((section) => <div key={section}><div className="ui-skeleton-shimmer h-4 w-24 rounded" />{[0,1].map((row) => <div key={row} className="mt-5 flex gap-4"><div className="ui-skeleton-shimmer h-3 w-12 rounded" /><div className="ui-skeleton-shimmer h-4 w-2/3 rounded" /></div>)}</div>)}</div>
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

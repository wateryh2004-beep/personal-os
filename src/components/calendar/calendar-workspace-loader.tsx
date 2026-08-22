"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { MicrosoftDeviceConnect } from "@/components/calendar/microsoft-device-connect";
import { calendarWorkspaceResource, type CalendarWorkspaceData } from "@/features/calendar/workspace-resource";
import { perfMark, perfMeasure } from "@/lib/perf";
import { useWorkspaceResourceLifecycle } from "@/lib/workspace-resource-cache";

function CalendarShell() {
  return (
    <section aria-busy="true" className="flex h-[calc(var(--app-viewport-height)-var(--toolbar-height)-var(--tab-bar-height))] bg-[var(--surface-canvas)]">
      <div className="flex w-full flex-col">
        <div className="flex min-h-[52px] items-center justify-between border-b border-[var(--border-subtle)] px-4">
          <div className="flex items-center gap-2"><div className="size-8 rounded-full bg-[var(--surface-hover)]"/><div className="h-5 w-44 rounded bg-[var(--surface-hover)]"/></div>
          <div className="flex gap-2"><div className="h-6 w-12 rounded bg-[var(--surface-hover)]"/><div className="h-8 w-16 rounded-[8px] bg-[var(--surface-hover)]"/></div>
        </div>
        <div className="flex h-9 items-center gap-2 border-b border-[rgba(60,60,67,.06)] px-4"><div className="h-5 w-14 rounded bg-[var(--surface-hover)]"/><div className="h-5 w-16 rounded bg-[var(--surface-hover)]"/><div className="h-5 w-12 rounded bg-[var(--surface-hover)]"/></div>
        <div className="grid min-h-0 flex-1 grid-cols-[52px_repeat(7,minmax(0,1fr))] opacity-70"><div className="border-r border-[var(--border-subtle)]"/>{Array.from({ length: 7 }).map((_, index) => <div key={index} className="border-r border-[rgba(60,60,67,.07)] last:border-r-0"/> )}</div>
      </div>
    </section>
  );
}

export function CalendarWorkspaceLoader({ initialWorkspace, initialCreateOpen = false, initialEventId }: { initialWorkspace: CalendarWorkspaceData; initialCreateOpen?: boolean; initialEventId?: string }) {
  const snapshot = useSyncExternalStore(calendarWorkspaceResource.subscribe, calendarWorkspaceResource.get, calendarWorkspaceResource.get);
  useWorkspaceResourceLifecycle(calendarWorkspaceResource);
  useEffect(() => {
    const hadCachedData = calendarWorkspaceResource.get().data !== undefined;
    calendarWorkspaceResource.set(initialWorkspace);
    perfMark("workspace-visible", { workspace: "calendar", cached: hadCachedData, source: "rsc" });
    void calendarWorkspaceResource.revalidate().then(() => perfMeasure("workspace-data-ready", "navigation-click", { workspace: "calendar" })).catch(() => {});
  }, [initialWorkspace]);
  const data = snapshot.data ?? initialWorkspace;
  if (!data) return <CalendarShell />;
  if (data.unavailable) return <section><h1 className="text-2xl font-semibold">Calendar</h1><p className="mt-4 border-l-2 border-[var(--danger)] bg-[rgba(215,0,21,.05)] px-3 py-2 text-sm text-[var(--danger)]">日历数据库尚未连接。请先应用 Calendar migration。</p></section>;
  if (!data.connection || data.connection.last_error_code === "calendar_not_connected") return <MicrosoftDeviceConnect reconnect={Boolean(data.connection)} />;
  return <CalendarWorkspace events={[]} categories={data.categories} timezone={data.timezone} syncStatus={data.sync} scopeReady={(data.connection.oauth_scope_version ?? 1) >= 2} initialCreateOpen={initialCreateOpen} initialEventId={initialEventId} />;
}

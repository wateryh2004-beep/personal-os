"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CalendarShell } from "./calendar-workspace-skeleton";
import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { MicrosoftDeviceConnect } from "@/components/calendar/microsoft-device-connect";
import { calendarWorkspaceResource, type CalendarWorkspaceData } from "@/features/calendar/workspace-resource";
import { perfMark, perfMeasure } from "@/lib/perf";
import { useWorkspaceResourceLifecycle } from "@/lib/workspace-resource-cache";


function CalendarMessage({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-[748px] px-5 py-8 sm:px-7">
      <h1 className="text-[27px] font-semibold tracking-[-0.042em] text-[var(--text-primary)]">日历</h1>
      <p className="mt-4.5 border-t border-[var(--separator)] pt-4.5 text-[12px] leading-5.5 text-[var(--text-secondary)]">{children}</p>
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
  if (data.unavailable) return <CalendarMessage>日历数据尚未连接。</CalendarMessage>;
  if (!data.connection || data.connection.last_error_code === "calendar_not_connected") return <MicrosoftDeviceConnect reconnect={Boolean(data.connection)} />;
  return <CalendarWorkspace events={[]} categories={data.categories} timezone={data.timezone} syncStatus={data.sync} scopeReady={(data.connection.oauth_scope_version ?? 1) >= 2} initialCreateOpen={initialCreateOpen} initialEventId={initialEventId} />;
}

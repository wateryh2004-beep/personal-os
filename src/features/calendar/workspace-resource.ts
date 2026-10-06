"use client";

import { createWorkspaceResource, readWorkspaceResponse } from "@/lib/workspace-resource-cache";
import type { CalendarCategory } from "./categories/types";
import type { CalendarEventRecord } from "./types";

export type CalendarWorkspaceData = {
  connection: { id: string; last_error_code: string | null; oauth_scope_version: number | null } | null;
  categories: CalendarCategory[];
  timezone: string;
  unavailable: boolean;
  sync: { state: "fresh" | "syncing" | "stale" | "failed" | "unavailable"; lastSyncAt: string | null; nextHourlyAt: string | null; nextFullAt: string | null; subscriptionExpiresAt: string | null; webhookLastReceivedAt: string | null; errorCode: string | null; subscriptionExpiring: boolean; backgroundSyncLabel?: string; nextBackgroundAt?: string | null } | null;
};

async function readCalendarWorkspace(signal?: AbortSignal): Promise<CalendarWorkspaceData> {
  return readWorkspaceResponse<CalendarWorkspaceData>("/api/calendar/workspace", signal);
}

export const calendarWorkspaceResource = createWorkspaceResource(
  "calendar:workspace-data",
  readCalendarWorkspace,
  5 * 60_000,
);

export type CalendarRangeData = { events: CalendarEventRecord[]; truncated: boolean };
const rangeResources = new Map<string, ReturnType<typeof createWorkspaceResource<CalendarRangeData>>>();

/** Range resources outlive a Calendar component mount, but remain tab-memory only. */
export function calendarRangeResource(key: string, start: string, end: string) {
  const current = rangeResources.get(key);
  if (current) return current;
  const resource = createWorkspaceResource(key, async (signal) => {
    const body = await readWorkspaceResponse<Partial<CalendarRangeData>>(`/api/calendar/events?${new URLSearchParams({ start, end })}`, signal);
    return { events: body.events ?? [], truncated: Boolean(body.truncated) };
  }, 2 * 60_000);
  rangeResources.set(key, resource);
  return resource;
}

export function invalidateCalendarRangeResources() {
  rangeResources.forEach((resource) => resource.invalidate());
}

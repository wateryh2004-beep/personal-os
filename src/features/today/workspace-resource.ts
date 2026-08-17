"use client";

import { createWorkspaceResource } from "@/lib/workspace-resource-cache";
import type { NowWorkspace } from "./types";

async function readTodayWorkspace(): Promise<NowWorkspace> {
  const response = await fetch("/api/today/workspace", { cache: "no-store", credentials: "same-origin" });
  const body = await response.json() as NowWorkspace & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "today_workspace_unavailable");
  return body;
}

export const todayWorkspaceResource = createWorkspaceResource("today:workspace-data", readTodayWorkspace, 20_000);

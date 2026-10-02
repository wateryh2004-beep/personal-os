"use client";

import { createWorkspaceResource, readWorkspaceResponse } from "@/lib/workspace-resource-cache";
import type { NowWorkspace } from "./types";

async function readTodayWorkspace(signal?: AbortSignal): Promise<NowWorkspace> {
  return readWorkspaceResponse<NowWorkspace>("/api/today/workspace", signal);
}

export const todayWorkspaceResource = createWorkspaceResource(
  "today:workspace-data",
  readTodayWorkspace,
  20_000,
);

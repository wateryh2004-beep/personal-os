import { NextResponse } from "next/server";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { getMicrosoftTodoWorkspace } from "@/features/tasks/queries";
import {
  applyWorkspaceLatencyHeaders,
  createWorkspaceLatencyProfiler,
} from "@/lib/performance/workspace-latency";

/** Private read model for the per-tab Tasks cache. Never shared or CDN-cached. */
export async function GET(request: Request) {
  const profiler = createWorkspaceLatencyProfiler(
    "tasks",
    "api",
    request.headers.get("x-personal-os-trace-id"),
  );
  try {
    const owner = await profiler.time("auth", () => requireOwnerApi());
    const workspace = await getMicrosoftTodoWorkspace(owner, profiler);
    const response = NextResponse.json(workspace, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
    profiler.finish(response.status);
    return applyWorkspaceLatencyHeaders(response, profiler);
  } catch (error) {
    const response = apiAuthenticationFailure(error) ?? NextResponse.json(
      { error: "任务工作区暂时不可用。" },
      { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
    profiler.finish(response.status);
    return applyWorkspaceLatencyHeaders(response, profiler);
  }
}

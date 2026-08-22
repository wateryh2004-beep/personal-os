import { NextResponse } from "next/server";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { getTodayWorkspace } from "@/features/today/queries";
import {
  applyWorkspaceLatencyHeaders,
  createWorkspaceLatencyProfiler,
} from "@/lib/performance/workspace-latency";

export async function GET(request: Request) {
  const profiler = createWorkspaceLatencyProfiler(
    "today",
    "api",
    request.headers.get("x-personal-os-trace-id"),
  );
  try {
    const owner = await profiler.time("auth", () => requireOwnerApi());
    const workspace = await getTodayWorkspace(new Date(), owner, profiler);
    const response = NextResponse.json(workspace, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
    profiler.finish(response.status);
    return applyWorkspaceLatencyHeaders(response, profiler);
  } catch (error) {
    const response = apiAuthenticationFailure(error) ?? NextResponse.json(
      { error: "Today 工作区暂时不可用。" },
      { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
    profiler.finish(response.status);
    return applyWorkspaceLatencyHeaders(response, profiler);
  }
}

import { NextResponse } from "next/server";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { getMicrosoftTodoWorkspace } from "@/features/tasks/queries";

/** Private read model for the per-tab Tasks cache. Never shared or CDN-cached. */
export async function GET() {
  try {
    const owner = await requireOwnerApi();
    const workspace = await getMicrosoftTodoWorkspace(owner);
    return NextResponse.json(workspace, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ error: "任务工作区暂时不可用。" }, { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}

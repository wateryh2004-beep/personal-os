import { NextResponse } from "next/server";
import { apiAuthenticationFailure } from "@/lib/auth/require-owner";
import { getMicrosoftTodoWorkspace } from "@/features/tasks/queries";

/** Private, no-store context used only by the global quick-capture layer. */
export async function GET() {
  try {
    const workspace = await getMicrosoftTodoWorkspace();
    return NextResponse.json({ lists: workspace.lists }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ error: "任务清单暂时不可用。" }, { status: 503 });
  }
}

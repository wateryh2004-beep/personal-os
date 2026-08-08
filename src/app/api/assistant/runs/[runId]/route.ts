import {
  apiAuthenticationFailure,
  requireOwnerApi,
} from "@/lib/auth/require-owner";
import { getAgentRun } from "@/features/assistant/persistence";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const owner = await requireOwnerApi();
    const { runId } = await context.params;
    return Response.json(
      await getAgentRun(owner.supabase, owner.userId, runId),
      { headers: noStore },
    );
  } catch (error) {
    return apiAuthenticationFailure(error) ?? Response.json({ error: "无法读取 Agent 会话。" }, { status: 404, headers: noStore });
  }
}

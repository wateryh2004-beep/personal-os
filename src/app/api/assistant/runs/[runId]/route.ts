import {
  apiAuthenticationFailure,
  requireOwnerApi,
} from "@/lib/auth/require-owner";
import { z } from "zod";
import { assistantSurfaces } from "@/features/assistant/types";
import { graphEntityRefSchema } from "@/features/graph/types";
import { AgentRunIdentityError, type RunExpectation } from "@/features/assistant/run-identity";
import { getAgentRun } from "@/features/assistant/persistence";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const owner = await requireOwnerApi();
    const { runId } = await context.params;
    const params = new URL(request.url).searchParams;
    let binding: RunExpectation | undefined;
    if (params.has("surface")) {
      const surface = z.enum(assistantSurfaces).parse(params.get("surface"));
      binding = params.has("entityId") || params.has("entityType") ? { surface, currentEntity: graphEntityRefSchema.parse({ type: params.get("entityType"), id: params.get("entityId") }) } : { surface };
    }
    return Response.json(
      await getAgentRun(owner.supabase, owner.userId, runId, binding),
      { headers: noStore },
    );
  } catch (error) {
    if (error instanceof AgentRunIdentityError) return Response.json({ error: "会话与目标不一致。" }, { status: 409, headers: noStore });
    if (error instanceof z.ZodError) return Response.json({ error: "会话标识无效。" }, { status: 400, headers: noStore });
    return apiAuthenticationFailure(error) ?? Response.json({ error: "无法读取 Agent 会话。" }, { status: 404, headers: noStore });
  }
}

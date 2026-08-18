import { z } from "zod";
import {
  apiAuthenticationFailure,
  requireOwnerApi,
} from "@/lib/auth/require-owner";
import { createAgentRun, getLatestNoteAgentRun } from "@/features/assistant/persistence";
import { assistantSurfaces } from "@/features/assistant/types";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store, max-age=0" };
const schema = z.object({
  surface: z.enum(assistantSurfaces).default("global"),
  userRequest: z.string().max(10_000).default(""),
  currentPath: z.string().max(1000).nullable().optional(),
  currentEntity: z.object({ type: z.string().max(100), id: z.string().uuid() }).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const owner = await requireOwnerApi();
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success)
      return Response.json({ error: "无法创建 Agent 会话。" }, { status: 400, headers: noStore });
    const runId = await createAgentRun({
      supabase: owner.supabase,
      userId: owner.userId,
      ...parsed.data,
    });
    return Response.json({ runId }, { status: 201, headers: noStore });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? Response.json({ error: "Agent 会话暂时不可用。" }, { status: 503, headers: noStore });
  }
}

export async function GET(request: Request) {
  try {
    const owner = await requireOwnerApi();
    const noteId = new URL(request.url).searchParams.get("noteId");
    if (!noteId || !z.string().uuid().safeParse(noteId).success)
      return Response.json({ error: "笔记标识无效。" }, { status: 400, headers: noStore });
    const thread = await getLatestNoteAgentRun(owner.supabase, owner.userId, noteId);
    return Response.json(thread ?? { run: null, messages: [], steps: [], actions: [] }, { headers: noStore });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? Response.json({ error: "无法读取笔记讨论。" }, { status: 503, headers: noStore });
  }
}

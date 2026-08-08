import { createAgentUIStreamResponse } from "ai";
import { z } from "zod";
import {
  apiAuthenticationFailure,
  requireOwnerApi,
} from "@/lib/auth/require-owner";
import { deepSeekModelIds } from "@/lib/ai/deepseek";
import { createAssistantAgent } from "@/features/assistant/runtime";
import { assistantSurfaces } from "@/features/assistant/types";
import { normalizeAssistantError } from "@/features/assistant/errors";
import {
  acquireCalendarRequestLock,
  releaseCalendarRequestLock,
} from "@/lib/ai/calendar-request-lock";
export const runtime = "nodejs";
export const maxDuration = 30;
const noStore = { "Cache-Control": "private, no-store, max-age=0" };
const schema = z.object({
  surface: z
    .enum(assistantSurfaces)
    .refine(
      (surface) =>
        surface === "calendar" ||
        surface === "tasks" ||
        surface === "inbox" ||
        surface === "career",
    ),
  messages: z.array(z.unknown()).min(1).max(20),
  model: z.enum(deepSeekModelIds).optional(),
  currentEntity: z
    .object({ type: z.string(), id: z.string().uuid() })
    .nullable()
    .optional(),
  surfaceContext: z
    .object({
      type: z.string().max(40),
      title: z.string().max(240).nullable().optional(),
      content: z.string().max(20_000).nullable().optional(),
    })
    .optional(),
});
export async function POST(request: Request) {
  let lockId: string | null = null;
  let lockClient:
    | Awaited<ReturnType<typeof requireOwnerApi>>["supabase"]
    | null = null;
  try {
    const owner = await requireOwnerApi();
    lockClient = owner.supabase;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return Response.json(
        { error: "无效的助手请求。" },
        { status: 400, headers: noStore },
      );
    if (parsed.data.surface === "calendar") {
      lockId = await acquireCalendarRequestLock(owner.supabase);
      if (!lockId)
        return Response.json(
          { error: "你的账户正在另一台设备处理日历请求，请稍后重试。" },
          { status: 409, headers: noStore },
        );
    }
    const runtime = await createAssistantAgent({
      surface: parsed.data.surface,
      mode: parsed.data.surface === "inbox" ? "triage" : "chat",
      messages: parsed.data.messages as never,
      model: parsed.data.model,
      currentEntity: parsed.data.currentEntity as never,
      currentSurface: parsed.data.surfaceContext
        ? {
            type: parsed.data.surfaceContext.type as "calendar_view",
            title: parsed.data.surfaceContext.title,
            content: parsed.data.surfaceContext.content,
          }
        : null,
    });
    const response = await createAgentUIStreamResponse({
      agent: runtime.agent,
      uiMessages: parsed.data.messages,
      abortSignal: request.signal,
      timeout: {
        totalMs: 18_000,
        firstChunkMs: 8_000,
        chunkMs: 8_000,
        toolMs: 4_000,
      },
      onError: (error) => normalizeAssistantError(error).message,
      onEnd: async () => {
        if (lockId) await releaseCalendarRequestLock(owner.supabase, lockId);
      },
    });
    response.headers.set("Cache-Control", noStore["Cache-Control"]);
    return response;
  } catch (error) {
    if (lockId && lockClient)
      await releaseCalendarRequestLock(lockClient, lockId);
    const auth = apiAuthenticationFailure(error);
    if (auth) return auth;
    return Response.json(
      { error: normalizeAssistantError(error).message },
      { status: 503, headers: noStore },
    );
  }
}

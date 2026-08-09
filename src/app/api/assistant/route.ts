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
  assertOwnedRun,
  createAgentRun,
  persistAgentMessage,
  recordAgentStep,
  updateAgentRun,
} from "@/features/assistant/persistence";
import {
  acquireCalendarRequestLock,
  releaseCalendarRequestLock,
} from "@/lib/ai/calendar-request-lock";
export const runtime = "nodejs";
export const maxDuration = 60;
const noStore = { "Cache-Control": "private, no-store, max-age=0" };
const schema = z.object({
  surface: z.enum(assistantSurfaces),
  messages: z.array(z.unknown()).min(1).max(20),
  model: z.enum(deepSeekModelIds).optional(),
  runId: z.string().uuid().nullable().optional(),
  currentPath: z.string().max(1000).nullable().optional(),
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
  let runId: string | null = null;
  let runUserId: string | null = null;
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
    runUserId = owner.userId;
    if (parsed.data.surface === "global") {
      runId = parsed.data.runId ?? await createAgentRun({
        supabase: owner.supabase,
        userId: owner.userId,
        surface: "global",
        userRequest: "",
        currentPath: parsed.data.currentPath,
        currentEntity: parsed.data.currentEntity ?? null,
      });
      await assertOwnedRun(owner.supabase, owner.userId, runId);
      const latestUserMessage = [...parsed.data.messages]
        .reverse()
        .find((message) =>
          Boolean(message && typeof message === "object" && "role" in message && message.role === "user"),
        );
      if (latestUserMessage)
        await persistAgentMessage({
          supabase: owner.supabase,
          userId: owner.userId,
          runId,
          message: latestUserMessage as never,
        });
    }
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
      runId,
      currentPath: parsed.data.currentPath,
      currentSurface: parsed.data.surfaceContext
        ? {
            type: parsed.data.surfaceContext.type as "global_page",
            title: parsed.data.surfaceContext.title,
            content: parsed.data.surfaceContext.content,
          }
        : null,
    });
    let streamFailure: ReturnType<typeof normalizeAssistantError> | null = null;
    const response = await createAgentUIStreamResponse({
      agent: runtime.agent,
      uiMessages: parsed.data.messages,
      sendReasoning: false,
      abortSignal: request.signal,
      timeout: {
        totalMs: 45_000,
        firstChunkMs: 12_000,
        chunkMs: 12_000,
        toolMs: 8_000,
      },
      onError: (error) => {
        streamFailure = normalizeAssistantError(error);
        return streamFailure.message;
      },
      onEnd: async ({ responseMessage, isAborted }) => {
        if (runId) {
          await persistAgentMessage({
            supabase: owner.supabase,
            userId: owner.userId,
            runId,
            message: responseMessage,
          });
          const { count } = await owner.supabase
            .from("agent_actions")
            .select("id", { count: "exact", head: true })
            .eq("run_id", runId)
            .eq("status", "proposed");
          if (streamFailure)
            await recordAgentStep({
              supabase: owner.supabase,
              userId: owner.userId,
              runId,
              stepType: "error",
              title: "模型请求未完成",
              summary: streamFailure.message,
              output: { errorCode: streamFailure.code },
              status: "failed",
            });
          await updateAgentRun({
            supabase: owner.supabase,
            userId: owner.userId,
            runId,
            status: streamFailure
              ? "failed"
              : isAborted
              ? "cancelled"
              : (count ?? 0) > 0
                ? "awaiting_approval"
                : "completed",
            errorCode: streamFailure?.code ?? null,
          });
        }
        if (lockId) await releaseCalendarRequestLock(owner.supabase, lockId);
      },
    });
    response.headers.set("Cache-Control", noStore["Cache-Control"]);
    if (runId) response.headers.set("X-Agent-Run-Id", runId);
    return response;
  } catch (error) {
    if (lockId && lockClient)
      await releaseCalendarRequestLock(lockClient, lockId);
    const auth = apiAuthenticationFailure(error);
    if (auth) return auth;
    if (runId && runUserId && lockClient)
      await updateAgentRun({
        supabase: lockClient,
        userId: runUserId,
        runId,
        status: "failed",
        errorCode: normalizeAssistantError(error).code,
      }).catch(() => undefined);
    return Response.json(
      { error: normalizeAssistantError(error).message },
      { status: 503, headers: noStore },
    );
  }
}

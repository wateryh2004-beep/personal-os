import { createAgentUIStreamResponse } from "ai";
import { z } from "zod";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { deepSeekModelIds } from "@/lib/ai/deepseek";
import { createAssistantAgent } from "@/features/assistant/runtime";
import { assistantSurfaces } from "@/features/assistant/types";
import type { AssistantMessageMetadata, AssistantStreamSource } from "@/features/assistant/stream-metadata";
import { normalizeAssistantError } from "@/features/assistant/errors";
import { decideContextGate } from "@/features/assistant/kernel/context-gate";
import { graphEntityRefSchema } from "@/features/graph/types";
import {
  assertOwnedRun,
  createAgentRun,
  persistAgentMessage,
  recordAgentStep,
  updateAgentRun,
} from "@/features/assistant/persistence";
import { acquireCalendarRequestLock, releaseCalendarRequestLock } from "@/lib/ai/calendar-request-lock";
import { recordStatusSafely } from "@/features/system-status/service";
import { completeAiRequestWithUsage, type SafeSourceSummary } from "@/features/ai/governance";

export const runtime = "nodejs";
export const maxDuration = 60;
const noStore = { "Cache-Control": "private, no-store, max-age=0" };

const schema = z.object({
  surface: z.enum(assistantSurfaces),
  messages: z.array(z.unknown()).min(1).max(20),
  model: z.enum(deepSeekModelIds).optional(),
  runId: z.string().uuid().nullable().optional(),
  currentPath: z.string().max(1000).nullable().optional(),
  currentEntity: graphEntityRefSchema.nullable().optional(),
  surfaceContext: z.object({
    type: z.string().max(40),
    title: z.string().max(240).nullable().optional(),
    content: z.string().max(20_000).nullable().optional(),
  }).optional(),
});

function latestUserText(messages: unknown[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== "object" || !("role" in message) || message.role !== "user") continue;
    if (!("parts" in message) || !Array.isArray(message.parts)) continue;
    const text = message.parts
      .filter((part): part is { type: "text"; text: string } => Boolean(part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string"))
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return "";
}

function summaryWithStreamSources(base: SafeSourceSummary, sources: AssistantStreamSource[]): SafeSourceSummary {
  if (!sources.length) return base;
  const entitiesByModule: Record<string, number> = {};
  for (const source of sources) entitiesByModule[source.domain] = (entitiesByModule[source.domain] ?? 0) + 1;
  return {
    ...base,
    modules: Object.keys(entitiesByModule).sort(),
    entitiesByModule,
    sourceCount: sources.length,
  };
}

export async function POST(request: Request) {
  const requestStartedAt = performance.now();
  let firstTextAt: number | null = null;
  let setupMs = 0;
  let lockId: string | null = null;
  let runId: string | null = null;
  let runUserId: string | null = null;
  let lockClient: Awaited<ReturnType<typeof requireOwnerApi>>["supabase"] | null = null;

  try {
    const owner = await requireOwnerApi();
    lockClient = owner.supabase;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "无效的助手请求。" }, { status: 400, headers: noStore });

    runUserId = owner.userId;
    const message = latestUserText(parsed.data.messages);
    const previewGate = decideContextGate({
      message,
      surface: parsed.data.surface,
      currentPath: parsed.data.currentPath,
      hasCurrentSurface: Boolean(parsed.data.surfaceContext?.content || parsed.data.currentEntity),
    });
    const runCapable = parsed.data.surface === "global" || parsed.data.surface === "notes-library";
    const shouldPersistRun = runCapable && (Boolean(parsed.data.runId) || parsed.data.surface === "notes-library" || previewGate.mode === "action");

    if (shouldPersistRun) {
      runId = parsed.data.runId ?? await createAgentRun({
        supabase: owner.supabase,
        userId: owner.userId,
        surface: parsed.data.surface,
        userRequest: message,
        currentPath: parsed.data.currentPath,
        currentEntity: parsed.data.currentEntity ?? null,
      });
      await assertOwnedRun(owner.supabase, owner.userId, runId);
      const latestUserMessage = [...parsed.data.messages].reverse().find((item) => Boolean(item && typeof item === "object" && "role" in item && item.role === "user"));
      if (latestUserMessage) await persistAgentMessage({ supabase: owner.supabase, userId: owner.userId, runId, message: latestUserMessage as never });
    }

    if (parsed.data.surface === "calendar") {
      lockId = await acquireCalendarRequestLock(owner.supabase);
      if (!lockId) return Response.json({ error: "你的账户正在另一台设备处理日历请求，请稍后重试。" }, { status: 409, headers: noStore });
    }

    const assistantRuntime = await createAssistantAgent({
      surface: parsed.data.surface,
      mode: parsed.data.surface === "inbox" ? "triage" : "chat",
      messages: parsed.data.messages as never,
      model: parsed.data.model,
      currentEntity: parsed.data.currentEntity,
      runId,
      currentPath: parsed.data.currentPath,
      currentSurface: parsed.data.surfaceContext ? {
        type: parsed.data.surfaceContext.type as "global_page",
        title: parsed.data.surfaceContext.title,
        content: parsed.data.surfaceContext.content,
      } : null,
    });
    setupMs = Math.round(performance.now() - requestStartedAt);

    let streamFailure: ReturnType<typeof normalizeAssistantError> | null = null;
    const usage = { inputTokens: 0, outputTokens: 0 };
    const metadata = (finish = false): AssistantMessageMetadata => {
      const sources = assistantRuntime.getStreamSources();
      const now = performance.now();
      return {
        createdAt: Date.now(),
        model: assistantRuntime.modelId,
        auditId: assistantRuntime.auditId,
        retrievalMode: assistantRuntime.retrievalMode,
        contextChars: assistantRuntime.personalContextPack?.diagnostics.totalChars ?? 0,
        sources: finish ? sources : undefined,
        setupMs,
        ttftMs: firstTextAt === null ? null : Math.round(firstTextAt - requestStartedAt),
        durationMs: finish ? Math.round(now - requestStartedAt) : undefined,
        duplicateReadCalls: finish ? assistantRuntime.getDuplicateReadCalls() : undefined,
      };
    };

    const response = await createAgentUIStreamResponse({
      agent: assistantRuntime.agent,
      uiMessages: parsed.data.messages,
      sendReasoning: false,
      abortSignal: request.signal,
      timeout: { totalMs: 45_000, firstChunkMs: 12_000, chunkMs: 12_000, toolMs: 8_000 },
      experimental_transform: () => new TransformStream({
        transform(chunk, controller) {
          if (firstTextAt === null && chunk.type === "text-delta" && chunk.text.length > 0) firstTextAt = performance.now();
          controller.enqueue(chunk);
        },
      }),
      messageMetadata: ({ part }): AssistantMessageMetadata | undefined => {
        if (part.type === "start") return metadata(false);
        if (part.type === "finish") return {
          ...metadata(true),
          totalTokens: part.totalUsage.totalTokens,
          finishReason: String(part.finishReason),
        };
        return undefined;
      },
      onStepEnd: ({ usage: stepUsage }) => {
        usage.inputTokens += stepUsage.inputTokens ?? 0;
        usage.outputTokens += stepUsage.outputTokens ?? 0;
      },
      onError: (error) => {
        streamFailure = normalizeAssistantError(error);
        return streamFailure.message;
      },
      onEnd: async ({ responseMessage, isAborted }) => {
        const sources = assistantRuntime.getStreamSources();
        const durationMs = Math.round(performance.now() - requestStartedAt);
        const ttftMs = firstTextAt === null ? null : Math.round(firstTextAt - requestStartedAt);
        const duplicateReadCalls = assistantRuntime.getDuplicateReadCalls();
        const finalSummary = summaryWithStreamSources(assistantRuntime.sourceSummary, sources);
        await completeAiRequestWithUsage(
          assistantRuntime.auditId,
          streamFailure ? "failed" : isAborted ? "cancelled" : "completed",
          usage,
          streamFailure?.code ?? null,
          assistantRuntime.governance,
          { sourceSummary: finalSummary, telemetry: { setupMs, ttftMs, durationMs, duplicateReadCalls, streamSourceCount: sources.length } },
        );

        console.info(JSON.stringify({
          scope: "assistant",
          event: "request_complete",
          surface: parsed.data.surface,
          model: assistantRuntime.modelId,
          retrievalMode: assistantRuntime.retrievalMode,
          setupMs,
          ttftMs,
          durationMs,
          duplicateReadCalls,
          sourceCount: sources.length,
          status: streamFailure ? "failed" : isAborted ? "cancelled" : "completed",
        }));

        if (runId) {
          await persistAgentMessage({ supabase: owner.supabase, userId: owner.userId, runId, message: responseMessage });
          const { count } = await owner.supabase.from("agent_actions").select("id", { count: "exact", head: true }).eq("run_id", runId).eq("status", "proposed");
          if (streamFailure) await recordAgentStep({ supabase: owner.supabase, userId: owner.userId, runId, stepType: "error", title: "模型请求未完成", summary: streamFailure.message, output: { errorCode: streamFailure.code }, status: "failed" });
          await updateAgentRun({
            supabase: owner.supabase,
            userId: owner.userId,
            runId,
            status: streamFailure ? "failed" : isAborted ? "cancelled" : (count ?? 0) > 0 ? "awaiting_approval" : "completed",
            errorCode: streamFailure?.code ?? null,
          });
          const finishedAt = new Date().toISOString();
          if (streamFailure) {
            await recordStatusSafely(owner.userId, "ai", { state: "failed", lastAttemptAt: finishedAt, errorCode: streamFailure.code, errorSummary: streamFailure.message, retryAfter: new Date(Date.now() + 30_000).toISOString(), nextStep: "重试请求；不会将未完成回答写入笔记或外部系统。" }, { type: "retry_scheduled", operationKey: `agent-run-${runId}`, errorCode: streamFailure.code, errorSummary: streamFailure.message, retryAfter: new Date(Date.now() + 30_000).toISOString() });
          } else {
            await recordStatusSafely(owner.userId, "ai", { state: "fresh", lastSuccessAt: finishedAt, lastAttemptAt: finishedAt, nextStep: "AI 调用按请求执行，敏感内容遵循现有访问边界。" }, { type: "succeeded", operationKey: `agent-run-${runId}` });
          }
        }
        if (lockId) await releaseCalendarRequestLock(owner.supabase, lockId);
      },
    });

    response.headers.set("Cache-Control", noStore["Cache-Control"]);
    if (runId) response.headers.set("X-Agent-Run-Id", runId);
    return response;
  } catch (error) {
    if (lockId && lockClient) await releaseCalendarRequestLock(lockClient, lockId);
    const auth = apiAuthenticationFailure(error);
    if (auth) return auth;
    if (runId && runUserId && lockClient) await updateAgentRun({ supabase: lockClient, userId: runUserId, runId, status: "failed", errorCode: normalizeAssistantError(error).code }).catch(() => undefined);
    if (runUserId) {
      const normalized = normalizeAssistantError(error);
      await recordStatusSafely(runUserId, "ai", { state: "failed", lastAttemptAt: new Date().toISOString(), errorCode: normalized.code, errorSummary: normalized.message, retryAfter: new Date(Date.now() + 30_000).toISOString(), nextStep: "检查 AI 配置或网络后重试。" }, { type: "retry_scheduled", operationKey: runId ? `agent-run-${runId}` : undefined, errorCode: normalized.code, errorSummary: normalized.message, retryAfter: new Date(Date.now() + 30_000).toISOString() });
    }
    return Response.json({ error: normalizeAssistantError(error).message }, { status: 503, headers: noStore });
  }
}

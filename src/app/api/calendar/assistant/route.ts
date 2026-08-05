import { createAgentUIStreamResponse } from "ai";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { env } from "@/lib/env";
import { createCalendarAgent } from "@/lib/ai/calendar-agent";
import { acquireCalendarRequestLock, releaseCalendarRequestLock } from "@/lib/ai/calendar-request-lock";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({ messages: z.array(z.unknown()).min(1).max(20) });

function safeErrorMessage(error: unknown) {
  const value = error instanceof Error ? error.message.toLowerCase() : "";
  const statusCode = typeof error === "object" && error && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : undefined;
  if (statusCode === 401 || value.includes("api key") || value.includes("authentication")) return { code: "api_key_invalid", message: "DeepSeek API Key 无效或已失效。请在 Settings 重新保存。" };
  if (statusCode === 402 || value.includes("insufficient") || value.includes("balance")) return { code: "insufficient_balance", message: "DeepSeek 账户余额不足，请在 DeepSeek 平台充值后重试。" };
  if (statusCode === 429 || value.includes("rate limit")) return { code: "rate_limited", message: "DeepSeek 当前请求过于频繁，请稍后重试。" };
  if (value.includes("timeout") || value.includes("abort")) return { code: "timeout", message: "DeepSeek 响应超时，请重试。" };
  return { code: "provider_unavailable", message: "DeepSeek 暂时不可用，请稍后重试。" };
}

export async function POST(request: Request) {
  const { supabase, userId } = await requireOwner();
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "无效的对话请求。" }, { status: 400 });
  if (!env.supabaseSecretKey) return Response.json({ error: "AI 服务尚未配置。" }, { status: 503 });
  let requestId: string | null = null;
  try {
    requestId = await acquireCalendarRequestLock(supabase);
    if (!requestId) return Response.json({ error: "你的账户正在另一台设备处理日历请求。请等待该请求结束，或在另一台设备点击“停止”。" }, { status: 409 });
    const { data: profile } = await supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
    const agent = await createCalendarAgent({ userId, supabase, timezone: profile?.timezone || "Asia/Shanghai" });
    return createAgentUIStreamResponse({
      agent,
      uiMessages: body.data.messages,
      abortSignal: request.signal,
      timeout: { totalMs: 18_000, firstChunkMs: 8_000, chunkMs: 8_000, toolMs: 4_000 },
      onError: (error) => {
        const safe = safeErrorMessage(error);
        console.error(JSON.stringify({ level: "error", route: "/api/calendar/assistant", request_id: requestId, error_code: safe.code }));
        return safe.message;
      },
      onEnd: async () => { if (requestId) await releaseCalendarRequestLock(supabase, requestId); },
    });
  } catch (error) {
    if (requestId) await releaseCalendarRequestLock(supabase, requestId);
    const message = error instanceof Error && error.message === "deepseek_not_configured" ? "请先在 Settings 保存 DeepSeek API Key。" : "AI 日历助手暂时不可用，请检查 DeepSeek 设置后重试。";
    return Response.json({ error: message }, { status: 503 });
  }
}

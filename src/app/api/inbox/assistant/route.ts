import { createAgentUIStreamResponse } from "ai";
import { z } from "zod";
import { createInboxAgent } from "@/lib/ai/inbox-agent";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({ messages: z.array(z.unknown()).min(1).max(12) });
const noStore = { "Cache-Control": "private, no-store, max-age=0" };

function safeError(error: unknown) {
  const value = error instanceof Error ? error.message.toLowerCase() : "";
  if (value.includes("api key") || value.includes("authentication")) return "DeepSeek API Key 无效或已失效。请在 Settings 重新保存。";
  if (value.includes("balance") || value.includes("insufficient")) return "DeepSeek 账户余额不足，请充值后重试。";
  if (value.includes("rate limit")) return "DeepSeek 当前请求过于频繁，请稍后重试。";
  if (value.includes("timeout") || value.includes("abort")) return "DeepSeek 响应超时，请重试。";
  return "AI 整理暂时不可用，请稍后重试。";
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireOwnerApi();
    const body = requestSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return Response.json({ error: "无效的整理请求。" }, { status: 400, headers: noStore });
    if (!env.supabaseSecretKey) return Response.json({ error: "AI 服务尚未配置。" }, { status: 503, headers: noStore });
    const { data: profile } = await supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
    const agent = await createInboxAgent({ userId, supabase, timezone: profile?.timezone || "Asia/Shanghai" });
    const response = await createAgentUIStreamResponse({ agent, uiMessages: body.data.messages, abortSignal: request.signal, timeout: { totalMs: 18_000, firstChunkMs: 8_000, chunkMs: 8_000, toolMs: 4_000 }, onError: safeError });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  } catch (error) {
    const authFailure = apiAuthenticationFailure(error);
    if (authFailure) return authFailure;
    return Response.json({ error: "AI 整理暂时不可用，请检查 DeepSeek 设置后重试。" }, { status: 503, headers: noStore });
  }
}

import { createAgentUIStreamResponse } from "ai";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { env } from "@/lib/env";
import { createCalendarAgent } from "@/lib/ai/calendar-agent";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({ messages: z.array(z.unknown()).min(1).max(20) });

export async function POST(request: Request) {
  const { supabase, userId } = await requireOwner();
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "无效的对话请求。" }, { status: 400 });
  if (!env.supabaseSecretKey) return Response.json({ error: "AI 服务尚未配置。" }, { status: 503 });
  try {
    const { data: profile } = await supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
    const agent = await createCalendarAgent({ userId, supabase, timezone: profile?.timezone || "Asia/Shanghai" });
    return createAgentUIStreamResponse({ agent, uiMessages: body.data.messages, abortSignal: request.signal, timeout: { totalMs: 25_000 } });
  } catch (error) {
    const message = error instanceof Error && error.message === "deepseek_not_configured" ? "请先在 Settings 保存 DeepSeek API Key。" : "AI 日历助手暂时不可用，请检查 DeepSeek 设置后重试。";
    return Response.json({ error: message }, { status: 503 });
  }
}

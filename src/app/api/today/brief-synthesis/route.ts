import { NextResponse } from "next/server";
import { synthesizeTodayBrief } from "@/features/today/ai-synthesis";
import { getTodayWorkspace } from "@/features/today/queries";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;
const headers = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST() {
  try {
    const [{ supabase, userId }, workspace] = await Promise.all([
      requireOwnerApi(),
      getTodayWorkspace(),
    ]);
    if (!workspace.todayBrief.length)
      return NextResponse.json({ error: "今天还没有足够信息可供总结。" }, { status: 422, headers });
    const result = await synthesizeTodayBrief({
      userId,
      timezone: workspace.timezone,
      items: workspace.todayBrief,
    });
    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "today_brief_ai_synthesized",
      entity_type: "today_brief",
      actor_type: "assistant",
      after_data: { model: result.modelId, source_count: workspace.todayBrief.length },
    });
    return NextResponse.json(result, { headers });
  } catch (error) {
    const auth = apiAuthenticationFailure(error);
    if (auth) return auth;
    const code = error instanceof Error ? error.message : "";
    const message = code.includes("deepseek")
      ? "DeepSeek 尚未配置或凭据不可用。"
      : "Today Brief 暂时无法生成 AI 总结，确定性清单仍可正常使用。";
    return NextResponse.json({ error: message }, { status: 503, headers });
  }
}

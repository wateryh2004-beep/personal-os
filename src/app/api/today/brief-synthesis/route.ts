import { z } from "zod";
import { todayBriefFingerprint } from "@/features/today/brief-snapshot";
import { getDateKeyInTimeZone } from "@/lib/date-keys";
import { NextResponse } from "next/server";
import { synthesizeTodayBrief } from "@/features/today/ai-synthesis";
import { getTodayWorkspace } from "@/features/today/queries";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;
const headers = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request?: Request) {
  try {
    const owner = await requireOwnerApi();
    const { supabase, userId } = owner;
    const expected = request ? z.object({ localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), sourceFingerprint: z.string().regex(/^[0-9a-f]{64}$/) }).strict().safeParse(await request.json().catch(() => null)) : null;
    if (expected && !expected.success) return NextResponse.json({ error: "总结来源标识无效。" }, { status: 400, headers });
    const workspace = await getTodayWorkspace(new Date(), owner);
    if (!workspace.todayBrief.length)
      return NextResponse.json({ error: "今天还没有足够信息可供总结。" }, { status: 422, headers });
    const localDate = getDateKeyInTimeZone(workspace.generatedAt || new Date().toISOString(), workspace.timezone);
    const sourceFingerprint = todayBriefFingerprint(workspace.todayBrief);
    if (expected?.success && (expected.data.localDate !== localDate || expected.data.sourceFingerprint !== sourceFingerprint)) return NextResponse.json({ error: "今日日期或来源已变化，请核对当前内容后再生成。" }, { status: 409, headers });
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
    return NextResponse.json({ ...result, localDate, sourceFingerprint }, { headers });
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

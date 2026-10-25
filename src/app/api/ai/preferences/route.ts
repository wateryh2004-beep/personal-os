import { NextResponse } from "next/server";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
/** Only the public model identifier, fetched after the user opens note AI. */
export async function GET() {
  try {
    const { supabase, userId } = await requireOwnerApi();
    const result = await supabase.from("ai_provider_settings").select("model").eq("user_id", userId).is("archived_at", null).maybeSingle();
    if (result.error) throw new Error("ai_preferences_unavailable");
    return NextResponse.json({ model: result.data?.model === "deepseek-v4-pro" ? "deepseek-v4-pro" : "deepseek-v4-flash" }, { headers });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ error: "AI 设置暂时无法读取。" }, { status: 503, headers });
  }
}

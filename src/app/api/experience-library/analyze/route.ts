import { NextResponse } from "next/server";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import {
  analyzeExperienceText,
  getExperienceAiConfiguration,
} from "@/lib/adapters/experience-library-ai";
import {
  assertAiBudget,
  auditAiRequest,
  completeAiRequestWithUsage,
  getAiGovernance,
} from "@/features/ai/governance";
import { experienceEntryIdSchema } from "@/features/experience-library/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers });

export async function POST(request: Request) {
  let owner: Awaited<ReturnType<typeof requireOwnerApi>>;
  try {
    owner = await requireOwnerApi();
  } catch (error) {
    return apiAuthenticationFailure(error) ?? fail("暂时无法验证身份。", 500);
  }
  if (request.headers.get("origin") !== new URL(request.url).origin
    || request.headers.get("sec-fetch-site") === "cross-site") {
    return fail("请从经验详情页发起整理。", 403);
  }
  const raw = await request.json().catch(() => null);
  const parsed = experienceEntryIdSchema.safeParse(raw);
  if (!parsed.success) return fail("经验标识无效。");
  const { supabase, userId } = owner;

  const { data: entry } = await supabase.from("experience_library_entries")
    .select("id,title,tags")
    .eq("id", parsed.data.entryId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .maybeSingle();
  if (!entry) return fail("经验不存在或无权访问。", 404);
  const { data: captures, error: captureError } = await supabase.from("experience_library_captures")
    .select("id,capture_type,raw_content")
    .eq("entry_id", entry.id)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (captureError || !captures?.length) return fail("此经验还没有可整理的正文或评论。", 409);

  let configuration: Awaited<ReturnType<typeof getExperienceAiConfiguration>>;
  try {
    configuration = await getExperienceAiConfiguration(userId);
  } catch {
    return fail("AI 凭据暂时无法读取，请重新保存设置。", 409);
  }
  if (!configuration) return fail("尚未配置经验资料库的 AI 模型。", 409);

  const governance = await getAiGovernance(userId);
  const assembled = captures
    .map((capture, index) => `[片段 ${index + 1} · ${capture.capture_type}]\n${capture.raw_content}`)
    .join("\n\n")
    .slice(0, governance.maxContextCharsPerRequest);
  const sourceSummary = {
    modules: ["experience_library"],
    entitiesByModule: { experience_library: 1 },
    timeRange: { from: null, to: null },
    reasons: ["explicit_entry_analysis"],
    sourceCount: 1,
  };
  const budget = await assertAiBudget(userId, governance);
  const auditId = await auditAiRequest({
    userId,
    surface: "experience_library",
    purpose: "organize_pasted_experience",
    model: configuration.modelId,
    status: budget.allowed ? "allowed" : "blocked_budget",
    retrievalMode: "targeted",
    sourceSummary,
    retrievalReason: "用户在经验详情中明确点击整理",
    contextChars: assembled.length,
    outputTokenLimit: governance.maxOutputTokensPerRequest,
    errorCode: budget.allowed ? null : budget.code,
  });
  if (!budget.allowed) return fail("AI 使用已达到当前预算上限。", 429);

  try {
    const result = await analyzeExperienceText({
      userId,
      provider: configuration.provider,
      modelId: configuration.modelId,
      apiKey: configuration.apiKey,
      text: assembled,
      maxOutputTokens: Math.min(governance.maxOutputTokensPerRequest, 1600),
    });
    const keyPoints = result.analysis.keyPoints.map(({ sourceIndex, ...point }) => ({
      ...point,
      sourceCaptureId: sourceIndex && captures[sourceIndex - 1]
        ? captures[sourceIndex - 1].id
        : null,
    }));
    const { error: updateError } = await supabase.from("experience_library_entries").update({
      ai_summary: result.analysis.summary,
      ai_key_points: keyPoints,
      ai_status: "completed",
      ai_error_code: null,
      ai_provider: configuration.provider,
      ai_model: configuration.modelId,
      ai_analyzed_at: new Date().toISOString(),
      tags: [...new Set([...(entry.tags ?? []), ...result.analysis.tags])].slice(0, 20),
    }).eq("id", entry.id).eq("user_id", userId).is("archived_at", null);
    if (updateError) throw new Error("experience_ai_save_failed");
    await completeAiRequestWithUsage(
      auditId,
      "completed",
      { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      null,
      governance,
    );
    return NextResponse.json({
      ...result.analysis,
      keyPoints,
      provider: configuration.provider,
      modelId: configuration.modelId,
    }, { headers });
  } catch {
    await supabase.from("experience_library_entries").update({
      ai_status: "failed",
      ai_error_code: "experience_ai_failed",
    }).eq("id", entry.id).eq("user_id", userId);
    await completeAiRequestWithUsage(auditId, "failed", {}, "experience_ai_failed", governance);
    return fail("AI 整理未完成；原始文字与图片已保留，可稍后重试。", 502);
  }
}

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
import { assembleExperienceSources, verifiedExperienceCitation, type ExperienceAiSource } from "@/features/experience-library/source-attribution";
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
    .select("id,title,tags,merged_into_id")
    .eq("id", parsed.data.entryId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .maybeSingle();
  if (!entry) return fail("经验不存在或无权访问。", 404);
  if (entry.merged_into_id) return fail("请从合并后的主记录发起整理。", 409);
  const { data: children, error: childrenError } = await supabase.from("experience_library_entries")
    .select("id").eq("user_id", userId).eq("merged_into_id", entry.id).is("archived_at", null);
  if (childrenError) return fail("合并的原记录暂时无法读取，请重试。", 503);
  const groupIds = [entry.id, ...(children ?? []).map((child) => child.id)];
  const { data: captures, error: captureError } = await supabase.from("experience_library_captures")
    .select("id,capture_type,raw_content")
    .in("entry_id", groupIds)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (captureError) return fail("原文暂时无法读取，请重试。", 503);
  const { data: imageRows, error: imageError } = await supabase.from("experience_library_media")
    .select("id,document_id,position").in("entry_id", groupIds).eq("user_id", userId).is("archived_at", null).order("position");
  if (imageError) return fail("图片文字暂时无法读取，请重试。", 503);
  const documentIds = (imageRows ?? []).flatMap((image) => image.document_id ? [image.document_id] : []);
  const { data: documents, error: documentError } = documentIds.length ? await supabase.from("documents")
    .select("id,extracted_text,text_extraction_method,text_extraction_source_sha256")
    .eq("user_id", userId).eq("ai_visibility", "normal").eq("storage_state", "available").is("archived_at", null).in("id", documentIds)
    : { data: [], error: null };
  if (documentError) return fail("图片文字暂时无法读取，请重试。", 503);
  const usableImages = (imageRows ?? []).filter((image) => documents?.some((document) => document.id === image.document_id && document.text_extraction_method === "ocr_local"));
  const { data: corrections, error: correctionError } = usableImages.length ? await supabase.from("experience_library_ocr_corrections")
    .select("media_id,document_id,source_sha256,text_content").eq("user_id", userId).in("media_id", usableImages.map((image) => image.id)).order("created_at", { ascending: false }).order("id", { ascending: false })
    : { data: [], error: null };
  if (correctionError) return fail("图片文字暂时无法读取，请重试。", 503);
  const sources: ExperienceAiSource[] = (captures ?? []).map((capture) => ({ type: "capture", id: capture.id, label: capture.capture_type, text: capture.raw_content }));
  for (const [index, image] of usableImages.entries()) {
    const document = documents?.find((item) => item.id === image.document_id);
    const correction = corrections?.find((item) => item.media_id === image.id && item.document_id === document?.id && item.source_sha256 === document?.text_extraction_source_sha256);
    const text = correction?.text_content ?? document?.extracted_text;
    if (text?.trim()) sources.push({ type: "image", id: image.id, label: `图片 ${index + 1} 的识别文字`, text });
  }
  if (!sources.length) return fail("此经验没有可整理的原文或已允许 AI 使用的图片文字。", 409);

  let configuration: Awaited<ReturnType<typeof getExperienceAiConfiguration>>;
  try {
    configuration = await getExperienceAiConfiguration(userId);
  } catch {
    return fail("AI 凭据暂时无法读取，请重新保存设置。", 409);
  }
  if (!configuration) return fail("尚未配置经验资料库的 AI 模型。", 409);

  const governance = await getAiGovernance(userId);
  const { text: assembled, included, truncated } = assembleExperienceSources(sources, governance.maxContextCharsPerRequest);
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
      ...verifiedExperienceCitation(sourceIndex, point.sourceQuote, included),
    }));
    const { data: savedEntry, error: updateError } = await supabase.from("experience_library_entries").update({
      ai_summary: result.analysis.summary,
      ai_key_points: keyPoints,
      ai_status: "completed",
      ai_error_code: null,
      ai_provider: configuration.provider,
      ai_model: configuration.modelId,
      ai_analyzed_at: new Date().toISOString(),
      tags: [...new Set([...(entry.tags ?? []), ...result.analysis.tags])].slice(0, 20),
    }).eq("id", entry.id).eq("user_id", userId).is("archived_at", null).select("id").maybeSingle();
    if (updateError || !savedEntry) throw new Error("experience_ai_save_failed");
    const auditCompleted = await completeAiRequestWithUsage(
      auditId,
      "completed",
      { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      null,
      governance,
    ).catch(() => false);
    return NextResponse.json({
      ...result.analysis,
      keyPoints,
      truncated,
      auditIncomplete: !auditCompleted,
      provider: configuration.provider,
      modelId: configuration.modelId,
    }, { headers });
  } catch {
    await supabase.from("experience_library_entries").update({
      ai_status: "failed",
      ai_error_code: "experience_ai_failed",
    }).eq("id", entry.id).eq("user_id", userId);
    await completeAiRequestWithUsage(auditId, "failed", {}, "experience_ai_failed", governance).catch(() => false);
    return fail("AI 整理未完成；原始文字与图片已保留，可稍后重试。", 502);
  }
}

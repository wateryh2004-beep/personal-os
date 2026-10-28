"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { sealSecret } from "@/lib/crypto/sealed-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { readR2ObjectStream } from "@/lib/adapters/cloudflare-r2";
import { canUploadNoteImage } from "@/features/files/schemas";
import { matchesExperienceImageSignature } from "./image-signature";
import {
  experienceLibraryKeyMaterial,
  getExperienceAiConfiguration,
  testExperienceAiConnection,
} from "@/lib/adapters/experience-library-ai";
import {
  extractExperienceTags,
  normalizeExperienceSourceUrl,
  suggestExperienceTitle,
  splitExperienceSegments,
} from "./parsing";
import {
  appendExperienceInputSchema,
  appendExperienceRpcResultSchema,
  attachExperienceMediaSchema,
  experienceAiSettingsSchema,
  experienceAiTestSchema,
  experienceMediaIdSchema,
  experienceMediaMoveSchema,
  updateExperienceMediaSchema,
} from "./schemas";
import type { AppendExperienceResult } from "./types";

async function audit(
  supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"],
  userId: string,
  action: string,
  entityId: string,
  afterData: Record<string, unknown> = {},
) {
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action,
    entity_type: "experience_library_entry",
    entity_id: entityId,
    actor_type: "user",
    after_data: afterData,
  });
}

async function touchEntry(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"], userId: string, entryId: string) {
  // A recent-list timestamp is a convenience; a failed touch must never turn
  // an already saved original into a false failure.
  try { await supabase.from("experience_library_entries").update({ updated_at: new Date().toISOString() }).eq("id", entryId).eq("user_id", userId).is("archived_at", null); } catch { /* next read still preserves the source */ }
}

/** Owner-scoped duplicate hint; raw share text is never logged. */
export async function findExistingExperience(source: string) {
  let url: string | null;
  try { url = normalizeExperienceSourceUrl(source); } catch { return null; }
  if (!url) return null;
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("experience_library_entries")
    .select("id,title,source_url").eq("user_id", userId).eq("source_url", url).is("archived_at", null).maybeSingle();
  if (error || !data) return null;
  return { id: data.id, title: data.title, sourceUrl: data.source_url };
}

export async function appendExperienceCapture(rawInput: unknown): Promise<AppendExperienceResult> {
  const parsed = appendExperienceInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error("粘贴内容或来源信息无效。");
  const content = parsed.data.content;
  if (!content.trim()) {
    const { userId } = await requireOwner();
    void userId;
    throw new Error("请先粘贴文字或图片。");
  }
  const sourceUrl = normalizeExperienceSourceUrl(parsed.data.sourceUrl);
  const split = splitExperienceSegments(content, parsed.data.captureType);
  const title = parsed.data.title?.trim() || suggestExperienceTitle(content);
  const tags = extractExperienceTags(content);
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.rpc("append_experience_library_capture", {
    p_entry_id: parsed.data.entryId ?? null,
    p_source_url: sourceUrl,
    p_title: title,
    p_capture_type: split.captureType,
    p_raw_content: content,
    p_segments: split.segments,
    p_tags: tags,
    p_request_id: parsed.data.requestId,
  });
  if (error) throw new Error("原文未能保存，请检查登录状态和数据库配置后重试。");
  const result = appendExperienceRpcResultSchema.safeParse(data);
  if (!result.success) throw new Error("原文保存结果无法确认，请刷新后检查，避免重复提交。");
  await touchEntry(supabase, userId, result.data.entry_id);
  revalidatePath("/experience-library");
  revalidatePath(`/experience-library/${result.data.entry_id}`);
  return {
    entryId: result.data.entry_id,
    captureId: result.data.capture_id,
    title: result.data.title,
    createdEntry: result.data.created_entry,
    appended: result.data.appended,
  };
}

export async function createImageOnlyExperience(input: {
  requestId: string;
  entryId?: string | null;
  sourceUrl?: string | null;
  title?: string;
}) {
  const request = typeof input.requestId === "string" ? input.requestId : "";
  if (!/^[0-9a-f-]{36}$/i.test(request)) throw new Error("保存请求无效。");
  const sourceUrl = normalizeExperienceSourceUrl(input.sourceUrl);
  const title = input.title?.trim() || "未命名经验";
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.rpc("append_experience_library_capture", {
    p_entry_id: input.entryId ?? null,
    p_source_url: sourceUrl,
    p_title: title,
    p_capture_type: "unknown",
    p_raw_content: null,
    p_segments: null,
    p_tags: [],
    p_request_id: request,
  });
  if (error) throw new Error("经验记录未能创建。");
  const result = appendExperienceRpcResultSchema.safeParse(data);
  if (!result.success) throw new Error("经验记录保存结果无法确认，请刷新后检查。");
  revalidatePath("/experience-library");
  revalidatePath(`/experience-library/${result.data.entry_id}`);
  return {
    entryId: result.data.entry_id,
    captureId: null,
    title: result.data.title,
    createdEntry: result.data.created_entry,
    appended: false,
  } satisfies AppendExperienceResult;
}

export async function attachExperienceMedia(rawInput: unknown) {
  const parsed = attachExperienceMediaSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error("图片关联信息无效。");
  const { supabase, userId } = await requireOwner();
  const [{ data: entry }, { data: document }] = await Promise.all([
    supabase.from("experience_library_entries")
      .select("id,source_url")
      .eq("id", parsed.data.entryId)
      .eq("user_id", userId)
      .is("archived_at", null)
      .maybeSingle(),
    supabase.from("documents")
      .select("id,storage_provider,storage_state,archived_at,storage_path,mime_type,original_filename,file_size")
      .eq("id", parsed.data.documentId)
      .eq("user_id", userId)
      .is("vault_group_id", null)
      .maybeSingle(),
  ]);
  if (!entry) throw new Error("目标经验不存在或无权访问。");
  if (!document || document.storage_provider !== "cloudflare_r2"
    || document.storage_state !== "available" || document.archived_at) {
    throw new Error("图片原件尚未完成私有存储确认。");
  }
  if (!document.storage_path.startsWith(`${userId}/files/${document.id}/sealed-`)
    || !canUploadNoteImage(document.original_filename, document.mime_type, Number(document.file_size))) {
    throw new Error("图片原件的格式或封存状态无效。");
  }
  try {
    const object = await readR2ObjectStream(document.storage_path);
    if (object.size !== Number(document.file_size)) {
      await object.body.cancel().catch(() => {});
      throw new Error("invalid_size");
    }
    const reader = object.body.getReader();
    const prefix = new Uint8Array(64);
    let length = 0;
    try {
      while (length < prefix.length) {
        const part = await reader.read();
        if (part.done) break;
        const take = Math.min(part.value.byteLength, prefix.length - length);
        prefix.set(part.value.subarray(0, take), length);
        length += take;
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (!matchesExperienceImageSignature(prefix.subarray(0, length), document.mime_type)) throw new Error("invalid_image");
  } catch {
    throw new Error("图片原件不可读取或格式与内容不一致，尚未关联；请重新上传。 ");
  }
  if (parsed.data.captureId) {
    const { data: capture } = await supabase.from("experience_library_captures")
      .select("id,entry_id,raw_content")
      .eq("id", parsed.data.captureId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!capture || capture.entry_id !== parsed.data.entryId) {
      throw new Error("关联原文不存在或不属于当前经验。");
    }
    if (
      parsed.data.selectionStart !== null
      && parsed.data.selectionEnd !== null
      && capture.raw_content.slice(parsed.data.selectionStart, parsed.data.selectionEnd) !== parsed.data.selectionQuote
    ) {
      throw new Error("关联原文已经变化，请重新选择文字后再关联图片。");
    }
  }
  const { data: existing } = await supabase.from("experience_library_media")
    .select("id")
    .eq("user_id", userId)
    .eq("entry_id", parsed.data.entryId)
    .eq("document_id", parsed.data.documentId)
    .is("archived_at", null)
    .maybeSingle();
  if (existing) return { mediaId: existing.id, alreadyAttached: true };

  const { data: last } = await supabase.from("experience_library_media")
    .select("position")
    .eq("user_id", userId)
    .eq("entry_id", parsed.data.entryId)
    .is("archived_at", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase.from("experience_library_media").insert({
    user_id: userId,
    entry_id: parsed.data.entryId,
    capture_id: parsed.data.captureId,
    document_id: parsed.data.documentId,
    selection_start: parsed.data.selectionStart,
    selection_end: parsed.data.selectionEnd,
    selection_quote: parsed.data.selectionQuote,
    position: (last?.position ?? -1) + 1,
    caption: parsed.data.caption || null,
    source_kind: parsed.data.sourceKind,
  }).select("id").single();
  if (error || !data) throw new Error("图片已上传，但关联信息未能保存；请保留此页并重试关联。");
  await touchEntry(supabase, userId, parsed.data.entryId);
  await audit(supabase, userId, "attach_media", parsed.data.entryId, {
    media_id: data.id,
    document_id: parsed.data.documentId,
    capture_id: parsed.data.captureId,
    has_text_selection: parsed.data.selectionStart !== null,
  });
  revalidatePath("/experience-library");
  revalidatePath(`/experience-library/${parsed.data.entryId}`);
  return { mediaId: data.id, alreadyAttached: false };
}

export async function updateExperienceMedia(rawInput: unknown) {
  const parsed = updateExperienceMediaSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error("图片关联设置无效。");
  const { supabase, userId } = await requireOwner();
  const { data: current } = await supabase.from("experience_library_media")
    .select("id,entry_id,capture_id")
    .eq("id", parsed.data.mediaId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .maybeSingle();
  if (!current) throw new Error("图片关联不存在或已移除。");
  if (parsed.data.captureId) {
    const { data: capture } = await supabase.from("experience_library_captures")
      .select("id,entry_id")
      .eq("id", parsed.data.captureId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!capture || capture.entry_id !== current.entry_id) throw new Error("目标原文不属于当前经验。");
  }
  const changedCapture = current.capture_id !== parsed.data.captureId;
  const { error } = await supabase.from("experience_library_media").update({
    capture_id: parsed.data.captureId,
    caption: parsed.data.caption || null,
    ...(changedCapture ? { selection_start: null, selection_end: null, selection_quote: null } : {}),
  }).eq("id", current.id).eq("user_id", userId).is("archived_at", null);
  if (error) throw new Error("图片关联未能更新。");
  revalidatePath(`/experience-library/${current.entry_id}`);
}

export async function moveExperienceMedia(rawInput: unknown) {
  const parsed = experienceMediaMoveSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error("图片顺序操作无效。");
  const { supabase, userId } = await requireOwner();
  const { data: current } = await supabase.from("experience_library_media")
    .select("id,entry_id,position")
    .eq("id", parsed.data.mediaId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .maybeSingle();
  if (!current) throw new Error("图片关联不存在。");
  const { data: rows, error } = await supabase.from("experience_library_media")
    .select("id,position")
    .eq("user_id", userId)
    .eq("entry_id", current.entry_id)
    .is("archived_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error || !rows) throw new Error("图片顺序暂时无法调整。");
  const index = rows.findIndex((row) => row.id === current.id);
  const swapIndex = parsed.data.direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapIndex < 0 || swapIndex >= rows.length) return { moved: false };
  const other = rows[swapIndex];
  const updates = [
    supabase.from("experience_library_media").update({ position: other.position }).eq("id", current.id).eq("user_id", userId),
    supabase.from("experience_library_media").update({ position: current.position }).eq("id", other.id).eq("user_id", userId),
  ];
  const results = await Promise.all(updates);
  if (results.some((result) => result.error)) throw new Error("图片顺序未能完整更新，请刷新后重试。");
  revalidatePath(`/experience-library/${current.entry_id}`);
  return { moved: true };
}

export async function archiveExperienceMedia(rawInput: unknown) {
  const parsed = experienceMediaIdSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error("图片关联标识无效。");
  const { supabase, userId } = await requireOwner();
  const { data: current } = await supabase.from("experience_library_media")
    .select("id,entry_id")
    .eq("id", parsed.data.mediaId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .maybeSingle();
  if (!current) return;
  const { error } = await supabase.from("experience_library_media").update({
    archived_at: new Date().toISOString(),
  }).eq("id", current.id).eq("user_id", userId);
  if (error) throw new Error("图片关联未能移除；图片原件仍保留。");
  await audit(supabase, userId, "archive_media_relation", current.entry_id, {
    media_id: current.id,
    original_deleted: false,
  });
  revalidatePath(`/experience-library/${current.entry_id}`);
}

export async function saveExperienceAiSettings(formData: FormData) {
  const parsed = experienceAiSettingsSchema.safeParse({
    provider: formData.get("provider"),
    modelId: formData.get("model_id"),
    apiKey: String(formData.get("api_key") || "").trim() || undefined,
  });
  if (!parsed.success) throw new Error("请检查 Provider、模型 ID 和 API Key。");
  const { userId } = await requireOwner();
  const admin = createAdminClient();
  const { data: existing } = await admin.from("experience_library_ai_settings")
    .select("provider,api_key_ciphertext")
    .eq("user_id", userId)
    .maybeSingle();
  if (!parsed.data.apiKey && !existing?.api_key_ciphertext) throw new Error("请输入 API Key。");
  if (!parsed.data.apiKey && existing?.provider !== parsed.data.provider) {
    throw new Error("切换 Provider 时请输入对应的新 API Key。");
  }
  const { error } = await admin.from("experience_library_ai_settings").upsert({
    user_id: userId,
    provider: parsed.data.provider,
    model_id: parsed.data.modelId,
    api_key_ciphertext: parsed.data.apiKey
      ? sealSecret(parsed.data.apiKey, experienceLibraryKeyMaterial())
      : existing?.api_key_ciphertext,
  }, { onConflict: "user_id" });
  if (error) throw new Error("AI 设置未能保存。");
  await audit(admin as typeof admin, userId, "configure_experience_ai", userId, {
    provider: parsed.data.provider,
    model_id: parsed.data.modelId,
    key_replaced: Boolean(parsed.data.apiKey),
  });
  revalidatePath("/experience-library");
}

export async function testExperienceAiSettings(formData: FormData) {
  const parsed = experienceAiTestSchema.safeParse({
    provider: formData.get("provider"),
    modelId: formData.get("model_id"),
    apiKey: String(formData.get("api_key") || "").trim() || undefined,
  });
  if (!parsed.success) throw new Error("请检查 Provider 和模型 ID。");
  const { userId } = await requireOwner();
  const existing = await getExperienceAiConfiguration(userId);
  if (!parsed.data.apiKey && existing?.provider !== parsed.data.provider) {
    throw new Error("切换 Provider 时请输入对应的新 API Key。");
  }
  const apiKey = parsed.data.apiKey ?? existing?.apiKey;
  if (!apiKey) throw new Error("请先保存 API Key。");
  await testExperienceAiConnection({
    provider: parsed.data.provider,
    modelId: parsed.data.modelId,
    apiKey,
  });
  const admin = createAdminClient();
  await admin.from("experience_library_ai_settings").update({
    last_tested_at: new Date().toISOString(),
  }).eq("user_id", userId);
  revalidatePath("/experience-library");
}

export async function removeExperienceAiSettings() {
  const { userId } = await requireOwner();
  const admin = createAdminClient();
  const { error } = await admin.from("experience_library_ai_settings")
    .delete()
    .eq("user_id", userId);
  if (error) throw new Error("AI 设置未能移除。");
  await audit(admin as typeof admin, userId, "remove_experience_ai", userId);
  revalidatePath("/experience-library");
}

export async function saveExperiencePersonalNote(input: { entryId: string; note: string; status: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(input.entryId) || typeof input.note !== "string" || input.note.length > 10000 || !["unmarked", "to_read", "useful", "outdated"].includes(input.status)) throw new Error("备注或标记无效。");
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("experience_library_entries").update({ personal_note: input.note, review_status: input.status }).eq("id", input.entryId).eq("user_id", userId).is("archived_at", null).select("id").maybeSingle();
  if (error || !data) throw new Error("保存未完成，请稍后重试。");
  revalidatePath("/experience-library");
  revalidatePath(`/experience-library/${input.entryId}`);
}

/** Add an immutable correction for the currently verified image; never alter its original OCR. */
export async function correctExperienceImageText(input: { mediaId: string; documentId: string; sourceSha256: string; text: string; expectedCorrectionId: string | null; expectedExtractedAt: string | null }) {
  const value = z.object({ mediaId: z.uuid(), documentId: z.uuid(), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/), text: z.string().max(300000), expectedCorrectionId: z.uuid().nullable(), expectedExtractedAt: z.string().datetime({ offset: true }).nullable() }).strict().parse(input);
  const { supabase, userId } = await requireOwner();
  const { data: media, error } = await supabase.from("experience_library_media").select("entry_id,document_id").eq("id", value.mediaId).eq("user_id", userId).is("archived_at", null).maybeSingle();
  if (error || !media || media.document_id !== value.documentId) throw new Error("图片关联已变化，请刷新后重试。");
  const result = await supabase.rpc("save_experience_ocr_correction", { p_media_id: value.mediaId, p_document_id: value.documentId, p_source_sha256: value.sourceSha256, p_text: value.text, p_expected_correction: value.expectedCorrectionId, p_expected_extracted_at: value.expectedExtractedAt });
  if (result.error || !result.data) throw new Error("识别结果可能已更新；原图和旧版本仍保留，请复制当前输入并刷新后核对重试。");
  revalidatePath("/experience-library"); revalidatePath(`/experience-library/${media.entry_id}`);
}

/** Opting in changes this file's existing AI visibility setting, with explicit user intent. */
export async function setExperienceImageAiVisibility(input: { mediaId: string; allow: boolean }) {
  const value = z.object({ mediaId: z.uuid(), allow: z.boolean() }).strict().parse(input);
  const { supabase, userId } = await requireOwner();
  const { data: media, error } = await supabase.from("experience_library_media").select("entry_id,document_id").eq("id", value.mediaId).eq("user_id", userId).is("archived_at", null).maybeSingle();
  if (error || !media?.document_id) throw new Error("图片关联不存在。");
  const updated = await supabase.from("documents").update({ ai_visibility: value.allow ? "normal" : "sensitive" }).eq("id", media.document_id).eq("user_id", userId).eq("ai_visibility", value.allow ? "sensitive" : "normal").is("archived_at", null).select("id").maybeSingle();
  if (updated.error || !updated.data) throw new Error("图片 AI 使用设置未能保存。");
  await audit(supabase, userId, "experience_image_ai_visibility_changed", media.entry_id, { media_id: value.mediaId, visibility: value.allow ? "normal" : "sensitive" });
  revalidatePath(`/experience-library/${media.entry_id}`);
}

export async function getExperienceTaskLists() {
  const { supabase, userId } = await requireOwner();
  const [connection, lists] = await Promise.all([
    supabase.from("calendar_connections").select("id,status").eq("user_id", userId).is("archived_at", null).maybeSingle(),
    supabase.from("microsoft_todo_lists").select("id,display_name,is_default,connection_id").eq("user_id", userId).is("archived_at", null).order("display_name"),
  ]);
  if (connection.error || lists.error) throw new Error("任务清单暂时无法读取，请稍后重试。");
  return { connected: connection.data?.status === "enabled", lists: (lists.data ?? []).filter((item) => item.connection_id === connection.data?.id).map((item) => ({ id: item.id, name: item.display_name, isDefault: item.is_default })) };
}

/** Associate an already confirmed provider task without dispatching another task write. */
export async function linkExperienceTask(input: { entryId: string; taskId: string }) {
  const value = z.object({ entryId: z.uuid(), taskId: z.uuid() }).strict().parse(input);
  const { supabase, userId } = await requireOwner();
  const { data: existing, error: readError } = await supabase.from("experience_library_task_links").select("id").eq("user_id", userId).eq("entry_id", value.entryId).eq("todo_task_id", value.taskId).maybeSingle();
  if (readError) throw new Error("任务已创建，但来源关联尚未确认，请重试关联。");
  if (!existing) {
    const { error } = await supabase.from("experience_library_task_links").insert({ user_id: userId, entry_id: value.entryId, todo_task_id: value.taskId });
    if (error) throw new Error("任务已创建，但来源关联尚未确认，请重试关联。");
  }
  revalidatePath(`/experience-library/${value.entryId}`);
}

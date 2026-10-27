"use server";

import { createHash } from "node:crypto";
import { captureIntentSchema, type CaptureIntent, type CaptureOutcome } from "./capture-intents";
import { diagnosticErrorKind } from "@/lib/diagnostics";
import { revalidatePath } from "@/lib/workspace-revalidation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateDailyNote } from "@/features/notes/daily-note-service";
import { inboxCaptureSchema } from "./schemas";
import { classifyInboxItem } from "./classify";
import type { InboxCaptureState, InboxClassifyState } from "./state";

async function audit(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"], userId: string, action: string, entityId: string, data: Record<string, unknown>) {
  await supabase.from("audit_logs").insert({ user_id: userId, action, entity_type: "inbox_item", entity_id: entityId, actor_type: "user", after_data: data });
}

/** Read-only reconciliation: absence after a lost response never authorizes a second insert. */
export async function reconcileInboxCaptureIntent(input: CaptureIntent): Promise<CaptureOutcome> {
  const intent = captureIntentSchema.safeParse(input);
  const content = inboxCaptureSchema.safeParse({ content: intent.success ? intent.data.content : null });
  if (!intent.success || !content.success) return { status: "rejected", intentId: input.intentId, code: "invalid", message: "请输入 1 至 10,000 个字符。" };
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("inbox_items").select("id,content_markdown,capture_content_hash,ai_status,ai_classification_token").eq("id", intent.data.intentId).eq("user_id", userId).maybeSingle();
  if (error || !data) return { status: "needs-check", intentId: intent.data.intentId, message: "保存结果尚未核对。原输入和提交标识已保留，不会自动重复保存。" };
  const hash = createHash("sha256").update(content.data.content, "utf8").digest("hex");
  if (data.content_markdown !== content.data.content || data.capture_content_hash !== hash) return { status: "rejected", intentId: intent.data.intentId, code: "conflict", message: "这次提交对应的记录已变化，请保留输入并返回 Inbox 核对。" };
  return { status: "saved", intentId: intent.data.intentId, inboxId: data.id, classification: data.ai_classification_token ? "needs-check" : data.ai_status === "ready" ? "ready" : data.ai_status === "failed" ? "failed" : "unclassified" };
}

export async function captureInboxIntent(input: CaptureIntent): Promise<CaptureOutcome> {
  const intent = captureIntentSchema.safeParse(input);
  const content = inboxCaptureSchema.safeParse({ content: intent.success ? intent.data.content : null });
  if (!intent.success || !content.success) return { status: "rejected", intentId: input.intentId, code: "invalid", message: "请输入 1 至 10,000 个字符。" };
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.rpc("capture_inbox_intent", { p_intent_id: intent.data.intentId, p_content: content.data.content });
  if (error) {
    if (error.code === "40001") return { status: "rejected", intentId: intent.data.intentId, code: "conflict", message: "这次提交标识已对应其他内容，请先核对原记录。" };
    return reconcileInboxCaptureIntent(intent.data);
  }
  const canonical = z.object({ inbox_id: z.string().uuid(), created: z.boolean() }).safeParse(data);
  if (!canonical.success || canonical.data.inbox_id !== intent.data.intentId) return reconcileInboxCaptureIntent(intent.data);
  // A replay must not call the model again. A failed classification does not undo capture.
  if (canonical.data.created) {
    try { await classifyInboxItem({ supabase, userId, inboxId: canonical.data.inbox_id }); }
    catch { /* The real Inbox record remains saved; reconcile its actual AI status. */ }
  }
  await revalidatePath("/inbox"); await revalidatePath("/today");
  return reconcileInboxCaptureIntent(intent.data);
}

export async function captureInboxItem(_: InboxCaptureState, formData: FormData): Promise<InboxCaptureState> {
  const intentId = String(formData.get("intent_id") || crypto.randomUUID());
  try {
    const result = await captureInboxIntent({ intentId, content: String(formData.get("content") || "") });
    if (result.status === "saved") return { status: "success", message: "已加入 Inbox。", inboxId: result.inboxId, classified: result.classification === "ready", intentId };
    return { status: "error", message: result.message, intentId, needsCheck: result.status === "needs-check" };
  } catch { return { status: "error", intentId, needsCheck: true, message: "保存结果尚未核对，输入已保留。请先核对原提交，不要重复保存。" }; }
}

export async function reclassifyInboxItem(_: InboxClassifyState, formData: FormData): Promise<InboxClassifyState> {
  const parsed = inboxIdSchema.safeParse({ inboxId: formData.get("inbox_id") });
  if (!parsed.success) return { status: "error", message: "无效的 Inbox 记录。" };
  try {
    const { supabase, userId } = await requireOwner();
    const result = await classifyInboxItem({ supabase, userId, inboxId: parsed.data.inboxId, explicitRestart: true });
    await audit(supabase, userId, "reclassify", parsed.data.inboxId, { status: result.status });
    await revalidatePath("/inbox");
    if (result.status === "needs-check") return { status: "error", needsCheck: true, message: "识别结果尚未核对，请只读取原记录状态，不会重新生成。" };
    if (result.status === "superseded") return { status: "error", message: "来源或识别版本已变化，旧识别未应用。请查看当前记录。" };
    return {
      status: "success",
      message: result.status === "ready" ? "已识别出去向，请在列表确认。" : "仍无法判断，可手动选择去向。",
    };
  } catch (error) {
    console.error("[inbox:reclassify] failed", { reason: diagnosticErrorKind(error) });
    return { status: "error", needsCheck: true, message: "识别结果尚未核对，请先读取原记录状态，不会自动重发。" };
  }
}

/** Only reads classification metadata; no claim/model/repair side effect. */
export async function readInboxClassificationState(inboxIdInput: unknown) {
  const id = z.string().uuid().parse(inboxIdInput);
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("inbox_items").select("id,ai_status,ai_classification_started_at,processed_at,archived_at").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error || !data) throw new Error("识别结果尚未核对。");
  return { status: data.ai_classification_started_at ? "needs-check" as const : data.ai_status === "ready" ? "ready" as const : data.ai_status === "failed" ? "failed" as const : "needs-check" as const, processed: Boolean(data.processed_at || data.archived_at) };
}

export async function dismissInboxProposal(_: InboxClassifyState, formData: FormData): Promise<InboxClassifyState> {
  const parsed = inboxIdSchema.safeParse({ inboxId: formData.get("inbox_id") });
  if (!parsed.success) return { status: "error", message: "无效的 Inbox 记录。" };
  try {
    const { supabase, userId } = await requireOwner();
    const { data, error } = await supabase.from("inbox_items")
      .update({
        ai_proposal: null,
        ai_status: "failed",
        ai_updated_at: new Date().toISOString(),
        ai_error: "用户拒绝提案",
      })
      .eq("user_id", userId)
      .eq("id", parsed.data.inboxId)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();
    if (error || !data) throw new Error("inbox_dismiss_failed");
    await audit(supabase, userId, "dismiss_proposal", data.id, {});
    await revalidatePath("/inbox");
    return { status: "success", message: "已放回收集盒。" };
  } catch {
    return { status: "error", message: "操作失败，请重试。" };
  }
}

const inboxIdSchema = z.object({ inboxId: z.string().uuid() });

export async function cancelInboxUndispatchedIntent(_: InboxCaptureState, formData: FormData): Promise<InboxCaptureState> {
  const parsed = inboxIdSchema.safeParse({ inboxId: formData.get("inbox_id") });
  if (!parsed.success) return { status: "error", message: "无效的收集箱记录。" };
  const { userId } = await requireOwner();
  const { data, error } = await createAdminClient().rpc("cancel_inbox_undispatched", { p_owner: userId, p_inbox_id: parsed.data.inboxId });
  if (error || data !== true) return { status: "error", message: "没有可取消的未发送意图。远端结果待核对时不会释放；原内容和输入仍保留。" };
  await revalidatePath("/inbox");
  return { status: "success", message: "已取消尚未发送的意图。可保留当前输入重新确认，或选择其他去向。" };
}

export async function archiveInboxItem(_: InboxCaptureState, formData: FormData): Promise<InboxCaptureState> {
  const parsed = inboxIdSchema.safeParse({ inboxId: formData.get("inbox_id") });
  if (!parsed.success) return { status: "error", message: "无效的 Inbox 记录。" };
  try {
    const { supabase, userId } = await requireOwner();
    const { data, error } = await supabase.from("inbox_items")
      .update({ archived_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", parsed.data.inboxId)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();
    if (error || !data) throw new Error("inbox_archive_failed");
    await audit(supabase, userId, "archive", data.id, {});
    await revalidatePath("/inbox");
    await revalidatePath("/today");
    return { status: "success", message: "已归档，可在页面底部恢复。" };
  } catch (error) {
    console.error("[inbox:archive] failed", { reason: diagnosticErrorKind(error) });
    return { status: "error", message: "暂时无法归档，请重试。" };
  }
}

export async function restoreInboxItem(_: InboxCaptureState, formData: FormData): Promise<InboxCaptureState> {
  const parsed = inboxIdSchema.safeParse({ inboxId: formData.get("inbox_id") });
  if (!parsed.success) return { status: "error", message: "无效的 Inbox 记录。" };
  try {
    const { supabase, userId } = await requireOwner();
    const { data, error } = await supabase.from("inbox_items")
      .update({ archived_at: null })
      .eq("user_id", userId)
      .eq("id", parsed.data.inboxId)
      .not("archived_at", "is", null)
      .select("id")
      .maybeSingle();
    if (error || !data) throw new Error("inbox_restore_failed");
    await audit(supabase, userId, "restore", data.id, {});
    await revalidatePath("/inbox");
    await revalidatePath("/today");
    return { status: "success", message: "已恢复到 Inbox。" };
  } catch (error) {
    console.error("[inbox:restore] failed", { reason: diagnosticErrorKind(error) });
    return { status: "error", message: "暂时无法恢复，请重试。" };
  }
}

const noteConversionSchema = z.object({
  inboxId: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  bodyMarkdown: z.string().max(10_000),
});

export async function convertInboxToNote(_: InboxCaptureState, formData: FormData): Promise<InboxCaptureState> {
  const parsed = noteConversionSchema.safeParse({ inboxId: formData.get("inbox_id"), title: formData.get("title"), bodyMarkdown: formData.get("body_markdown") });
  if (!parsed.success) return { status: "error", message: "笔记内容无效。" };
  try {
    const { supabase } = await requireOwner();
    const { data: noteId, error } = await supabase.rpc("convert_inbox_note", { p_inbox_id: parsed.data.inboxId, p_title: parsed.data.title, p_body: parsed.data.bodyMarkdown });
    if (error || typeof noteId !== "string") throw new Error("inbox_note_conversion_failed");
    await revalidatePath("/inbox");
    await revalidatePath("/notes");
    await revalidatePath("/today");
    return { status: "success", message: "已创建笔记。", inboxId: parsed.data.inboxId, destinationHref: `/notes/${noteId}` };
  } catch {
    return { status: "error", message: "笔记未能创建，请重试。" };
  }
}

export async function convertInboxToDailyNote(_: InboxCaptureState, formData: FormData): Promise<InboxCaptureState> {
  const parsed = inboxIdSchema.safeParse({ inboxId: formData.get("inbox_id") });
  if (!parsed.success) return { status: "error", message: "无效的 Inbox 记录。" };
  try {
    const { supabase, userId } = await requireOwner();
    const { data: item, error: itemError } = await supabase.from("inbox_items")
      .select("id,content_markdown,converted_task_id,converted_todo_task_id,converted_note_id")
      .eq("user_id", userId)
      .eq("id", parsed.data.inboxId)
      .maybeSingle();
    if (itemError || !item) throw new Error("inbox_not_found");
    if (item.converted_task_id || item.converted_todo_task_id) {
      return { status: "error", message: "这条内容已经转成任务，不能再次写入日记。" };
    }
    const { data: profile } = await supabase.from("profiles")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle();
    const daily = item.converted_note_id ? { id: item.converted_note_id, revision: 0 } : await getOrCreateDailyNote(supabase, userId, profile?.timezone || "Asia/Shanghai");
    // The RPC locks the source before changing any note. A competing provider
    // claim or editor save rolls back the append, version and source together.
    const { data, error } = await supabase.rpc("convert_inbox_daily", { p_inbox_id: item.id, p_note_id: daily.id, p_expected_revision: daily.revision });
    const destination = z.object({ noteId: z.uuid(), date: z.iso.date() }).parse(data);
    if (error) throw new Error("inbox_daily_update_failed");
    await revalidatePath("/inbox");
    await revalidatePath("/notes");
    await revalidatePath(`/notes/${destination.noteId}`);
    await revalidatePath("/today");
    return {
      status: "success",
      message: `已写入 ${destination.date} 的今日日记。`,
      destinationHref: `/notes/${destination.noteId}`,
    };
  } catch (error) {
    console.error("[inbox:daily] failed", { reason: diagnosticErrorKind(error) });
    return { status: "error", message: "暂时无法写入今日日记，请重试。" };
  }
}

export async function readInboxProjectChoices() {
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("projects").select("id,name").eq("user_id", userId).is("archived_at", null).order("updated_at", { ascending: false }).limit(201);
  return { projects: error ? [] : data?.slice(0, 200) ?? [], unavailable: Boolean(error), truncated: (data?.length ?? 0) > 200 };
}
export async function convertInboxToProject(_: InboxCaptureState, formData: FormData): Promise<InboxCaptureState> {
  const parsed = noteConversionSchema.extend({ projectId: z.uuid() }).safeParse({ inboxId: formData.get("inbox_id"), title: formData.get("title"), bodyMarkdown: formData.get("body_markdown"), projectId: formData.get("project_id") });
  if (!parsed.success) return { status: "error", message: "请选择项目并填写资料标题。" };
  try {
    const { supabase } = await requireOwner();
    const { data: noteId, error } = await supabase.rpc("convert_inbox_project", { p_inbox_id: parsed.data.inboxId, p_project_id: parsed.data.projectId, p_title: parsed.data.title, p_body: parsed.data.bodyMarkdown });
    if (error || typeof noteId !== "string") throw new Error("inbox_project_failed");
    await revalidatePath("/inbox"); await revalidatePath("/projects"); await revalidatePath("/notes");
    return { status: "success", message: "已保存为该项目的笔记资料。", inboxId: parsed.data.inboxId, destinationHref: `/notes/${noteId}` };
  } catch { return { status: "error", message: "尚未关联项目，原内容仍保留；请核对后重试。" }; }
}
export async function convertInboxToLink(previous: InboxCaptureState, formData: FormData): Promise<InboxCaptureState> {
  const url = z.url().refine(value => ["https:", "http:"].includes(new URL(value).protocol)).safeParse(formData.get("url"));
  if (!url.success) return { status: "error", message: "请填写完整的 http 或 https 链接。" };
  const source = String(formData.get("body_markdown") ?? "");
  const next = new FormData(); next.set("inbox_id", String(formData.get("inbox_id") ?? "")); next.set("title", String(formData.get("title") ?? ""));
  next.set("body_markdown", `[原始链接](${url.data.replace(/[()]/g, character => character === "(" ? "%28" : "%29")})\n\n${source}`);
  return convertInboxToNote(previous, next);
}

/** Only reads the original source, immutable payload proof and actual destination. */
export async function readInboxConversionIntent(kind: "note" | "daily" | "project" | "link", formData: FormData): Promise<InboxCaptureState> {
  const { supabase, userId } = await requireOwner();
  const pending = (message = "原处理结果尚未核对，输入与原目标已保留，不会再次提交。"): InboxCaptureState => ({ status: "error", needsCheck: true, message });
  if (!["note", "daily", "project", "link"].includes(kind)) return { status: "error", message: "处理类型无效。" };
  const sourceId = inboxIdSchema.safeParse({ inboxId: formData.get("inbox_id") });
  if (!sourceId.success) return { status: "error", message: "原 Inbox 记录无效。" };
  let desired: z.infer<typeof noteConversionSchema> | null = null, projectId: string | null = null;
  if (kind !== "daily") {
    let body = formData.get("body_markdown");
    if (kind === "link") {
      const url = z.url().refine(value => ["http:", "https:"].includes(new URL(value).protocol)).safeParse(formData.get("url"));
      if (!url.success) return { status: "error", message: "原始链接无效，输入已保留。" };
      body = `[原始链接](${url.data.replace(/[()]/g, character => character === "(" ? "%28" : "%29")})\n\n${String(body ?? "")}`;
    }
    const parsed = noteConversionSchema.safeParse({ inboxId: sourceId.data.inboxId, title: formData.get("title"), bodyMarkdown: body });
    if (!parsed.success) return { status: "error", message: "原提交笔记内容无效，输入已保留。" };
    desired = parsed.data;
    if (kind === "project") { const project = z.uuid().safeParse(formData.get("project_id")); if (!project.success) return { status: "error", message: "原项目无效，输入已保留。" }; projectId = project.data; }
  }
  try {
    const { data: source, error } = await supabase.from("inbox_items").select("id,content_markdown,processed_at,converted_note_id,converted_task_id,converted_todo_task_id").eq("id", sourceId.data.inboxId).eq("user_id", userId).is("archived_at", null).maybeSingle();
    if (error || !source) return pending("原 Inbox 暂不可读取，不会改用其他记录或重新提交。");
    if (source.converted_task_id || source.converted_todo_task_id) return { status: "error", message: "原内容已处理到任务，未按当前目的地保存。" };
    if (!source.processed_at || !source.converted_note_id) return pending();
    const { data: note, error: noteError } = await supabase.from("notes").select("id,title,project_id,revision,content_hash").eq("id", source.converted_note_id).eq("user_id", userId).is("vault_group_id", null).is("archived_at", null).is("deleted_at", null).maybeSingle();
    if (noteError || !note) return pending("原目标笔记已归档、隐藏或暂不可读；不会另建目标。");
    const destinationHref = `/notes/${note.id}`;
    if (kind === "daily") {
      const match = /^日记 · (\d{4}-\d{2}-\d{2})$/.exec(note.title), date = z.iso.date().safeParse(match?.[1]);
      if (!date.success) return { status: "error", message: "原内容处理到另一种笔记，不能认定已写入日记。" };
      const [auditProof, body] = await Promise.all([
        supabase.from("audit_logs").select("id").eq("user_id", userId).eq("entity_type", "inbox_item").eq("entity_id", source.id).eq("action", "convert").contains("after_data", { target: "daily", destination_id: note.id, date: date.data }).limit(1),
        supabase.from("notes").select("body_markdown").eq("id", note.id).eq("user_id", userId).is("vault_group_id", null).is("archived_at", null).is("deleted_at", null).maybeSingle(),
      ]);
      if (auditProof.error || body.error || !auditProof.data?.length || !body.data?.body_markdown.includes(`<!-- inbox:${source.id} -->`)) return pending("原日记写入证据不完整或内容已有后续修改，请打开原记录核对。");
      return { status: "success", message: `已核对原记录，写入的是 ${date.data} 的日记。`, inboxId: source.id, destinationHref };
    }
    if (kind === "project") {
      if (note.project_id !== projectId) return { status: "error", message: "原目标不属于这次提交的项目，输入已保留。" };
      const [project, association] = await Promise.all([
        supabase.from("projects").select("id").eq("id", projectId!).eq("user_id", userId).is("archived_at", null).maybeSingle(),
        supabase.from("audit_logs").select("id").eq("user_id", userId).eq("entity_type", "note").eq("entity_id", note.id).eq("action", "associate_project").contains("after_data", { project_id: projectId, inbox_id: source.id }).limit(1),
      ]);
      if (project.error || !project.data || association.error || !association.data?.length) return pending("原项目或关联凭据尚未核对，不会换到其他项目。");
    } else if (note.project_id !== null) return { status: "error", message: "原记录已处理到项目资料，未按普通笔记提交。" };
    const originalBody = desired!.bodyMarkdown === "" ? source.content_markdown : desired!.bodyMarkdown;
    const hash = createHash("sha256").update(originalBody, "utf8").digest("hex");
    const [version, conversion] = await Promise.all([
      supabase.from("note_versions").select("title,body_markdown,revision").eq("user_id", userId).eq("note_id", note.id).eq("version_number", 1).maybeSingle(),
      supabase.from("audit_logs").select("id").eq("user_id", userId).eq("entity_type", "inbox_item").eq("entity_id", source.id).eq("action", "convert_to_note").contains("after_data", { note_id: note.id, content_hash: hash }).limit(1),
    ]);
    if (version.error || !version.data || conversion.error) return pending("原笔记版本或处理凭据尚未读取，当前输入已保留。");
    if (version.data.title !== desired!.title || version.data.body_markdown !== originalBody) return { status: "error", message: "原保存对应另一份标题或正文，当前新输入尚未保存。" };
    if (!conversion.data?.length) return pending("尚未核对到同一份原提交的处理凭据，输入已保留。");
    if (note.title !== version.data.title || note.content_hash && note.content_hash !== hash || version.data.revision !== null && note.revision > version.data.revision) return { ...pending("原保存已确认，目标笔记随后有更新。请打开原笔记核对，当前输入仍保留。"), destinationHref };
    return { status: "success", message: "已核对原提交的保存记录。", inboxId: source.id, destinationHref };
  } catch { return pending(); }
}

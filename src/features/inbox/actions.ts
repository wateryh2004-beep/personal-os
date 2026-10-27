"use server";

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

export async function captureInboxItem(_: InboxCaptureState, formData: FormData): Promise<InboxCaptureState> {
  const parsed = inboxCaptureSchema.safeParse({ content: formData.get("content") });
  if (!parsed.success) return { status: "error", message: "请输入 1 至 10,000 个字符。" };
  try {
    const { supabase, userId } = await requireOwner();
    const { data, error } = await supabase.from("inbox_items")
      .insert({ user_id: userId, content_markdown: parsed.data.content })
      .select("id")
      .single();
    if (error || !data) throw new Error("inbox_insert_failed");
    await audit(supabase, userId, "capture", data.id, { character_count: parsed.data.content.length });
    // 无对话式识别：写入后立即判定去向，失败不阻塞保存（落入收集盒）。
    let classified = false;
    try {
      const result = await classifyInboxItem({ supabase, userId, inboxId: data.id });
      classified = result.status === "ready";
    } catch (error) {
      console.error("[inbox:capture] classify failed", {
        reason: diagnosticErrorKind(error),
      });
    }
    await revalidatePath("/inbox");
    await revalidatePath("/today");
    return { status: "success", message: "已加入 Inbox。", inboxId: data.id, classified };
  } catch (error) {
    console.error("[inbox:capture] failed", {
      reason: diagnosticErrorKind(error),
    });
    return { status: "error", message: "暂时无法保存，请检查网络后重试。" };
  }
}

export async function reclassifyInboxItem(_: InboxClassifyState, formData: FormData): Promise<InboxClassifyState> {
  const parsed = inboxIdSchema.safeParse({ inboxId: formData.get("inbox_id") });
  if (!parsed.success) return { status: "error", message: "无效的 Inbox 记录。" };
  try {
    const { supabase, userId } = await requireOwner();
    const result = await classifyInboxItem({ supabase, userId, inboxId: parsed.data.inboxId });
    await audit(supabase, userId, "reclassify", parsed.data.inboxId, { status: result.status });
    await revalidatePath("/inbox");
    return {
      status: "success",
      message: result.status === "ready" ? "已识别出去向，请在列表确认。" : "仍无法判断，可手动选择去向。",
    };
  } catch (error) {
    console.error("[inbox:reclassify] failed", { reason: diagnosticErrorKind(error) });
    return { status: "error", message: "识别失败，请稍后重试。" };
  }
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

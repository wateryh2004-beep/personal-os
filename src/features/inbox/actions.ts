"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { contentHash } from "@/features/notes/utils";
import { appendInboxToDailyNote } from "@/features/notes/daily-note-service";
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
        reason: error instanceof Error ? error.message : "unknown_error",
      });
    }
    revalidatePath("/inbox");
    revalidatePath("/today");
    return { status: "success", message: "已加入 Inbox。", inboxId: data.id, classified };
  } catch (error) {
    console.error("[inbox:capture] failed", {
      reason: error instanceof Error ? error.message : "unknown_error",
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
    revalidatePath("/inbox");
    return {
      status: "success",
      message: result.status === "ready" ? "已识别出去向，请在列表确认。" : "仍无法判断，可手动选择去向。",
    };
  } catch (error) {
    console.error("[inbox:reclassify] failed", { reason: error instanceof Error ? error.message : "unknown_error" });
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
    revalidatePath("/inbox");
    return { status: "success", message: "已放回收集盒。" };
  } catch {
    return { status: "error", message: "操作失败，请重试。" };
  }
}

const inboxIdSchema = z.object({ inboxId: z.string().uuid() });

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
    revalidatePath("/inbox");
    revalidatePath("/today");
    return { status: "success", message: "已归档，可在页面底部恢复。" };
  } catch (error) {
    console.error("[inbox:archive] failed", { reason: error instanceof Error ? error.message : "unknown_error" });
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
    revalidatePath("/inbox");
    revalidatePath("/today");
    return { status: "success", message: "已恢复到 Inbox。" };
  } catch (error) {
    console.error("[inbox:restore] failed", { reason: error instanceof Error ? error.message : "unknown_error" });
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
    const { supabase, userId } = await requireOwner();
    const { data: item } = await supabase.from("inbox_items").select("id,content_markdown").eq("id", parsed.data.inboxId).is("archived_at", null).maybeSingle();
    if (!item) throw new Error("inbox_not_found");
    const body = parsed.data.bodyMarkdown || item.content_markdown;
    const now = new Date().toISOString();
    const { data: note, error } = await supabase.from("notes").insert({
      user_id: userId,
      title: parsed.data.title,
      body_markdown: body,
      status: "active",
      revision: 1,
      content_hash: contentHash(body),
      word_count: body.trim() ? body.trim().split(/\s+/).length : 0,
      character_count: body.length,
      last_saved_at: now,
    }).select("id").single();
    if (error || !note) throw new Error("note_insert_failed");
    const version = await supabase.from("note_versions").insert({ user_id: userId, note_id: note.id, title: parsed.data.title, body_markdown: body, version_number: 1, created_by: userId, content_hash: contentHash(body), revision: 1, reason: "initial" });
    if (version.error) throw new Error("version_insert_failed");
    const { error: processedError } = await supabase.from("inbox_items").update({ converted_note_id: note.id, processed_at: now }).eq("id", item.id);
    if (processedError) throw new Error("inbox_update_failed");
    await audit(supabase, userId, "convert_to_note", item.id, { note_id: note.id, content_hash: contentHash(body) });
    revalidatePath("/inbox");
    revalidatePath("/notes");
    revalidatePath("/today");
    return { status: "success", message: "已创建笔记。" };
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
    if (item.converted_note_id) {
      return {
        status: "success",
        message: "这条内容已经写入 Notes。",
        destinationHref: `/notes/${item.converted_note_id}`,
      };
    }
    const { data: profile } = await supabase.from("profiles")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle();
    const destination = await appendInboxToDailyNote(
      supabase,
      userId,
      profile?.timezone || "Asia/Shanghai",
      item.id,
      item.content_markdown,
    );
    const now = new Date().toISOString();
    const { data: processed, error } = await supabase.from("inbox_items")
      .update({
        converted_note_id: destination.noteId,
        processed_at: now,
        archived_at: null,
      })
      .eq("user_id", userId)
      .eq("id", item.id)
      .select("id")
      .maybeSingle();
    if (error || !processed) throw new Error("inbox_daily_update_failed");
    await audit(supabase, userId, "convert", item.id, {
      target: "daily",
      destination_id: destination.noteId,
      date: destination.date,
    });
    revalidatePath("/inbox");
    revalidatePath("/notes");
    revalidatePath(`/notes/${destination.noteId}`);
    revalidatePath("/today");
    return {
      status: "success",
      message: `已写入 ${destination.date} 的今日日记。`,
      destinationHref: `/notes/${destination.noteId}`,
    };
  } catch (error) {
    console.error("[inbox:daily] failed", { reason: error instanceof Error ? error.message : "unknown_error" });
    return { status: "error", message: "暂时无法写入今日日记，请重试。" };
  }
}

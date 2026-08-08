"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { contentHash } from "@/features/notes/utils";
import { inboxCaptureSchema } from "./schemas";
import type { InboxCaptureState } from "./state";

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
    revalidatePath("/inbox");
    revalidatePath("/today");
    return { status: "success", message: "已加入 Inbox。" };
  } catch (error) {
    console.error("[inbox:capture] failed", {
      reason: error instanceof Error ? error.message : "unknown_error",
    });
    return { status: "error", message: "暂时无法保存，请检查网络后重试。" };
  }
}

const inboxIdSchema = z.object({ inboxId: z.string().uuid() });

export async function archiveInboxItem(formData: FormData) {
  const parsed = inboxIdSchema.safeParse({ inboxId: formData.get("inbox_id") });
  if (!parsed.success) throw new Error("无效的 Inbox 项。");
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("inbox_items").update({ archived_at: new Date().toISOString() }).eq("id", parsed.data.inboxId).select("id").maybeSingle();
  if (error || !data) throw new Error("Inbox 项未能归档。");
  await audit(supabase, userId, "archive", data.id, {});
  revalidatePath("/inbox");
  revalidatePath("/today");
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

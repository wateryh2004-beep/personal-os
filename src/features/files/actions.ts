"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { readR2ObjectStream } from "@/lib/adapters/cloudflare-r2";
import { verifyFileStream } from "./integrity";
import { folderSchema, moveFileSchema, renameFileSchema } from "./schemas";

function fail(): never { throw new Error("操作未能完成，请检查权限或输入后重试。"); }
async function audit(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"], userId: string, action: string, id: string, afterData: Record<string, unknown> = {}) {
  try {
    const { error } = await supabase.from("audit_logs").insert({ user_id: userId, action, entity_type: "document", entity_id: id, actor_type: "user", after_data: afterData });
    return error ? { saved: true as const, warning: "文件变更已保存，但操作日志未记录，请刷新确认。" } : { saved: true as const };
  } catch {
    return { saved: true as const, warning: "文件变更已保存，但操作日志未记录，请刷新确认。" };
  }
}
async function ownFolder(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"], id: string) {
  const { data, error } = await supabase.from("file_folders").select("id").eq("id", id).is("archived_at", null).maybeSingle();
  if (error || !data) fail();
}
const fileAiVisibilitySchema = z.object({ documentId: z.string().uuid(), aiVisibility: z.enum(["normal", "sensitive", "never"]) });

/** Owner-only boundary: sensitive files never enter an AI tool result or context. */
export async function setFileAiVisibility(formData: FormData) {
  const parsed = fileAiVisibilitySchema.safeParse({ documentId: formData.get("document_id"), aiVisibility: formData.get("ai_visibility") });
  if (!parsed.success) fail();
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("documents").update({ ai_visibility: parsed.data.aiVisibility }).eq("id", parsed.data.documentId).eq("storage_provider", "cloudflare_r2").select("id").maybeSingle();
  if (error || !data) throw new Error("无法更新文件的 AI 可见性，请确认最新 migration 已应用。");
  const result = await audit(supabase, userId, "set_ai_visibility", data.id, { ai_visibility: parsed.data.aiVisibility });
  revalidatePath("/files"); return result;
}

export async function createFileFolder(formData: FormData) {
  const value = folderSchema.safeParse({ name: formData.get("name"), parentId: formData.get("parent_id") || null });
  if (!value.success) fail();
  const { supabase, userId } = await requireOwner();
  if (value.data.parentId) await ownFolder(supabase, value.data.parentId);
  const { data, error } = await supabase.from("file_folders").insert({ user_id: userId, name: value.data.name, parent_id: value.data.parentId ?? null }).select("id").single();
  if (error || !data) fail();
  const result = await audit(supabase, userId, "create_folder", data.id, { name: value.data.name, parent_id: value.data.parentId ?? null });
  revalidatePath("/files"); return result;
}

export async function renameFile(formData: FormData) {
  const value = renameFileSchema.safeParse({ documentId: formData.get("document_id"), title: formData.get("title") });
  if (!value.success) fail();
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("documents").update({ title: value.data.title }).eq("id", value.data.documentId).eq("storage_provider", "cloudflare_r2").is("archived_at", null).select("id").maybeSingle();
  if (error || !data) fail();
  const result = await audit(supabase, userId, "rename", data.id, { title: value.data.title }); revalidatePath("/files"); return result;
}

export async function moveFile(formData: FormData) {
  const value = moveFileSchema.safeParse({ documentId: formData.get("document_id"), folderId: formData.get("folder_id") || null });
  if (!value.success) fail();
  const { supabase, userId } = await requireOwner();
  if (value.data.folderId) await ownFolder(supabase, value.data.folderId);
  const { data, error } = await supabase.from("documents").update({ folder_id: value.data.folderId }).eq("id", value.data.documentId).eq("storage_provider", "cloudflare_r2").is("archived_at", null).select("id").maybeSingle();
  if (error || !data) fail();
  const result = await audit(supabase, userId, "move", data.id, { folder_id: value.data.folderId }); revalidatePath("/files"); return result;
}

export async function archiveFile(formData: FormData) {
  const documentId = String(formData.get("document_id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) fail();
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("documents").update({ archived_at: new Date().toISOString(), storage_state: "archived" }).eq("id", documentId).eq("user_id", userId).eq("storage_provider", "cloudflare_r2").eq("storage_state", "available").is("archived_at", null).select("id").maybeSingle();
  if (error || !data) fail();
  const result = await audit(supabase, userId, "archive", data.id); revalidatePath("/files"); return result;
}

export async function restoreFile(formData: FormData) {
  const documentId = String(formData.get("document_id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) fail();
  const { supabase, userId } = await requireOwner();
  const current = await supabase.from("documents").select("id,storage_path,file_size,checksum,archived_at,storage_state").eq("id", documentId).eq("user_id", userId).eq("storage_provider", "cloudflare_r2").maybeSingle();
  if (current.error || !current.data) fail();
  const file = current.data;
  if (file.storage_state === "available" && !file.archived_at) return { saved: true as const };
  if (file.storage_state !== "archived" || !file.archived_at || !file.storage_path.startsWith(`${userId}/`)) fail();
  try {
    const object = await readR2ObjectStream(file.storage_path);
    if (object.size !== Number(file.file_size)) {
      await object.body.cancel().catch(() => {});
      throw new Error("size_mismatch");
    }
    await verifyFileStream(object.body, Number(file.file_size), file.checksum);
  } catch { throw new Error("原文件暂不可读或校验不一致，文件仍保留在归档区；请重试或使用独立备份。"); }
  const { data, error } = await supabase.from("documents").update({ archived_at: null, storage_state: "available" }).eq("id", documentId).eq("user_id", userId).eq("storage_provider", "cloudflare_r2").eq("storage_state", "archived").eq("archived_at", file.archived_at).select("id").maybeSingle();
  if (error || !data) fail();
  const result = await audit(supabase, userId, "restore", data.id); revalidatePath("/files"); return result;
}

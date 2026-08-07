"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/require-owner";
import { folderSchema, moveFileSchema, renameFileSchema } from "./schemas";

function fail(): never { throw new Error("操作未能完成，请检查权限或输入后重试。"); }
async function audit(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"], userId: string, action: string, id: string, afterData: Record<string, unknown> = {}) {
  const { error } = await supabase.from("audit_logs").insert({ user_id: userId, action, entity_type: "document", entity_id: id, actor_type: "user", after_data: afterData });
  if (error) fail();
}
async function ownFolder(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"], id: string) {
  const { data, error } = await supabase.from("file_folders").select("id").eq("id", id).is("archived_at", null).maybeSingle();
  if (error || !data) fail();
}

export async function createFileFolder(formData: FormData) {
  const value = folderSchema.safeParse({ name: formData.get("name"), parentId: formData.get("parent_id") || null });
  if (!value.success) fail();
  const { supabase, userId } = await requireOwner();
  if (value.data.parentId) await ownFolder(supabase, value.data.parentId);
  const { data, error } = await supabase.from("file_folders").insert({ user_id: userId, name: value.data.name, parent_id: value.data.parentId ?? null }).select("id").single();
  if (error || !data) fail();
  await audit(supabase, userId, "create_folder", data.id, { name: value.data.name, parent_id: value.data.parentId ?? null });
  revalidatePath("/files");
}

export async function renameFile(formData: FormData) {
  const value = renameFileSchema.safeParse({ documentId: formData.get("document_id"), title: formData.get("title") });
  if (!value.success) fail();
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("documents").update({ title: value.data.title }).eq("id", value.data.documentId).eq("storage_provider", "cloudflare_r2").is("archived_at", null).select("id").maybeSingle();
  if (error || !data) fail();
  await audit(supabase, userId, "rename", data.id, { title: value.data.title }); revalidatePath("/files");
}

export async function moveFile(formData: FormData) {
  const value = moveFileSchema.safeParse({ documentId: formData.get("document_id"), folderId: formData.get("folder_id") || null });
  if (!value.success) fail();
  const { supabase, userId } = await requireOwner();
  if (value.data.folderId) await ownFolder(supabase, value.data.folderId);
  const { data, error } = await supabase.from("documents").update({ folder_id: value.data.folderId }).eq("id", value.data.documentId).eq("storage_provider", "cloudflare_r2").is("archived_at", null).select("id").maybeSingle();
  if (error || !data) fail();
  await audit(supabase, userId, "move", data.id, { folder_id: value.data.folderId }); revalidatePath("/files");
}

export async function archiveFile(formData: FormData) {
  const documentId = String(formData.get("document_id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) fail();
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("documents").update({ archived_at: new Date().toISOString(), storage_state: "archived" }).eq("id", documentId).eq("storage_provider", "cloudflare_r2").is("archived_at", null).select("id").maybeSingle();
  if (error || !data) fail();
  await audit(supabase, userId, "archive", data.id); revalidatePath("/files");
}

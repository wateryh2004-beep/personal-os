"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { requireOwner } from "@/lib/auth/require-owner";
import { bulletSchema, canApproveBullet, careerDirectionSchema, careerProfileSchema, certificationSchema, factSchema, formObject, isCurrent, outputSchema, skillSchema, experienceSchema } from "./schemas";

function failed(error: unknown): never { void error; throw new Error("操作未能完成，请检查输入、权限或配置后重试。"); }
async function audit(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"], userId: string, action: string, entityType: string, entityId: string, afterData: Record<string, unknown> = {}) {
  const { error } = await supabase.from("audit_logs").insert({ user_id: userId, action, entity_type: entityType, entity_id: entityId, after_data: afterData, actor_type: "user" });
  if (error) failed(error);
}
async function own(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"], table: string, id: string) {
  const { data, error } = await supabase.from(table).select("id").eq("id", id).maybeSingle();
  if (error || !data) failed(new Error("找不到该记录或无权访问。"));
}
function parse<T>(schema: { safeParse: (data: unknown) => { success: boolean; data?: T } }, data: unknown): T { const result = schema.safeParse(data); if (!result.success) failed(new Error("输入不符合要求，请检查后重试。")); return result.data!; }

export async function saveCareerProfile(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const value = parse(careerProfileSchema, formObject(formData));
  const { error } = await supabase.from("career_profiles").upsert({ ...value, user_id: userId }, { onConflict: "user_id" }); if (error) failed(error);
  await audit(supabase, userId, "upsert", "career_profile", userId); revalidatePath("/career"); revalidatePath("/career/profile");
}
export async function createDirection(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const value = parse(careerDirectionSchema, formObject(formData));
  const { data, error } = await supabase.from("career_directions").insert({ ...value, user_id: userId }).select("id").single(); if (error) failed(error);
  await audit(supabase, userId, "create", "career_direction", data.id, { name: value.name }); revalidatePath("/career"); revalidatePath("/career/directions");
}
export async function createExperience(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const raw = formObject(formData); const value = parse(experienceSchema, { ...raw, is_current: isCurrent(formData.get("is_current")) });
  const { data, error } = await supabase.from("experiences").insert({ ...value, user_id: userId }).select("id").single(); if (error) failed(error);
  await audit(supabase, userId, "create", "experience", data.id, { organization: value.organization, role: value.role }); revalidatePath("/career"); redirect(`/career/experiences/${data.id}`);
}
export async function createFact(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const value = parse(factSchema, formObject(formData)); await own(supabase, "experiences", value.experience_id); if (value.source_document_id) await own(supabase, "documents", value.source_document_id);
  const { data, error } = await supabase.from("experience_facts").insert({ ...value, user_id: userId }).select("id").single(); if (error) failed(error);
  await audit(supabase, userId, "create", "experience_fact", data.id, { experience_id: value.experience_id, fact_type: value.fact_type }); revalidatePath(`/career/experiences/${value.experience_id}`); revalidatePath("/career");
}
export async function createOutput(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const value = parse(outputSchema, formObject(formData)); await own(supabase, "experiences", value.experience_id);
  const { data, error } = await supabase.from("experience_outputs").insert({ ...value, public_url: value.public_url || null, user_id: userId }).select("id").single(); if (error) failed(error);
  await audit(supabase, userId, "create", "experience_output", data.id, { experience_id: value.experience_id, name: value.name }); revalidatePath(`/career/experiences/${value.experience_id}`); revalidatePath("/career");
}
export async function createBullet(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const value = parse(bulletSchema, formObject(formData)); await own(supabase, "experiences", value.experience_id); if (value.career_direction_id) await own(supabase, "career_directions", value.career_direction_id);
  const { data, error } = await supabase.from("experience_bullets").insert({ ...value, user_id: userId, status: "draft" }).select("id").single(); if (error) failed(error);
  await audit(supabase, userId, "create", "experience_bullet", data.id, { experience_id: value.experience_id }); revalidatePath(`/career/experiences/${value.experience_id}`);
}
export async function linkFactToBullet(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const bulletId = String(formData.get("bullet_id") || ""); const factId = String(formData.get("fact_id") || ""); await own(supabase, "experience_bullets", bulletId); await own(supabase, "experience_facts", factId);
  const [{ data: bullet }, { data: fact }] = await Promise.all([supabase.from("experience_bullets").select("experience_id").eq("id", bulletId).single(), supabase.from("experience_facts").select("experience_id").eq("id", factId).single()]);
  if (!bullet || !fact || bullet.experience_id !== fact.experience_id) failed(new Error("表达只能关联同一经历的事实。"));
  const { error } = await supabase.from("bullet_fact_links").upsert({ user_id: userId, bullet_id: bulletId, fact_id: factId }, { onConflict: "bullet_id,fact_id" }); if (error) failed(error);
  await audit(supabase, userId, "link", "experience_bullet", bulletId, { fact_id: factId }); revalidatePath(`/career/experiences/${bullet.experience_id}`);
}
export async function approveBullet(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const bulletId = String(formData.get("bullet_id") || ""); await own(supabase, "experience_bullets", bulletId);
  const { data: bullet, error } = await supabase.from("experience_bullets").select("experience_id,source").eq("id", bulletId).single(); if (error || !bullet) failed(error || new Error("未找到表达。"));
  const { count } = await supabase.from("bullet_fact_links").select("id", { count: "exact", head: true }).eq("bullet_id", bulletId);
  if (!canApproveBullet({ hasFact: Boolean(count), source: bullet.source })) failed(new Error("批准前请至少关联一条事实；AI 来源内容须先人工改写。"));
  const { error: updateError } = await supabase.from("experience_bullets").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", bulletId); if (updateError) failed(updateError);
  await audit(supabase, userId, "approve", "experience_bullet", bulletId); revalidatePath(`/career/experiences/${bullet.experience_id}`);
}
export async function createSkill(formData: FormData) { const { supabase, userId } = await requireOwner(); const value = parse(skillSchema, formObject(formData)); const { data, error } = await supabase.from("skills").insert({ ...value, user_id: userId }).select("id").single(); if (error) failed(error); await audit(supabase, userId, "create", "skill", data.id, { name: value.name }); revalidatePath("/career/skills"); }
export async function createCertification(formData: FormData) { const { supabase, userId } = await requireOwner(); const value = parse(certificationSchema, formObject(formData)); if (value.document_id) await own(supabase, "documents", value.document_id); const { data, error } = await supabase.from("certifications").insert({ ...value, user_id: userId }).select("id").single(); if (error) failed(error); await audit(supabase, userId, "create", "certification", data.id, { name: value.name }); revalidatePath("/career/certifications"); }
export async function archiveExperience(formData: FormData) { const { supabase, userId } = await requireOwner(); const id = String(formData.get("experience_id") || ""); await own(supabase, "experiences", id); const { error } = await supabase.from("experiences").update({ archived_at: new Date().toISOString(), status: "archived" }).eq("id", id); if (error) failed(error); await audit(supabase, userId, "archive", "experience", id); revalidatePath("/career"); revalidatePath("/career/experiences"); redirect("/career/experiences"); }
const allowedFiles: Record<string, string[]> = { "application/pdf": ["pdf"], "image/png": ["png"], "image/jpeg": ["jpg", "jpeg"], "image/webp": ["webp"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"] };
export async function uploadEvidence(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const experienceId = String(formData.get("experience_id") || ""); const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 20 * 1024 * 1024) failed(new Error("请选择不超过 20MB 的 PDF、PNG、JPEG、WEBP 或 DOCX 文件。"));
  const extension = file.name.split(".").pop()?.toLowerCase() || ""; if (!allowedFiles[file.type]?.includes(extension)) failed(new Error("文件类型或扩展名不受支持。"));
  await own(supabase, "experiences", experienceId); const path = `${userId}/career/experience/${experienceId}/${randomUUID()}.${extension}`;
  const { error: storageError } = await supabase.storage.from("private-files").upload(path, file, { contentType: file.type, upsert: false }); if (storageError) failed(new Error("文件上传失败，请确认私有文件桶已创建。"));
  const { data, error } = await supabase.from("documents").insert({ user_id: userId, title: String(formData.get("title") || file.name).trim().slice(0, 240) || file.name, document_type: String(formData.get("document_type") || "other"), original_filename: file.name, storage_bucket: "private-files", storage_path: path, mime_type: file.type, file_size: file.size, confidentiality_level: String(formData.get("confidentiality_level") || "private") }).select("id").single();
  if (error) { await supabase.storage.from("private-files").remove([path]); failed(error); }
  const { error: linkError } = await supabase.from("entity_links").insert({ user_id: userId, source_type: "experience", source_id: experienceId, target_type: "document", target_id: data.id, relationship_type: "evidence" });
  if (linkError) { await supabase.from("documents").update({ archived_at: new Date().toISOString() }).eq("id", data.id); failed(linkError); }
  await audit(supabase, userId, "upload", "document", data.id, { experience_id: experienceId, document_type: formData.get("document_type") }); revalidatePath(`/career/experiences/${experienceId}`); revalidatePath("/career");
}

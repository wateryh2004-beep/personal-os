"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { requireOwner } from "@/lib/auth/require-owner";
import { applicationSchema, applicationTransitionSchema, bulletSchema, canApproveBullet, careerDirectionSchema, careerMilestoneSchema, careerProfileSchema, careerTrackOrderSchema, careerTrackSchema, certificationSchema, factSchema, formObject, gapAnalysisSchema, isCurrent, opportunitySchema, outputSchema, requirementSchema, resumeVersionSchema, skillSchema, experienceSchema } from "./schemas";
import { assessRequirement, type GapEvidence } from "./gap-analysis";

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
export async function updateDirection(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const directionId = String(formData.get("direction_id") || ""); const value = parse(careerDirectionSchema, formObject(formData));
  await own(supabase, "career_directions", directionId); const { error } = await supabase.from("career_directions").update(value).eq("id", directionId);
  if (error) failed(error); await audit(supabase, userId, "update", "career_direction", directionId, { name: value.name, status: value.status, priority: value.priority }); revalidatePath("/career"); revalidatePath("/career/directions");
}
export async function archiveDirection(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const directionId = String(formData.get("direction_id") || ""); await own(supabase, "career_directions", directionId);
  const { error } = await supabase.from("career_directions").update({ archived_at: new Date().toISOString(), status: "archived" }).eq("id", directionId);
  if (error) failed(error); await audit(supabase, userId, "archive", "career_direction", directionId); revalidatePath("/career"); revalidatePath("/career/directions");
}
export async function createCareerTrack(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const value = parse(careerTrackSchema, formObject(formData));
  const { data, error } = await supabase.from("career_tracks").insert({ ...value, user_id: userId }).select("id").single(); if (error || !data) failed(error);
  await audit(supabase, userId, "create", "career_track", data.id, { name: value.name }); revalidatePath("/career/roadmap"); revalidatePath("/career");
}
export async function createCareerMilestone(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const raw = formObject(formData); const value = parse(careerMilestoneSchema, { ...raw, career_direction_id: raw.career_direction_id || null });
  await own(supabase, "career_tracks", value.track_id); if (value.career_direction_id) await own(supabase, "career_directions", value.career_direction_id);
  const { data, error } = await supabase.from("career_milestones").insert({ ...value, user_id: userId }).select("id").single(); if (error || !data) failed(error);
  await audit(supabase, userId, "create", "career_milestone", data.id, { track_id: value.track_id, target_date: value.target_date, importance: value.importance }); revalidatePath("/career/roadmap"); revalidatePath("/career");
}
export async function updateCareerTrack(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const trackId = String(formData.get("track_id") || ""); const value = parse(careerTrackSchema, formObject(formData));
  await own(supabase, "career_tracks", trackId); const { error } = await supabase.from("career_tracks").update(value).eq("id", trackId); if (error) failed(error);
  await audit(supabase, userId, "update", "career_track", trackId, { name: value.name, status: value.status, color: value.color }); revalidatePath("/career/roadmap"); revalidatePath("/career");
}
export async function archiveCareerTrack(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const trackId = String(formData.get("track_id") || ""); await own(supabase, "career_tracks", trackId);
  const { error } = await supabase.from("career_tracks").update({ archived_at: new Date().toISOString(), status: "archived" }).eq("id", trackId); if (error) failed(error);
  await audit(supabase, userId, "archive", "career_track", trackId); revalidatePath("/career/roadmap"); revalidatePath("/career");
}
export async function updateCareerMilestone(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const milestoneId = String(formData.get("milestone_id") || ""); const raw = formObject(formData); const value = parse(careerMilestoneSchema, { ...raw, career_direction_id: raw.career_direction_id || null });
  await own(supabase, "career_milestones", milestoneId); await own(supabase, "career_tracks", value.track_id); if (value.career_direction_id) await own(supabase, "career_directions", value.career_direction_id);
  const { error } = await supabase.from("career_milestones").update(value).eq("id", milestoneId); if (error) failed(error);
  await audit(supabase, userId, "update", "career_milestone", milestoneId, { track_id: value.track_id, starts_on: value.starts_on, target_date: value.target_date, status: value.status }); revalidatePath("/career/roadmap"); revalidatePath("/career");
}
export async function archiveCareerMilestone(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const milestoneId = String(formData.get("milestone_id") || ""); await own(supabase, "career_milestones", milestoneId);
  const { error } = await supabase.from("career_milestones").update({ archived_at: new Date().toISOString() }).eq("id", milestoneId); if (error) failed(error);
  await audit(supabase, userId, "archive", "career_milestone", milestoneId); revalidatePath("/career/roadmap"); revalidatePath("/career");
}
export async function duplicateCareerMilestone(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const milestoneId = String(formData.get("milestone_id") || ""); await own(supabase, "career_milestones", milestoneId);
  const { data: source, error: sourceError } = await supabase.from("career_milestones").select("track_id,career_direction_id,title,description,starts_on,target_date,status,importance").eq("id", milestoneId).maybeSingle(); if (sourceError || !source) failed(sourceError);
  const { data, error } = await supabase.from("career_milestones").insert({ ...source, user_id: userId, title: `${source.title}（副本）` }).select("id").single(); if (error || !data) failed(error);
  await audit(supabase, userId, "duplicate", "career_milestone", data.id, { source_id: milestoneId }); revalidatePath("/career/roadmap"); revalidatePath("/career");
}
export async function reorderCareerTracks(formData: FormData) {
  const { supabase, userId } = await requireOwner(); let raw: unknown;
  try { raw = JSON.parse(String(formData.get("track_ids") || "[]")); } catch { failed(new Error("路线顺序无效。")); }
  const ids = parse(careerTrackOrderSchema, raw); await Promise.all(ids.map((id) => own(supabase, "career_tracks", id)));
  const results = await Promise.all(ids.map((id, position) => supabase.from("career_tracks").update({ position }).eq("id", id)));
  if (results.some((result) => result.error)) failed(results.find((result) => result.error)?.error);
  await audit(supabase, userId, "reorder", "career_track", ids[0], { track_ids: ids }); revalidatePath("/career/roadmap"); revalidatePath("/career");
}
export async function createExperience(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const raw = formObject(formData); const value = parse(experienceSchema, { ...raw, is_current: isCurrent(formData.get("is_current")) });
  const { data, error } = await supabase.from("experiences").insert({ ...value, user_id: userId }).select("id").single(); if (error) failed(error);
  await audit(supabase, userId, "create", "experience", data.id, { organization: value.organization, role: value.role }); revalidatePath("/career"); redirect(`/career/experiences/${data.id}`);
}
export async function createFact(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const raw = formObject(formData); const value = parse(factSchema, { ...raw, source_document_id: raw.source_document_id || null }); await own(supabase, "experiences", value.experience_id); if (value.source_document_id) await own(supabase, "documents", value.source_document_id);
  const { data, error } = await supabase.from("experience_facts").insert({ ...value, user_id: userId }).select("id").single(); if (error) failed(error);
  await audit(supabase, userId, "create", "experience_fact", data.id, { experience_id: value.experience_id, fact_type: value.fact_type }); revalidatePath(`/career/experiences/${value.experience_id}`); revalidatePath("/career");
}
export async function updateFact(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const raw = formObject(formData); const value = parse(factSchema, { ...raw, source_document_id: raw.source_document_id || null }); const factId = String(formData.get("fact_id") || ""); await own(supabase, "experience_facts", factId); await own(supabase, "experiences", value.experience_id); if (value.source_document_id) await own(supabase, "documents", value.source_document_id);
  const { error } = await supabase.from("experience_facts").update(value).eq("id", factId); if (error) failed(error); await audit(supabase, userId, "update", "experience_fact", factId, { experience_id: value.experience_id, fact_type: value.fact_type }); revalidatePath(`/career/experiences/${value.experience_id}`);
}
export async function createOutput(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const value = parse(outputSchema, formObject(formData)); await own(supabase, "experiences", value.experience_id);
  const { data, error } = await supabase.from("experience_outputs").insert({ ...value, public_url: value.public_url || null, user_id: userId }).select("id").single(); if (error) failed(error);
  await audit(supabase, userId, "create", "experience_output", data.id, { experience_id: value.experience_id, name: value.name }); revalidatePath(`/career/experiences/${value.experience_id}`); revalidatePath("/career");
}
export async function createBullet(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const raw = formObject(formData); const value = parse(bulletSchema, { ...raw, career_direction_id: raw.career_direction_id || null }); await own(supabase, "experiences", value.experience_id); if (value.career_direction_id) await own(supabase, "career_directions", value.career_direction_id);
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
export async function updateSkill(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const skillId = String(formData.get("skill_id") || ""); const value = parse(skillSchema, formObject(formData));
  await own(supabase, "skills", skillId); const { error } = await supabase.from("skills").update(value).eq("id", skillId);
  if (error) failed(error); await audit(supabase, userId, "update", "skill", skillId, { name: value.name, category: value.category, proficiency: value.proficiency }); revalidatePath("/career"); revalidatePath("/career/skills");
}
export async function archiveSkill(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const skillId = String(formData.get("skill_id") || ""); await own(supabase, "skills", skillId);
  const { error } = await supabase.from("skills").update({ archived_at: new Date().toISOString() }).eq("id", skillId);
  if (error) failed(error); await audit(supabase, userId, "archive", "skill", skillId); revalidatePath("/career"); revalidatePath("/career/skills");
}
export async function createCertification(formData: FormData) { const { supabase, userId } = await requireOwner(); const raw = formObject(formData); const value = parse(certificationSchema, { ...raw, document_id: raw.document_id || null }); if (value.document_id) await own(supabase, "documents", value.document_id); const { data, error } = await supabase.from("certifications").insert({ ...value, user_id: userId }).select("id").single(); if (error) failed(error); await audit(supabase, userId, "create", "certification", data.id, { name: value.name }); revalidatePath("/career/certifications"); }
export async function updateCertification(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const raw = formObject(formData); const value = parse(certificationSchema, { ...raw, document_id: raw.document_id || null });
  const certificationId = String(formData.get("certification_id") || ""); await own(supabase, "certifications", certificationId);
  if (value.document_id) await own(supabase, "documents", value.document_id);
  const { error } = await supabase.from("certifications").update(value).eq("id", certificationId);
  if (error) failed(error); await audit(supabase, userId, "update", "certification", certificationId, { name: value.name, status: value.status }); revalidatePath("/career"); revalidatePath("/career/certifications");
}
export async function archiveCertification(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const certificationId = String(formData.get("certification_id") || ""); await own(supabase, "certifications", certificationId);
  const { error } = await supabase.from("certifications").update({ archived_at: new Date().toISOString() }).eq("id", certificationId);
  if (error) failed(error); await audit(supabase, userId, "archive", "certification", certificationId); revalidatePath("/career"); revalidatePath("/career/certifications");
}
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
  const { error: linkError } = await supabase.from("entity_links").insert({ user_id: userId, source_type: "experience", source_id: experienceId, target_type: "document", target_id: data.id, relationship_type: "evidence", created_via: "system" });
  if (linkError) { await supabase.from("documents").update({ archived_at: new Date().toISOString() }).eq("id", data.id); failed(linkError); }
  await audit(supabase, userId, "upload", "document", data.id, { experience_id: experienceId, document_type: formData.get("document_type") }); revalidatePath(`/career/experiences/${experienceId}`); revalidatePath("/career");
}
export async function createEntityLink(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const experienceId = String(formData.get("experience_id") || ""); const targetType = String(formData.get("target_type") || ""); const targetId = String(formData.get("target_id") || ""); const tables: Record<string, string> = { note: "notes", task: "tasks", project: "projects", document: "documents" }; const table = tables[targetType];
  if (!table) failed(new Error("不支持的关联类型。")); await own(supabase, "experiences", experienceId); await own(supabase, table, targetId);
  const { error } = await supabase.from("entity_links").upsert({ user_id: userId, source_type: "experience", source_id: experienceId, target_type: targetType, target_id: targetId, relationship_type: "related" }, { onConflict: "user_id,source_type,source_id,target_type,target_id,relationship_type" }); if (error) failed(error);
  await audit(supabase, userId, "link", "experience", experienceId, { target_type: targetType, target_id: targetId }); revalidatePath(`/career/experiences/${experienceId}`);
}

export async function createOpportunity(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const raw = formObject(formData);
  const value = parse(opportunitySchema, { ...raw, source_url: raw.source_url || null, career_direction_id: raw.career_direction_id || null, deadline_at: raw.deadline_at ? new Date(String(raw.deadline_at)).toISOString() : null });
  if (value.career_direction_id) await own(supabase, "career_directions", value.career_direction_id);
  const { data, error } = await supabase.from("career_opportunities").insert({ ...value, source_url: value.source_url || null, deadline_at: value.deadline_at || null, user_id: userId }).select("id").single();
  if (error || !data) failed(error); await audit(supabase, userId, "create", "career_opportunity", data.id, { organization: value.organization, role_title: value.role_title });
  revalidatePath("/career"); revalidatePath("/career/opportunities");
}

export async function createOpportunityRequirement(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const value = parse(requirementSchema, { ...formObject(formData), extraction_source: "human" }); await own(supabase, "career_opportunities", value.opportunity_id);
  const { data, error } = await supabase.from("opportunity_requirements").insert({ ...value, user_id: userId }).select("id").single();
  if (error || !data) failed(error); await audit(supabase, userId, "create", "opportunity_requirement", data.id, { opportunity_id: value.opportunity_id, requirement_type: value.requirement_type });
  revalidatePath("/career/opportunities");
}

export async function createCareerApplication(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const raw = formObject(formData);
  const value = parse(applicationSchema, { ...raw, resume_version_id: raw.resume_version_id || null, applied_at: raw.applied_at ? new Date(String(raw.applied_at)).toISOString() : null });
  await own(supabase, "career_opportunities", value.opportunity_id); if (value.resume_version_id) await own(supabase, "resume_versions", value.resume_version_id);
  const { data, error } = await supabase.from("career_applications").insert({ ...value, applied_at: value.applied_at || null, user_id: userId }).select("id").single();
  if (error || !data) failed(error);
  const { error: historyError } = await supabase.from("application_stage_events").insert({ user_id: userId, application_id: data.id, from_status: null, to_status: value.status, event_type: "created" });
  if (historyError) { await supabase.from("career_applications").delete().eq("id", data.id); failed(historyError); }
  await audit(supabase, userId, "create", "career_application", data.id, { opportunity_id: value.opportunity_id, status: value.status }); revalidatePath("/career"); revalidatePath("/career/applications");
}

export async function transitionCareerApplication(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const value = parse(applicationTransitionSchema, formObject(formData)); await own(supabase, "career_applications", value.application_id);
  const { error } = await supabase.rpc("transition_career_application", { p_application_id: value.application_id, p_to_status: value.status, p_note: value.note });
  if (error) failed(error); await audit(supabase, userId, "transition", "career_application", value.application_id, { status: value.status }); revalidatePath("/career"); revalidatePath("/career/applications");
}

export async function createResumeVersion(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const raw = formObject(formData); const value = parse(resumeVersionSchema, { ...raw, target_direction_id: raw.target_direction_id || null });
  if (value.target_direction_id) await own(supabase, "career_directions", value.target_direction_id);
  const { data, error } = await supabase.from("resume_versions").insert({ ...value, user_id: userId, status: "draft" }).select("id").single();
  if (error || !data) failed(error); await audit(supabase, userId, "create", "resume_version", data.id, { title: value.title }); revalidatePath("/career/resumes");
}

export async function finalizeResumeVersion(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const resumeId = String(formData.get("resume_id") || ""); await own(supabase, "resume_versions", resumeId);
  const { error } = await supabase.rpc("finalize_resume_version", { p_resume_id: resumeId }); if (error) failed(error);
  await audit(supabase, userId, "finalize", "resume_version", resumeId); revalidatePath("/career/resumes");
}

export async function updateResumeVersion(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const resumeId = String(formData.get("resume_id") || ""); const raw = formObject(formData);
  const value = parse(resumeVersionSchema, { ...raw, target_direction_id: raw.target_direction_id || null });
  await own(supabase, "resume_versions", resumeId);
  const { data: resume } = await supabase.from("resume_versions").select("id,status").eq("id", resumeId).maybeSingle();
  if (!resume || resume.status !== "draft") failed(new Error("只有草稿简历可以编辑，定稿版本请新建版本再改。"));
  if (value.target_direction_id) await own(supabase, "career_directions", value.target_direction_id);
  const documentId = String(raw.document_id || "").trim() || null;
  if (documentId) await own(supabase, "documents", documentId);
  const { error } = await supabase.from("resume_versions").update({ ...value, document_id: documentId }).eq("id", resumeId);
  if (error) failed(error);
  await audit(supabase, userId, "update", "resume_version", resumeId, { title: value.title, document_id: documentId }); revalidatePath("/career/resumes"); revalidatePath("/career");
}

export async function archiveResumeVersion(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const resumeId = String(formData.get("resume_id") || ""); await own(supabase, "resume_versions", resumeId);
  const { data: resume } = await supabase.from("resume_versions").select("id,status").eq("id", resumeId).maybeSingle();
  if (!resume || resume.status !== "draft") failed(new Error("只有草稿简历可以归档。"));
  const { error } = await supabase.from("resume_versions").update({ archived_at: new Date().toISOString(), status: "archived" }).eq("id", resumeId);
  if (error) failed(error);
  await audit(supabase, userId, "archive", "resume_version", resumeId); revalidatePath("/career/resumes"); revalidatePath("/career");
}

export async function setResumeVersionBullets(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const resumeId = String(formData.get("resume_id") || ""); const bulletIds = [...new Set(formData.getAll("bullet_id").map(String))].slice(0, 100);
  const { data: resume } = await supabase.from("resume_versions").select("id,status").eq("id", resumeId).is("archived_at", null).maybeSingle(); if (!resume || resume.status !== "draft") failed(new Error("只有草稿简历可以修改。")); await Promise.all(bulletIds.map((id) => own(supabase, "experience_bullets", id)));
  const { error: deleteError } = await supabase.from("resume_version_bullets").delete().eq("resume_version_id", resumeId); if (deleteError) failed(deleteError);
  if (bulletIds.length) {
    const { error } = await supabase.from("resume_version_bullets").insert(bulletIds.map((bulletId, position) => ({ user_id: userId, resume_version_id: resumeId, bullet_id: bulletId, position })));
    if (error) failed(error);
  }
  await audit(supabase, userId, "compose", "resume_version", resumeId, { bullet_count: bulletIds.length }); revalidatePath("/career/resumes");
}

export async function runGapAnalysis(formData: FormData) {
  const { supabase, userId } = await requireOwner(); const raw = formObject(formData); const value = parse(gapAnalysisSchema, { ...raw, resume_version_id: raw.resume_version_id || null });
  await own(supabase, "career_opportunities", value.opportunity_id); if (value.resume_version_id) await own(supabase, "resume_versions", value.resume_version_id);
  const [{ data: requirements, error: requirementError }, { data: facts }, { data: bullets }, { data: skills }, { data: certifications }, { data: outputs }] = await Promise.all([
    supabase.from("opportunity_requirements").select("id,requirement_text").eq("opportunity_id", value.opportunity_id).is("archived_at", null).order("position"),
    supabase.from("experience_facts").select("id,content").is("archived_at", null),
    supabase.from("experience_bullets").select("id,content,status").is("archived_at", null),
    supabase.from("skills").select("id,name,evidence_markdown").is("archived_at", null),
    supabase.from("certifications").select("id,name,issuer,status").is("archived_at", null),
    supabase.from("experience_outputs").select("id,name,description_markdown,result_markdown").is("archived_at", null),
  ]);
  if (requirementError || !requirements?.length) failed(requirementError || new Error("请先录入岗位要求。"));
  let evidence: GapEvidence[] = [
    ...(facts ?? []).map((item) => ({ entityType: "experience_fact" as const, entityId: item.id, text: item.content })),
    ...(bullets ?? []).filter((item) => item.status === "approved").map((item) => ({ entityType: "experience_bullet" as const, entityId: item.id, text: item.content })),
    ...(skills ?? []).map((item) => ({ entityType: "skill" as const, entityId: item.id, text: `${item.name} ${item.evidence_markdown ?? ""}` })),
    ...(certifications ?? []).map((item) => ({ entityType: "certification" as const, entityId: item.id, text: `${item.name} ${item.issuer ?? ""} ${item.status}` })),
    ...(outputs ?? []).map((item) => ({ entityType: "experience_output" as const, entityId: item.id, text: `${item.name} ${item.description_markdown ?? ""} ${item.result_markdown ?? ""}` })),
  ];
  if (value.analysis_type === "resume") {
    const { data: linked } = await supabase.from("resume_version_bullets").select("bullet_id").eq("resume_version_id", value.resume_version_id!);
    const ids = new Set((linked ?? []).map((item) => item.bullet_id));
    evidence = evidence.filter((item) => item.entityType === "experience_bullet" && ids.has(item.entityId));
  }
  const assessments = requirements.map((requirement) => ({ requirement, result: assessRequirement(requirement.requirement_text, evidence) }));
  const missing = assessments.filter((entry) => entry.result.assessment === "missing").length; const partial = assessments.filter((entry) => entry.result.assessment === "partial").length;
  const summary = `${requirements.length} 条要求中，${missing} 条尚无证据，${partial} 条仅部分覆盖。结果基于已记录事实的保守关键词匹配，需人工确认。`;
  const { data: run, error: runError } = await supabase.from("gap_analysis_runs").insert({ user_id: userId, opportunity_id: value.opportunity_id, resume_version_id: value.resume_version_id, analysis_type: value.analysis_type, summary }).select("id").single();
  if (runError || !run) failed(runError);
  for (const assessment of assessments) {
    const { data: item, error: itemError } = await supabase.from("gap_analysis_items").insert({ user_id: userId, run_id: run.id, requirement_id: assessment.requirement.id, assessment: assessment.result.assessment, gap_type: value.analysis_type === "capital" ? "capital" : "resume_expression", explanation: assessment.result.explanation }).select("id").single();
    if (itemError || !item) { await supabase.from("gap_analysis_runs").delete().eq("id", run.id); failed(itemError); }
    if (assessment.result.evidence.length) {
      const { error: evidenceError } = await supabase.from("gap_analysis_evidence").insert(assessment.result.evidence.map((source) => ({ user_id: userId, gap_item_id: item.id, entity_type: source.entityType, entity_id: source.entityId })));
      if (evidenceError) { await supabase.from("gap_analysis_runs").delete().eq("id", run.id); failed(evidenceError); }
    }
  }
  await audit(supabase, userId, "analyze", "gap_analysis", run.id, { opportunity_id: value.opportunity_id, analysis_type: value.analysis_type }); revalidatePath("/career/opportunities"); revalidatePath("/career/capital");
}

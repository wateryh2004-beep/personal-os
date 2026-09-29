"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/require-owner";
import {
  interviewAnswerSchema,
  interviewAttemptSchema,
  interviewContextSchema,
  interviewEvidenceSchema,
  interviewNoteSchema,
  interviewPreparationSchema,
  interviewQuestionSchema,
  interviewSessionAttemptSchema,
  interviewSessionReviewSchema,
  interviewSessionSchema,
  formObject,
} from "./schemas";
import { type EvidenceType } from "./constants";

function failed(error: unknown): never {
  void error;
  throw new Error("操作未能完成，请检查输入、状态或权限后重试。");
}

function parse<T>(schema: { safeParse: (data: unknown) => { success: boolean; data?: T } }, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) failed(new Error("输入不符合 Interview Lab 约束。"));
  return result.data!;
}

async function audit(
  supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"],
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  afterData: Record<string, unknown> = {},
) {
  const { error } = await supabase.from("audit_logs").insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    after_data: afterData,
    actor_type: "user",
  });
  if (error) failed(error);
}

async function own(
  supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"],
  table: string,
  id: string,
) {
  const { data, error } = await supabase.from(table).select("id").eq("id", id).maybeSingle();
  if (error || !data) failed(error ?? new Error("找不到记录。"));
}

function revalidateInterview(questionId?: string, preparationId?: string, sessionId?: string) {
  revalidatePath("/career");
  revalidatePath("/career/interview");
  revalidatePath("/career/interview/questions");
  revalidatePath("/career/interview/practice");
  revalidatePath("/career/interview/sessions");
  revalidatePath("/career/interview/insights");
  if (questionId) revalidatePath(`/career/interview/questions/${questionId}`);
  if (preparationId) revalidatePath(`/career/interview/practice/${preparationId}`);
  if (sessionId) revalidatePath(`/career/interview/sessions/${sessionId}`);
}

export async function createInterviewQuestion(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const contextId = String(formData.get("context_id") || "") || null;
  const returnToWorkspace = String(formData.get("return_to_workspace") || "") === "1";
  const value = parse(interviewQuestionSchema, formObject(formData));
  if (value.parent_question_id) await own(supabase, "interview_questions", value.parent_question_id);
  let targetLanguage = "zh";
  if (contextId) {
    const { data: contextRow, error: contextError } = await supabase.from("interview_contexts").select("id,default_language").eq("id", contextId).maybeSingle();
    if (contextError || !contextRow) failed(contextError ?? new Error("找不到目标岗位。"));
    targetLanguage = contextRow.default_language || "zh";
  }
  const { data, error } = await supabase.from("interview_questions").insert({
    ...value,
    user_id: userId,
  }).select("id").single();
  if (error || !data) failed(error);
  const { error: prepError } = await supabase.from("interview_question_preparations").insert({
    user_id: userId,
    question_id: data.id,
    context_id: contextId,
    status: "unprepared",
    importance: contextId ? "high" : "normal",
    target_language: targetLanguage,
  });
  if (prepError) failed(prepError);
  await audit(supabase, userId, "create", "interview_question", data.id, { category: value.category, source_type: value.source_type });
  revalidateInterview(data.id);
  if (contextId) revalidatePath(`/career/interview/targets/${contextId}`);
  if (returnToWorkspace) {
    redirect(contextId ? `/career/interview?context=${contextId}&question=${data.id}` : `/career/interview?question=${data.id}`);
  }
  redirect(contextId ? `/career/interview/questions/${data.id}?context=${contextId}` : `/career/interview/questions/${data.id}`);
}

export async function updateInterviewQuestion(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const questionId = String(formData.get("question_id") || "");
  await own(supabase, "interview_questions", questionId);
  const value = parse(interviewQuestionSchema, formObject(formData));
  if (value.parent_question_id) await own(supabase, "interview_questions", value.parent_question_id);
  const { error } = await supabase.from("interview_questions").update(value).eq("id", questionId);
  if (error) failed(error);
  await audit(supabase, userId, "update", "interview_question", questionId, { category: value.category, difficulty: value.difficulty });
  revalidateInterview(questionId);
}

export async function archiveInterviewQuestion(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const questionId = String(formData.get("question_id") || "");
  await own(supabase, "interview_questions", questionId);
  const now = new Date().toISOString();
  const [{ error }, { error: prepError }] = await Promise.all([
    supabase.from("interview_questions").update({ archived_at: now }).eq("id", questionId),
    supabase.from("interview_question_preparations").update({ archived_at: now, status: "paused" }).eq("question_id", questionId),
  ]);
  if (error || prepError) failed(error ?? prepError);
  await audit(supabase, userId, "archive", "interview_question", questionId);
  revalidateInterview(questionId);
  redirect("/career/interview/questions");
}

export async function createInterviewContext(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const returnToWorkspace = String(formData.get("return_to_workspace") || "") === "1";
  const raw = { ...formObject(formData) } as Record<string, unknown>;
  delete raw.return_to_workspace;
  const contextType = String(raw.context_type || "target");
  const organization = String(raw.organization_snapshot || "").trim();
  const role = String(raw.role_title_snapshot || "").trim();
  if (!String(raw.title || "").trim() && contextType === "target") raw.title = [organization, role].filter(Boolean).join(" · ");
  if (!raw.context_type) raw.context_type = contextType;
  if (!raw.default_language) raw.default_language = "bilingual";
  if (!raw.priority) raw.priority = "4";
  if (!raw.status) raw.status = "active";
  if (!raw.notes_markdown) raw.notes_markdown = "";
  if (!raw.career_direction_id) raw.career_direction_id = "";
  if (!raw.opportunity_id) raw.opportunity_id = "";
  if (!raw.application_id) raw.application_id = "";
  if (!raw.next_interview_at) raw.next_interview_at = "";
  const value = parse(interviewContextSchema, raw);
  if (value.career_direction_id) await own(supabase, "career_directions", value.career_direction_id);
  if (value.opportunity_id) await own(supabase, "career_opportunities", value.opportunity_id);
  if (value.application_id) await own(supabase, "career_applications", value.application_id);
  const { data, error } = await supabase.from("interview_contexts").insert({ ...value, user_id: userId }).select("id").single();
  if (error || !data) failed(error);
  await audit(supabase, userId, "create", "interview_context", data.id, { context_type: value.context_type, title: value.title });
  revalidateInterview();
  if (returnToWorkspace) redirect(`/career/interview?context=${data.id}`);
  redirect(value.context_type === "general" ? "/career/interview" : `/career/interview/targets/${data.id}`);
}

export async function updateInterviewContext(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const contextId = String(formData.get("context_id") || "");
  await own(supabase, "interview_contexts", contextId);
  const value = parse(interviewContextSchema, formObject(formData));
  if (value.career_direction_id) await own(supabase, "career_directions", value.career_direction_id);
  if (value.opportunity_id) await own(supabase, "career_opportunities", value.opportunity_id);
  if (value.application_id) await own(supabase, "career_applications", value.application_id);
  const { error } = await supabase.from("interview_contexts").update(value).eq("id", contextId);
  if (error) failed(error);
  await audit(supabase, userId, "update", "interview_context", contextId, {
    status: value.status,
    priority: value.priority,
    next_interview_at: value.next_interview_at,
  });
  revalidateInterview();
  revalidatePath(`/career/interview/targets/${contextId}`);
}

export async function archiveInterviewContext(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const contextId = String(formData.get("context_id") || "");
  await own(supabase, "interview_contexts", contextId);
  const now = new Date().toISOString();
  const [{ error }, { error: prepError }] = await Promise.all([
    supabase.from("interview_contexts").update({ archived_at: now, status: "closed" }).eq("id", contextId),
    supabase.from("interview_question_preparations").update({ archived_at: now, status: "paused" }).eq("context_id", contextId),
  ]);
  if (error || prepError) failed(error ?? prepError);
  await audit(supabase, userId, "archive", "interview_context", contextId);
  revalidateInterview();
}

export async function ensureInterviewPreparation(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const questionId = String(formData.get("question_id") || "");
  const contextId = String(formData.get("context_id") || "") || null;
  await own(supabase, "interview_questions", questionId);
  let targetLanguage = "zh";
  if (contextId) {
    const { data: contextRow, error: contextError } = await supabase.from("interview_contexts").select("id,default_language").eq("id", contextId).maybeSingle();
    if (contextError || !contextRow) failed(contextError ?? new Error("找不到目标岗位。"));
    targetLanguage = contextRow.default_language || "zh";
  }
  let existingQuery = supabase.from("interview_question_preparations").select("id").eq("question_id", questionId).is("archived_at", null);
  existingQuery = contextId ? existingQuery.eq("context_id", contextId) : existingQuery.is("context_id", null);
  const { data: existing, error: lookupError } = await existingQuery.maybeSingle();
  if (lookupError) failed(lookupError);
  let preparationId = existing?.id;
  if (!preparationId) {
    const { data, error } = await supabase.from("interview_question_preparations").insert({
      user_id: userId,
      question_id: questionId,
      context_id: contextId,
      status: "unprepared",
      importance: contextId ? "high" : "normal",
      target_language: targetLanguage,
    }).select("id").single();
    if (error || !data) failed(error);
    preparationId = data.id;
    await audit(supabase, userId, "create", "interview_preparation", preparationId, { question_id: questionId, context_id: contextId });
  }
  revalidateInterview(questionId, preparationId);
  redirect(contextId ? `/career/interview/questions/${questionId}?context=${contextId}` : `/career/interview/questions/${questionId}`);
}

export async function saveInterviewWorkspace(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const preparationId = String(formData.get("preparation_id") || "");
  const questionId = String(formData.get("question_id") || "");
  const thoughts = String(formData.get("thoughts") || "");
  const answer = String(formData.get("answer") || "");

  await own(supabase, "interview_question_preparations", preparationId);
  const { data: prep, error: prepError } = await supabase
    .from("interview_question_preparations")
    .select("id,question_id,target_language")
    .eq("id", preparationId)
    .maybeSingle();
  if (prepError || !prep || prep.question_id !== questionId) failed(prepError ?? new Error("题目准备不存在。"));

  const { error: thoughtError } = await supabase
    .from("interview_question_preparations")
    .update({ working_thoughts_markdown: thoughts })
    .eq("id", preparationId);
  if (thoughtError) failed(thoughtError);

  const language = prep.target_language || "zh";
  const { data: current, error: currentError } = await supabase
    .from("interview_answer_versions")
    .select("id,version_number")
    .eq("preparation_id", preparationId)
    .eq("answer_mode", "spoken")
    .eq("language", language)
    .eq("status", "current")
    .is("target_seconds", null)
    .is("archived_at", null)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (currentError) failed(currentError);

  if (current) {
    const { error: updateError } = await supabase
      .from("interview_answer_versions")
      .update({
        body_markdown: answer,
        change_note: null,
        source: "human",
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", current.id);
    if (updateError) failed(updateError);
  } else if (answer.trim()) {
    const { data: latest, error: latestError } = await supabase
      .from("interview_answer_versions")
      .select("version_number")
      .eq("preparation_id", preparationId)
      .eq("answer_mode", "spoken")
      .eq("language", language)
      .is("target_seconds", null)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) failed(latestError);
    const { error: insertError } = await supabase.from("interview_answer_versions").insert({
      user_id: userId,
      preparation_id: preparationId,
      answer_mode: "spoken",
      target_seconds: null,
      language,
      body_markdown: answer,
      change_note: null,
      version_number: (latest?.version_number ?? 0) + 1,
      source: "human",
      status: "current",
      confirmed_at: new Date().toISOString(),
    });
    if (insertError) failed(insertError);
  }

  await audit(supabase, userId, "save", "interview_workspace", preparationId, {
    question_id: questionId,
    has_answer: Boolean(answer.trim()),
  });
  revalidatePath(`/career/interview/questions/${questionId}`);
  revalidatePath(`/career/interview/practice/${preparationId}`);
}

export async function updateInterviewPreparation(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const preparationId = String(formData.get("preparation_id") || "");
  const questionId = String(formData.get("question_id") || "");
  await own(supabase, "interview_question_preparations", preparationId);
  const value = parse(interviewPreparationSchema, formObject(formData));

  if (value.status === "ready") {
    const [answers, attempts] = await Promise.all([
      supabase.from("interview_answer_versions").select("id", { count: "exact", head: true }).eq("preparation_id", preparationId).eq("status", "current").is("archived_at", null),
      supabase.from("interview_practice_attempts").select("id", { count: "exact", head: true }).eq("preparation_id", preparationId).is("archived_at", null),
    ]);
    if (!value.key_message.trim() || !value.answer_logic_markdown.trim() || !answers.count || !attempts.count) {
      throw new Error("Ready 需要 Key Message、Answer Logic、至少一个 Current Answer 和至少一次 Practice。");
    }
  }

  const { error } = await supabase.from("interview_question_preparations").update({
    ...value,
    ready_at: value.status === "ready" ? new Date().toISOString() : null,
  }).eq("id", preparationId);
  if (error) failed(error);
  await audit(supabase, userId, "update", "interview_preparation", preparationId, { status: value.status, importance: value.importance, confidence: value.confidence });
  revalidateInterview(questionId, preparationId);
}

export async function addInterviewNote(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const value = parse(interviewNoteSchema, formObject(formData));
  await own(supabase, "interview_question_preparations", value.preparation_id);
  const { data, error } = await supabase.from("interview_question_notes").insert({
    ...value,
    user_id: userId,
    source: "human",
  }).select("id").single();
  if (error || !data) failed(error);
  await audit(supabase, userId, "create", "interview_note", data.id, { preparation_id: value.preparation_id, note_type: value.note_type });
  revalidateInterview(undefined, value.preparation_id);
}

export async function archiveInterviewNote(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const noteId = String(formData.get("note_id") || "");
  const preparationId = String(formData.get("preparation_id") || "");
  await own(supabase, "interview_question_notes", noteId);
  const { error } = await supabase.from("interview_question_notes").update({ archived_at: new Date().toISOString() }).eq("id", noteId);
  if (error) failed(error);
  await audit(supabase, userId, "archive", "interview_note", noteId);
  revalidateInterview(undefined, preparationId);
}

export async function createInterviewAnswerVersion(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const makeCurrent = String(formData.get("make_current") || "") === "1";
  const value = parse(interviewAnswerSchema, formObject(formData));
  await own(supabase, "interview_question_preparations", value.preparation_id);
  let query = supabase.from("interview_answer_versions").select("version_number")
    .eq("preparation_id", value.preparation_id)
    .eq("answer_mode", value.answer_mode)
    .eq("language", value.language)
    .order("version_number", { ascending: false }).limit(1);
  query = value.target_seconds == null ? query.is("target_seconds", null) : query.eq("target_seconds", value.target_seconds);
  const { data: latest, error: lookupError } = await query.maybeSingle();
  if (lookupError) failed(lookupError);
  const { data, error } = await supabase.from("interview_answer_versions").insert({
    ...value,
    user_id: userId,
    version_number: (latest?.version_number ?? 0) + 1,
    source: "human",
    status: "draft",
  }).select("id").single();
  if (error || !data) failed(error);
  if (makeCurrent) {
    let currentQuery = supabase.from("interview_answer_versions").select("id")
      .eq("preparation_id", value.preparation_id)
      .eq("answer_mode", value.answer_mode)
      .eq("language", value.language)
      .eq("status", "current")
      .is("archived_at", null)
      .neq("id", data.id);
    currentQuery = value.target_seconds == null ? currentQuery.is("target_seconds", null) : currentQuery.eq("target_seconds", value.target_seconds);
    const { data: oldCurrents, error: currentError } = await currentQuery;
    if (currentError) failed(currentError);
    const oldIds = (oldCurrents ?? []).map((row) => row.id);
    if (oldIds.length) {
      const { error: retireError } = await supabase.from("interview_answer_versions").update({ status: "retired" }).in("id", oldIds);
      if (retireError) failed(retireError);
    }
    const { error: promoteError } = await supabase.from("interview_answer_versions").update({ status: "current", confirmed_at: new Date().toISOString() }).eq("id", data.id);
    if (promoteError) {
      if (oldIds.length) await supabase.from("interview_answer_versions").update({ status: "current" }).in("id", oldIds);
      failed(promoteError);
    }
  }
  await audit(supabase, userId, "create", "interview_answer_version", data.id, { preparation_id: value.preparation_id, answer_mode: value.answer_mode, language: value.language, target_seconds: value.target_seconds, make_current: makeCurrent });
  revalidateInterview(undefined, value.preparation_id);
}

export async function promoteInterviewAnswerVersion(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const answerId = String(formData.get("answer_id") || "");
  await own(supabase, "interview_answer_versions", answerId);
  const { data: answer, error } = await supabase.from("interview_answer_versions")
    .select("id,preparation_id,answer_mode,language,target_seconds,source")
    .eq("id", answerId).maybeSingle();
  if (error || !answer) failed(error);
  let currentQuery = supabase.from("interview_answer_versions").select("id")
    .eq("preparation_id", answer.preparation_id)
    .eq("answer_mode", answer.answer_mode)
    .eq("language", answer.language)
    .eq("status", "current")
    .is("archived_at", null)
    .neq("id", answerId);
  currentQuery = answer.target_seconds == null ? currentQuery.is("target_seconds", null) : currentQuery.eq("target_seconds", answer.target_seconds);
  const { data: oldCurrents, error: currentError } = await currentQuery;
  if (currentError) failed(currentError);
  const oldIds = (oldCurrents ?? []).map((row) => row.id);
  if (oldIds.length) {
    const { error: retireError } = await supabase.from("interview_answer_versions").update({ status: "retired" }).in("id", oldIds);
    if (retireError) failed(retireError);
  }
  const { error: promoteError } = await supabase.from("interview_answer_versions").update({
    status: "current",
    confirmed_at: answer.source === "ai_draft" || answer.source === "ai_edited" ? new Date().toISOString() : undefined,
  }).eq("id", answerId);
  if (promoteError) {
    if (oldIds.length) await supabase.from("interview_answer_versions").update({ status: "current" }).in("id", oldIds);
    failed(promoteError);
  }
  await audit(supabase, userId, "promote", "interview_answer_version", answerId, { preparation_id: answer.preparation_id });
  revalidateInterview(undefined, answer.preparation_id);
}

export async function archiveInterviewAnswerVersion(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const answerId = String(formData.get("answer_id") || "");
  const preparationId = String(formData.get("preparation_id") || "");
  await own(supabase, "interview_answer_versions", answerId);
  const { error } = await supabase.from("interview_answer_versions").update({ archived_at: new Date().toISOString(), status: "retired" }).eq("id", answerId);
  if (error) failed(error);
  await audit(supabase, userId, "archive", "interview_answer_version", answerId);
  revalidateInterview(undefined, preparationId);
}

const evidenceTables: Record<EvidenceType, string> = {
  experience: "experiences",
  experience_fact: "experience_facts",
  experience_output: "experience_outputs",
  experience_bullet: "experience_bullets",
  skill: "skills",
  certification: "certifications",
  document: "documents",
  resume_version: "resume_versions",
};

export async function linkInterviewEvidence(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const targetRef = String(formData.get("target_ref") || "");
  const separator = targetRef.indexOf(":");
  const targetType = separator > 0 ? targetRef.slice(0, separator) : String(formData.get("target_type") || "");
  const targetId = separator > 0 ? targetRef.slice(separator + 1) : String(formData.get("target_id") || "");
  const value = parse(interviewEvidenceSchema, { ...formObject(formData), target_type: targetType, target_id: targetId });
  await own(supabase, "interview_question_preparations", value.preparation_id);
  await own(supabase, evidenceTables[value.target_type], value.target_id);
  const { error } = await supabase.from("entity_links").upsert({
    user_id: userId,
    source_type: "interview_preparation",
    source_id: value.preparation_id,
    target_type: value.target_type,
    target_id: value.target_id,
    relationship_type: value.relationship_type,
    created_via: "manual",
    metadata: {},
    archived_at: null,
  }, { onConflict: "user_id,source_type,source_id,target_type,target_id,relationship_type" });
  if (error) failed(error);
  await audit(supabase, userId, "link", "interview_preparation", value.preparation_id, { target_type: value.target_type, target_id: value.target_id, relationship_type: value.relationship_type });
  revalidateInterview(undefined, value.preparation_id);
}

export async function unlinkInterviewEvidence(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const linkId = String(formData.get("link_id") || "");
  const preparationId = String(formData.get("preparation_id") || "");
  await own(supabase, "entity_links", linkId);
  const { error } = await supabase.from("entity_links").update({ archived_at: new Date().toISOString() }).eq("id", linkId);
  if (error) failed(error);
  await audit(supabase, userId, "unlink", "interview_preparation", preparationId, { link_id: linkId });
  revalidateInterview(undefined, preparationId);
}

export async function createPracticeAttempt(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const value = parse(interviewAttemptSchema, formObject(formData));
  await own(supabase, "interview_question_preparations", value.preparation_id);
  if (value.answer_version_id) await own(supabase, "interview_answer_versions", value.answer_version_id);
  const { data: prep, error: prepError } = await supabase.from("interview_question_preparations")
    .select("id,question_id,status,prompt_override,interview_questions(canonical_prompt)")
    .eq("id", value.preparation_id).maybeSingle();
  if (prepError || !prep) failed(prepError);
  const question = Array.isArray(prep.interview_questions) ? prep.interview_questions[0] : prep.interview_questions;
  const prompt = value.prompt_snapshot || prep.prompt_override || question?.canonical_prompt;
  if (!prompt) failed(new Error("没有可记录的题目。"));
  const { data, error } = await supabase.from("interview_practice_attempts").insert({
    user_id: userId,
    preparation_id: value.preparation_id,
    answer_version_id: value.answer_version_id,
    session_id: null,
    parent_attempt_id: null,
    sequence_no: null,
    attempt_kind: "solo",
    input_mode: value.input_mode,
    language: value.language,
    prompt_snapshot: prompt,
    response_transcript_markdown: value.response_transcript_markdown,
    duration_seconds: value.duration_seconds,
    self_review_markdown: value.self_review_markdown,
    feedback_markdown: "",
    feedback_source: "self",
    strength_tags: value.strength_tags,
    issue_tags: value.issue_tags,
    next_focus: value.next_focus,
    confidence_before: value.confidence_before,
    confidence_after: value.confidence_after,
    metrics: {},
  }).select("id").single();
  if (error || !data) failed(error);
  const nextPractice = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const prepUpdate: Record<string, unknown> = { next_practice_at: nextPractice };
  if (value.next_focus) prepUpdate.next_focus = value.next_focus;
  if (prep.status === "unprepared" || prep.status === "developing") prepUpdate.status = "practicing";
  await supabase.from("interview_question_preparations").update(prepUpdate).eq("id", value.preparation_id);
  await audit(supabase, userId, "practice", "interview_attempt", data.id, { preparation_id: value.preparation_id });
  revalidateInterview(prep.question_id, value.preparation_id);
  redirect(`/career/interview/practice/${value.preparation_id}`);
}

export async function createInterviewSession(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const value = parse(interviewSessionSchema, formObject(formData));
  if (value.context_id) await own(supabase, "interview_contexts", value.context_id);
  const { data, error } = await supabase.from("interview_sessions").insert({
    ...value,
    user_id: userId,
    status: "planned",
  }).select("id").single();
  if (error || !data) failed(error);
  await audit(supabase, userId, "create", "interview_session", data.id, { session_kind: value.session_kind, session_format: value.session_format, context_id: value.context_id });
  revalidateInterview(undefined, undefined, data.id);
  redirect(`/career/interview/sessions/${data.id}`);
}

export async function startInterviewSession(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const sessionId = String(formData.get("session_id") || "");
  await own(supabase, "interview_sessions", sessionId);
  const { error } = await supabase.from("interview_sessions").update({ status: "in_progress", started_at: new Date().toISOString() }).eq("id", sessionId);
  if (error) failed(error);
  await audit(supabase, userId, "start", "interview_session", sessionId);
  revalidateInterview(undefined, undefined, sessionId);
}

export async function addSessionAttempt(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const value = parse(interviewSessionAttemptSchema, formObject(formData));
  await own(supabase, "interview_sessions", value.session_id);
  if (value.preparation_id) await own(supabase, "interview_question_preparations", value.preparation_id);
  if (value.parent_attempt_id) await own(supabase, "interview_practice_attempts", value.parent_attempt_id);
  const [{ data: session, error: sessionError }, { data: sequenceRows, error: seqError }] = await Promise.all([
    supabase.from("interview_sessions").select("session_kind,status,started_at").eq("id", value.session_id).maybeSingle(),
    supabase.from("interview_practice_attempts").select("sequence_no").eq("session_id", value.session_id).is("archived_at", null).order("sequence_no", { ascending: false }).limit(1),
  ]);
  if (sessionError || !session || seqError) failed(sessionError ?? seqError);
  if (session.status === "planned") {
    const { error: startError } = await supabase.from("interview_sessions").update({ status: "in_progress", started_at: new Date().toISOString() }).eq("id", value.session_id);
    if (startError) failed(startError);
  }
  const sequenceNo = ((sequenceRows ?? [])[0]?.sequence_no ?? 0) + 1;
  const { data, error } = await supabase.from("interview_practice_attempts").insert({
    user_id: userId,
    preparation_id: value.preparation_id,
    session_id: value.session_id,
    answer_version_id: null,
    parent_attempt_id: value.parent_attempt_id,
    sequence_no: sequenceNo,
    attempt_kind: session.session_kind,
    input_mode: value.input_mode,
    language: value.language,
    prompt_snapshot: value.prompt_snapshot,
    response_transcript_markdown: value.response_transcript_markdown,
    duration_seconds: value.duration_seconds,
    self_review_markdown: value.self_review_markdown,
    feedback_markdown: "",
    feedback_source: "self",
    strength_tags: value.strength_tags,
    issue_tags: value.issue_tags,
    next_focus: value.next_focus,
    confidence_before: value.confidence_before,
    confidence_after: value.confidence_after,
    metrics: {},
  }).select("id").single();
  if (error || !data) failed(error);
  await audit(supabase, userId, "practice", "interview_attempt", data.id, { session_id: value.session_id, preparation_id: value.preparation_id, sequence_no: sequenceNo });
  revalidateInterview(undefined, value.preparation_id ?? undefined, value.session_id);
}

export async function completeInterviewSession(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const value = parse(interviewSessionReviewSchema, formObject(formData));
  await own(supabase, "interview_sessions", value.session_id);
  const { data: session, error: sessionError } = await supabase.from("interview_sessions").select("started_at").eq("id", value.session_id).maybeSingle();
  if (sessionError || !session) failed(sessionError);
  const now = new Date().toISOString();
  const { error } = await supabase.from("interview_sessions").update({
    status: "completed",
    started_at: session.started_at || now,
    ended_at: now,
    overall_review_markdown: value.overall_review_markdown,
    strength_tags: value.strength_tags,
    issue_tags: value.issue_tags,
    next_focus: value.next_focus,
  }).eq("id", value.session_id);
  if (error) failed(error);
  await audit(supabase, userId, "complete", "interview_session", value.session_id, { issue_tags: value.issue_tags, strength_tags: value.strength_tags });
  revalidateInterview(undefined, undefined, value.session_id);
}

export async function archiveInterviewSession(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const sessionId = String(formData.get("session_id") || "");
  await own(supabase, "interview_sessions", sessionId);
  const { error } = await supabase.from("interview_sessions").update({ archived_at: new Date().toISOString(), status: "cancelled" }).eq("id", sessionId);
  if (error) failed(error);
  await audit(supabase, userId, "archive", "interview_session", sessionId);
  revalidateInterview(undefined, undefined, sessionId);
  redirect("/career/interview/sessions");
}

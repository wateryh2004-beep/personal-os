import { z } from "zod";
import {
  evidenceRelationships,
  evidenceTypes,
  interviewAnswerModes,
  interviewCategories,
  interviewContextStatuses,
  interviewContextTypes,
  interviewFollowUpKinds,
  interviewImportance,
  interviewLanguages,
  interviewNoteTypes,
  interviewSessionFormats,
  interviewSourceTypes,
  interviewStatuses,
  splitTagInput,
} from "./constants";

const optionalText = (limit: number) =>
  z.string().trim().max(limit).optional().transform((value) => value || null);

const optionalUuid = z.string().trim().optional().transform((value) => value || null).pipe(z.string().uuid().nullable());

const optionalDate = z.string().trim().optional().transform((value) => value || null).pipe(z.string().date().nullable());

const optionalUrl = z.string().trim().optional().transform((value) => value || null).pipe(z.string().url().nullable());

const optionalInt = (min: number, max: number) =>
  z.preprocess((value) => value === "" || value == null ? null : value, z.coerce.number().int().min(min).max(max).nullable());

const tagField = (limit: number) =>
  z.string().max(4_000).optional().transform((value) => splitTagInput(value, limit));

function nullableIso(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toISOString();
}

export const interviewQuestionSchema = z.object({
  canonical_prompt: z.string().trim().min(1).max(10_000),
  short_title: optionalText(240),
  category: z.enum(interviewCategories),
  subcategory: optionalText(120),
  competency_tags: tagField(24),
  prompt_variants: tagField(20),
  source_type: z.enum(interviewSourceTypes),
  source_name: optionalText(200),
  source_url: optionalUrl,
  source_observed_at: optionalDate,
  source_detail: optionalText(4_000),
  parent_question_id: optionalUuid,
  follow_up_kind: z.string().trim().optional().transform((value) => value || null).pipe(z.enum(interviewFollowUpKinds).nullable()),
  difficulty: z.coerce.number().int().min(1).max(5),
}).superRefine((value, ctx) => {
  if (Boolean(value.parent_question_id) !== Boolean(value.follow_up_kind)) {
    ctx.addIssue({ code: "custom", path: ["follow_up_kind"], message: "追问必须同时指定父问题和追问类型。" });
  }
  if (value.source_type === "reported_interview" && !value.source_name) {
    ctx.addIssue({ code: "custom", path: ["source_name"], message: "公开面经必须记录来源名称。" });
  }
});

export const interviewContextSchema = z.object({
  title: z.string().trim().min(1).max(240),
  context_type: z.enum(interviewContextTypes),
  career_direction_id: optionalUuid,
  opportunity_id: optionalUuid,
  application_id: optionalUuid,
  organization_snapshot: optionalText(240),
  role_title_snapshot: optionalText(240),
  default_language: z.enum(interviewLanguages),
  priority: z.coerce.number().int().min(1).max(5),
  status: z.enum(interviewContextStatuses),
  next_interview_at: z.preprocess(nullableIso, z.string().datetime().nullable()),
  notes_markdown: z.string().max(100_000).optional().default(""),
}).superRefine((value, ctx) => {
  const refs = [value.career_direction_id, value.opportunity_id, value.application_id].filter(Boolean);
  if (value.context_type === "general" && refs.length) ctx.addIssue({ code: "custom", message: "通用场景不能绑定 Career 对象。" });
  if (value.context_type === "target" && (!value.organization_snapshot || !value.role_title_snapshot || refs.length)) {
    ctx.addIssue({ code: "custom", message: "Target 场景需要组织和岗位快照，且不绑定 Career 对象。" });
  }
  if (value.context_type === "direction" && (!value.career_direction_id || refs.length !== 1)) ctx.addIssue({ code: "custom", message: "方向场景必须且只能绑定职业方向。" });
  if (value.context_type === "opportunity" && (!value.opportunity_id || refs.length !== 1)) ctx.addIssue({ code: "custom", message: "机会场景必须且只能绑定机会。" });
  if (value.context_type === "application" && (!value.application_id || refs.length !== 1)) ctx.addIssue({ code: "custom", message: "申请场景必须且只能绑定申请。" });
});

export const interviewPreparationSchema = z.object({
  prompt_override: optionalText(10_000),
  status: z.enum(interviewStatuses),
  importance: z.enum(interviewImportance),
  target_language: z.enum(interviewLanguages),
  interviewer_intent_markdown: z.string().max(50_000).optional().default(""),
  risk_markdown: z.string().max(50_000).optional().default(""),
  working_thoughts_markdown: z.string().max(100_000).optional().default(""),
  answer_logic_markdown: z.string().max(50_000).optional().default(""),
  key_message: z.string().max(5_000).optional().default(""),
  next_focus: z.string().max(5_000).optional().default(""),
  confidence: optionalInt(1, 5),
  next_practice_at: z.preprocess(nullableIso, z.string().datetime().nullable()),
});

export const interviewNoteSchema = z.object({
  preparation_id: z.string().uuid(),
  note_type: z.enum(interviewNoteTypes),
  body_markdown: z.string().trim().min(1).max(50_000),
});

export const interviewAnswerSchema = z.object({
  preparation_id: z.string().uuid(),
  answer_mode: z.enum(interviewAnswerModes),
  target_seconds: optionalInt(10, 1800),
  language: z.enum(interviewLanguages),
  body_markdown: z.string().trim().min(1).max(50_000),
  change_note: optionalText(4_000),
});

export const interviewAttemptSchema = z.object({
  preparation_id: z.string().uuid(),
  answer_version_id: optionalUuid,
  input_mode: z.enum(["text", "voice", "transcript_import"]),
  language: z.enum(interviewLanguages),
  prompt_snapshot: optionalText(10_000),
  response_transcript_markdown: z.string().max(100_000).optional().default(""),
  duration_seconds: optionalInt(1, 7200),
  self_review_markdown: z.string().max(50_000).optional().default(""),
  issue_tags: tagField(32),
  strength_tags: tagField(32),
  next_focus: z.string().max(5_000).optional().default(""),
  confidence_before: optionalInt(1, 5),
  confidence_after: optionalInt(1, 5),
});

export const interviewSessionSchema = z.object({
  context_id: optionalUuid,
  title: z.string().trim().min(1).max(240),
  session_kind: z.enum(["mock", "real"]),
  session_format: z.enum(interviewSessionFormats),
  facilitator: z.enum(["self", "ai", "human", "mixed"]),
  round_label: optionalText(120),
  interviewer_label: optionalText(240),
  language_mode: z.enum(interviewLanguages),
  scheduled_at: z.preprocess(nullableIso, z.string().datetime().nullable()),
});

export const interviewSessionAttemptSchema = z.object({
  session_id: z.string().uuid(),
  preparation_id: optionalUuid,
  parent_attempt_id: optionalUuid,
  input_mode: z.enum(["text", "voice", "transcript_import"]),
  language: z.enum(interviewLanguages),
  prompt_snapshot: z.string().trim().min(1).max(10_000),
  response_transcript_markdown: z.string().max(100_000).optional().default(""),
  duration_seconds: optionalInt(1, 7200),
  self_review_markdown: z.string().max(50_000).optional().default(""),
  issue_tags: tagField(32),
  strength_tags: tagField(32),
  next_focus: z.string().max(5_000).optional().default(""),
  confidence_before: optionalInt(1, 5),
  confidence_after: optionalInt(1, 5),
});

export const interviewSessionReviewSchema = z.object({
  session_id: z.string().uuid(),
  overall_review_markdown: z.string().max(100_000).optional().default(""),
  strength_tags: tagField(32),
  issue_tags: tagField(32),
  next_focus: z.string().max(5_000).optional().default(""),
});

export const interviewEvidenceSchema = z.object({
  preparation_id: z.string().uuid(),
  target_type: z.enum(evidenceTypes),
  target_id: z.string().uuid(),
  relationship_type: z.enum(evidenceRelationships),
});

export function formObject(formData: FormData) {
  return Object.fromEntries(formData);
}

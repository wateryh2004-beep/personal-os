import { z } from "zod";

const optionalText = (limit: number) => z.string().trim().max(limit).optional().transform((value) => value || null);
const optionalDate = z.string().trim().optional().transform((value) => value || null).pipe(z.string().date().nullable());

export const directionStatuses = ["exploring", "active", "paused", "deprioritized", "rejected", "archived"] as const;
export const experienceTypes = ["education", "internship", "employment", "project", "campus", "research", "volunteer", "other"] as const;
export const factTypes = ["responsibility", "action", "tool", "scale", "metric", "collaboration", "process", "result", "context", "other"] as const;
export const bulletStatuses = ["draft", "approved", "rejected", "archived"] as const;

export const careerProfileSchema = z.object({
  professional_headline: optionalText(240), career_summary: optionalText(12000), current_stage: optionalText(160),
  target_graduation_date: optionalDate, target_recruitment_cycle: optionalText(100),
  preferred_locations: z.string().max(600).transform((value) => value.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 30)),
  preferred_work_types: z.string().max(600).transform((value) => value.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 30)),
  risk_preferences: optionalText(1000), constraints_markdown: optionalText(12000), goals_markdown: optionalText(12000),
});

export const careerDirectionSchema = z.object({
  name: z.string().trim().min(1).max(160), description: optionalText(4000), priority: z.coerce.number().int().min(0).max(999),
  status: z.enum(directionStatuses), hypothesis_markdown: optionalText(12000), supporting_evidence_markdown: optionalText(12000),
  opposing_evidence_markdown: optionalText(12000), current_decision: optionalText(4000), review_date: optionalDate,
});

export const careerTrackSchema = z.object({
  name: z.string().trim().min(1).max(120), description: optionalText(4_000), status: z.enum(["active", "paused", "archived"]), color: z.enum(["blue", "slate", "amber", "violet", "teal"]), start_date: optionalDate, end_date: optionalDate,
}).refine((value) => !value.start_date || !value.end_date || value.start_date <= value.end_date, { message: "结束日期不能早于开始日期。" });

export const careerMilestoneSchema = z.object({
  track_id: z.string().uuid(), career_direction_id: z.string().uuid().nullable().optional(), title: z.string().trim().min(1).max(240), description: optionalText(4_000), starts_on: optionalDate, target_date: z.string().date(), status: z.enum(["planned", "in_progress", "completed", "skipped"]), importance: z.enum(["low", "normal", "high"]),
}).refine((value) => !value.starts_on || value.starts_on <= value.target_date, { message: "开始时间不能晚于节点日期。" });

export const careerTrackOrderSchema = z.array(z.string().uuid()).min(1).max(100);

export const experienceSchema = z.object({
  experience_type: z.enum(experienceTypes), organization: z.string().trim().min(1).max(200), department: optionalText(200), role: optionalText(200), location: optionalText(200),
  start_date: optionalDate, end_date: optionalDate, is_current: z.boolean(), background_markdown: optionalText(12000), raw_description_markdown: optionalText(20000),
  confidentiality_level: z.enum(["private", "sensitive", "public_safe"]), status: z.enum(["draft", "confirmed", "archived"]),
}).superRefine((value, ctx) => {
  if (value.is_current && value.end_date) ctx.addIssue({ code: "custom", path: ["end_date"], message: "当前经历不能填写结束日期。" });
  if (value.start_date && value.end_date && value.end_date < value.start_date) ctx.addIssue({ code: "custom", path: ["end_date"], message: "结束日期不能早于开始日期。" });
});

export const factSchema = z.object({
  experience_id: z.string().uuid(), fact_type: z.enum(factTypes), content: z.string().trim().min(1).max(10000),
  metric_value: z.preprocess((value) => value === "" ? null : value, z.coerce.number().finite().nullable()), metric_unit: optionalText(80),
  occurred_at: optionalDate, verification_status: z.enum(["unverified", "self_confirmed", "document_verified", "externally_verified"]),
  source_document_id: z.string().uuid().nullable().optional(), notes_markdown: optionalText(12000),
});

export const outputSchema = z.object({
  experience_id: z.string().uuid(), name: z.string().trim().min(1).max(240), description_markdown: optionalText(12000),
  output_type: z.enum(["report", "presentation", "product", "code", "analysis", "document", "event", "process", "publication", "dataset", "other"]),
  result_markdown: optionalText(12000), public_url: z.string().trim().url().nullable().optional().or(z.literal("")),
  confidentiality_level: z.enum(["private", "sensitive", "public_safe"]), occurred_at: optionalDate,
});

export const bulletSchema = z.object({
  experience_id: z.string().uuid(), career_direction_id: z.string().uuid().nullable().optional(), content: z.string().trim().min(1).max(5000), language: z.string().trim().min(2).max(20),
  source: z.enum(["human", "ai_draft", "ai_edited"]),
});

export const skillSchema = z.object({ name: z.string().trim().min(1).max(120), category: z.enum(["technical", "analytical", "business", "communication", "language", "domain", "tool", "other"]), proficiency: z.enum(["learning", "basic", "working", "proficient", "advanced"]), evidence_markdown: optionalText(12000), last_used_at: optionalDate });
export const certificationSchema = z.object({ name: z.string().trim().min(1).max(200), issuer: optionalText(200), exam_date: optionalDate, issue_date: optionalDate, expiry_date: optionalDate, status: z.enum(["planned", "registered", "preparing", "passed", "failed", "issued", "expired", "abandoned"]), score: optionalText(100), credential_number: optionalText(300), document_id: z.string().uuid().nullable().optional(), notes_markdown: optionalText(12000) }).superRefine((value, ctx) => { if (value.issue_date && value.expiry_date && value.expiry_date < value.issue_date) ctx.addIssue({ code: "custom", path: ["expiry_date"], message: "到期日期不能早于发证日期。" }); });

export function formObject(formData: FormData) { return Object.fromEntries(formData); }
export function isCurrent(value: FormDataEntryValue | null) { return value === "on"; }
export function canApproveBullet({ hasFact, source }: { hasFact: boolean; source: string }) { return hasFact && source === "human"; }
export function redactCertificationForExport<T extends { credential_number?: string | null }>(row: T, includeSensitive = false) { if (includeSensitive) return row; const safe: Partial<T> = { ...row }; delete safe.credential_number; return safe; }

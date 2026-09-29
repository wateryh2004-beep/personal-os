export const interviewCategories = [
  "resume",
  "motivation_fit",
  "behavioral",
  "situational",
  "business_commercial",
  "knowledge",
  "stress",
  "interviewer_question",
] as const;

export const interviewStatuses = [
  "unprepared",
  "developing",
  "practicing",
  "ready",
  "needs_review",
  "paused",
] as const;

export const interviewImportance = ["low", "normal", "high", "critical"] as const;
export const interviewLanguages = ["zh", "en", "bilingual"] as const;
export const interviewAnswerModes = ["outline", "spoken", "framework", "notes"] as const;
export const interviewContextTypes = ["general", "target", "direction", "opportunity", "application"] as const;
export const interviewContextStatuses = ["active", "paused", "closed"] as const;
export const interviewSessionFormats = ["recorded_video", "one_to_one", "panel", "group_interview", "group_case", "phone", "mixed", "other"] as const;
export const interviewNoteTypes = ["thinking", "insight", "research", "reflection", "interviewer_feedback"] as const;
export const interviewSourceTypes = ["manual", "reported_interview", "preparation", "real_interview", "ai_suggested", "imported"] as const;
export const interviewFollowUpKinds = ["clarify", "deep_dive", "challenge", "counterfactual", "pressure", "other"] as const;

export const competencyRegistry = [
  "adaptability",
  "career_judgment",
  "commercial_awareness",
  "commercial_judgment",
  "communication",
  "curiosity",
  "customer_insight",
  "execution",
  "humility",
  "influence_without_authority",
  "judgment",
  "leadership",
  "learning_agility",
  "motivation",
  "ownership",
  "prioritization",
  "problem_solving",
  "resilience",
  "self_awareness",
  "stakeholder_management",
  "structured_thinking",
] as const;

export const issueRegistry = [
  "answer_not_direct",
  "background_too_long",
  "defensive",
  "generic_company_fit",
  "late_conclusion",
  "late_result",
  "no_prioritization",
  "story_overuse",
  "too_broad",
  "weak_evidence",
  "weak_influence_mechanism",
  "weak_reflection",
  "weak_result",
] as const;

export const categoryLabels: Record<string, string> = {
  resume: "简历面",
  motivation_fit: "动机 / Fit",
  behavioral: "行为面",
  situational: "情景 / 能力",
  business_commercial: "商业 / Case",
  knowledge: "专业 / Knowledge",
  stress: "压力面",
  interviewer_question: "反问",
};

export const statusLabels: Record<string, string> = {
  unprepared: "未准备",
  developing: "整理中",
  practicing: "练习中",
  ready: "已准备",
  needs_review: "需复盘",
  paused: "暂停",
};

export const importanceLabels: Record<string, string> = {
  low: "低",
  normal: "普通",
  high: "高",
  critical: "关键",
};

export const languageLabels: Record<string, string> = {
  zh: "中文",
  en: "英文",
  bilingual: "双语",
};

export const answerModeLabels: Record<string, string> = {
  outline: "提纲",
  spoken: "口语",
  framework: "框架",
  notes: "备注",
};

export const noteTypeLabels: Record<string, string> = {
  thinking: "思考",
  insight: "洞察",
  research: "研究",
  reflection: "复盘",
  interviewer_feedback: "面试官反馈",
};

export const sessionFormatLabels: Record<string, string> = {
  recorded_video: "录制视频",
  one_to_one: "1v1",
  panel: "多人面试",
  group_interview: "群面",
  group_case: "群组案例",
  phone: "电话",
  mixed: "混合",
  other: "其他",
};

export const evidenceTypes = [
  "experience",
  "experience_fact",
  "experience_output",
  "experience_bullet",
  "skill",
  "certification",
  "document",
  "resume_version",
] as const;

export type EvidenceType = typeof evidenceTypes[number];

export const evidenceTypeLabels: Record<EvidenceType, string> = {
  experience: "经历",
  experience_fact: "事实",
  experience_output: "成果",
  experience_bullet: "简历表达",
  skill: "技能",
  certification: "证书",
  document: "文件",
  resume_version: "简历版本",
};

export const evidenceRelationships = [
  "primary_evidence",
  "supporting_evidence",
  "counter_evidence",
  "tests_skill",
  "source_material",
  "resume_context",
] as const;

export const evidenceRelationshipLabels: Record<string, string> = {
  primary_evidence: "核心证据",
  supporting_evidence: "辅助证据",
  counter_evidence: "边界 / 反证",
  tests_skill: "能力对应",
  source_material: "来源材料",
  resume_context: "简历语境",
};

export function splitTagInput(value: string | null | undefined, limit = 24) {
  if (!value) return [];
  return [...new Set(value.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

export function joinTagInput(value: string[] | null | undefined) {
  return (value ?? []).join(", ");
}

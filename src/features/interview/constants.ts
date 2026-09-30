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

export const interviewQuestionTypeKeys = [
  "resume",
  "behavioral",
  "motivation_fit",
  "knowledge",
  "business_case",
  "situational",
  "candidate_question",
] as const;

export const interviewQuestionStyles = ["standard", "stress"] as const;

export const questionTypeLabels: Record<string, string> = {
  resume: "简历",
  behavioral: "行为",
  motivation_fit: "动机 / Fit",
  knowledge: "专业 / Knowledge",
  business_case: "商业 / Case",
  situational: "情景",
  candidate_question: "反问",
};

export const questionStyleLabels: Record<string, string> = {
  standard: "标准",
  stress: "压力",
};

export const legacyCategoryByQuestionType: Record<string, string> = {
  resume: "resume",
  behavioral: "behavioral",
  motivation_fit: "motivation_fit",
  knowledge: "knowledge",
  business_case: "business_commercial",
  situational: "situational",
  candidate_question: "interviewer_question",
};

export const questionTypeByLegacyCategory: Record<string, string> = {
  resume: "resume",
  behavioral: "behavioral",
  motivation_fit: "motivation_fit",
  knowledge: "knowledge",
  business_commercial: "business_case",
  situational: "situational",
  interviewer_question: "candidate_question",
};

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
  business_case: "商业 / Case",
  knowledge: "专业 / Knowledge",
  stress: "压力面",
  interviewer_question: "反问",
  candidate_question: "反问",
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


export const competencyLabels: Record<string, string> = {
  adaptability: "适应力",
  career_judgment: "职业判断",
  commercial_awareness: "商业敏感度",
  commercial_judgment: "商业判断",
  communication: "沟通表达",
  curiosity: "好奇心",
  customer_insight: "客户洞察",
  execution: "执行力",
  humility: "谦逊与开放",
  influence_without_authority: "无职权影响力",
  judgment: "判断力",
  leadership: "领导力",
  learning_agility: "学习敏捷度",
  motivation: "求职动机",
  ownership: "主人翁意识",
  prioritization: "优先级管理",
  problem_solving: "问题解决",
  resilience: "韧性",
  self_awareness: "自我认知",
  stakeholder_management: "利益相关方管理",
  structured_thinking: "结构化思考",
};

export const issueLabels: Record<string, string> = {
  answer_not_direct: "回答不够直接",
  background_too_long: "背景铺垫过长",
  defensive: "防御性过强",
  generic_company_fit: "公司匹配度表达空泛",
  late_conclusion: "结论出现太晚",
  late_result: "结果出现太晚",
  no_prioritization: "缺少优先级",
  story_overuse: "经历重复使用",
  too_broad: "回答范围过宽",
  weak_evidence: "证据不足",
  weak_influence_mechanism: "影响机制不清",
  weak_reflection: "反思不足",
  weak_result: "结果不够有力",
};

export const sourceTypeLabels: Record<string, string> = {
  manual: "手动录入",
  reported_interview: "面经",
  preparation: "准备过程中形成",
  real_interview: "真实面试",
  ai_suggested: "AI 建议",
  imported: "导入",
};

export const followUpKindLabels: Record<string, string> = {
  clarify: "澄清",
  deep_dive: "深入追问",
  challenge: "挑战",
  counterfactual: "反事实",
  pressure: "压力追问",
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

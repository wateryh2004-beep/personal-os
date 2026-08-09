import type { CognitiveRecipeDefinition } from "./types";

export const careerStrategyRecipe: CognitiveRecipeDefinition = {
  recipe: "career_strategy",
  objective: "结合 Career 结构化数据、当前决定与真实经历证据分析职业方向。",
  complexity: "analytical",
  defaultTimeWindowDays: 60,
  expandedTimeWindowDays: 180,
  minimumRecentNotes: 3,
  retrievalOrder: ["working_memory", "graph", "recent_notes", "reviews", "semantic_search", "lexical_search"],
  requiredSources: ["Career 结构化数据", "当前 Decision/Working Memory", "相关 Notes/Reviews"],
  synthesisRules: ["区分目标、已有证据、差距和假设。", "当前确认方向优先于过期探索记录。", "不编造经历、技能或岗位事实。"],
  uncertaintyRules: ["外部市场判断若没有来源，应标为一般推论而非个人事实。"],
  answerContract: ["当前定位", "证据与差距", "战略选项", "近期验证动作", "附来源"],
  toolGroups: ["career_read", "notes_read", "memory_read", "search"],
};

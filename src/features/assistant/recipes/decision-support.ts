import type { CognitiveRecipeDefinition } from "./types";

export const decisionSupportRecipe: CognitiveRecipeDefinition = {
  recipe: "decision_support",
  objective: "结合当前目标、约束、既有决定与历史证据，帮助用户评估明确取舍。",
  complexity: "analytical",
  defaultTimeWindowDays: 45,
  expandedTimeWindowDays: 120,
  minimumRecentNotes: 3,
  retrievalOrder: ["working_memory", "recent_notes", "reviews", "time_context", "semantic_search", "graph"],
  requiredSources: ["当前目标与约束", "有效 Decision", "支持或反对各选项的个人证据"],
  synthesisRules: ["先复述决策问题与约束。", "比较选项而不是替用户决定。", "标出可逆性、机会成本与需要验证的假设。"],
  uncertaintyRules: ["缺少关键约束时给条件式建议。", "一般常识不能冒充用户偏好。"],
  answerContract: ["决策框架", "选项比较", "证据与风险", "建议的最小验证动作", "附来源"],
  toolGroups: ["notes_read", "memory_read", "career_read", "calendar_read", "todo_read", "search"],
};

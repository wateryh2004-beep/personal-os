import type { CognitiveRecipeDefinition } from "./types";

export const beliefChangeRecipe: CognitiveRecipeDefinition = {
  recipe: "belief_change",
  objective: "比较历史证据与当前状态，识别用户观点、假设或方向的真实变化。",
  complexity: "analytical",
  defaultTimeWindowDays: 45,
  expandedTimeWindowDays: 120,
  minimumRecentNotes: 4,
  retrievalOrder: ["working_memory", "recent_notes", "reviews", "semantic_search", "lexical_search", "graph"],
  requiredSources: ["历史记录", "当前 Decision/Working Memory", "相关复盘"],
  synthesisRules: ["分别呈现‘当时’与‘现在’的证据。", "把变化触发因素与推测分开。", "当前确认决定优先描述当前立场，但不得抹去历史。"],
  uncertaintyRules: ["只有单侧证据时不能断言观点已改变。", "推测原因必须显式标为推论。"],
  answerContract: ["给出是否发生变化的判断", "列出历史立场与当前立场", "列出可能触发因素及证据", "附来源"],
  toolGroups: ["notes_read", "memory_read", "career_read", "search"],
};

import type { CognitiveRecipeDefinition } from "./types";

export const trajectoryAnalysisRecipe: CognitiveRecipeDefinition = {
  recipe: "trajectory_analysis",
  objective: "从一段时间的记录中判断方向、投入和关注点如何演进。",
  complexity: "analytical",
  defaultTimeWindowDays: 60,
  expandedTimeWindowDays: 180,
  minimumRecentNotes: 5,
  retrievalOrder: ["recent_notes", "reviews", "working_memory", "time_context", "semantic_search", "graph"],
  requiredSources: ["不同时点的记录", "当前状态", "可验证的推进或停止证据"],
  synthesisRules: ["按时间顺序组织变化。", "区分表达频率与实际投入。", "不把一次记录外推为长期趋势。"],
  uncertaintyRules: ["时间点不足时只描述观察，不下趋势结论。"],
  answerContract: ["轨迹摘要", "关键转折点", "正在增强/减弱的方向", "证据缺口", "附来源"],
  toolGroups: ["notes_read", "memory_read", "career_read", "todo_read", "calendar_read", "search"],
};

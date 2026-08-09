import type { CognitiveRecipeDefinition } from "./types";

export const nextBestActionRecipe: CognitiveRecipeDefinition = {
  recipe: "next_best_action",
  objective: "依据当前目标、约束、开放事项和可用时间，提出最小且可执行的下一步。",
  complexity: "moderate",
  defaultTimeWindowDays: 21,
  expandedTimeWindowDays: 45,
  minimumRecentNotes: 3,
  retrievalOrder: ["working_memory", "time_context", "recent_notes", "reviews", "semantic_search"],
  requiredSources: ["当前目标或决定", "现实约束", "未完成事项或近期证据"],
  synthesisRules: ["优先给一个下一步，再给备选。", "动作必须足够小、可验证并符合现有约束。", "不未经确认创建任务或日程。"],
  uncertaintyRules: ["目标不明确时提出澄清问题或给条件式选项。"],
  answerContract: ["推荐下一步", "为什么是现在", "完成标准", "可选后续", "附来源"],
  toolGroups: ["notes_read", "memory_read", "todo_read", "calendar_read", "search"],
};

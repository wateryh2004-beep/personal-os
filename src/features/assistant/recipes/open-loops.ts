import type { CognitiveRecipeDefinition } from "./types";

export const openLoopsRecipe: CognitiveRecipeDefinition = {
  recipe: "open_loops",
  objective: "找出笔记、任务、日程和复盘中尚未解决的承诺、问题与等待项。",
  complexity: "moderate",
  defaultTimeWindowDays: 30,
  expandedTimeWindowDays: 60,
  minimumRecentNotes: 4,
  retrievalOrder: ["recent_notes", "time_context", "reviews", "working_memory", "semantic_search"],
  requiredSources: ["近期 Notes", "未完成任务", "相关 Reviews"],
  synthesisRules: ["只提取明确存在或可直接推导的开放事项。", "区分任务、问题、等待项和以后再看。", "合并重复项但保留来源。"],
  uncertaintyRules: ["不能从模糊愿望制造任务。"],
  answerContract: ["按类型列出开放事项", "标出明确截止时间", "指出来源", "无事项时明确说明"],
  toolGroups: ["notes_read", "todo_read", "calendar_read", "memory_read", "search"],
};

import type { CognitiveRecipeDefinition } from "./types";

export const contradictionDetectionRecipe: CognitiveRecipeDefinition = {
  recipe: "contradiction_detection",
  objective: "识别不同来源之间的真实冲突、时间变化或尚未澄清的张力。",
  complexity: "analytical",
  defaultTimeWindowDays: 60,
  expandedTimeWindowDays: 180,
  minimumRecentNotes: 4,
  retrievalOrder: ["working_memory", "recent_notes", "reviews", "semantic_search", "lexical_search", "graph"],
  requiredSources: ["至少两条可对照来源", "当前 Decision/Working Memory（若涉及当前立场）"],
  synthesisRules: ["先区分逻辑冲突、时间上的立场变化和仅仅措辞不同。", "引用双方证据及日期。", "不得为了形成矛盾而夸大差异。"],
  uncertaintyRules: ["证据语境不足时标为待澄清张力，而非矛盾。"],
  answerContract: ["列出确认的冲突", "列出可能只是变化或语境差异的项目", "提出最小澄清问题", "附来源"],
  toolGroups: ["notes_read", "memory_read", "career_read", "search"],
};

import type { CognitiveRecipeDefinition } from "./types";

export const retrospectiveThinkingRecipe: CognitiveRecipeDefinition = {
  recipe: "retrospective_thinking",
  objective: "从近期真实记录中归纳反复出现的主题、变化和仍未解决的问题。",
  complexity: "analytical",
  defaultTimeWindowDays: 21,
  expandedTimeWindowDays: 45,
  minimumRecentNotes: 5,
  retrievalOrder: ["recent_notes", "reviews", "working_memory", "semantic_search", "lexical_search"],
  requiredSources: ["近期 Notes", "已完成 Reviews（若存在）", "当前 Working Memory/Decision（用于校准当前状态）"],
  synthesisRules: [
    "主题必须由至少两个独立记录支持；单篇记录只能列为弱信号。",
    "比较最近 7 天与此前 14 天，区分持续、升温、新出现和减弱的主题。",
    "从正文中寻找未解决问题与决定信号，并检查它们是否与当前 Working Memory/Decision 冲突。",
    "区分近期记录、跨期重复主题和当前决定，不把旧想法写成当前立场。",
    "优先保留具体日期、事件、判断和未解决问题。",
  ],
  uncertaintyRules: ["近期记录不足时直接说明覆盖范围，不用常识填空。", "无法确认主题持续性时标为弱信号。"],
  answerContract: ["先给核心结论", "归纳最近的主要思考主线", "指出新出现或明显升温的主题", "列出反复出现但尚未解决的问题", "指出观点正在变化的地方", "提出一项值得进一步追问的核心问题", "每项附来源链接"],
  toolGroups: ["notes_read", "memory_read", "search"],
};

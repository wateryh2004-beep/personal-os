import { interviewTargets, interviewItems } from "./interview.js";
export const practiceQueue = interviewItems.slice(0, 9).map((item, index) => ({
  id: item.preparationId, question_id: item.questionId, context_id: index === 1 ? "synthetic-target" : null,
  prompt_override: item.prompt, status: "developing", importance: "high", target_language: "zh",
  interview_questions: { canonical_prompt: item.prompt, short_title: item.shortTitle },
  interview_contexts: index === 1 ? { title: interviewTargets[0].title } : null,
  attempt_count: index % 3, usable_story_count: index % 2, competency_count: index % 3, covered_competency_count: 0,
  practice_reasons: [index % 2 ? "到期复习" : "还没练过", "能力证据不足"],
}));
const coverage = [
  { tag: "judgment", label: "在长周期研究中识别关键假设并判断证据的能力", total: 7, ready: 2, storyCount: 2, strongStoryCount: 0, practiceCount: 1, diagnosis: "缺少可用故事" },
  { tag: "analysis", label: "数据分析", total: 5, ready: 3, storyCount: 3, strongStoryCount: 2, practiceCount: 4, diagnosis: "题目准备不足" },
  { tag: "communication", label: "清晰表达", total: 2, ready: 2, storyCount: 1, strongStoryCount: 1, practiceCount: 0, diagnosis: "尚未练习" },
];
export function fixtureMode() { return new URLSearchParams(location.search).get("fixture"); }
export function fixtureQueue(context) {
  const mode = fixtureMode();
  return { contexts: interviewTargets, queue: mode === "empty" ? [] : practiceQueue.filter(item => !context || (context === "general" ? !item.context_id : item.context_id === context)), unavailable: mode === "error" };
}
export function fixtureInsights() {
  const empty = fixtureMode() === "empty";
  const source = fixtureMode() === "actual" ? "practice" : "plan";
  return { contexts: interviewTargets, unavailable: fixtureMode() === "error", preparations: empty ? [] : practiceQueue,
    attempts: empty ? [] : [{ id: "attempt" }], stories: [], competencyCoverage: empty ? [] : coverage, priorityGaps: empty ? [] : coverage,
    storyUsage: empty ? [] : [{ id: "story", count: 3, share: 0.75, source, story: { title: "示例研究：从原始材料整理可核对的分析结论" } }, { id: "archived-story", count: 1, share: 0.25, source, story: null }],
    issueCounts: empty ? [] : [{ tag: "answer_not_direct", count: 3 }], monthlyTrend: empty ? [] : [{ month: "2026-10", attempts: 4, issuesPerAttempt: 0.75 }],
  };
}
export function fixtureDetail() {
  return { preparation: { ...practiceQueue[0], next_focus: "先说结论，再说明依据和需要补充的证据。", next_practice_at: "2026-10-22T00:00:00Z" }, linkedStories: [],
    answers: [{ id: "synthetic-answer", status: "current", answer_mode: "spoken", language: "zh", body_markdown: interviewItems[0].answer, version_number: 1 }],
    attempts: Array.from({ length: 8 }, (_, index) => ({ id: `synthetic-attempt-${index}`, practiced_at: "2026-10-19T00:00:00Z", duration_seconds: 90, issue_tags: ["answer_not_direct"], response_transcript_markdown: "这是用于验证完整历史阅读的合成回答。\n".repeat(12) + `历史尾部 ${index + 1}`, self_review_markdown: "需要更快进入结论。", next_focus: "先说明判断依据。" })),
  };
}

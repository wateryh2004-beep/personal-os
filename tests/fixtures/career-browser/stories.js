export const storyExperiences = [{ id: "10000000-0000-4000-8000-000000000001", organization: "示例研究团队", role: "数据研究" }, { id: "10000000-0000-4000-8000-000000000002", organization: "示例项目", role: "协作与交付" }];
export const storyRows = [
  { id: "20000000-0000-4000-8000-000000000001", title: "从零整理研究资料：跨来源口径校验、假设记录与复核机制的建立", one_line: "将分散材料整理为可核对的证据链，保留尚未确认的假设。", status: "usable", experience_id: storyExperiences[0].id, experience: storyExperiences[0], competencies: [{ id: "analysis", label: "数据分析" }, { id: "judgment", label: "判断力" }], archetypeCount: 2 },
  { id: "20000000-0000-4000-8000-000000000002", title: "SQL 查询结果出现偏差时的排查", one_line: "从样本、关联键与聚合口径逐层检查差异。", status: "draft", experience_id: storyExperiences[0].id, experience: storyExperiences[0], competencies: [{ id: "analysis", label: "数据分析" }], archetypeCount: 0 },
  { id: "20000000-0000-4000-8000-000000000003", title: "多方需求之间如何做出取舍", one_line: "以可验证的问题和共同的验收条件推进讨论。", status: "strong", experience_id: storyExperiences[1].id, experience: storyExperiences[1], competencies: [{ id: "communication", label: "沟通表达" }], archetypeCount: 3 },
  { id: "20000000-0000-4000-8000-000000000004", title: "一段还需要整理的经历", one_line: "", status: "needs_review", experience_id: null, experience: null, competencies: [], archetypeCount: 0 },
];
export function storyLibraryFixture() {
  const mode = new URLSearchParams(location.search).get("fixture");
  return { stories: mode === "empty" ? [] : storyRows, experiences: storyExperiences, unavailable: mode === "error" };
}
export function storyDetailFixture(id) {
  const row = storyRows.find(item => item.id === id) ?? storyRows[0];
  const mode = new URLSearchParams(location.search).get("fixture");
  const story = { ...row,
    situation_markdown: "资料来自多个来源，部分统计口径不同。\\n\\n## 必须保留的前提\\n\\n不能把不同期间和范围的数据直接比较。".replaceAll("\\n", "\n"),
    task_markdown: "我的任务是梳理口径、标记不确定信息，并建立可追溯的分析底稿。",
    action_markdown: "先检查关键字段与原始出处，再记录每次修正的依据。\n\n- 核对期间和统计范围\n- 保留原始文件与来源\n- 对异常值建立复核记录\n\n" + "面对资料不完整的情况，先说明能够确认的事实，再列出需要补充的证据。\n\n".repeat(12) + "```text\n" + "synthetic_long_code_".repeat(15) + "\n```\n\n| 检查项 | 依据 |\n| --- | --- |\n| 统计范围 | 原始来源记录 |\n\n行动章节完整尾部。",
    result_markdown: mode === "sparse" ? "" : "形成了一套可复核的研究底稿。这里只是合成界面样本，不代表用户的实际成果。",
    reflection_markdown: "资料不足时保留不确定性，避免用流畅的表达替代事实核对。",
  };
  if (mode === "missing-experience") story.experience_id = "10000000-0000-4000-8000-000000000099";
  return { story, experiences: storyExperiences, competencies: row.competencies.map((item, index) => ({ competency_id: item.id, competency: item, is_primary: index === 0 })), archetypes: [
    { archetype_id: "archetype-a", archetype: { title: "信息不完整时怎样形成判断？" }, evidence_role: "primary", fit_note: "说明已知事实、关键假设和下一步验证。" },
    { archetype_id: "archetype-b", archetype: { title: "复盘一次需要修正原判断的经历。" }, evidence_role: "supporting", fit_note: "" },
  ] };
}

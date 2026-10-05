import { AppShell } from "@/components/layout/app-shell";
import { InterviewFastWorkspace } from "@/components/career/interview/interview-fast-workspace";

/** Synthetic layout/interaction fixtures only; unavailable in normal deployments. */
export function InterviewReadingFixture() {
  const titles = ["系统有人用，如何证明有价值", "AI 代写代码后，你的贡献是什么", "SQL：平均空置率为什么算错了", "Case：产品怎么定价，多少客户能回本", "项目推进遇到分歧怎么办", "如何解释一次失败与改进"];
  return <AppShell presentationPathname="/career/interview"><InterviewFastWorkspace targets={[{ id: "fixture-target", title: "模拟岗位", organization: "测试公司", role: "分析岗" }]} initialContextId="" initialQuestionId="" initialCategory="all" items={Array.from({ length: 42 }, (_, index) => ({
    preparationId: `fixture-prep-${index}`, questionId: `fixture-question-${index}`, contextId: index === 41 ? "fixture-target" : null,
    shortTitle: titles[index % titles.length], prompt: index === 0 ? "你提到内部系统已有同事使用。如何证明它改善了业务，而不只是把 Excel 搬到网页？如果没有可靠的节省工时数据，你会怎么回答？" : `布局测试 ${index}：${titles[index % titles.length]}？`,
    category: index % 3 === 0 ? "resume" : "knowledge", categoryLabel: index % 3 === 0 ? "简历" : "专业", style: index % 4 === 0 ? "stress" : "standard", subcategory: index % 3 === 0 ? null : "SQL与数据分析", competencies: [],
    answerId: `fixture-answer-${index}`, answerMeta: { status: "draft", source: "ai_draft", language: "zh", version_number: 2, confirmed_at: null },
    thoughts: "## 思考顺序\n\n这是界面测试内容，不代表用户经历。先区分观察、解释和证据，再明确结论的适用条件。\n\n1. 明确问题\n2. 检查证据\n3. 说明边界\n\n## 参考资料\n[测试来源](https://example.com)",
    answer: "## 先给出判断\n\n这是用于验证排版的模拟文本，不是个人经历或可直接使用的答案。没有可靠数据时，应清楚区分已观察到的事实、合理推测与尚未验证的判断。\n\n## 再解释证据\n\n使用记录能说明工具被采用，但不能单独证明业务收益。可以解释改进发生在哪个环节，以及还需要什么证据。\n\n## 最后说明下一步\n\n保留不确定性，提出可核对的验证方式。不要把估计写成已经发生的事实。\n\n## 来源与目标岗位\n仅用于本地界面测试。",
  }))} /></AppShell>;
}

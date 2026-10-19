import { AppShell } from "@/components/layout/app-shell";
import { QuestionCatalog } from "@/components/career/interview/question-catalog";
import { PageHeader } from "@/components/shared/page-header";

/** Synthetic data behind E2E_MOBILE_HARNESS; exercise the real Next history integration. */
export function InterviewCatalogFixture() {
  return <AppShell presentationPathname="/career/interview/questions"><PageHeader title="题目管理" /><QuestionCatalog unavailable={false} createForm={<p>合成场景，不执行新建写入。</p>} rows={[
    { id: "fixture-catalog-sql", shortTitle: "SQL 窗口函数", prompt: "解释窗口函数与分组的差异。", category: "knowledge", style: "standard", subcategory: "SQL与数据分析", preparationCount: 1 },
    { id: "fixture-catalog-bias", shortTitle: "选择偏差", prompt: "识别样本的选择偏差。", category: "knowledge", style: "stress", subcategory: "SQL与数据分析", preparationCount: 2 },
    { id: "fixture-catalog-cash", shortTitle: "现金流", prompt: "解释现金流与利润的差异。", category: "knowledge", style: "standard", subcategory: "会计", preparationCount: 0 },
  ]} /></AppShell>;
}

import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ detail: vi.fn(), list: vi.fn(), graph: vi.fn(), submit: vi.fn() }));
vi.mock("@/features/career/queries", () => ({ getExperience: mocks.detail, getExperiences: mocks.list }));
vi.mock("@/features/graph/queries", () => ({ getExperienceGraph: mocks.graph }));
vi.mock("@/features/career/form-actions", () => ({ submitCareerForm: mocks.submit }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, useSearchParams: () => new URLSearchParams(), useRouter: () => ({ refresh: vi.fn() }) }));
import DetailPage from "@/app/(app)/career/experiences/[experienceId]/page";
import LibraryPage from "@/app/(app)/career/experiences/page";
const experience = { id: "e1", organization: "示例机构", role: "分析", experience_type: "internship", status: "confirmed", confidentiality_level: "private", is_current: true, start_date: null, end_date: null, department: "研究组", background_markdown: "# 背景小节\n\n完整背景", raw_description_markdown: "原始记录完整尾文。" };
function detail() { return { experience, facts: [{ id: "f1", content: "完整事实。".repeat(50) + "FACT_END", fact_type: "metric", verification_status: "self_confirmed", metric_value: 0, metric_unit: "差异", occurred_at: "2026-01-01", source_document_id: null, notes_markdown: "<script>alert(1)</script>\n\n事实补充完整尾文。" }], outputs: [{ id: "o1", name: "报告", output_type: "report", confidentiality_level: "private", description_markdown: "DESCRIPTION_END", result_markdown: "RESULT_END", public_url: "javascript:alert(1)" }], bullets: [], documents: [], versions: [{ id: "v1", fact_id: "f1", version_number: 1, created_at: "2026-01-01T00:00:00Z", content: "历史完整尾文", fact_type: "action", verification_status: "unverified", metric_value: null, notes_markdown: "历史备注" }], directions: [], links: [], audit: [], unavailable: false }; }
it("reads complete facts, description AND result, independent history and raw record without writing", async () => {
  mocks.detail.mockResolvedValue(detail()); mocks.graph.mockResolvedValue({ related: [], suggestions: [] });
  const html = renderToStaticMarkup(await DetailPage({ params: Promise.resolve({ experienceId: "e1" }), searchParams: Promise.resolve({ q: "SQL ", type: "internship", period: "current", status: "confirmed", returnTo: "https://outside.test" }) }));
  expect(html.match(/<h1 /g)).toHaveLength(1);
  for (const text of ["FACT_END", "DESCRIPTION_END", "RESULT_END", "事实补充完整尾文", "原始记录完整尾文", "历史完整尾文", "历史备注", "0 差异", "研究组"]) expect(html).toContain(text);
  expect(html).not.toContain("<script>"); expect(html).not.toContain('href="javascript:');
  expect(html).not.toContain("<textarea"); expect(html).not.toContain("outside.test");
  expect(html).toContain("q=SQL+&amp;type=internship&amp;period=current&amp;status=confirmed");
  expect(html).not.toContain("AI 分析"); expect(mocks.submit).not.toHaveBeenCalled();
});
it("distinguishes failed reads and unavailable history from a confirmed empty collection", async () => {
  const data = { ...detail(), facts: [], outputs: [], unavailable: true };
  mocks.detail.mockResolvedValue(data); mocks.graph.mockResolvedValue({ related: [], suggestions: [] });
  const html = renderToStaticMarkup(await DetailPage({ params: Promise.resolve({ experienceId: "e1" }) }));
  expect(html).toContain("部分资料未能读取"); expect(html).toContain("暂未读取到内容"); expect(html).not.toContain("还没有事实");
  mocks.detail.mockResolvedValue(null); await expect(DetailPage({ params: Promise.resolve({ experienceId: "missing" }) })).rejects.toThrow("NOT_FOUND");
});
it("keeps full experience prose and duplicate create dialogs out of the catalog", async () => {
  mocks.list.mockResolvedValue({ experiences: [experience], unavailable: false });
  const html = renderToStaticMarkup(await LibraryPage({ searchParams: Promise.resolve({}) }));
  expect(html).not.toContain("原始记录完整尾文"); expect(html).not.toContain("完整背景");
  expect(html.match(/>新增经历<\/button>/g)).toHaveLength(1);
});

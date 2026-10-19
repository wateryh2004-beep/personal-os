import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ detail: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn() }));
vi.mock("@/features/interview/queries", () => ({ getInterviewStoryDetail: mocks.detail, getInterviewStories: mocks.list }));
vi.mock("@/features/interview/actions", () => ({ createInterviewStory: mocks.create, updateInterviewStory: mocks.update, archiveInterviewStory: mocks.archive }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ refresh: vi.fn() }), notFound: () => { throw new Error("NOT_FOUND"); } }));
import DetailPage from "@/app/(app)/career/interview/stories/[storyId]/page";
import LibraryPage from "@/app/(app)/career/interview/stories/page";
const base = { id: "s1", title: "示例故事", one_line: "一句话", status: "usable", experience_id: null, situation_markdown: "# 原文小节\n完整背景。", task_markdown: "任务", action_markdown: "完整行动。".repeat(50) + "END_OF_ACTION", result_markdown: "", reflection_markdown: "<script>alert(1)</script>\n\n完整反思。" };
function detail() { return { story: base, experiences: [], competencies: Array.from({ length: 7 }, (_, index) => ({ competency_id: `c${index}`, competency: { label: `能力${index}` }, is_primary: index === 0 })), archetypes: [{ archetype_id: "a", archetype: { title: "母题" }, fit_note: "适用边界", evidence_role: "counter" }] }; }
describe("Read-first story pages", () => {
  it("renders complete prose and all relations without auto-editing or writing", async () => {
    mocks.detail.mockResolvedValue(detail());
    const html = renderToStaticMarkup(await DetailPage({ params: Promise.resolve({ storyId: "s1" }), searchParams: Promise.resolve({ q: "SQL window", status: "usable", experience: "e1", competency: "c1", returnTo: "https://elsewhere.test" }) }));
    expect(html.match(/<h1 /g)).toHaveLength(1);
    expect(html).toContain("END_OF_ACTION"); expect(html).toContain("完整反思");
    expect(html).toContain("尚未补充结果"); expect(html).toContain("能力6");
    expect(html).toContain("边界 / 反证"); expect(html).toContain("适用边界");
    expect(html).not.toContain("<script>"); expect(html).not.toContain("<textarea");
    expect(html).toContain('/career/interview/stories?q=SQL+window&amp;status=usable&amp;experience=e1&amp;competency=c1');
    expect(html).not.toContain("elsewhere.test");
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.archive).not.toHaveBeenCalled();
  });
  it("keeps full story bodies out of the library catalog", async () => {
    mocks.list.mockResolvedValue({ stories: [{ ...base, experience: null, competencies: [], archetypeCount: 0 }], experiences: [], unavailable: false });
    const html = renderToStaticMarkup(await LibraryPage());
    expect(html).toContain("示例故事"); expect(html).toContain("一句话");
    expect(html).not.toContain("END_OF_ACTION"); expect(html).not.toContain("完整背景");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not present failed story loading as a genuinely empty library", async () => {
    mocks.list.mockResolvedValue({ stories: [], experiences: [], unavailable: true });
    const html = renderToStaticMarkup(await LibraryPage());
    expect(html).toContain('role="alert"'); expect(html).toContain("暂时无法读取故事");
    expect(html).not.toContain("还没有故事，先记录");
  });
});

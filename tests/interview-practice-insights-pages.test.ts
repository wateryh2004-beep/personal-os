import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ queue: vi.fn(), insights: vi.fn() }));
vi.mock("@/features/interview/queries", () => ({ getPracticeQueue: mocks.queue, getInterviewInsights: mocks.insights }));
import PracticePage from "@/app/(app)/career/interview/practice/page";
import InsightsPage from "@/app/(app)/career/interview/insights/page";

const gap = { requiresStory: true, tag: "analysis", label: "数据分析", total: 2, ready: 1, storyCount: 1, strongStoryCount: 0, practiceCount: 0, diagnosis: "缺少可用故事" };
function insights(source = "plan") {
  return { contexts: [], preparations: [{ status: "ready" }], attempts: [], stories: [], competencyCoverage: [gap], priorityGaps: [gap], issueCounts: [], monthlyTrend: [], storyUsage: [{ id: "story", count: 3, share: 1, source, story: { title: "示例故事" } }], unavailable: false };
}

describe("Practice and insights task pages", () => {
  it("distinguishes a failed practice read from an empty queue and retains the scope in recovery", async () => {
    mocks.queue.mockResolvedValue({ queue: [], contexts: [], unavailable: true });
    const failed = renderToStaticMarkup(await PracticePage({ searchParams: Promise.resolve({ context: "general" }) }));
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('/career/interview/practice?context=general');
    expect(failed).not.toContain("当前范围没有可练习题目");
    mocks.queue.mockResolvedValue({ queue: [], contexts: [], unavailable: false });
    const empty = renderToStaticMarkup(await PracticePage({ searchParams: Promise.resolve({ context: "general" }) }));
    expect(empty).toContain("当前范围没有可练习题目");
    expect(empty).toContain('/career/interview?context=general');
    expect(empty).not.toContain('role="alert"');
  });

  it("shows the real queue order, first action and practice counts without inventing competency coverage", async () => {
    mocks.queue.mockResolvedValue({ contexts: [], unavailable: false, queue: Array.from({ length: 7 }, (_, index) => ({ id: `prep-${index}`, interview_questions: { canonical_prompt: `题目 ${index}` }, practice_reasons: ["还没练过"], attempt_count: 0, competency_count: 0 })) });
    const html = renderToStaticMarkup(await PracticePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('href="/career/interview/practice/prep-0"');
    expect(html).toContain("开始第一题");
    expect(html).toContain("7 道可练，7 道尚无练习记录");
    expect(html).toContain("尚未关联能力");
    expect(html).not.toContain("0/0");
    expect(html).toContain("其余可练题目（2 道）");
    expect(html).toMatch(/<details[^>]*><summary class="ui-disclosure-trigger">/);
    expect(html).not.toMatch(/<details[^>]* open/);
  });

  it("labels planned associations and actual practice uses separately", async () => {
    mocks.insights.mockResolvedValue(insights());
    const plan = renderToStaticMarkup(await InsightsPage({ searchParams: Promise.resolve({ context: "target" }) }));
    expect(plan).toContain("3 个母题关联");
    expect(plan).not.toContain("3 次练习使用");
    expect(plan).toContain('href="/career/interview/practice?context=target"');
    expect(plan).toContain("补充故事");
    mocks.insights.mockResolvedValue(insights("practice"));
    const actual = renderToStaticMarkup(await InsightsPage({ searchParams: Promise.resolve({}) }));
    expect(actual).toContain("3 次练习使用");
    expect(actual).not.toContain("3 个母题关联");
  });

  it("never certifies missing or failed coverage as no ability gaps", async () => {
    for (const unavailable of [false, true]) {
      mocks.insights.mockResolvedValue({ ...insights(), preparations: [], competencyCoverage: [], priorityGaps: [], storyUsage: [], unavailable });
      const html = renderToStaticMarkup(await InsightsPage({ searchParams: Promise.resolve({}) }));
      expect(html).not.toContain("没有明显能力缺口");
      expect(html).toContain(unavailable ? "资料不完整，暂不判断缺口" : "当前范围还没有准备记录");
    }
  });
});


it("sends technical competency gaps to preparation, not to the personal-story library", async () => {
  const technical = { ...gap, requiresStory: false, strongStoryCount: 0, storyCount: 0, diagnosis: "题目准备不足" };
  mocks.insights.mockResolvedValue({ ...insights(), competencyCoverage: [technical], priorityGaps: [technical] });
  const html = renderToStaticMarkup(await InsightsPage({ searchParams: Promise.resolve({ context: "general" }) }));
  expect(html).toContain("继续准备");
  expect(html).toContain('href="/career/interview?context=general"');
  expect(html).not.toContain("补充故事");
  expect(html).not.toContain("0/0 个故事可用");
});

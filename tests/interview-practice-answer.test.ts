import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ detail: vi.fn() }));
vi.mock("@/features/interview/queries", () => ({ getPracticeDetail: mocks.detail }));
vi.mock("@/features/interview/actions", () => ({ createPracticeAttempt: vi.fn(),savePracticeIntent:vi.fn(),reconcilePracticeIntent:vi.fn() }));
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn()}),unstable_rethrow:vi.fn()}));
import Page from "@/app/(app)/career/interview/practice/[preparationId]/page";

it("uses the same spoken-answer selection and reader without spoiling practice", async () => {
  const base = { preparation_id: "prep", answer_mode: "spoken", language: "zh", target_seconds: 90, version_number: 1, status: "draft", source: "ai_draft", confirmed_at: null, updated_at: "2026-10-01" };
  mocks.detail.mockResolvedValue({ preparation: { id: "prep", question_id: "question", target_language: "zh", interview_questions: { canonical_prompt: "Question" }, working_thoughts_markdown: "Supporting explanation." }, attempts: [], linkedStories: [], answers: [
    { ...base, id: "outline", answer_mode: "outline", body_markdown: "OUTLINE_NOT_SPOKEN" },
    { ...base, id: "draft", body_markdown: "DRAFT_SHOULD_NOT_WIN" },
    { ...base, id: "current", status: "current", body_markdown: "## 标准答案\nCOMPLETE_SPOKEN_ANSWER\n## 思路拆解讲解\nLESSON_ONLY" },
  ] });
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ preparationId: "prep" }), searchParams: Promise.resolve({}) }));
  expect(html).toContain('data-testid="interview-study-view"');
  expect(html).toContain("COMPLETE_SPOKEN_ANSWER");
  expect(html).not.toContain("OUTLINE_NOT_SPOKEN");
  expect(html).not.toContain("DRAFT_SHOULD_NOT_WIN");
  expect(html).not.toContain("LESSON_ONLY");
  expect(html).toMatch(/<details><summary[^>]*><span[^>]*>查看标准答案与讲解<\/span>/);
  expect(html).not.toMatch(/<details[^>]* open/);
  expect(html).toContain('name="answer_version_id" value=""');
});

it("keeps all eight fetched attempts and their complete text available for review", async () => {
  mocks.detail.mockResolvedValue({ preparation: { id: "prep", question_id: "question", target_language: "zh", interview_questions: { canonical_prompt: "Question" } }, answers: [], linkedStories: [], attempts: Array.from({ length: 8 }, (_, index) => ({
    id: `attempt-${index}`, practiced_at: "2026-10-19T00:00:00Z", issue_tags: [], response_transcript_markdown: `回答 ${index}：` + "完整内容。".repeat(50) + `尾部 ${index}`, self_review_markdown: "复盘内容", next_focus: "下次重点",
  })) });
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ preparationId: "prep" }), searchParams: Promise.resolve({}) }));
  expect(html).toContain("最多展示 8 次");
  expect(html.match(/<article /g)).toHaveLength(8);
  expect(html).toContain("完整内容。".repeat(50) + "尾部 7");
  expect(html).not.toContain("line-clamp-3");
  expect(html).not.toContain("autofocus");
});

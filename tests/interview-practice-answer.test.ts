import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ detail: vi.fn() }));
vi.mock("@/features/interview/queries", () => ({ getPracticeDetail: mocks.detail }));
vi.mock("@/features/interview/actions", () => ({ createPracticeAttempt: vi.fn() }));
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
  expect(html).toMatch(/<details><summary[^>]*>查看标准答案与讲解/);
  expect(html).toContain('name="answer_version_id" value=""');
});

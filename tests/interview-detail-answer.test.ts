import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ detail: vi.fn() }));
vi.mock("@/features/interview/queries", () => ({ getInterviewQuestionDetail: mocks.detail }));
vi.mock("@/features/interview/actions", () => ({ archiveInterviewAnswerVersion: vi.fn(), archiveInterviewQuestion: vi.fn(), createInterviewAnswerVersion: vi.fn(), createInterviewQuestion: vi.fn(), ensureInterviewPreparation: vi.fn(), linkInterviewEvidence: vi.fn(), linkStoryToArchetype: vi.fn(), promoteInterviewAnswerVersion: vi.fn(), unlinkInterviewEvidence: vi.fn(), unlinkStoryFromArchetype: vi.fn(), updateInterviewPreparation: vi.fn(), updateInterviewQuestion: vi.fn() }));
import Page from "@/app/(app)/career/interview/questions/[questionId]/page";
const current = { id: "current", preparation_id: "prep", answer_mode: "spoken", language: "zh", target_seconds: 90, body_markdown: "ADOPTED_CURRENT_BODY", version_number: 1, status: "current", source: "human", confirmed_at: null, updated_at: "2026-10-01" };
const draft = { ...current, id: "draft", body_markdown: "EDITED_DRAFT_BODY", version_number: 2, status: "draft", source: "ai_edited", updated_at: "2026-10-02" };
beforeEach(() => mocks.detail.mockResolvedValue({ question: { id: "question", canonical_prompt: "Question", category: "resume", competency_tags: [], prompt_variants: [] }, selectedPreparation: { id: "prep", target_language: "zh", context_id: null, status: "developing", importance: "medium" }, answers: [current, draft], contexts: [], attempts: [], archetypeStories: [], storyCatalog: [], variants: [], evidenceLinks: [], evidenceCatalog: [], childQuestions: [] }));
it("opens a pinned edited draft visibly even when an adopted current answer exists", async () => {
  const markup = renderToStaticMarkup(await Page({ params: Promise.resolve({ questionId: "question" }), searchParams: Promise.resolve({ answer: "draft" }) }));
  expect(markup).toContain('name="based_on_answer_id" value="draft"');
  expect(markup).toContain('name="body_markdown"');
  expect(markup).toMatch(/<textarea[^>]*name="body_markdown"[^>]*>EDITED_DRAFT_BODY<\/textarea>/);
  expect(markup).toMatch(/<details[^>]*id="answer-versions"[^>]*open=""/);
  expect(markup).toContain("参考答案 · 待确认");
  expect(markup).toContain("确认并设为当前答案");
  expect(markup).toContain("ADOPTED_CURRENT_BODY");
});
it("rejects unknown version pins and defaults to the adopted answer", async () => {
  const markup = renderToStaticMarkup(await Page({ params: Promise.resolve({ questionId: "question" }), searchParams: Promise.resolve({ answer: "foreign" }) }));
  expect(markup).toMatch(/<textarea[^>]*name="body_markdown"[^>]*>ADOPTED_CURRENT_BODY<\/textarea>/);
});

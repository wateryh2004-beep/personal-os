import type { WorkspaceAnswer } from "@/features/interview/workspace-answers";
import { afterEach, expect, it, vi } from "vitest";
const data = vi.hoisted(() => ({ contexts: [{ id: "swire", title: "Swire", organization_snapshot: "太古集团", role_title_snapshot: "MT" }], questionTypes: [], competencies: [], competencyLinks: [], answers: [] as WorkspaceAnswer[], preparations: [{ id: "p1", question_id: "q1", context_id: null, interview_questions: { canonical_prompt: "General" } }, { id: "p2", question_id: "q2", context_id: "swire", interview_questions: { canonical_prompt: "Swire" } }] }));
vi.mock("@/features/interview/queries", () => ({ getInterviewWorkspaceData: vi.fn(async () => data) }));
vi.mock("@/components/career/interview/interview-fast-workspace", () => ({ InterviewFastWorkspace: () => null }));
import Page from "@/app/(app)/career/interview/page";
it("defaults to general without pre-opening a question even when a target exists", async () => {
  const page = await Page({ searchParams: Promise.resolve({}) });
  expect(page.props.initialContextId).toBe(""); expect(page.props.initialQuestionId).toBe("");
});
it("honors an explicit valid target and question", async () => {
  const page = await Page({ searchParams: Promise.resolve({ context: "swire", question: "q2" }) });
  expect(page.props.initialContextId).toBe("swire"); expect(page.props.initialQuestionId).toBe("q2");
});
it("falls back to general for stale targets and rejects cross-context question IDs", async () => {
  const page = await Page({ searchParams: Promise.resolve({ context: "deleted", question: "q2" }) });
  expect(page.props.initialContextId).toBe(""); expect(page.props.initialQuestionId).toBe("");
});

afterEach(() => { data.answers.length = 0; });
it("renders fallback body and metadata and restores a pinned edited draft on reload", async () => {
  const draft: WorkspaceAnswer = { id: "draft", preparation_id: "p1", answer_mode: "spoken", language: "zh", target_seconds: null, body_markdown: "完整参考答案", version_number: 2, status: "draft", source: "ai_draft", confirmed_at: null, updated_at: "2026-10-01" };
  data.answers.push(draft);
  const first = await Page({ searchParams: Promise.resolve({ question: "q1" }) });
  expect(first.props.items[0]).toMatchObject({ answer: draft.body_markdown, answerId: "draft", answerMeta: { status: "draft", source: "ai_draft", confirmed_at: null } });
  data.answers.push({ ...draft, id: "current", body_markdown: "Adopted answer", version_number: 1, status: "current" });
  const defaults = await Page({ searchParams: Promise.resolve({ question: "q1" }) });
  expect(defaults.props.items[0].answerId).toBe("current");
  const pinned = await Page({ searchParams: Promise.resolve({ question: "q1", answer: "draft" }) });
  expect(pinned.props.items[0].answerId).toBe("draft");
  expect(pinned.key).not.toBe(defaults.key);
});
it("does not apply an answer pin to another question", async () => {
  data.answers.push({ id: "foreign", preparation_id: "p2", answer_mode: "spoken", language: "zh", target_seconds: null, body_markdown: "Other answer", version_number: 1, status: "draft", source: "ai_draft", confirmed_at: null, updated_at: "2026-10-01" });
  const page = await Page({ searchParams: Promise.resolve({ question: "q1", answer: "foreign" }) });
  expect(page.props.items[0].answer).toBe("");
});

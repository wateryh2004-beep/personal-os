import { expect, it, vi } from "vitest";
const data = vi.hoisted(() => ({ contexts: [{ id: "swire", title: "Swire", organization_snapshot: "太古集团", role_title_snapshot: "MT" }], questionTypes: [], competencies: [], competencyLinks: [], answers: [], preparations: [{ id: "p1", question_id: "q1", context_id: null, interview_questions: { canonical_prompt: "General" } }, { id: "p2", question_id: "q2", context_id: "swire", interview_questions: { canonical_prompt: "Swire" } }] }));
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

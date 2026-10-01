import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { createPracticeAttempt } from "@/features/interview/actions";

const preparationId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
const questionId = "33333333-3333-4333-8333-333333333333";

function mockDatabase(scheduleError: Error | null = null) {
  const insert = vi.fn();
  const update = vi.fn();
  const supabase = {
    from(table: string) {
      let operation = "select";
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        insert(value: unknown) { operation = "insert"; insert(table, value); return query; },
        update(value: unknown) { operation = "update"; update(table, value); return query; },
        maybeSingle: vi.fn(async () => ({
          data: { id: preparationId, question_id: questionId, status: "developing", interview_questions: { canonical_prompt: "既有题目" } },
          error: null,
        })),
        single: vi.fn(async () => ({ data: { id: attemptId }, error: null })),
        then(resolve: (result: { error: Error | null }) => unknown) {
          return Promise.resolve({ error: operation === "update" ? scheduleError : null }).then(resolve);
        },
      };
      return query;
    },
  };
  mocks.requireOwner.mockResolvedValue({ supabase, userId: "owner" });
  return { insert, update };
}

function attemptForm(nextFocus = "先说结论") {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    preparation_id: preparationId,
    input_mode: "text",
    language: "zh",
    duration_seconds: "90",
    next_focus: nextFocus,
    response_transcript_markdown: "用户自己的回答",
  })) form.set(key, value);
  form.append("issue_tags", "late_conclusion");
  form.append("issue_tags", "weak_evidence");
  return form;
}

beforeEach(() => vi.clearAllMocks());

describe("Interview practice save feedback", () => {
  it("persists reflection inputs and redirects with the saved attempt receipt", async () => {
    const { insert, update } = mockDatabase();
    const start = Date.now();
    await expect(createPracticeAttempt(attemptForm())).rejects.toThrow(`redirect:/career/interview/practice/${preparationId}?saved=${attemptId}`);
    expect(insert).toHaveBeenCalledWith("interview_practice_attempts", expect.objectContaining({
      duration_seconds: 90,
      issue_tags: ["late_conclusion", "weak_evidence"],
      next_focus: "先说结论",
    }));
    expect(update).toHaveBeenCalledWith("interview_question_preparations", expect.objectContaining({ next_focus: "先说结论", status: "practicing" }));
    const nextPractice = Date.parse(update.mock.calls[0][1].next_practice_at);
    expect(nextPractice).toBeGreaterThanOrEqual(start + 3 * 86_400_000);
    expect(nextPractice).toBeLessThanOrEqual(Date.now() + 3 * 86_400_000);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/career/interview/practice/${preparationId}`);
  });

  it.each(["", "  \n "])("preserves the previous focus when the new focus is blank (%j)", async (focus) => {
    const { update } = mockDatabase();
    await expect(createPracticeAttempt(attemptForm(focus))).rejects.toThrow("redirect:");
    expect(update.mock.calls[0][1]).not.toHaveProperty("next_focus");
  });

  it("reports a scheduling failure without hiding that the attempt was saved", async () => {
    const { insert } = mockDatabase(new Error("schedule update failed"));
    await expect(createPracticeAttempt(attemptForm())).rejects.toThrow(`saved=${attemptId}&review=not_updated`);
    expect(insert.mock.calls.filter(([table]) => table === "interview_practice_attempts")).toHaveLength(1);
  });
});

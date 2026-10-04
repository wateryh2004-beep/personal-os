import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ owner: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.owner }));
import { getCareerHome } from "@/features/career/queries";

type Call = { table: string; columns: string; filters: Array<[string, ...unknown[]]>; limit: number | null };
function setup(targets: Array<{ id: string }>, readingError = false) {
  const calls: Call[] = [];
  const from = vi.fn((table: string) => {
    const call: Call = { table, columns: "", filters: [], limit: null }; calls.push(call);
    const query = {
      select: (columns: string) => { call.columns = columns; return query; },
      eq: (...args: unknown[]) => { call.filters.push(["eq", ...args]); return query; },
      neq: (...args: unknown[]) => { call.filters.push(["neq", ...args]); return query; },
      in: (...args: unknown[]) => { call.filters.push(["in", ...args]); return query; },
      is: (...args: unknown[]) => { call.filters.push(["is", ...args]); return query; },
      not: (...args: unknown[]) => { call.filters.push(["not", ...args]); return query; },
      or: (...args: unknown[]) => { call.filters.push(["or", ...args]); return query; },
      order: () => query,
      limit: (count: number) => { call.limit = count; return query; },
      maybeSingle: () => query,
      then: (resolve: (result: unknown) => void) => {
        const isReading = call.columns.includes("interview_questions!inner");
        return Promise.resolve(resolve({
          error: isReading && readingError ? { message: "private backend detail" } : null,
          data: isReading ? readingError ? null : [{ id: "prep", question_id: "q", context_id: targets[0]?.id ?? null, prompt_override: null, key_message: "Synthetic summary", updated_at: "2026-10-04T08:00:00Z", interview_questions: [{ canonical_prompt: "Synthetic question", short_title: "Short title" }] }]
            : table === "interview_contexts" ? targets : table === "career_profiles" ? null : [],
          count: 0,
        }));
      },
    };
    return query;
  });
  mocks.owner.mockResolvedValue({ userId: "owner", supabase: { from } });
  return calls;
}

beforeEach(() => vi.resetAllMocks());

describe("Career home reading shelf query", () => {
  it("loads a small owner-scoped shelf for the visible active targets and general study", async () => {
    const calls = setup([{ id: "target" }]);
    const result = await getCareerHome();
    expect(result.recentReadings).toEqual([{ id: "prep", questionId: "q", contextId: "target", title: "Short title", summary: "Synthetic summary", updatedAt: "2026-10-04T08:00:00Z" }]);
    const reading = calls.find((call) => call.columns.includes("interview_questions!inner"))!;
    expect(reading.limit).toBe(6);
    expect(reading.filters).toEqual(expect.arrayContaining([
      ["eq", "user_id", "owner"], ["neq", "status", "paused"], ["is", "archived_at", null],
      ["is", "interview_questions.archived_at", null], ["or", "context_id.is.null,context_id.in.(target)"],
    ]));
    expect(reading.columns).not.toContain("body_markdown");
    expect(calls.some((call) => call.table === "interview_answer_versions")).toBe(false);
  });
  it("does not generate an empty in-filter and reports a failed reading shelf as incomplete", async () => {
    const calls = setup([], true);
    const result = await getCareerHome();
    expect(result.unavailable).toBe(true);
    expect(result.recentReadings).toEqual([]);
    expect(calls.find((call) => call.columns.includes("interview_questions!inner"))!.filters).toContainEqual(["or", "context_id.is.null"]);
  });
});

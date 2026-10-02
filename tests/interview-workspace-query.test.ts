import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.owner }));
import { getInterviewWorkspaceData } from "@/features/interview/queries";
it("paginates answer history beyond the server row cap without losing late preparations", async () => {
  const rows = Array.from({ length: 1205 }, (_, index) => ({ id: `answer-${String(index).padStart(4, "0")}`, preparation_id: index < 1200 ? "early" : "late", status: index === 1204 ? "current" : "draft" }));
  const ranges: number[][] = [];
  const supabase = { from(table: string) {
    let start = 0, end = 999;
    const query = {
      select: () => query, eq: () => query, neq: () => query, in: () => query, is: () => query, order: () => query,
      range: (first: number, last: number) => { start = first; end = last; if (table === "interview_answer_versions") ranges.push([first, last]); return query; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "interview_answer_versions" ? rows.slice(start, end + 1) : [], error: null }).then(resolve),
    }; return query;
  } };
  mocks.owner.mockResolvedValue({ supabase });
  const data = await getInterviewWorkspaceData();
  expect(data.answers).toHaveLength(1205);
  expect(data.answers.at(-1)).toMatchObject({ preparation_id: "late", status: "current" });
  expect(ranges).toEqual([[0, 499], [500, 999], [1000, 1499]]);
});
it("paginates preparations and competency links without silently truncating discovery", async () => {
  const sizes: Record<string, number> = { interview_question_preparations: 1101, interview_question_competencies: 1307 };
  const supabase = { from(table: string) {
    let start = 0, end = 999;
    const query = {
      select: () => query, eq: () => query, neq: () => query, in: () => query, is: () => query, order: () => query,
      range: (first: number, last: number) => { start = first; end = last; return query; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: Array.from({ length: sizes[table] ?? 0 }, (_, index) => ({ id: `${table}-${index}` })).slice(start, end + 1), error: null }).then(resolve),
    }; return query;
  } };
  mocks.owner.mockResolvedValue({ supabase });
  const data = await getInterviewWorkspaceData();
  expect(data.preparations).toHaveLength(1101);
  expect(data.competencyLinks).toHaveLength(1307);
  expect(data.unavailable).toBe(false);
});

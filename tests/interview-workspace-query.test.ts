import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.owner }));
import { getInterviewWorkspaceData, getPracticeQueue, getPracticeDetail, getInterviewInsights } from "@/features/interview/queries";
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
it("loads current and draft practice references under the same authenticated preparation", async () => {
  const calls: unknown[][] = [];
  const supabase = { from(table: string) {
    const query = {
      select: () => query, eq: (field: string, value: unknown) => { calls.push([table, "eq", field, value]); return query; },
      in: (field: string, value: unknown) => { calls.push([table, "in", field, value]); return query; },
      is: (field: string, value: unknown) => { calls.push([table, "is", field, value]); return query; },
      order: () => query, limit: () => query, range: () => query,
      maybeSingle: () => Promise.resolve({ data: { id: "prep", interview_questions: { archetype_id: "archetype" } } }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    }; return query;
  } };
  mocks.owner.mockResolvedValue({ supabase });
  await getPracticeDetail("prep");
  expect(calls).toContainEqual(["interview_answer_versions", "in", "status", ["current", "draft"]]);
  expect(calls).toContainEqual(["interview_answer_versions", "eq", "preparation_id", "prep"]);
  expect(calls).toContainEqual(["interview_answer_versions", "is", "archived_at", null]);
});

it("keeps unlinked attempts in the all-scope overview without attributing them to a target", async () => {
  const supabase = { from(table: string) {
    const query = {
      select: () => query, eq: () => query, is: () => query, order: () => query, range: () => query,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "interview_question_preparations" ? [{ id: "selected-prep", question_id: "q" }] : table === "interview_practice_attempts" ? [
        { id: "selected", preparation_id: "selected-prep", practiced_at: "2026-10-19T00:00:00Z", issue_tags: [] },
        { id: "other", preparation_id: "other-prep", practiced_at: "2026-10-19T00:00:00Z", issue_tags: [] },
        { id: "unlinked", preparation_id: null, practiced_at: "2026-10-19T00:00:00Z", issue_tags: [] },
      ] : [], error: null }).then(resolve),
    }; return query;
  } };
  mocks.owner.mockResolvedValue({ supabase });
  expect((await getInterviewInsights()).attempts.map((item) => item.id)).toEqual(["selected", "unlinked"]);
  for (const scope of ["general", "target-id"]) {
    const data = await getInterviewInsights(scope);
    expect(data.attempts.map((item) => item.id)).toEqual(["selected"]);
    expect(data.monthlyTrend[0].attempts).toBe(1);
  }
});


it("uses only active targets plus general preparation by default while allowing explicit paused history", async () => {
  const make = (id: string, context: string | null, category: string) => ({
    id, context_id: context, question_id: id, status: "developing", importance: "high", last_practiced_at: null, next_practice_at: null,
    interview_questions: { id, canonical_prompt: id, short_title: id, archetype_id: `archetype-${id}`, variant_kind: "canonical", question_style: "standard", difficulty: 1, category },
    interview_contexts: context ? { id: context, title: context, priority: 5, next_interview_at: null } : null,
  });
  const preps = [
    make("general", null, "knowledge"),
    make("active-behavioral", "active-target", "behavioral"),
    make("active-case", "active-target", "business_commercial"),
    make("paused-case", "paused-target", "business_commercial"),
  ];
  const fixtures: Record<string, Record<string, unknown>[]> = {
    interview_question_preparations: preps,
    interview_contexts: [
      { id: "active-target", title: "Active target", status: "active", priority: 5 },
      { id: "paused-target", title: "Paused target", status: "paused", priority: 2 },
    ],
    interview_questions: preps.map((prep) => prep.interview_questions),
    interview_question_competencies: [
      { question_id: "general", competency_id: "financial" },
      { question_id: "active-case", competency_id: "financial" },
      { question_id: "active-behavioral", competency_id: "leadership" },
    ],
    interview_competencies: [
      { id: "financial", key: "financial", label: "金融分析" },
      { id: "leadership", key: "leadership", label: "领导力" },
    ],
  };
  const supabase = { from(table: string) {
    let start = 0, end = 999;
    let onlyContext: string | null | undefined;
    const query = {
      select: () => query,
      eq: (field: string, value: unknown) => { if (field === "context_id") onlyContext = String(value); return query; },
      neq: () => query,
      not: () => query,
      is: (field: string, value: unknown) => { if (field === "context_id" && value === null) onlyContext = null; return query; },
      order: () => query,
      range: (first: number, last: number) => { start = first; end = last; return query; },
      then: (resolve: (value: unknown) => unknown) => {
        let rows = fixtures[table] ?? [];
        if (table === "interview_question_preparations" && onlyContext !== undefined) rows = rows.filter((row) => row.context_id === onlyContext);
        return Promise.resolve({ data: rows.slice(start, end + 1), error: null }).then(resolve);
      },
    };
    return query;
  } };
  mocks.owner.mockResolvedValue({ supabase });

  const all = await getPracticeQueue();
  expect(all.unavailable).toBe(false);
  expect(all.queue.map((item) => item.id).sort()).toEqual(["active-behavioral", "active-case", "general"].sort());
  expect(all.queue.find((item) => item.id === "active-case")?.practice_reasons).not.toContain("缺少可用故事");
  expect(all.queue.find((item) => item.id === "active-behavioral")?.practice_reasons).toContain("缺少可用故事");

  const insights = await getInterviewInsights();
  expect(insights.preparations.map((item) => item.id).sort()).toEqual(["active-behavioral", "active-case", "general"].sort());
  expect(insights.competencyCoverage.find((item) => item.tag === "financial")?.requiresStory).toBe(false);
  expect(insights.competencyCoverage.find((item) => item.tag === "financial")?.diagnosis).toBe("题目准备不足");
  expect(insights.competencyCoverage.find((item) => item.tag === "leadership")?.diagnosis).toBe("缺少可用故事");

  expect((await getPracticeQueue("paused-target")).queue.map((item) => item.id)).toEqual(["paused-case"]);
  expect((await getInterviewInsights("paused-target")).preparations.map((item) => item.id)).toEqual(["paused-case"]);
});

import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.owner }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { createInterviewAnswerVersion, saveInterviewWorkspace } from "@/features/interview/actions";
const prepId = "11111111-1111-4111-8111-111111111111", questionId = "22222222-2222-4222-8222-222222222222", answerId = "33333333-3333-4333-8333-333333333333";
const original = { id: answerId, user_id: "owner", preparation_id: prepId, answer_mode: "spoken", target_seconds: 90, language: "en", body_markdown: "Original complete answer", version_number: 1, status: "draft", source: "ai_draft", confirmed_at: null, archived_at: null, updated_at: "2026-10-01" };
type Row = Record<string, unknown>;
function database(answerPatch: Row = {}, collide = false) {
  const rows: Record<string, Row[]> = { interview_question_preparations: [{ id: prepId, question_id: questionId, user_id: "owner", target_language: "zh", archived_at: null }], interview_answer_versions: [{ ...original, ...answerPatch }], audit_logs: [] };
  const writes: Array<{ table: string; operation: string; value: Row }> = [];
  let conflicted = false;
  const supabase = { from(table: string) {
    let operation = "select", value: Row = {}, orderBy = "", limit = Infinity;
    const filters: Array<(row: Row) => boolean> = [];
    const execute = (single = false) => {
      let result = (rows[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
      if (operation === "insert") {
        if (table === "interview_answer_versions" && collide && !conflicted) { conflicted = true; rows[table].push({ ...original, id: "concurrent", version_number: 2 }); return { data: null, error: { code: "23505" } }; }
        const inserted = { ...value, id: `inserted-${rows[table].length}`, updated_at: "2026-10-02", archived_at: null };
        rows[table].push(inserted); result = [inserted]; writes.push({ table, operation, value });
      } else if (operation === "update") { result.forEach((row) => Object.assign(row, value)); writes.push({ table, operation, value }); }
      if (orderBy) result = result.toSorted((a, b) => Number(b[orderBy]) - Number(a[orderBy]));
      result = result.slice(0, limit); return { data: single ? result[0] ?? null : result, error: null };
    };
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
      neq: (key: string, value: unknown) => { filters.push((row) => row[key] !== value); return query; },
      is: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return query; },
      order: (key: string) => { orderBy = key; return query; },
      limit: (value: number) => { limit = value; return query; },
      insert: (input: Row) => { operation = "insert"; value = input; return query; },
      update: (input: Row) => { operation = "update"; value = input; return query; },
      single: async () => execute(true), maybeSingle: async () => execute(true),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
    }; return query;
  } };
  mocks.owner.mockResolvedValue({ supabase, userId: "owner" }); return { rows, writes };
}
function form(patch: Record<string, string> = {}) {
  const data = new FormData(); Object.entries({ preparation_id: prepId, question_id: questionId, answer_id: answerId, thoughts: "Updated thoughts", answer: original.body_markdown, ...patch }).forEach(([key, value]) => data.set(key, value)); return data;
}
beforeEach(() => vi.clearAllMocks());
describe("workspace save ownership and provenance", () => {
  it("saves thoughts without modifying, confirming or duplicating an AI draft", async () => {
    const { rows, writes } = database(); const result = await saveInterviewWorkspace(form());
    expect(result.answerMeta).toMatchObject({ source: "ai_draft", status: "draft", confirmed_at: null });
    expect(rows.interview_answer_versions).toEqual([original]);
    expect(writes.filter((write) => write.table === "interview_answer_versions")).toEqual([]);
  });
  it("does not overwrite externally changed answers on a thought-only request", async () => {
    const { rows } = database({ body_markdown: "Updated elsewhere" });
    await saveInterviewWorkspace(form({ answer_changed: "0" })); expect(rows.interview_answer_versions[0].body_markdown).toBe("Updated elsewhere");
  });
  it("resolves unchanged legacy requests without an answer ID instead of duplicating", async () => {
    const { rows } = database(); await saveInterviewWorkspace(form({ answer_id: "" })); expect(rows.interview_answer_versions).toHaveLength(1);
  });
  it.each(["draft", "current"])("appends edits to %s while retaining source, language, duration and original body", async (status) => {
    const { rows } = database({ status }); const result = await saveInterviewWorkspace(form({ answer: "Edited complete answer" }));
    expect(rows.interview_answer_versions[0]).toMatchObject({ ...original, status });
    expect(rows.interview_answer_versions[1]).toMatchObject({ language: "en", target_seconds: 90, body_markdown: "Edited complete answer", status: "draft", source: "ai_edited", confirmed_at: null, version_number: 2 });
    expect(result.answerId).toBe(rows.interview_answer_versions[1].id);
  });
  it("retries competing version inserts without replacing another answer", async () => {
    const { rows } = database({}, true); await saveInterviewWorkspace(form({ answer: "Edited" })); expect(rows.interview_answer_versions.at(-1)?.version_number).toBe(3);
  });
  it("rejects a cross-preparation answer before any write", async () => {
    const { writes } = database({ preparation_id: "other" }); await expect(saveInterviewWorkspace(form())).rejects.toThrow(); expect(writes).toEqual([]);
  });
  it("rejects blanking an existing answer without retiring versions", async () => {
    const { writes, rows } = database(); await expect(saveInterviewWorkspace(form({ answer: " \n " }))).rejects.toThrow("答案不能为空"); expect(writes).toEqual([]); expect(rows.interview_answer_versions).toEqual([original]);
  });
  it("returns no answer for a truly empty preparation", async () => {
    const { rows } = database(); rows.interview_answer_versions = []; expect(await saveInterviewWorkspace(form({ answer_id: "", answer: "" }))).toEqual({ answerId: null, answerMeta: null });
  });
});

it("pins the newly saved and confirmed detail version rather than its old draft", async () => {
  const { rows } = database();
  const data = new FormData();
  Object.entries({ preparation_id: prepId, answer_mode: "spoken", language: "en", target_seconds: "90", body_markdown: "Reviewed and edited answer", change_note: "", based_on_answer_id: answerId, make_current: "1", return_to_question: "1" }).forEach(([key, value]) => data.set(key, value));
  await createInterviewAnswerVersion(data);
  const saved = rows.interview_answer_versions[1];
  expect(saved).toMatchObject({ source: "ai_edited", status: "current", body_markdown: "Reviewed and edited answer" });
  expect(saved.confirmed_at).toBeTruthy();
  expect(rows.interview_answer_versions[0]).toEqual(original);
  expect(mocks.redirect).toHaveBeenCalledWith(`/career/interview/questions/${questionId}?answer=${saved.id}`);
});

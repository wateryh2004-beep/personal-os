import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]>, fail: "", primaryError: false, selected: [] as string[], ordered: [] as string[], pages: [] as number[], documentIds: [] as string[] }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: async () => ({ supabase: { from: (table: string) => {
  const result = () => ({ data: db.fail === table ? null : db.rows[table] ?? [], error: db.fail === table ? { message: "synthetic error" } : null });
  const query = { select: (fields: string) => { if (table === "experiences") db.selected.push(fields); return query; }, is: () => query, eq: () => query, in: (_key: string, ids: string[]) => { if (table === "documents") db.documentIds = ids; return query; }, or: () => query,
    order: (key: string) => { db.ordered.push(`${table}:${key}`); return query; }, limit: () => Promise.resolve(result()),
    maybeSingle: () => Promise.resolve({ data: db.rows[table]?.[0] ?? null, error: db.primaryError ? { message: "internal secret" } : null }),
    range: (from: number, to: number) => { db.pages.push(from); const r = result(); return Promise.resolve({ ...r, data: r.data?.slice(from, to + 1) ?? null }); },
  }; return query;
} } }) }));
import { getExperience, getExperiences, getCareerTarget } from "@/features/career/queries";
beforeEach(() => { db.rows = {}; db.fail = ""; db.primaryError = false; db.selected = []; db.ordered = []; db.pages = []; db.documentIds = []; });
it("reads all metadata pages in stable order and reports a failed page honestly", async () => {
  db.rows.experiences = Array.from({ length: 501 }, (_, index) => ({ id: String(index) }));
  const result = await getExperiences(); expect(result.experiences).toHaveLength(501); expect(result.unavailable).toBe(false); expect(db.pages).toEqual([0, 500]);
  expect(db.selected[0]).not.toBe("*"); expect(db.selected[0]).not.toContain("markdown"); expect(db.ordered).toContain("experiences:id");
  db.fail = "experiences"; expect(await getExperiences()).toEqual({ experiences: [], unavailable: true });
});
it("does not turn a primary read error into a not-found record", async () => {
  db.primaryError = true; await expect(getExperience("e1")).rejects.toThrow("暂时无法读取经历");
  db.primaryError = false; expect(await getExperience("missing")).toBeNull();
});
it("keeps completed fact history pages and exposes partial read failures", async () => {
  db.rows.experiences = [{ id: "e1" }]; db.rows.experience_facts = [{ id: "f1" }];
  db.rows.experience_fact_versions = Array.from({ length: 501 }, (_, index) => ({ id: String(index), fact_id: "f1" }));
  let result = await getExperience("e1"); expect(result?.versions).toHaveLength(501); expect(result?.unavailable).toBe(false);
  db.fail = "experience_outputs"; result = await getExperience("e1"); expect(result?.unavailable).toBe(true); expect(result?.facts).toHaveLength(1);
});
it("reads evidence links in both directions and uses the owner's configured timezone", async () => {
  db.rows.experiences = [{ id: "e1" }]; db.rows.profiles = [{ timezone: "America/New_York" }];
  db.rows.entity_links = [{ target_type: "document", target_id: "d1" }, { source_type: "document", source_id: "d2" }, { source_type: "document", source_id: "d1" }];
  const result = await getExperience("e1"); expect(db.documentIds).toEqual(["d1", "d2"]); expect(result?.timezone).toBe("America/New_York");
});

it("loads target relations in complete stable metadata pages without answer or private preparation bodies", async()=>{
 db.rows.interview_contexts=[{id:"t"}];
 db.rows.interview_questions=Array.from({length:501},(_,i)=>({id:String(i)}));
 db.rows.profiles=[{timezone:"America/New_York"}];
 const result=await getCareerTarget("t");
 expect(result?.questions).toHaveLength(501); expect(result?.timezone).toBe("America/New_York"); expect(result?.unavailable).toBe(false);
 expect(db.ordered).toContain("interview_questions:id");
 db.fail="interview_questions"; expect((await getCareerTarget("t"))?.unavailable).toBe(true);
 db.primaryError=true; await expect(getCareerTarget("t")).rejects.toThrow("暂时无法读取岗位");
 db.primaryError=false; db.rows.interview_contexts=[]; expect(await getCareerTarget("missing")).toBeNull();
});

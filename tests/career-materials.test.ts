import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ owner: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.owner }));
import { careerDocumentEndpoint, careerMaterialReadHref, getCareerMaterials, type CareerMaterialDocument } from "@/features/career/materials";

type Row = Record<string, unknown>;
type Call = { table: string; filters: Array<[string, string, unknown]>; columns: string };
function fakeDatabase(tables: Record<string, Row[]>, errorTable?: string) {
  const calls: Call[] = [];
  const from = vi.fn((table: string) => {
    const call: Call = { table, filters: [], columns: "" };
    calls.push(call);
    let start = 0; let end = 499;
    const query = {
      select: vi.fn((columns: string) => { call.columns = columns; return query; }),
      eq: vi.fn((key: string, value: unknown) => { call.filters.push(["eq", key, value]); return query; }),
      is: vi.fn((key: string, value: unknown) => { call.filters.push(["is", key, value]); return query; }),
      in: vi.fn((key: string, value: unknown[]) => { call.filters.push(["in", key, value]); return query; }),
      or: vi.fn((value: string) => { call.filters.push(["or", value, null]); return query; }),
      order: vi.fn(() => query),
      range: vi.fn((a: number, b: number) => { start = a; end = b; return query; }),
      then: (resolve: (value: { data: Row[] | null; error: null | { message: string } }) => void) => {
        let data = [...tables[table] ?? []];
        for (const [kind, key, value] of call.filters) {
          if (kind === "or") data = data.filter((row) => row.source_type === "document" || row.target_type === "document");
          else if (kind === "in") data = data.filter((row) => (value as unknown[]).includes(row[key]));
          else data = data.filter((row) => row[key] === value);
        }
        return Promise.resolve(resolve(table === errorTable ? { data: null, error: { message: "not available" } } : { data: data.slice(start, end + 1), error: null }));
      },
    };
    return query;
  });
  mocks.owner.mockResolvedValue({ userId: "owner", supabase: { from } });
  return calls;
}
const owned = (row: Row): Row => ({ user_id: "owner", archived_at: null, ...row });
const document = (id: string, extra: Row = {}): Row => owned({ id, title: id, original_filename: `${id}.pdf`, document_type: "other", confidentiality_level: "private", ai_visibility: "normal", storage_provider: "cloudflare_r2", storage_state: "available", uploaded_at: "2026-10-01T08:00:00Z", ...extra });
const resume = (id: string, documentId: string | null): Row => owned({ id, title: "Synthetic resume", version_label: "v1", status: "draft", content_markdown: "# Synthetic content", document_id: documentId, updated_at: "2026-10-01T08:00:00Z" });
const link = (id: string, sourceType: string, sourceId: string, targetType: string, targetId: string, extra: Row = {}): Row => owned({ id, source_type: sourceType, source_id: sourceId, target_type: targetType, target_id: targetId, ...extra });

beforeEach(() => vi.resetAllMocks());

describe("Career materials association boundary", () => {
  it("includes fact, certification, resume, and bidirectional Career links; excludes unrelated, foreign, archived and orphaned records", async () => {
    const calls = fakeDatabase({
      experience_facts: [owned({ id: "f1", experience_id: "exp", source_document_id: "fact" }), owned({ id: "f2", experience_id: "archived-exp", source_document_id: "orphan" }), owned({ id: "f3", experience_id: "exp", source_document_id: "archived-fact", archived_at: "2026-01-01" })],
      experiences: [owned({ id: "exp" }), owned({ id: "archived-exp", archived_at: "2026-01-01" })],
      certifications: [owned({ id: "cert", name: "Synthetic certificate", document_id: "cert" }), owned({ id: "foreign-doc", name: "Foreign doc", document_id: "foreign" })],
      resume_versions: [resume("resume", "resume"), { ...resume("not-mine", "not-mine"), user_id: "other" }],
      skills: [owned({ id: "skill" }), owned({ id: "archived-skill", archived_at: "2026-01-01" })],
      entity_links: [link("l1", "document", "reverse", "skill", "skill"), link("l2", "experience", "exp", "document", "forward"), link("l3", "note", "note", "document", "note-only"), link("l4", "skill", "archived-skill", "document", "archived-source"), link("l5", "skill", "skill", "document", "archived-link", { archived_at: "2026-01-01" }), link("l6", "experience", "exp", "document", "fact")],
      documents: ["fact", "cert", "resume", "reverse", "forward", "orphan", "archived-fact", "note-only", "archived-source", "archived-link", "unrelated", "not-mine"].map((id) => document(id)).concat(document("foreign", { user_id: "other" })),
    });
    const result = await getCareerMaterials();
    expect(result.documents.map((item) => item.id).sort()).toEqual(["cert", "fact", "forward", "resume", "reverse"]);
    expect(result.resumes.map((item) => item.id)).toEqual(["resume"]);
    expect(result.unavailable).toBe(false);
    expect(result.associations).toContainEqual({ documentId: "fact", label: "经历事实的来源", href: "/career/experiences/exp" });
    for (const call of calls) {
      expect(call.filters).toContainEqual(["eq", "user_id", "owner"]);
      expect(call.filters).toContainEqual(["is", "archived_at", null]);
      if (call.table === "documents") expect(call.filters.some(([kind, key]) => kind === "in" && key === "id")).toBe(true);
    }
  });

  it("does not query private documents without Career associations or on an association failure", async () => {
    for (const error of [undefined, "entity_links"]) {
      const calls = fakeDatabase({ documents: [document("private")] }, error);
      const result = await getCareerMaterials();
      expect(result.documents).toEqual([]);
      expect(calls.some((call) => call.table === "documents")).toBe(false);
      expect(result.unavailable).toBe(Boolean(error));
    }
  });

  it("keeps owner-readable AI-never and legacy files, excludes unavailable files, and uses only a supported read route", async () => {
    fakeDatabase({
      certifications: ["never", "legacy", "pending", "archived"].map((id) => owned({ id, name: id, document_id: id })),
      documents: [document("never", { ai_visibility: "never" }), document("legacy", { storage_provider: "supabase_storage" }), document("pending", { storage_state: "pending" }), document("archived", { archived_at: "2026-01-01" })],
    });
    const result = await getCareerMaterials();
    expect(result.documents.map((item) => item.id).sort()).toEqual(["legacy", "never"]);
    const [legacy, never] = ["legacy", "never"].map((id) => result.documents.find((row) => row.id === id)!);
    expect(careerMaterialReadHref(legacy)).toBeNull();
    expect(careerMaterialReadHref(never)).toBe("/api/files/never/download?inline=1");
    expect(never.ai_visibility).toBe("never");
    expect(careerMaterialReadHref({ ...never, storage_state: "pending" })).toBeNull();
  });

  it("paginates associations and bounds ID filters instead of silently truncating at the API row cap", async () => {
    const ids = Array.from({ length: 501 }, (_, index) => `doc-${index}`);
    const calls = fakeDatabase({ certifications: ids.map((id) => owned({ id, name: id, document_id: id })), documents: ids.map((id) => document(id)) });
    const result = await getCareerMaterials();
    expect(result.documents).toHaveLength(501);
    expect(calls.filter((call) => call.table === "certifications")).toHaveLength(2);
    for (const call of calls.filter((call) => call.table === "documents")) {
      expect((call.filters.find(([kind]) => kind === "in")![2] as string[]).length).toBeLessThanOrEqual(100);
    }
  });

  it("does not treat arbitrary linked entities or object prototype keys as Career records", () => {
    for (const type of ["note", "task", "project", "document", "toString", "__proto__"]) {
      expect(careerDocumentEndpoint({ source_type: type, source_id: "source", target_type: "document", target_id: "doc" })).toBeNull();
    }
    expect(careerMaterialReadHref(document("a/b") as CareerMaterialDocument)).toBe("/api/files/a%2Fb/download?inline=1");
  });
});

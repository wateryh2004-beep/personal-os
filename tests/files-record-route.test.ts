import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwnerApi: mocks.owner, apiAuthenticationFailure: (error: unknown) => error === "unauthenticated" || error === "foreign" ? Response.json({ error: "denied" }, { status: error === "foreign" ? 403 : 401 }) : null }));
import { GET } from "@/app/api/files/[documentId]/record/route";
const ownerId = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222";
let record: Record<string, unknown>;
let attached: boolean, failed: boolean;
const conditions = new Map<string, [string, unknown][]>();
const selects = new Map<string, string>();
const from = vi.fn((table: string) => {
 const filters: [string, unknown][] = []; conditions.set(table, filters);
 const result = () => failed ? { data: null, error: new Error("Synthetic SQL error") } : table === "documents" ? { data: filters.every(([key, value]) => record[key] === value) ? record : null, error: null } : { data: attached ? [{ id: "attachment" }] : [], error: null };
 const query = {
  select: (columns: string) => { selects.set(table, columns); return query; },
  eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
  is: (key: string, value: unknown) => { filters.push([key, value]); return query; },
  maybeSingle: async () => result(), limit: async () => result(),
 };
 return query;
});
const request = () => new Request(`https://example.test/api/files/${id}/record?user_id=untrusted`);
const context = { params: Promise.resolve({ documentId: id }) };
beforeEach(() => {
 from.mockClear(); conditions.clear(); selects.clear(); attached = false; failed = false;
 record = { id, user_id: ownerId, title: "Synthetic canonical file", original_filename: "original.pdf", mime_type: "application/pdf", file_size: 4, folder_id: null, uploaded_at: "2026-10-27", created_at: "2026-10-27", archived_at: null, vault_group_id: null, storage_provider: "cloudflare_r2", storage_state: "available", ai_visibility: "normal", text_extraction_status: "completed", extracted_character_count: 123, mutation_revision: 5, storage_path: "private/path/must-not-return", extracted_text: "must-not-return", checksum: "must-not-return" };
 mocks.owner.mockResolvedValue({ userId: ownerId, supabase: { from } });
});
function privateResponse(response: Response) { expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0"); expect(response.headers.get("Vary")).toBe("Cookie"); }
it("reads one owner-scoped available non-Vault file, with a finite list DTO and attachment exclusion", async () => {
 const response = await GET(request(), context); expect(response.status).toBe(200); privateResponse(response);
 const body = await response.json(); expect(body.file).toMatchObject({ id, title: record.title, mutation_revision: 5, extracted_character_count: 123 });
 expect(Object.keys(body.file)).toEqual(["id", "title", "original_filename", "mime_type", "file_size", "folder_id", "uploaded_at", "created_at", "archived_at", "ai_visibility", "text_extraction_status", "extracted_character_count", "mutation_revision"]);
 expect(selects.get("documents")).not.toMatch(/storage_path|extracted_text|checksum|upload_url|token|signed_url/i);
 expect(conditions.get("documents")).toEqual([["id", id], ["user_id", ownerId], ["storage_provider", "cloudflare_r2"], ["storage_state", "available"], ["archived_at", null], ["vault_group_id", null]]);
 expect(conditions.get("entity_links")).toEqual([["user_id", ownerId], ["target_id", id], ["source_type", "note"], ["target_type", "document"], ["relationship_type", "attachment"], ["archived_at", null]]);
});
it.each([["user_id", "foreign-owner"], ["storage_state", "pending"], ["storage_state", "cancelled"], ["archived_at", "2026-10-27"], ["vault_group_id", "hidden-vault"], ["storage_provider", "other-provider"]])("does not expose %s=%s", async (key, value) => {
 record[key] = value; const response = await GET(request(), context); privateResponse(response); expect(await response.json()).toEqual({ file: null });
});
it("excludes Notes attachments even when the raw document is available", async () => { attached = true; const response = await GET(request(), context); expect(await response.json()).toEqual({ file: null }); });
it.each(["unauthenticated", "foreign"])("rejects %s before any query", async error => { mocks.owner.mockRejectedValue(error); const response = await GET(request(), context); expect(response.status).toBe(error === "foreign" ? 403 : 401); privateResponse(response); expect(from).not.toHaveBeenCalled(); });
it("rejects malformed IDs without a document scan", async () => { const response = await GET(request(), { params: Promise.resolve({ documentId: "not-a-uuid" }) }); expect(response.status).toBe(400); expect(from).not.toHaveBeenCalled(); });
it("preserves canonical read failures instead of inventing an empty successful row", async () => { failed = true; const response = await GET(request(), context); expect(response.status).toBe(503); privateResponse(response); expect(await response.json()).toHaveProperty("error"); });

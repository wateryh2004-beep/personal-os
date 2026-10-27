import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwnerApi: mocks.owner, apiAuthenticationFailure: (error: unknown) => error === "unauthenticated" || error === "foreign" ? Response.json({ error: "denied" }, { status: error === "foreign" ? 403 : 401 }) : null }));
import { GET } from "@/app/api/files/publication-directory/route";
const ownerId = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let documents: Record<string, unknown>[], attached: Set<string>, failed: boolean;
const calls: { table: string; filters: [string, unknown][]; limit?: number; columns?: string; order?: string }[] = [];
let active: number, maximum: number;
const from = vi.fn((table: string) => {
 const call: typeof calls[number] = { table, filters: [] }; calls.push(call);
 const query = {
  select: (columns: string) => { call.columns = columns; return query; }, eq: (key: string, value: unknown) => { call.filters.push([key, value]); return query; },
  is: (key: string, value: unknown) => { call.filters.push([key, value]); return query; }, gt: (key: string, value: unknown) => { call.filters.push([`gt:${key}`, value]); return query; },
  ilike: (key: string, value: unknown) => { call.filters.push([`ilike:${key}`, value]); return query; }, order: (column: string) => { call.order = column; return query; },
  limit: async (limit: number) => {
   call.limit = limit; active++; maximum = Math.max(maximum, active); await Promise.resolve(); active--;
   if (failed) return { data: null, error: new Error("Synthetic unavailable") };
   if (table === "entity_links") return { data: attached.has(String(call.filters.find(([key]) => key === "target_id")?.[1])) ? [{ id: "attachment" }] : [], error: null };
   const rows = documents.filter(row => call.filters.every(([key, value]) => key.startsWith("gt:") ? String(row[key.slice(3)]) > String(value) : key.startsWith("ilike:") ? true : row[key] === value));
   return { data: rows.sort((a, b) => String(a.id).localeCompare(String(b.id))).slice(0, limit), error: null };
  },
 };
 return query;
});
const request = (query = "") => new Request(`https://example.test/api/files/publication-directory${query}`);
beforeEach(() => {
 calls.length = 0; from.mockClear(); attached = new Set(); failed = false; active = maximum = 0;
 documents = Array.from({ length: 22 }, (_, n) => ({ id: id(n), user_id: ownerId, title: `Synthetic ${n}`, original_filename: `original-${n}.txt`, mime_type: "text/plain", file_size: 4, folder_id: null, uploaded_at: "2026-10-27", created_at: "2026-10-27", archived_at: null, vault_group_id: null, storage_provider: "cloudflare_r2", storage_state: "available", ai_visibility: "normal", text_extraction_status: "completed", extracted_character_count: 4, mutation_revision: 5, storage_path: "must-not-return", extracted_text: "must-not-return" }));
 mocks.owner.mockResolvedValue({ userId: ownerId, supabase: { from } });
});
it("provides a real default owner directory in finite ID order with 20+1 sentinel and an explicit next cursor", async () => {
 const response = await GET(request()); const body = await response.json(); expect(response.status).toBe(200);
 expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0"); expect(response.headers.get("vary")).toBe("Cookie");
 expect(body.files).toHaveLength(20); expect(body.next).toBe(id(19)); expect(body.files[0].id).toBe(id(0)); expect(body.files[19].id).toBe(id(19));
 expect(body.files[0]).not.toHaveProperty("storage_path"); expect(body.files[0]).not.toHaveProperty("extracted_text");
 expect(calls[0]).toMatchObject({ table: "documents", order: "id", limit: 21 });
 expect(calls[0].filters).toEqual([["user_id", ownerId], ["storage_provider", "cloudflare_r2"], ["storage_state", "available"], ["archived_at", null], ["vault_group_id", null]]);
 expect(calls.filter(call => call.table === "entity_links")).toHaveLength(20); expect(maximum).toBeLessThanOrEqual(2);
 const next = await (await GET(request(`?after=${body.next}`))).json(); expect(next.files.map((row: { id: string }) => row.id)).toEqual([id(20), id(21)]); expect(next.next).toBeNull();
});
it("keeps exclusions accurate even if every scanned document is a Notes attachment", async () => {
 attached = new Set(documents.slice(0, 20).map(row => String(row.id)));
 const body = await (await GET(request())).json(); expect(body.files).toEqual([]); expect(body.next).toBe(id(19));
 for (const call of calls.filter(call => call.table === "entity_links")) expect(call).toMatchObject({ limit: 1, filters: expect.arrayContaining([["user_id", ownerId], ["source_type", "note"], ["target_type", "document"], ["relationship_type", "attachment"], ["archived_at", null]]) });
});
it("excludes other owners, Vault, archived and pending rows without trusting request identity", async () => {
 documents[0].user_id = "foreign"; documents[1].vault_group_id = "vault"; documents[2].archived_at = "today"; documents[3].storage_state = "pending";
 const body = await (await GET(request())).json(); expect(body.files.map((row: { id: string }) => row.id)).not.toEqual(expect.arrayContaining([id(0), id(1), id(2), id(3)]));
 expect((await GET(request("?user_id=foreign"))).status).toBe(400);
});
it("allows optional literal title search and rejects duplicate/invalid cursor parameters", async () => {
 await GET(request("?q=100%25_test")); expect(calls[0].filters).toContainEqual(["ilike:title", "%100\\%\\_test%"]);
 expect((await GET(request("?after=not-a-uuid"))).status).toBe(400); expect((await GET(request(`?after=${id(0)}&after=${id(1)}`))).status).toBe(400);
});
it.each(["unauthenticated", "foreign"])("rejects %s before querying", async error => { mocks.owner.mockRejectedValue(error); expect((await GET(request())).status).toBe(error === "foreign" ? 403 : 401); expect(from).not.toHaveBeenCalled(); });
it("does not mistake a real query failure for a completed empty page", async () => { failed = true; expect((await GET(request())).status).toBe(503); });

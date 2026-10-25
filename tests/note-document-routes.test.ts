import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as documentGet } from "@/app/api/notes/[noteId]/document/route";
import { GET as detailsGet } from "@/app/api/notes/[noteId]/details/route";
import { OwnerAuthenticationError, requireOwner, requireOwnerApi } from "@/lib/auth/require-owner";

vi.mock("@/lib/auth/require-owner", async (original) => ({ ...await original<typeof import("@/lib/auth/require-owner")>(), requireOwner: vi.fn(), requireOwnerApi: vi.fn() }));
const id = "22222222-2222-4222-8222-222222222222";
const ownerId = "11111111-1111-4111-8111-111111111111";
const request = new Request("https://app.test/api/notes/document");
const params = { params: Promise.resolve({ noteId: id }) };
beforeEach(() => vi.resetAllMocks());
describe("note detail HTTP owner and critical-path contracts", () => {
  it.each([documentGet, detailsGet])("denies anonymous and non-owner requests before any document access", async (get) => {
    for (const [code, status] of [["unauthenticated", 401], ["not-authorized", 403]] as const) {
      vi.mocked(requireOwnerApi).mockRejectedValue(new OwnerAuthenticationError(code));
      const response = await get(request, params); expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toContain("no-store"); expect(requireOwner).not.toHaveBeenCalled();
    }
  });
  it("opens the body without querying versions, relations, AI or folder trees", async () => {
    const reads: URL[] = [];
    const supabase = createClient("https://synthetic.test", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input) => {
      const url = new URL(String(input)); reads.push(url);
      return Response.json(url.pathname.endsWith("/notes") ? { id, title: "正文优先", body_markdown: "合成正文", revision: 4 } : []);
    } } });
    vi.mocked(requireOwnerApi).mockResolvedValue({ supabase, userId: ownerId, email: "owner@example.test" });
    const response = await documentGet(request, params); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ note: { body_markdown: "合成正文", revision: 4 }, attachments: [] });
    expect(reads.map((u) => u.pathname).sort()).toEqual(["/rest/v1/entity_links", "/rest/v1/notes"]);
    expect(reads.every((u) => u.searchParams.get("user_id") === `eq.${ownerId}`)).toBe(true);
  });
  it("distinguishes missing notes from database failures and preserves primary PDF metadata", async () => {
    let mode = "pdf";
    const supabase = createClient("https://synthetic.test", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/notes")) return mode === "missing" ? Response.json(null) : mode === "failed" ? Response.json({ message: "database unavailable" }, { status: 500 }) : Response.json({ id, revision: 1 });
      return Response.json(url.pathname.endsWith("/entity_links") ? [{ target_id: id, metadata: { document_role: "primary_pdf" } }] : [{ id, title: "原件", mime_type: "application/pdf" }]);
    } } });
    vi.mocked(requireOwnerApi).mockResolvedValue({ supabase, userId: ownerId, email: "owner@example.test" });
    expect((await (await documentGet(request, params)).json()).attachments[0].role).toBe("primary_pdf");
    mode = "missing"; expect((await documentGet(request, params)).status).toBe(404);
    mode = "failed"; const failed = await documentGet(request, params); expect(failed.status).toBe(503); expect(failed.headers.get("cache-control")).toContain("no-store");
  });
});

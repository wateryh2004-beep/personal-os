import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import type { Database } from "@/types/database";
const fixture = vi.hoisted(() => ({ document: vi.fn() }));
vi.mock("@/features/notes/queries", () => ({ getNoteDocument: fixture.document }));
import { readWorkbenchEntity } from "@/features/workbench/entity-queries";
const userId = "00000000-0000-4000-8000-000000000001";
const id = "10000000-0000-4000-8000-000000000001";
const hidden = "20000000-0000-4000-8000-000000000001";
const publicDocument = "20000000-0000-4000-8000-000000000002";
afterEach(() => { vi.unstubAllGlobals(); fixture.document.mockReset(); });
function owner(fetcher: typeof fetch) { return { userId, email: "synthetic@example.com", supabase: createClient<Database>("https://synthetic.local", "synthetic-publishable", { global: { fetch: fetcher } }) }; }
it("does not disclose hidden file metadata through an owner-only workbench read", async () => {
  const requests: URL[] = [];
  const context = owner(async (input) => {
    const url = new URL(String(input)); requests.push(url);
    const hiddenAllowed = url.searchParams.get("vault_group_id") !== "is.null";
    return Response.json(hiddenAllowed ? { id, title: "Hidden title", original_filename: "private.pdf", mime_type: "application/pdf", file_size: 800, updated_at: "2026-10-25T00:00:00Z" } : null);
  });
  expect(await readWorkbenchEntity({ kind: "document", id }, context)).toEqual({ status: "missing", ref: { kind: "document", id } });
  expect(requests[0].searchParams.get("vault_group_id")).toBe("is.null");
  expect(requests[0].searchParams.get("user_id")).toBe(`eq.${userId}`);
});
it("requires ordinary note visibility before reading any body or attachments", async () => {
  const context = owner(async () => Response.json(null));
  expect((await readWorkbenchEntity({ kind: "note", id }, context)).status).toBe("missing");
  expect(fixture.document).not.toHaveBeenCalled();
});
it("filters hidden note attachments before choosing the primary PDF", async () => {
  fixture.document.mockResolvedValue({ note: { id, title: "Ordinary note", body_markdown: "Synthetic body", updated_at: "2026-10-25T00:00:00Z", status: "active", archived_at: null, deleted_at: null }, attachments: [
    { id: hidden, title: "Hidden PDF", role: "primary_pdf", mime_type: "application/pdf", original_filename: "hidden.pdf", file_size: 80 },
    { id: publicDocument, title: "Allowed attachment", role: "attachment", mime_type: "text/plain", original_filename: "public.txt", file_size: 80 },
  ] });
  const context = owner(async (input) => { const url = new URL(String(input)); if (url.pathname.endsWith("/notes")) return Response.json({ id }); expect(url.searchParams.get("vault_group_id")).toBe("is.null"); return Response.json([{ id: publicDocument }]); });
  const result = await readWorkbenchEntity({ kind: "note", id }, context);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error("ordinary note failed");
  expect(result.entity.attachments?.map((file) => file.id)).toEqual([publicDocument]); expect(result.entity.pdf).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain("Hidden PDF");
});

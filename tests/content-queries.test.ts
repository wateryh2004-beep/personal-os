import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { readContent } from "@/features/content/queries";

const id = "10000000-0000-4000-8000-000000000001";
function owner(reply: (url: URL) => unknown) {
  const requests: URL[] = [];
  const supabase = createClient("https://content.example.test", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input) => {
    const url = new URL(String(input)); requests.push(url);
    return Response.json(reply(url));
  } } });
  return { requests, identity: { supabase, userId: id, email: "owner@example.test" } };
}
describe("bounded owner content reads", () => {
  it("finds only metadata with literal text and all privacy filters", async () => {
    const { identity, requests } = owner(() => [{ id, title: "50%_", revision: 3 }]);
    const result = await readContent(identity, { action: "find", kind: "note", q: "50%_", limit: 2 });
    expect(result).toEqual({ results: [{ id, title: "50%_", revision: 3, href: `/notes/${id}/read` }] });
    const params = requests[0].searchParams;
    expect(params.get("user_id")).toBe(`eq.${id}`);
    expect(params.get("ai_visibility")).toBe("eq.normal");
    expect(params.get("status")).toBe("eq.active");
    expect(params.get("archived_at")).toBe("is.null");
    expect(params.get("deleted_at")).toBe("is.null");
    expect(params.get("title")).toBe("ilike.%50\\%\\_%");
    expect(params.get("select")).not.toContain("body_markdown");
    expect(params.get("limit")).toBe("2");
  });
  it("returns no record rather than falling back around owner or privacy restrictions", async () => {
    const { identity, requests } = owner(() => null);
    expect(await readContent(identity, { action: "read", kind: "note", id })).toBeNull();
    expect(requests).toHaveLength(1);
  });
  it("keeps source and raw Markdown separate", async () => {
    const original = " # exact\n\n100−20−15=65 vs 90\n";
    const { identity, requests } = owner((url) => url.pathname.endsWith("notes") ? { id, body_markdown: original, revision: 2 } : [{ after_data: { source: "codex", sourceUrl: "https://example.test/chosen" }, created_at: "2026-10-04" }]);
    const result = await readContent(identity, { action: "read", kind: "note", id });
    expect(result).toMatchObject({ body_markdown: original, sources: [{ source: "codex", sourceUrl: "https://example.test/chosen", savedAt: "2026-10-04" }] });
    expect(requests.every((url) => url.searchParams.get("user_id") === `eq.${id}`)).toBe(true);
  });
});

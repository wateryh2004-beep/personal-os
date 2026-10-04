import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireOwner } from "@/lib/auth/require-owner";
import { searchNotesWorkspace } from "@/features/notes/queries";

vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: vi.fn() }));
const ownerId = "00000000-0000-4000-8000-000000000001";
const folderId = "00000000-0000-4000-8000-000000000002";
const row = (index: number, title = "日志", body = "研究进展") => ({
  id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  user_id: ownerId, title, body_markdown: body, folder_id: folderId,
  updated_at: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(), pinned_at: null,
  content_origin: "human", deleted_at: null as string | null, status: "active",
});

function database(rows: ReturnType<typeof row>[], fail = false) {
  const requests: URL[] = [];
  const supabase = createClient("https://notes.example.test", "synthetic-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      if (fail) return new Response(JSON.stringify({ code: "42501", message: "denied" }), { status: 403 });
      const column = url.searchParams.has("title") ? "title" : "body_markdown";
      const filter = url.searchParams.get(column)!;
      expect(filter.startsWith("imatch.")).toBe(true);
      const pattern = new RegExp(filter.slice("imatch.".length), "iu");
      const result = rows.filter((note) => pattern.test(note[column])
        && url.searchParams.get("user_id") === `eq.${note.user_id}`
        && note.deleted_at === null && note.status !== "archived" && note.status !== "trashed"
        && (!url.searchParams.has("folder_id") || url.searchParams.get("folder_id") === `eq.${note.folder_id}`))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id))
        .slice(0, Number(url.searchParams.get("limit")));
      return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
    } },
  });
  vi.mocked(requireOwner).mockResolvedValue({ supabase, userId: ownerId, email: "owner@example.test" });
  return requests;
}

beforeEach(() => vi.clearAllMocks());

describe("Owner-scoped Notes search", () => {
  it("reserves room for an old title match even when newer body hits fill the result limit", async () => {
    const requests = database([row(0, "研究方法", `${"旧内容 ".repeat(100)}研究进展`), ...Array.from({ length: 40 }, (_, index) => row(index + 1))]);
    const result = await searchNotesWorkspace("研究", null, 30);
    expect(result).toHaveLength(30);
    expect(result[0].title).toBe("研究方法");
    expect(result[0].excerpt).toContain("研究进展");
    expect(result[0]).not.toHaveProperty("body_markdown");
    expect(new Set(result.map(({ id }) => id)).size).toBe(result.length);
    expect(requests).toHaveLength(2);
    expect(requests.map((url) => url.searchParams.get("limit"))).toEqual(["30", "30"]);
  });

  it("applies owner, active-state and selected-folder filters to both bounded reads", async () => {
    const foreign = { ...row(1), user_id: "other-owner" };
    const otherFolder = { ...row(2), folder_id: "00000000-0000-4000-8000-000000000099" };
    const requests = database([row(0), foreign, otherFolder, { ...row(3), status: "archived" }, { ...row(4), status: "trashed" }, { ...row(5), deleted_at: "2026-10-01" }]);
    expect((await searchNotesWorkspace("研究", folderId, 100)).map(({ id }) => id)).toEqual([row(0).id]);
    for (const { searchParams } of requests) {
      expect(searchParams.get("user_id")).toBe(`eq.${ownerId}`);
      expect(searchParams.get("folder_id")).toBe(`eq.${folderId}`);
      expect(searchParams.get("deleted_at")).toBe("is.null");
      expect(searchParams.getAll("status")).toEqual(["neq.archived", "neq.trashed"]);
      expect(searchParams.get("limit")).toBe("50");
      expect(searchParams.has("or")).toBe(false);
    }
  });

  it.each(['%', '_', '*', 'C++', '[a].*', '(x),"quoted"', '\\notes'])('searches %s literally without wildcard broadening or raw filter interpolation', async (query) => {
    const requests = database([row(0, `标题 ${query}`, "正文"), row(1, "不匹配", "不匹配")]);
    expect((await searchNotesWorkspace(query, null)).map(({ id }) => id)).toEqual([row(0).id]);
    expect(requests.every(({ searchParams }) => !searchParams.has("or"))).toBe(true);
  });

  it("returns no results without broadening an invalid folder or empty query", async () => {
    const requests = database([row(0)]);
    expect(await searchNotesWorkspace(" ", null)).toEqual([]);
    expect(await searchNotesWorkspace("研究", "invalid-folder")).toEqual([]);
    expect(requests).toHaveLength(0);
    expect(requireOwner).not.toHaveBeenCalled();
  });

  it("lets the API report a search failure instead of misrepresenting it as no matches", async () => {
    database([], true);
    await expect(searchNotesWorkspace("研究", null)).rejects.toThrow("notes_search_failed");
  });
});

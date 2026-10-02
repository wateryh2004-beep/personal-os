import { describe, expect, it, vi } from "vitest";
import { listNotesWorkspacePage } from "@/features/notes/queries";

const targetFolder = "00000000-0000-4000-8000-000000000001";
const rows = Array.from({ length: 150 }, (_, index) => ({
  id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  title: `记录 ${index}`,
  updated_at: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
  pinned_at: index === 145 ? "2026-01-01T00:00:00Z" : null,
  folder_id: index === 149 ? targetFolder : null,
  deleted_at: null,
  status: "active",
  content_origin: "human",
}));

function database(error = false) {
  let matches = [...rows];
  const order: { field: keyof typeof rows[number]; ascending: boolean }[] = [];
  const query = {
    select: vi.fn(() => query),
    is: vi.fn(() => query),
    neq: vi.fn(() => query),
    eq: vi.fn((field: "folder_id", value: string) => { matches = matches.filter((row) => row[field] === value); return query; }),
    not: vi.fn((field: "pinned_at") => { matches = matches.filter((row) => row[field] !== null); return query; }),
    order: vi.fn((field: keyof typeof rows[number], options: { ascending: boolean }) => { order.push({ field, ascending: options.ascending }); return query; }),
    range: vi.fn(async (start: number, end: number) => ({
      data: error ? null : matches.sort((a, b) => {
        for (const { field, ascending } of order) {
          const delta = String(a[field] ?? "").localeCompare(String(b[field] ?? ""));
          if (delta) return ascending ? delta : -delta;
        }
        return 0;
      }).slice(start, end + 1),
      error: error ? { code: "42501" } : null,
    })),
  };
  const client = { from: vi.fn(() => query), rpc: vi.fn(() => { throw new Error("scoped_list_must_not_page_globally"); }) };
  return { client: client as unknown as Parameters<typeof listNotesWorkspacePage>[0], query };
}

describe("Notes scoped database listing", () => {
  it("returns notes in an older folder regardless of their global page and never selects bodies", async () => {
    const db = database();
    const result = await listNotesWorkspacePage(db.client, { folderId: targetFolder, limit: 50 });
    expect(result.notes.map((note) => note.id)).toEqual([rows[149].id]);
    expect(result.hasMore).toBe(false);
    expect(db.query.select.mock.calls[0].join(",")).not.toContain("body_markdown");
    expect(result.notes[0]).not.toHaveProperty("body_markdown");
  });

  it("filters favorites before applying an offset and paginates recent notes by update time", async () => {
    const favorites = await listNotesWorkspacePage(database().client, { view: "favorites", limit: 50 });
    expect(favorites.notes.map((note) => note.id)).toEqual([rows[145].id]);
    const recent = await listNotesWorkspacePage(database().client, { view: "recent", offset: 50, limit: 50 });
    expect(recent.notes).toHaveLength(50);
    expect(recent.notes[0].id).toBe(rows[99].id);
    expect(recent.hasMore).toBe(true);
  });

  it("reports a denied query as unavailable instead of an empty folder", async () => {
    const result = await listNotesWorkspacePage(database(true).client, { folderId: targetFolder });
    expect(result.state).toBe("unavailable");
  });

  it.each(["favorites", "recent"] as const)("keeps %s available on the original active/archived schema", async (view) => {
    let base = false;
    let invalidEnum = false;
    let pinnedOnly = false;
    const query = {
      select: vi.fn((fields: string) => { base = !fields.includes("folder_id"); return query; }),
      neq: vi.fn((_field: string, value: string) => { if (base && value === "trashed") invalidEnum = true; return query; }),
      is: vi.fn(() => query),
      not: vi.fn(() => { pinnedOnly = true; return query; }),
      order: vi.fn(() => query),
      range: vi.fn(async () => !base ? { data: null, error: { code: "42703" } }
        : invalidEnum ? { data: null, error: { code: "22P02" } }
        : { data: rows.filter((row) => !pinnedOnly || row.pinned_at).slice(0, 51).map(({ id, title, updated_at, pinned_at }) => ({ id, title, updated_at, pinned_at })), error: null }),
    };
    const client = { from: () => query } as unknown as Parameters<typeof listNotesWorkspacePage>[0];
    const result = await listNotesWorkspacePage(client, { view, limit: 50 });
    expect(result.state).toBe("base");
    expect(result.notes.length).toBeGreaterThan(0);
    expect(result.notes[0].folder_id).toBeNull();
    expect(result.notes[0].content_origin).toBeNull();
    expect(query.select).toHaveBeenLastCalledWith("id,title,updated_at,pinned_at");
    expect(invalidEnum).toBe(false);
  });
});

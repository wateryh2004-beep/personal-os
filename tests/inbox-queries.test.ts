import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.owner }));
import { getInboxWorkspace } from "@/features/inbox/queries";

type Row = Record<string, unknown>;
type Result = { data: Row[] | null; error: { message: string } | null; count?: number | null };
function query(result: Result) {
  const chain = {
    select: vi.fn(), is: vi.fn(), not: vi.fn(), order: vi.fn(), limit: vi.fn(),
    then: (resolve: (value: Result) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  for (const method of [chain.select, chain.is, chain.not, chain.order, chain.limit]) method.mockReturnValue(chain);
  return chain;
}
const pending = { id: "synthetic-pending", content_markdown: "Synthetic oldest pending", processed_at: null };
const processed = { id: "synthetic-processed", content_markdown: "Synthetic history", processed_at: "2026-10-07T12:00:00Z" };
const archived = { id: "synthetic-archived", content_markdown: "Synthetic archive", archived_at: "2026-10-07T13:00:00Z" };
const list = { id: "synthetic-list", display_name: "Synthetic list", is_default: true };
function setup(overrides: Partial<Record<"pending" | "processed" | "archived" | "lists", Partial<Result>>> = {}) {
  const results: Record<"pending" | "processed" | "archived" | "lists", Result> = {
    pending: { data: [pending], error: null, count: 137, ...overrides.pending },
    processed: { data: [processed], error: null, ...overrides.processed },
    archived: { data: [archived], error: null, ...overrides.archived },
    lists: { data: [list], error: null, ...overrides.lists },
  };
  const chains = { pending: query(results.pending), processed: query(results.processed), archived: query(results.archived), lists: query(results.lists) };
  for (const chain of Object.values(chains)) mocks.from.mockReturnValueOnce(chain);
  return chains;
}
beforeEach(() => { vi.resetAllMocks(); mocks.owner.mockResolvedValue({ supabase: { from: mocks.from } }); });

describe("AI-first Inbox queries", () => {
  it("reads pending independently from recent history so history cannot displace unprocessed records", async () => {
    const chains = setup();
    const result = await getInboxWorkspace();
    expect(mocks.owner).toHaveBeenCalledOnce();
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["inbox_items", "inbox_items", "inbox_items", "microsoft_todo_lists"]);
    expect(chains.pending.select).toHaveBeenCalledWith(expect.stringContaining("ai_proposal,ai_status,ai_error"), { count: "exact" });
    expect(chains.pending.is.mock.calls).toEqual([["archived_at", null], ["processed_at", null]]);
    expect(chains.pending.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(chains.pending.limit).toHaveBeenCalledWith(100);
    expect(chains.processed.is).toHaveBeenCalledWith("archived_at", null);
    expect(chains.processed.not).toHaveBeenCalledWith("processed_at", "is", null);
    expect(chains.processed.order).toHaveBeenCalledWith("processed_at", { ascending: false });
    expect(chains.processed.limit).toHaveBeenCalledWith(20);
    expect(chains.archived.not).toHaveBeenCalledWith("archived_at", "is", null);
    expect(chains.archived.order).toHaveBeenCalledWith("archived_at", { ascending: false });
    expect(chains.archived.limit).toHaveBeenCalledWith(20);
    expect(chains.lists.is).toHaveBeenCalledWith("archived_at", null);
    expect(chains.lists.order).toHaveBeenCalledWith("display_name");
    expect(result).toEqual({ items: [pending, processed], pendingCount: 137, archivedItems: [archived], lists: [list], unavailable: false });
  });

  it.each(["pending", "processed", "archived", "lists"] as const)("marks a failed %s read unavailable and preserves independently successful results", async (failed) => {
    setup({ [failed]: { error: { message: "Synthetic read failure" } } });
    const result = await getInboxWorkspace();
    expect(result.unavailable).toBe(true);
    expect(result.items).toEqual(failed === "pending" ? [processed] : failed === "processed" ? [pending] : [pending, processed]);
    expect(result.pendingCount).toBe(failed === "pending" ? null : 137);
    expect(result.archivedItems).toEqual(failed === "archived" ? [] : [archived]);
    expect(result.lists).toEqual(failed === "lists" ? [] : [list]);
  });

  it.each([0, null])("preserves a zero or unknown exact count (%s) without replacing it with the fetched length", async (count) => {
    setup({ pending: { count, data: count === 0 ? [] : [pending] } });
    expect((await getInboxWorkspace()).pendingCount).toBe(count);
  });

  it("normalizes successful null data without claiming an unavailable read", async () => {
    setup({ pending: { data: null, count: 0 }, processed: { data: null }, archived: { data: null }, lists: { data: null } });
    expect(await getInboxWorkspace()).toEqual({ items: [], pendingCount: 0, archivedItems: [], lists: [], unavailable: false });
  });

  it("does not turn authentication failure into an empty workspace", async () => {
    mocks.owner.mockRejectedValue(new Error("Synthetic owner required"));
    await expect(getInboxWorkspace()).rejects.toThrow("Synthetic owner required");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

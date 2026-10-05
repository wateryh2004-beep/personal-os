import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCareerHome } from "@/features/career/queries";

const mocks = vi.hoisted(() => ({ owner: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.owner }));

type Row = Record<string, string | null>;
type QueryStep = { method: string; args: unknown[] };
type QueryRead = { table: string; steps: QueryStep[] };
type QueryResult = { data: unknown; error: { message: string } | null; count?: number };
const now = new Date("2026-10-04T00:30:00Z");
const milestone = (id: string, target_date: string, status = "planned", extra: Row = {}): Row => ({ id, title: id, user_id: "owner", target_date, status, archived_at: null, ...extra });

function harness(rows: Row[], timezone: string | null = "America/Los_Angeles", failure?: "profiles" | "past") {
  const reads: QueryRead[] = [];
  const from = vi.fn((table: string) => {
    const read: QueryRead = { table, steps: [] };
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "neq", "order", "limit", "in", "lt", "gte", "not", "maybeSingle"]) {
      query[method] = (...args: unknown[]) => { read.steps.push({ method, args }); return query; };
    }
    query.then = (resolve: (value: QueryResult) => unknown) => {
      reads.push(read);
      let result: QueryResult = { data: [], error: null, count: 0 };
      if (table === "profiles") result = { data: timezone ? { timezone } : null, error: failure === "profiles" ? { message: "unavailable" } : null };
      if (table === "career_profiles") result = { data: null, error: null };
      if (table === "career_milestones") {
        let selected = [...rows];
        for (const { method, args } of read.steps) {
          const column = args[0] as string;
          if (method === "eq" || method === "is") selected = selected.filter((row) => row[column] === args[1]);
          if (method === "in") selected = selected.filter((row) => (args[1] as string[]).includes(row[column] as string));
          if (method === "gte") selected = selected.filter((row) => row[column] !== null && row[column] >= (args[1] as string));
          if (method === "lt") selected = selected.filter((row) => row[column] !== null && row[column] < (args[1] as string));
          if (method === "order") selected.sort((a, b) => String(a[column]).localeCompare(String(b[column])));
          if (method === "limit") selected = selected.slice(0, args[0] as number);
        }
        const head = read.steps.some((step) => step.method === "select" && (step.args[1] as { head?: boolean } | undefined)?.head);
        result = failure === "past" && head ? { data: null, error: { message: "unavailable" } } : { data: head ? null : selected, count: selected.length, error: null };
      }
      return Promise.resolve(result).then(resolve);
    };
    return query;
  });
  mocks.owner.mockResolvedValue({ userId: "owner", supabase: { from } });
  return { reads, from };
}

beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); });

describe("career home milestone reads", () => {
  it("filters eligible milestones before limiting so old and resolved records cannot bury future work", async () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, index) => milestone(`old-${index}`, "2026-09-01")),
      ...Array.from({ length: 6 }, (_, index) => milestone(`done-${index}`, "2026-10-03", "completed")),
      milestone("skipped", "2026-10-03", "skipped"),
      milestone("archived", "2026-10-03", "planned", { archived_at: "2026-10-03" }),
      milestone("foreign", "2026-10-03", "planned", { user_id: "other-owner" }),
      ...Array.from({ length: 7 }, (_, index) => milestone(`next-${index}`, `2026-10-${String(index + 3).padStart(2, "0")}`, index === 0 ? "in_progress" : "planned")),
    ];
    const h = harness(rows);
    const data = await getCareerHome();
    expect(data.milestones.map((item) => item.id)).toEqual(["next-0", "next-1", "next-2", "next-3", "next-4"]);
    expect(data).toMatchObject({ now: now.getTime(), timezone: "America/Los_Angeles", pastMilestoneCount: 6, unavailable: false });
    const upcoming = h.reads.find((read) => read.table === "career_milestones" && read.steps.some((step) => step.method === "limit"))!;
    expect(upcoming.steps).toContainEqual({ method: "gte", args: ["target_date", "2026-10-03"] });
    expect(upcoming.steps.findIndex((step) => step.method === "in")).toBeLessThan(upcoming.steps.findIndex((step) => step.method === "limit"));
    expect(upcoming.steps.findIndex((step) => step.method === "gte")).toBeLessThan(upcoming.steps.findIndex((step) => step.method === "limit"));
    expect(mocks.owner).toHaveBeenCalledTimes(1);
  });

  it("uses the standard timezone fallback when no profile timezone is stored", async () => {
    harness([milestone("past", "2026-10-03"), milestone("today", "2026-10-04")], null);
    const data = await getCareerHome();
    expect(data.timezone).toBe("Asia/Shanghai");
    expect(data.milestones.map((item) => item.id)).toEqual(["today"]);
    expect(data.pastMilestoneCount).toBe(1);
  });

  it.each(["profiles", "past"] as const)("reports partial unavailability if the %s read fails", async (failure) => {
    harness([milestone("today", "2026-10-04")], null, failure);
    expect((await getCareerHome()).unavailable).toBe(true);
  });

  it("does not read private career data before owner authentication succeeds", async () => {
    const h = harness([]);
    mocks.owner.mockRejectedValue(new Error("unauthenticated"));
    await expect(getCareerHome()).rejects.toThrow("unauthenticated");
    expect(h.from).not.toHaveBeenCalled();
  });
});

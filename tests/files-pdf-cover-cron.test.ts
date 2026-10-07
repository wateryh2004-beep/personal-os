import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ admin: vi.fn(), backfill: vi.fn(), process: vi.fn(), extract: vi.fn(), lookup: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { cronSecret: "synthetic-cron", ownerUserId: "fixture-owner", ownerEmail: "owner@fixture.test" } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: fake.admin }));
vi.mock("@/features/files/pdf-cover-service", () => ({ backfillPdfCovers: fake.backfill, processPdfCoverQueue: fake.process }));
vi.mock("@/features/files/extraction-service", () => ({ extractDocumentForOwner: fake.extract }));
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/files-extraction/route";
const timeline: string[] = [];
let extractionError: unknown;
beforeEach(() => {
  vi.clearAllMocks(); timeline.length = 0; extractionError = null;
  fake.lookup.mockResolvedValue({ data: { user: { email: "owner@fixture.test" } }, error: null });
  const query = { select: () => query, eq: () => query, is: () => query, or: () => query, order: () => query,
    limit: async () => { timeline.push("extraction-query"); return { data: [{ id: "fixture-document" }], error: extractionError }; } };
  fake.admin.mockReturnValue({ auth: { admin: { getUserById: fake.lookup } }, from: () => query });
  fake.backfill.mockImplementation(async () => { timeline.push("cover-backfill"); return 3; });
  fake.process.mockImplementation(async () => { timeline.push("cover-process"); return { status: "ready" }; });
  fake.extract.mockImplementation(async () => { timeline.push("extract"); return { status: "completed" }; });
});
const request = (secret = "synthetic-cron") => new NextRequest("https://fixture.test/api/cron/files-extraction", { headers: { authorization: `Bearer ${secret}` } });
describe("bounded cover recovery on existing extraction cron", () => {
  it("does no database or provider work for invalid cron authorization", async () => {
    expect((await GET(request("wrong"))).status).toBe(401); expect(fake.admin).not.toHaveBeenCalled(); expect(fake.process).not.toHaveBeenCalled();
  });
  it("verifies the configured owner before queue access", async () => {
    fake.lookup.mockResolvedValue({ data: { user: { email: "other@fixture.test" } }, error: null });
    expect((await GET(request())).status).toBe(503); expect(fake.backfill).not.toHaveBeenCalled();
  });
  it("discovers at most three, processes at most two and runs covers before extraction", async () => {
    const response = await GET(request()); expect(response.status).toBe(200);
    expect(fake.backfill).toHaveBeenCalledWith(expect.anything(), "fixture-owner", 3); expect(fake.process).toHaveBeenCalledTimes(2);
    expect(timeline).toEqual(["cover-backfill", "cover-process", "cover-process", "extraction-query", "extract"]);
    expect(await response.json()).toMatchObject({ covers: { queued: 3, processed: 2, failed: false }, completed: 1 });
  });
  it("does not let failed text extraction prevent durable cover recovery", async () => {
    extractionError = { message: "synthetic unavailable" }; expect((await GET(request())).status).toBe(500); expect(fake.process).toHaveBeenCalledTimes(2);
  });
  it("does not let a failed cover queue prevent existing text extraction", async () => {
    fake.backfill.mockRejectedValue(new Error("queue unavailable")); const response = await GET(request());
    expect(response.status).toBe(200); expect(fake.extract).toHaveBeenCalledOnce(); expect(await response.json()).toMatchObject({ covers: { failed: true }, completed: 1 });
  });
  it("stops immediately when covers are disabled or no job is available", async () => {
    fake.process.mockResolvedValue({ status: "disabled" }); await GET(request()); expect(fake.process).toHaveBeenCalledOnce(); expect(fake.extract).toHaveBeenCalledOnce();
  });
});

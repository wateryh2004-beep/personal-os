import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as planPost } from "@/app/api/files/export/plan/route";
import { POST as partPost } from "@/app/api/files/export/part/route";
import type { ExportPlan } from "@/features/files/export/contract";
import type { ExportDocument, ExportSource } from "@/features/files/export/portable";

const state = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn(), read: vi.fn(), configured: true }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwnerApi: state.auth, apiAuthenticationFailure: (error: unknown) => error === "unauthorized" ? new Response("denied", { status: 401 }) : null }));
vi.mock("@/lib/adapters/cloudflare-r2", () => ({ isR2Configured: () => state.configured }));
vi.mock("@/features/files/export/source", () => ({ createExportSource: state.create }));
const origin = "https://personal-os.example";
const id = "00000000-0000-4000-8000-000000000001";
const original = Buffer.from("synthetic private file");
let documents: ExportDocument[];
function request(path: "plan" | "part", fields?: Record<string, string>, requestOrigin: string | null = origin) {
  return new Request(`${origin}/api/files/export/${path}`, { method: "POST", headers: { ...(requestOrigin ? { Origin: requestOrigin } : {}), ...(fields ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }, ...(fields ? { body: new URLSearchParams(fields) } : {}) });
}
async function plan() { return await (await planPost(request("plan"))).json() as ExportPlan; }
beforeEach(() => {
  documents = [{ id, storage_path: "verified-owner/original", file_size: original.length, storage_state: "available", checksum: null, folder_id: null }];
  const source: ExportSource = { folders: async function* () {}, relationships: async function* () {}, documents: async function* () { yield* documents; }, openObject: state.read };
  state.auth.mockReset().mockResolvedValue({ userId: "verified-owner", supabase: { session: "verified" } });
  state.create.mockReset().mockReturnValue(source);
  state.read.mockReset().mockImplementation(async () => ({ size: original.length, body: new ReadableStream({ start(controller) { controller.enqueue(original); controller.close(); } }) }));
  state.configured = true;
});

describe("Explicit Files partition plan and download routes", () => {
  it("reads only verified-owner metadata for plans, with private cache headers", async () => {
    const response = await planPost(request("plan"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ format: "personal-os-files-plan/v1", counts: { documents: 1 }, downloadStatus: "not_verified" });
    expect(state.create).toHaveBeenCalledWith({ session: "verified" }, "verified-owner", expect.any(AbortSignal));
    expect(state.read).not.toHaveBeenCalled();
  });

  it("downloads and retries the selected unchanged plan using a native form request", async () => {
    const value = await plan();
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await partPost(request("part", { planId: value.planId, partIndex: "1" }));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-disposition")).toContain(`personal-os-files-${value.planId.slice(0, 16)}-part-1-of-1.tar`);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("content-type")).toBe("application/x-tar");
      const archive = Buffer.from(await response.arrayBuffer()).toString();
      expect(archive).toContain("personal-os-files-part/v1");
      expect(archive).toContain('"collectionComplete":true');
      expect(archive).toContain(original.toString());
      expect(archive).not.toContain("verified-owner/original");
    }
    expect(state.read).toHaveBeenCalledTimes(2);
  });

  it("returns visible 409 before object reads when metadata changed since planning", async () => {
    const value = await plan();
    documents[0] = { ...documents[0], title: "updated after planning" };
    const response = await partPost(request("part", { planId: value.planId, partIndex: "1" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "files_export_plan_changed" });
    expect(state.read).not.toHaveBeenCalled();
  });

  it("handles auth, origin and provider availability before reading metadata", async () => {
    state.auth.mockRejectedValueOnce("unauthorized");
    expect((await planPost(request("plan"))).status).toBe(401);
    for (const entry of [null, "https://other.example"]) {
      expect((await planPost(request("plan", undefined, entry))).status).toBe(403);
      expect((await partPost(request("part", undefined, entry))).status).toBe(403);
    }
    state.configured = false;
    expect((await planPost(request("plan"))).status).toBe(503);
    expect((await partPost(request("part"))).status).toBe(503);
    expect(state.create).not.toHaveBeenCalled(); expect(state.read).not.toHaveBeenCalled();
  });

  it("rejects missing, invalid or oversized form fields and out-of-range part selections", async () => {
    const value = await plan(); state.create.mockClear();
    const invalidFields: Record<string, string>[] = [{ planId: value.planId, partIndex: "0" }, { planId: "unknown", partIndex: "1" }, { planId: "x".repeat(1100), partIndex: "1" }, { planId: value.planId, partIndex: "1", unexpected: "field" }];
    for (const fields of invalidFields) {
      expect((await partPost(request("part", fields))).status).toBe(400);
    }
    expect((await partPost(request("part"))).status).toBe(400);
    expect(state.create).not.toHaveBeenCalled();
    const response = await partPost(request("part", { planId: value.planId, partIndex: "2" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "files_export_invalid_part" });
    expect(state.read).not.toHaveBeenCalled();
  });

  it("reports bounded-size failures without provider details", async () => {
    documents[0].file_size = 101 * 1024 * 1024;
    const response = await planPost(request("plan"));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: "export_invalid_size" });
    state.create.mockImplementationOnce(() => { throw new Error("private-provider-host-token"); });
    const failed = await planPost(request("plan"));
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain("private-provider");
  });
});

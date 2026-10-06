import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/files/export/route";

const state = vi.hoisted(() => ({ auth: vi.fn(), budget: vi.fn(), create: vi.fn(), stream: vi.fn(), configured: true }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwnerApi: state.auth, apiAuthenticationFailure: (error: unknown) => error === "unauthorized" ? new Response("denied", { status: 401 }) : null }));
vi.mock("@/lib/adapters/cloudflare-r2", () => ({ isR2Configured: () => state.configured }));
vi.mock("@/features/files/export/source", () => ({ createExportSource: state.create }));
vi.mock("@/features/files/export/portable", () => ({ checkExportBudget: state.budget, archiveStream: state.stream }));
beforeEach(() => {
  state.auth.mockReset().mockResolvedValue({ userId: "verified-owner", supabase: { session: "only-owner" } });
  state.budget.mockReset().mockResolvedValue({ bytes: 100, rows: 2 });
  state.create.mockReset().mockReturnValue({ source: true });
  state.stream.mockReset().mockReturnValue(new ReadableStream({ start(controller) { controller.close(); } }));
  state.configured = true;
});
const request = (origin: string | null = "https://personal-os.example") => new Request("https://personal-os.example/api/files/export", { method: "POST", headers: origin ? { Origin: origin } : {} });

describe("Explicit private Files export HTTP boundary", () => {
  it("authenticates before creating sources, fetching originals, or checking budget", async () => {
    state.auth.mockRejectedValue("unauthorized");
    expect((await POST(request())).status).toBe(401);
    expect(state.create).not.toHaveBeenCalled(); expect(state.stream).not.toHaveBeenCalled();
  });
  it("refuses missing/cross-site origins", async () => {
    for (const origin of [null, "https://other.example"]) expect((await POST(request(origin))).status).toBe(403);
    expect(state.create).not.toHaveBeenCalled();
  });
  it("downloads a no-store archive using only the verified owner", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-tar");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="personal-os-files-.*\.tar"$/);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(state.create).toHaveBeenCalledWith({ session: "only-owner" }, "verified-owner", expect.any(AbortSignal));
    expect(state.budget).toHaveBeenCalledBefore(state.stream);
  });
  it("refuses oversized exports before creating the response stream", async () => {
    state.budget.mockRejectedValue(new Error("files_export_budget_exceeded"));
    const response = await POST(request());
    expect(response.status).toBe(413); expect(await response.text()).toContain("512 MiB");
    expect(state.stream).not.toHaveBeenCalled();
  });
  it("does not expose query/provider errors or configuration details", async () => {
    state.budget.mockRejectedValue(new Error("secret-provider-host-and-token"));
    const response = await POST(request());
    expect(response.status).toBe(500); expect(await response.text()).not.toContain("secret");
    state.configured = false;
    expect((await POST(request())).status).toBe(503);
  });
});

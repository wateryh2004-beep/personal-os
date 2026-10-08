import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/exports/system/route";
const state = vi.hoisted(() => ({ auth: vi.fn(), source: vi.fn(), stream: vi.fn(), artwork: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwnerApi: state.auth, apiAuthenticationFailure: (error: unknown) => error === "unauthorized" ? new Response("denied", { status: 401 }) : null }));
vi.mock("@/features/system-backup/source", () => ({ createSystemBackupSource: state.source }));
vi.mock("@/features/system-backup/artwork", () => ({ prepareArtworkBackup: state.artwork }));
vi.mock("@/features/system-backup/export", () => ({ systemBackupStream: state.stream }));
beforeEach(() => {
  state.auth.mockReset().mockResolvedValue({ userId: "verified-owner", supabase: { ownerSession: true } });
  state.artwork.mockReset().mockResolvedValue("artwork-source");
  state.source.mockReset().mockReturnValue("source");
  state.stream.mockReset().mockReturnValue(new ReadableStream({ start(c) { c.close(); } }));
});
const request = (origin: string | null = "https://personal-os.example", site = "same-origin") => new Request("https://personal-os.example/api/exports/system", { method: "POST", headers: { ...(origin ? { origin } : {}), "sec-fetch-site": site }, body: '{"user_id":"untrusted"}' });
describe("System snapshot authenticated HTTP boundary", () => {
  it("requires owner authentication before constructing any source", async () => {
    state.auth.mockRejectedValue("unauthorized"); expect((await POST(request())).status).toBe(401); expect(state.source).not.toHaveBeenCalled();
  });
  it("rejects absent or cross-site origins", async () => {
    for (const origin of [null, "https://evil.example"]) expect((await POST(request(origin))).status).toBe(403);
    expect((await POST(request("https://personal-os.example", "cross-site"))).status).toBe(403); expect(state.source).not.toHaveBeenCalled();
  });
  it("uses only the verified session, sends a private attachment and no prefetched GET", async () => {
    const response = await POST(request()); expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(/attachment; filename="personal-os-system-.*\.ndjson"/);
    expect(response.headers.get("cache-control")).toContain("no-store"); expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(state.source).toHaveBeenCalledWith({ ownerSession: true }, "verified-owner");
    expect(state.stream).toHaveBeenCalledWith("source", "verified-owner", expect.any(AbortSignal), "artwork-source");
  });
  it("never exposes source errors", async () => {
    state.source.mockImplementation(() => { throw new Error("private-provider-detail"); });
    const response = await POST(request()); expect(response.status).toBe(500); expect(await response.text()).not.toContain("private-provider-detail");
  });
});

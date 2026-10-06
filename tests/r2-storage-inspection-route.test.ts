import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ owner: vi.fn(), health: vi.fn(), usage: vi.fn(), logical: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwnerApi: mock.owner, apiAuthenticationFailure: (error: unknown) => error === "unauthenticated" ? Response.json({ error: "denied" }, { status: 401 }) : null }));
vi.mock("@/lib/adapters/cloudflare-r2", () => ({ checkR2Health: mock.health, inspectR2ObjectUsage: mock.usage }));
vi.mock("@/features/files/storage-inspection/service", () => ({ readLogicalStorage: mock.logical }));
let POST: typeof import("@/app/api/files/storage-inspection/route").POST;
function request(body = "{}", origin = "https://example.test") {
  return new Request("https://example.test/api/files/storage-inspection", { method: "POST", headers: { origin }, body });
}
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  POST = (await import("@/app/api/files/storage-inspection/route")).POST;
  mock.owner.mockResolvedValue({ userId: "owner", supabase: {} });
  mock.health.mockResolvedValue({ configured: true, endpointValid: true, bucket: "fixture-private", status: "ok", credentialsReachR2: true });
  mock.logical.mockResolvedValue({ status: "complete", records: 0, activeBytes: 0, archivedBytes: 0, pendingBytes: 0 });
  mock.usage.mockResolvedValue({ status: "complete", objectCount: 0, objectBytes: 0, pagesScanned: 1 });
});
describe("owner-only manual storage inspection", () => {
  it("authenticates before accessing diagnostics", async () => {
    mock.owner.mockRejectedValue("unauthenticated");
    expect((await POST(request())).status).toBe(401);
    expect(mock.health).not.toHaveBeenCalled(); expect(mock.logical).not.toHaveBeenCalled(); expect(mock.usage).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests and malformed inputs without network calls", async () => {
    expect((await POST(request("{}", "https://other.test"))).status).toBe(403);
    for (const body of ["[]", "null", "{", '{"scan":"true"}', "a".repeat(129)]) expect((await POST(request(body))).status).toBe(400);
    expect(mock.health).not.toHaveBeenCalled();
  });
  it("does not list objects during the basic health check and keeps response private", async () => {
    const response = await POST(request());
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(await response.json()).toMatchObject({ usage: null, logical: { status: "complete" } });
    expect(mock.usage).not.toHaveBeenCalled();
    expect(mock.logical).toHaveBeenCalledWith({}, "owner", "fixture-private", expect.any(AbortSignal));
  });
  it("deduplicates concurrent and repeated scans but checks identity every time", async () => {
    const results = await Promise.all([POST(request('{"scan":true}')), POST(request('{"scan":true}'))]);
    await POST(request('{"scan":true}'));
    expect(mock.owner).toHaveBeenCalledTimes(3);
    expect(mock.usage).toHaveBeenCalledTimes(1);
    expect(await results[0].json()).toEqual(await results[1].json());
    mock.owner.mockResolvedValue({ userId: "different-owner", supabase: {} });
    await POST(request('{"scan":true}'));
    expect(mock.usage).toHaveBeenCalledTimes(2);
  });
  it("retries after cache expiry and never lets basic health hide requested usage", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      await POST(request()); await POST(request('{"scan":true}'));
      expect(mock.health).toHaveBeenCalledTimes(2);
      clock.mockReturnValue(now + 61_000);
      await POST(request('{"scan":true}'));
      expect(mock.usage).toHaveBeenCalledTimes(2);
    } finally { clock.mockRestore(); }
  });
});

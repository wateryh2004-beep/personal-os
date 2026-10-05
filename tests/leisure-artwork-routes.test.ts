import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ owner: vi.fn(), sources: vi.fn(), bytes: vi.fn(), migrate: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({
  requireOwnerApi: mock.owner,
  apiAuthenticationFailure: (error: unknown) => error === "unauthenticated" ? Response.json({ error: "需要登录。" }, { status: 401, headers: { "Cache-Control": "private, no-store, max-age=0" } }) : null,
}));
vi.mock("@/features/leisure/artwork-storage", () => ({
  artworkPrivateHeaders: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", "X-Content-Type-Options": "nosniff" },
  getPrivateArtworkSources: mock.sources, getPrivateArtworkBytes: mock.bytes, importPrivateArtwork: mock.migrate,
}));
import { GET as status } from "@/app/api/leisure/artwork/route";
import { GET as image } from "@/app/api/leisure/artwork/[artworkId]/route";
import { importLeisureArtwork } from "@/features/leisure/artwork-storage-actions";
const ctx = { params: Promise.resolve({ artworkId: "shameless-us" }) };
beforeEach(() => { vi.clearAllMocks(); mock.owner.mockResolvedValue({ userId: "owner-from-session" }); mock.sources.mockResolvedValue({}); mock.bytes.mockResolvedValue(Buffer.from("webp")); });
describe("private artwork authentication boundary", () => {
  it("authenticates status, image and every import before storage access", async () => {
    mock.owner.mockRejectedValue("unauthenticated");
    expect((await status()).status).toBe(401);
    expect((await image(new Request("https://example.test/api/leisure/artwork/shameless-us"), ctx)).status).toBe(401);
    expect((await importLeisureArtwork("shameless-us")).ok).toBe(false);
    expect(mock.sources).not.toHaveBeenCalled(); expect(mock.bytes).not.toHaveBeenCalled(); expect(mock.migrate).not.toHaveBeenCalled();
  });
  it("serves owner-scoped bytes with private cache and fixed MIME", async () => {
    const result = await image(new Request("https://example.test/api/leisure/artwork/shameless-us?w=640"), ctx);
    expect(mock.bytes).toHaveBeenCalledWith("owner-from-session", "shameless-us", 640);
    expect(result.status).toBe(200); expect(result.headers.get("content-type")).toBe("image/webp");
    expect(result.headers.get("cache-control")).toContain("no-store"); expect(result.headers.get("vary")).toBe("Cookie");
    expect(result.headers.get("x-content-type-options")).toBe("nosniff");
  });
  it("rejects arbitrary transformations and returns absent files without redirecting publicly", async () => {
    expect((await image(new Request("https://example.test/api/leisure/artwork/shameless-us?w=9999"), ctx)).status).toBe(400);
    expect(mock.bytes).not.toHaveBeenCalled(); mock.bytes.mockResolvedValue(null);
    const response = await image(new Request("https://example.test/api/leisure/artwork/shameless-us"), ctx);
    expect(response.status).toBe(404); expect(response.headers.get("location")).toBeNull();
  });
  it("does not leak provider details on a failed import", async () => {
    mock.migrate.mockRejectedValue(new Error("secret-provider-body"));
    const result = await importLeisureArtwork("shameless-us");
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("secret-provider-body");
    expect(mock.migrate).toHaveBeenCalledWith("owner-from-session", "shameless-us");
  });
  it("rejects a non-allowlisted ID despite a valid owner session", async () => {
    expect((await importLeisureArtwork("http://127.0.0.1/secret")).ok).toBe(false);
    expect(mock.migrate).not.toHaveBeenCalled();
  });
});

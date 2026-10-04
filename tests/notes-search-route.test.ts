import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/notes/search/route";
import { OwnerAuthenticationError, requireOwner, requireOwnerApi } from "@/lib/auth/require-owner";

vi.mock("@/lib/auth/require-owner", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth/require-owner")>(),
  requireOwner: vi.fn(),
  requireOwnerApi: vi.fn(),
}));

const ownerId = "00000000-0000-4000-8000-000000000001";
const folderId = "00000000-0000-4000-8000-000000000002";
const fixture = {
  id: "10000000-0000-4000-8000-000000000001", title: "研究",
  body_markdown: "研究进展", folder_id: folderId, updated_at: "2026-10-01T00:00:00Z",
  pinned_at: null, content_origin: "human",
};
const request = (query = `q=研究&folderId=${folderId}&limit=10`) => new Request(`https://personal-os.example.test/api/notes/search?${query}`);

beforeEach(() => {
  vi.resetAllMocks();
  // API callers must not use the Server Component redirecting auth function.
  vi.mocked(requireOwner).mockRejectedValue(new Error("unexpected_redirecting_auth"));
});

describe("Notes search API authentication boundary", () => {
  it.each([
    ["unauthenticated", 401],
    ["not-authorized", 403],
    ["configuration", 401],
  ] as const)("returns protocol status for %s rather than a redirect or 503", async (code, status) => {
    vi.mocked(requireOwnerApi).mockRejectedValue(new OwnerAuthenticationError(code));
    const response = await GET(request());
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.has("location")).toBe(false);
    expect(await response.json()).toHaveProperty("error");
    expect(requireOwnerApi).toHaveBeenCalledOnce();
    expect(requireOwner).not.toHaveBeenCalled();
  });

  it("passes the verified owner through real search queries without repeating redirecting auth", async () => {
    const reads: URL[] = [];
    const supabase = createClient("https://notes.example.test", "synthetic-test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input) => {
        reads.push(new URL(String(input)));
        return new Response(JSON.stringify([fixture]), { headers: { "Content-Type": "application/json" } });
      } },
    });
    vi.mocked(requireOwnerApi).mockResolvedValue({ supabase, userId: ownerId, email: "owner@example.test" });
    const response = await GET(request(`q=研究&folderId=${folderId}&limit=10&user_id=untrusted`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    const { results } = await response.json();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: fixture.id, excerpt: "研究进展" });
    expect(results[0]).not.toHaveProperty("body_markdown");
    expect(reads).toHaveLength(2);
    for (const { searchParams } of reads) {
      expect(searchParams.get("user_id")).toBe(`eq.${ownerId}`);
      expect(searchParams.get("folder_id")).toBe(`eq.${folderId}`);
      expect(searchParams.get("limit")).toBe("10");
    }
    expect(requireOwnerApi).toHaveBeenCalledOnce();
    expect(requireOwner).not.toHaveBeenCalled();
  });

  it("keeps unexpected authentication/network failures as retryable 503 responses", async () => {
    vi.mocked(requireOwnerApi).mockRejectedValue(new Error("temporary_network_failure"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "搜索暂时不可用。" });
    expect(requireOwner).not.toHaveBeenCalled();
  });

  it("rejects malformed search parameters before reading private data", async () => {
    const response = await GET(request("q=研究&folderId=invalid-folder"));
    expect(response.status).toBe(400);
    expect(requireOwnerApi).not.toHaveBeenCalled();
    expect(requireOwner).not.toHaveBeenCalled();
  });
});

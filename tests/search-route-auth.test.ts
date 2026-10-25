import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/search/route";
import { OwnerAuthenticationError, requireOwner, requireOwnerApi } from "@/lib/auth/require-owner";

vi.mock("@/lib/auth/require-owner", async (original) => ({
  ...await original<typeof import("@/lib/auth/require-owner")>(),
  requireOwner: vi.fn(), requireOwnerApi: vi.fn(),
}));
const ownerId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const request = (query = "q=合成&domains=notes&limit=10") => new Request(`https://app.test/api/search?${query}`);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireOwner).mockRejectedValue(new Error("page_redirect_must_not_be_used"));
});

describe("global search HTTP owner boundary", () => {
  it.each([["unauthenticated", 401], ["not-authorized", 403], ["configuration", 401]] as const)("returns protocol status for %s, including empty queries", async (code, status) => {
    vi.mocked(requireOwnerApi).mockRejectedValue(new OwnerAuthenticationError(code));
    for (const query of ["q=合成", "q=", "q=%20%20", ""]) {
      const response = await GET(request(query));
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toMatch(/private.*no-store/);
      expect(response.headers.has("location")).toBe(false);
      expect(await response.json()).toHaveProperty("error");
    }
    expect(requireOwnerApi).toHaveBeenCalledTimes(4);
    expect(requireOwner).not.toHaveBeenCalled();
  });
  it("passes the same verified owner into the real query and preserves RPC/result contracts", async () => {
    const reads: { path: string; body: unknown }[] = [];
    const supabase = createClient("https://synthetic.test", "synthetic-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input, init) => {
        reads.push({ path: new URL(String(input)).pathname, body: JSON.parse(String(init?.body)) });
        return Response.json([{ domain: "notes", entity_type: "note", entity_id: itemId, title: "合成", subtitle: "", snippet: "示例", metadata: {}, source_updated_at: null, score: 40 }]);
      } },
    });
    vi.mocked(requireOwnerApi).mockResolvedValue({ supabase, userId: ownerId, email: "owner@example.test" });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toMatch(/private.*no-store/);
    expect(await response.json()).toMatchObject({ query: "合成", results: [{ entityId: itemId, href: `/notes/${itemId}`, score: 40 }] });
    expect(reads).toEqual([{ path: "/rest/v1/rpc/search_personal_os", body: { p_query: "合成", p_limit: 10, p_domains: ["notes"] } }]);
    expect(requireOwnerApi).toHaveBeenCalledOnce();
    expect(requireOwner).not.toHaveBeenCalled();
    reads.length = 0;
    const empty = await GET(request("q="));
    expect(await empty.json()).toEqual({ query: "", results: [] });
    expect(reads).toEqual([]);
    expect(requireOwnerApi).toHaveBeenCalledTimes(2);
  });
  it("keeps unexpected outages as private 503 instead of pretending success", async () => {
    vi.mocked(requireOwnerApi).mockRejectedValue(new Error("unavailable"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toMatch(/private.*no-store/);
    expect(await response.json()).toEqual({ error: "搜索暂时不可用。" });
  });
  it.each(["PGRST301", "PGRST303"])("does not hide a persistent upstream JWT refusal (%s) as 503", async code => {
    const supabase = createClient("https://synthetic.test", "synthetic-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async () => Response.json({ code, message: "Synthetic JWT refusal" }, { status: 401 }) },
    });
    vi.mocked(requireOwnerApi).mockResolvedValue({ supabase, userId: ownerId, email: "owner@example.test" });
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "需要登录。" });
    expect(response.headers.get("cache-control")).toMatch(/private.*no-store/);
  });
  it("rejects invalid input before any private reads", async () => {
    for (const query of ["q=x&limit=51", "q=x&domains=unknown", `q=${"a".repeat(201)}`]) {
      const response = await GET(request(query));
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    expect(requireOwnerApi).not.toHaveBeenCalled();
  });
});

import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ owner: vi.fn(), stream: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({
  requireOwnerApi: state.owner,
  apiAuthenticationFailure: (error: unknown) => error === "anonymous" ? Response.json({ error: "需要登录。" }, { status: 401 }) : null,
}));
vi.mock("@/lib/adapters/cloudflare-r2", () => ({ isR2Configured: () => true, readR2ObjectStream: state.stream }));
import { GET } from "@/app/api/files/[documentId]/download/route";

beforeEach(() => { state.owner.mockReset(); state.stream.mockReset(); });

it("does not open private image bytes for an anonymous request", async () => {
  state.owner.mockRejectedValue("anonymous");
  const response = await GET(new Request("https://example.test/api/files/11111111-1111-4111-8111-111111111111/download?inline=1"), { params: Promise.resolve({ documentId: "11111111-1111-4111-8111-111111111111" }) });
  expect(response.status).toBe(401);
  expect(state.stream).not.toHaveBeenCalled();
});

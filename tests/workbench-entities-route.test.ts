import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ owner: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwnerApi: mock.owner, apiAuthenticationFailure: (error: unknown) => error === "auth" ? Response.json({ error: "login" }, { status: 401, headers: { "Cache-Control": "private, no-store" } }) : null }));
vi.mock("@/features/workbench/entity-queries", () => ({ readWorkbenchEntity: mock.read }));
import { GET } from "@/app/api/workbench/entities/route";
const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => { mock.owner.mockReset().mockResolvedValue({ userId: "verified-owner" }); mock.read.mockReset().mockImplementation(async ref => ({ status: "missing", ref })); });
describe("workbench read protocol", () => {
  it("authenticates even an empty/bad request before reading any domain", async () => { mock.owner.mockRejectedValue("auth"); const response = await GET(new Request("https://test/api/workbench/entities")); expect(response.status).toBe(401); expect(mock.read).not.toHaveBeenCalled(); });
  it("passes the one verified owner to every fixed entity read and forbids shared caching", async () => { const refs = [{ kind: "shopping", id }, { kind: "trip", id }]; const response = await GET(new Request(`https://test/api/workbench/entities?refs=${encodeURIComponent(JSON.stringify(refs))}`)); expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(response.headers.get("Vary")).toBe("Cookie"); expect(mock.read).toHaveBeenNthCalledWith(1, refs[0], { userId: "verified-owner" }); expect(mock.read).toHaveBeenNthCalledWith(2, refs[1], { userId: "verified-owner" }); });
  it.each([{ refs: [{ kind: "users", id }] }, { refs: [{ kind: "note", id, userId: "attacker" }] }, { refs: Array.from({ length: 5 }, () => ({ kind: "shopping", id })) }])("rejects forged or over-budget refs %j", async ({ refs }) => { const response = await GET(new Request(`https://test/api/workbench/entities?refs=${encodeURIComponent(JSON.stringify(refs))}`)); expect(response.status).toBe(400); expect(mock.read).not.toHaveBeenCalled(); });
});

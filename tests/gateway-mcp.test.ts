import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST, GET } from "@/app/api/mcp/route";
import { withGatewayStore } from "@/lib/adapters/content-gateway/postgres-store";
import { GatewayAccessError, type GatewayStore, type GatewayToken } from "@/features/content-gateway/contracts";
vi.mock("@/lib/adapters/content-gateway/postgres-store", () => ({ withGatewayStore: vi.fn() }));
const base = "https://personal.example";
const credential = "t".repeat(43);
const id = "10000000-0000-4000-8000-000000000001";
let token: GatewayToken | null;
let store: GatewayStore;
const request = (method: string, params: unknown = {}, authorization = `Bearer ${credential}`, more: Record<string, string> = {}) => new Request(`${base}/api/mcp`, { method: "POST", headers: { authorization, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25", ...more }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
async function payload(response: Response) {
  const text = await response.text();
  return JSON.parse(text.startsWith("{") ? text : text.split("\n").find((line) => line.startsWith("data: "))!.slice(6));
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("CONTENT_GATEWAY_ENABLED", "true"); vi.stubEnv("APP_URL", base);
  token = { grantId: id, ownerId: id, clientId: "personalos-codex", scope: ["notes:read"], resource: `${base}/api/mcp`, expiresAt: new Date(Date.now() + 3600_000).toISOString() };
  store = { getClient: vi.fn(), createRequest: vi.fn(), getRequest: vi.fn(), getCode: vi.fn(), consumeCode: vi.fn(), saveToken: vi.fn(), getToken: vi.fn(async () => token), revokeToken: vi.fn(), readContent: vi.fn(async () => ({ results: [{ id, title: "Chosen note" }] })), writeContent: vi.fn(async () => ({ operationId: id, entityType: "note", entityId: id, revision: 1, updatedAt: "2026-10-04T00:00:00Z", href: `/notes/${id}/read`, replayed: false })) };
  vi.mocked(withGatewayStore).mockImplementation(async (work) => work(store));
});
describe("independent scoped MCP boundary", () => {
  it("fails closed until explicitly configured", async () => {
    vi.stubEnv("CONTENT_GATEWAY_ENABLED", "false");
    expect((await GET(new Request(`${base}/api/mcp`))).status).toBe(503);
    expect(withGatewayStore).not.toHaveBeenCalled();
  });
  it("challenges missing/invalid bearer tokens instead of using browser cookies", async () => {
    const response = await GET(new Request(`${base}/api/mcp`, { headers: { cookie: "owner=session" } }));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(`${base}/.well-known/oauth-protected-resource/api/mcp`);
    expect(withGatewayStore).not.toHaveBeenCalled();
    token = null;
    expect((await POST(request("tools/list"))).status).toBe(401);
  });
  it("rejects cross-origin browser calls before reading authorization", async () => {
    expect((await POST(request("tools/list", {}, undefined, { origin: "https://attacker.example" }))).status).toBe(403);
    expect(withGatewayStore).not.toHaveBeenCalled();
  });
  it("rejects expired, foreign-client and wrong-audience tokens", async () => {
    const valid = { ...token! };
    for (const patch of [
      { expiresAt: new Date(Date.now() - 1000).toISOString() },
      { clientId: "unregistered-client" },
      { resource: `${base}/other-resource` },
    ]) {
      token = { ...valid, ...patch };
      const response = await POST(request("tools/list"));
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("invalid_token");
    }
    expect(store.readContent).not.toHaveBeenCalled();
  });
  it("rejects a mismatched host and redacts storage failures", async () => {
    expect((await POST(request("tools/list", {}, undefined, { host: "attacker.example" }))).status).toBe(403);
    expect(withGatewayStore).not.toHaveBeenCalled();
    vi.mocked(withGatewayStore).mockRejectedValue(new Error("private database connection details"));
    const response = await POST(request("tools/list"));
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"error":"temporarily_unavailable"}');
  });
  it("exposes only the granted read tools through the real MCP SDK", async () => {
    const response = await POST(request("tools/list"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const value = await payload(response);
    expect(value.result.tools.map((tool: { name: string }) => tool.name)).toEqual(["notes_find", "notes_read"]);
    expect(JSON.stringify(value)).not.toContain(credential);
  });
  it("executes only bounded read commands with a token hash and fixed audience", async () => {
    const value = await payload(await POST(request("tools/call", { name: "notes_find", arguments: { q: "chosen", limit: 2 } })));
    expect(value.result.structuredContent.results[0].id).toBe(id);
    expect(store.readContent).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/), `${base}/api/mcp`, { action: "find", kind: "note", q: "chosen", limit: 2 });
    expect(store.writeContent).not.toHaveBeenCalled();
  });
  it("rechecks revocation inside the business transaction", async () => {
    vi.mocked(store.readContent).mockRejectedValue(new GatewayAccessError("invalid_token"));
    const value = await payload(await POST(request("tools/call", { name: "notes_read", arguments: { id } })));
    expect(value.result.isError).toBe(true);
    expect(value.result._meta["mcp/www_authenticate"][0]).toContain("invalid_token");
  });
  it("binds write identity to Codex and preserves operation IDs without arbitrary SQL", async () => {
    token!.scope = ["notes:write", "interview:append"];
    const command = { operationId: id, contentOrigin: "human", captureMode: "original", title: "Chosen", bodyMarkdown: "  exact source\n" };
    const value = await payload(await POST(request("tools/call", { name: "notes_create", arguments: command })));
    expect(value.result.structuredContent.entityId).toBe(id);
    expect(store.writeContent).toHaveBeenCalledWith(expect.any(String), `${base}/api/mcp`, expect.objectContaining({ ...command, operation: "note.create", source: "codex" }));
    vi.mocked(store.writeContent).mockClear();
    await POST(request("tools/call", { name: "notes_create", arguments: { ...command, user_id: id, source: "human", sql: "drop table notes" } }));
    expect(store.writeContent).not.toHaveBeenCalled();
  });
});

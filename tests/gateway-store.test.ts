import { describe, expect, it, vi } from "vitest";
import { gatewayPoolConfig, createPostgresGatewayStore } from "@/lib/adapters/content-gateway/postgres-store";
import { getGatewayConfig } from "@/features/content-gateway/config";
import { authorizationServerMetadata, protectedResourceMetadata } from "@/features/content-gateway/metadata";
const url = "postgresql://content_gateway_runtime.fixture:synthetic-password@aws-0-test.pooler.supabase.com:6543/postgres?sslmode=verify-full";
const environment = { CONTENT_GATEWAY_DATABASE_URL: url };
const config = { issuer: "https://personal.example", resource: "https://personal.example/api/mcp", clientId: "personalos-codex" };
describe("gateway connection and discovery boundaries", () => {
  it("defaults off and requires a fixed HTTPS issuer", () => {
    expect(() => getGatewayConfig({ APP_URL: config.issuer })).toThrow();
    expect(() => getGatewayConfig({ CONTENT_GATEWAY_ENABLED: "true", APP_URL: "http://personal.example" })).toThrow();
    expect(() => getGatewayConfig({ CONTENT_GATEWAY_ENABLED: "true", APP_URL: "https://user:secret@personal.example" })).toThrow();
    expect(getGatewayConfig({ CONTENT_GATEWAY_ENABLED: "true", APP_URL: config.issuer })).toEqual(config);
  });
  it("permits only the dedicated runtime role and verified TLS", () => {
    const value = gatewayPoolConfig(environment);
    expect(value.user).toBe("content_gateway_runtime.fixture");
    expect(value.ssl).toEqual({ rejectUnauthorized: true });
    expect(value).not.toHaveProperty("connectionString");
    expect(value.max).toBe(2);
  });
  it.each([
    url.replace("content_gateway_runtime.fixture", "postgres"),
    url.replace("content_gateway_runtime.fixture", "service_role"),
    url.replace("sslmode=verify-full", "sslmode=require"),
    url.replace("sslmode=verify-full", "options=-crole=authenticated"),
    url.replace("aws-0-test.pooler.supabase.com", "attacker.example"),
    url.replace(":6543/", ":1234/"),
  ])("rejects privileged roles, indirection and insecure connections without echoing secrets", (invalid) => {
    try { gatewayPoolConfig({ CONTENT_GATEWAY_DATABASE_URL: invalid }); throw new Error("unexpected success"); }
    catch (error) { expect(String(error)).toBe("GatewayUnavailableError: Content gateway is not configured or available."); }
  });
  it("advertises the actual resource, PKCE and public-client code flow only", () => {
    const auth = authorizationServerMetadata(config);
    expect(auth.grant_types_supported).toEqual(["authorization_code"]);
    expect(auth.code_challenge_methods_supported).toEqual(["S256"]);
    expect(auth.authorization_response_iss_parameter_supported).toBe(true);
    expect(auth).not.toHaveProperty("registration_endpoint");
    expect(auth).not.toHaveProperty("client_secret");
    expect(protectedResourceMetadata(config).authorization_servers).toEqual([config.issuer]);
  });
});
describe("execute-only gateway adapter", () => {
  it("uses only parameterized, named routines", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ value: { ok: true } }] });
    const store = createPostgresGatewayStore({ query } as never);
    const hostile = { kind: "note", action: "find", q: "'; select * from private.secrets; --", limit: 2 };
    expect(await store.readContent("a".repeat(64), config.resource, hostile)).toEqual({ ok: true });
    expect(query).toHaveBeenCalledExactlyOnceWith("select content_gateway.read_content($1,$2,$3::jsonb) as value", ["a".repeat(64), config.resource, JSON.stringify(hostile)]);
  });
  it("rejects malformed stored authorization records", async () => {
    const store = createPostgresGatewayStore({ query: vi.fn().mockResolvedValue({ rows: [{ value: { ownerId: "spoofed", scope: ["admin"] } }] }) } as never);
    await expect(store.getToken("a".repeat(64), config.resource)).rejects.toThrow("not configured or available");
  });
  it.each([["P0201", "invalid_token"], ["P0202", "insufficient_scope"], ["P0102", "idempotency_conflict"]])("maps %s without leaking server messages", async (code, expected) => {
    const store = createPostgresGatewayStore({ query: vi.fn().mockRejectedValue({ code, message: "secret server details" }) } as never);
    await expect(store.writeContent("a".repeat(64), config.resource, {})).rejects.toThrow(expected);
  });
});

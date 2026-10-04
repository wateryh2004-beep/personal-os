import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { GET as authorize } from "@/app/api/oauth/authorize/route";
import { POST as decision } from "@/app/api/oauth/decision/route";
import { POST as exchange } from "@/app/api/oauth/token/route";
import { POST as revoke } from "@/app/api/oauth/revoke/route";
import { withGatewayStore } from "@/lib/adapters/content-gateway/postgres-store";
import { OwnerAuthenticationError, requireOwnerApi } from "@/lib/auth/require-owner";
import type { GatewayClient, GatewayCode, GatewayRequest, GatewayStore } from "@/features/content-gateway/contracts";
import { GatewayUnavailableError } from "@/features/content-gateway/contracts";
import { consentCookieName, hashSecret } from "@/features/content-gateway/oauth-http";

vi.mock("@/lib/adapters/content-gateway/postgres-store", () => ({ withGatewayStore: vi.fn() }));
vi.mock("@/lib/auth/require-owner", async (original) => ({ ...await original<typeof import("@/lib/auth/require-owner")>(), requireOwnerApi: vi.fn(), apiAuthenticationFailure: vi.fn(() => null) }));
const base = "https://personal-os.example";
const resource = `${base}/api/mcp`;
const id = "10000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000002";
const verifier = "a".repeat(43);
const challenge = createHash("sha256").update(verifier).digest("base64url");
const codeValue = "c".repeat(43);
const csrfNonce = "n".repeat(43);
const client: GatewayClient = { id: "personalos-codex", name: "Codex", ownerId, enabled: true, allowedScopes: ["notes:read", "notes:write"], resource, redirectUris: ["http://127.0.0.1/callback"], grants: ["authorization_code"], accessTokenLifetime: 3600 };
const pending: GatewayRequest = { id, clientId: client.id, redirectUri: "http://127.0.0.1:34567/callback", scope: ["notes:read", "notes:write"], resource, state: "test-state", codeChallenge: challenge, codeChallengeMethod: "S256", expiresAt: new Date(Date.now() + 300_000).toISOString(), consumedAt: null };
const code: GatewayCode = { clientId: client.id, ownerId, grantId: id, redirectUri: pending.redirectUri, codeChallenge: challenge, codeChallengeMethod: "S256", scope: ["notes:read"], resource, expiresAt: pending.expiresAt, consumedAt: null };
let store: GatewayStore;
let consumed: boolean;
let commits: number;
let rollbacks: number;
const rpc = vi.fn();
const tokenBody = (overrides = {}) => new URLSearchParams({ client_id: client.id, grant_type: "authorization_code", resource, redirect_uri: pending.redirectUri, code: codeValue, code_verifier: verifier, ...overrides }).toString();
const request = (path: string, body: string, extra: Record<string, string> = {}) => new Request(`${base}/api/oauth/${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...extra }, body });
const consentRequest = (body = `request_id=${id}&decision=approve&scope=notes%3Aread`, extra: Record<string, string> = {}) => request("decision", body, { origin: base, cookie: `${consentCookieName(id)}=${csrfNonce}`, ...extra });
const authorizationQuery = () => new URLSearchParams({ client_id: client.id, response_type: "code", redirect_uri: pending.redirectUri, resource, state: pending.state, code_challenge: challenge, code_challenge_method: "S256", scope: "notes:read" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CONTENT_GATEWAY_ENABLED", "true"); vi.stubEnv("APP_URL", base);
  consumed = false; commits = 0; rollbacks = 0;
  store = {
    getClient: vi.fn(async () => structuredClone(client)), createRequest: vi.fn(async () => structuredClone(pending)), getRequest: vi.fn(async () => structuredClone(pending)),
    getCode: vi.fn(async () => ({ ...code, consumedAt: consumed ? new Date().toISOString() : null })),
    consumeCode: vi.fn(async () => { if (consumed) return false; consumed = true; return true; }),
    saveToken: vi.fn(async () => ({ grantId: id, ownerId, clientId: client.id, scope: code.scope, resource, expiresAt: new Date(Date.now() + 3600_000).toISOString() })),
    getToken: vi.fn(async () => null), revokeToken: vi.fn(async () => {}), readContent: vi.fn(), writeContent: vi.fn(),
  };
  vi.mocked(withGatewayStore).mockImplementation(async (work) => {
    const before = consumed;
    try { const result = await work(store); commits++; return result; }
    catch { consumed = before; rollbacks++; throw new GatewayUnavailableError(); }
  });
  rpc.mockResolvedValue({ data: {}, error: null });
  vi.mocked(requireOwnerApi).mockResolvedValue({ userId: ownerId, email: "owner@example.test", supabase: { rpc } as never });
});

describe("OAuth HTTP boundary", () => {
  it("fails closed with 503 when configuration is disabled", async () => {
    vi.stubEnv("CONTENT_GATEWAY_ENABLED", "false");
    for (const call of [authorize(new Request(`${base}/api/oauth/authorize`)), exchange(request("token", tokenBody())), revoke(request("revoke", `client_id=${client.id}&token=${codeValue}`)), decision(consentRequest())]) {
      const response = await call;
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "temporarily_unavailable" });
    }
    expect(withGatewayStore).not.toHaveBeenCalled(); expect(requireOwnerApi).not.toHaveBeenCalled();
  });
  it("does not derive issuer from Host or forwarded-host", async () => {
    const fields = authorizationQuery();
    const response = await authorize(new Request(`https://internal.example/api/oauth/authorize?${fields}`, { headers: { host: "evil.example", "x-forwarded-host": "evil.example" } }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${base}/settings/connections/codex/authorize?request_id=${id}`);
  });
  it("prompts cold login before any pending state, preserving validated PKCE/state on a canonical next path", async () => {
    vi.mocked(requireOwnerApi).mockRejectedValue(new OwnerAuthenticationError("unauthenticated"));
    const fields = authorizationQuery();
    const response = await authorize(new Request(`https://internal.example/api/oauth/authorize?${fields}`, { headers: { host: "evil.example", "x-forwarded-host": "evil.example" } }));
    expect(response.status).toBe(303);
    const login = new URL(response.headers.get("location")!);
    expect(login.origin + login.pathname).toBe(`${base}/login`);
    expect(login.searchParams.get("next")).toBe(`/api/oauth/authorize?${fields}`);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(withGatewayStore).not.toHaveBeenCalled(); expect(store.createRequest).not.toHaveBeenCalled();
  });
  it.each([["configuration", 503], ["not-authorized", 403]] as const)("rejects %s owner authentication before database state", async (reason, status) => {
    vi.mocked(requireOwnerApi).mockRejectedValue(new OwnerAuthenticationError(reason));
    expect((await authorize(new Request(`${base}/api/oauth/authorize?${authorizationQuery()}`))).status).toBe(status);
    expect(withGatewayStore).not.toHaveBeenCalled(); expect(store.createRequest).not.toHaveBeenCalled();
  });
  it("validates query before owner authentication and checks registered owner before creating a request", async () => {
    expect((await authorize(new Request(`${base}/api/oauth/authorize?client_id=bad`))).status).toBe(400);
    expect(requireOwnerApi).not.toHaveBeenCalled();
    vi.mocked(store.getClient).mockResolvedValue({ ...client, ownerId: "different-owner" });
    expect((await authorize(new Request(`${base}/api/oauth/authorize?${authorizationQuery()}`))).status).toBe(403);
    expect(store.createRequest).not.toHaveBeenCalled();
  });
  it("rejects a missing callback port before browser authentication or database work", async () => {
    const query = authorizationQuery();
    query.set("redirect_uri", "http://127.0.0.1/callback");
    const response = await authorize(new Request(`${base}/api/oauth/authorize?${query}`));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(requireOwnerApi).not.toHaveBeenCalled(); expect(withGatewayStore).not.toHaveBeenCalled();
  });
  it("commits consumption on bad PKCE and rejects a correct retry", async () => {
    const invalid = await exchange(request("token", tokenBody({ code_verifier: "b".repeat(43) })));
    expect(invalid.status).toBe(400); expect(await invalid.json()).toEqual({ error: "invalid_grant" });
    expect(consumed).toBe(true); expect(commits).toBe(1); expect(rollbacks).toBe(0);
    const retry = await exchange(request("token", tokenBody()));
    expect(retry.status).toBe(400); expect(await retry.json()).toEqual({ error: "invalid_grant" });
    expect(store.saveToken).not.toHaveBeenCalled();
  });
  it("rolls back unexpected persistence failures and redacts database details", async () => {
    vi.mocked(store.saveToken).mockRejectedValue(new Error("postgres password=SECRET query=token"));
    const response = await exchange(request("token", tokenBody()));
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "temporarily_unavailable" });
    expect(consumed).toBe(false); expect(rollbacks).toBe(1); expect(commits).toBe(0);
  });
  it("returns no refresh token or owner/session values and never calls cookie authentication", async () => {
    const response = await exchange(request("token", tokenBody(), { cookie: "sb-fake=untrusted" }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(Object.keys(data).sort()).toEqual(["access_token", "expires_in", "scope", "token_type"]);
    expect(JSON.stringify(data)).not.toContain(ownerId); expect(requireOwnerApi).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each(["grant_type=authorization_code&grant_type=password", "client_id=personalos-codex&client_secret=SECRET", `code=${codeValue}&user_id=${ownerId}`])("rejects duplicate or unapproved token fields", async (body) => {
    expect((await exchange(request("token", body))).status).toBe(400);
    expect(withGatewayStore).not.toHaveBeenCalled();
  });
  it("rejects absent, opaque, foreign and cross-site consent origins before owner auth", async () => {
    const origins: Record<string, string>[] = [{ origin: "" }, { origin: "null" }, { origin: "https://evil.example" }, { origin: base, "sec-fetch-site": "cross-site" }];
    for (const extra of origins) {
      expect((await decision(consentRequest(undefined, extra))).status).toBe(403);
    }
    expect(requireOwnerApi).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("passes only hash-bound approval fields to owner RPC and supports native scope checkboxes", async () => {
    const response = await decision(consentRequest(`request_id=${id}&decision=approve&scope=notes%3Aread&scope=notes%3Awrite`));
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(rpc).toHaveBeenCalledWith("approve_content_authorization", { p_request_id: id, p_csrf_hash: hashSecret(csrfNonce), p_code_hash: hashSecret(location.searchParams.get("code")!), p_approved_scopes: ["notes:read", "notes:write"] });
    expect(location.searchParams.get("iss")).toBe(base); expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("denial invokes owner RPC and clears CSRF cookie", async () => {
    const response = await decision(consentRequest(`request_id=${id}&decision=deny`));
    expect(response.status).toBe(303);
    expect(rpc).toHaveBeenCalledWith("deny_content_authorization", { p_request_id: id, p_csrf_hash: hashSecret(csrfNonce) });
    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe("access_denied");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("does not approve requests missing the request-bound cookie or supplying user_id", async () => {
    expect((await decision(consentRequest(undefined, { cookie: "" }))).status).toBe(403);
    expect((await decision(consentRequest(`request_id=${id}&decision=approve&scope=notes%3Aread&user_id=${ownerId}`))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("maps a database-verified CSRF denial to 403 and unexpected RPC failures to 503", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "CSRF details must be redacted" } });
    const denied = await decision(consentRequest());
    expect(denied.status).toBe(403); expect(await denied.json()).toEqual({ error: "access_denied" });
    expect(commits).toBe(1); expect(rollbacks).toBe(0);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "08006", message: "database secret" } });
    const unavailable = await decision(consentRequest());
    expect(unavailable.status).toBe(503); expect(await unavailable.json()).toEqual({ error: "temporarily_unavailable" });
    expect(rollbacks).toBe(1);
  });
  it("keeps invalid-client protocol failures within the transaction response", async () => {
    vi.mocked(store.getClient).mockResolvedValue(null);
    expect((await revoke(request("revoke", `client_id=${client.id}&token=${codeValue}`))).status).toBe(400);
    expect((await decision(consentRequest())).status).toBe(400);
    expect(rollbacks).toBe(0);
  });
  it("revocation is idempotent, bounded to the public client and does not use cookies", async () => {
    const response = await revoke(request("revoke", `client_id=${client.id}&token=${codeValue}&token_type_hint=access_token`, { cookie: "sb-fake=untrusted" }));
    expect(response.status).toBe(200); expect(await response.text()).toBe("");
    expect(store.revokeToken).toHaveBeenCalledWith(hashSecret(codeValue), client.id); expect(requireOwnerApi).not.toHaveBeenCalled();
  });
});

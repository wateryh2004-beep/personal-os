import { describe, expect, it, vi } from "vitest";
import { decideAuthorization, exchangeAuthorizationCode, parseAuthorizationRequest, prepareAuthorization, revokeGatewayToken } from "@/features/content-gateway/oauth";
import { consentCookieName, GatewayOAuthError, hashSecret, isCodexRedirectUri, opaqueValue, readOAuthForm } from "@/features/content-gateway/oauth-http";
import type { GatewayClient, GatewayCode, GatewayConfig, GatewayRequest, GatewayStore } from "@/features/content-gateway/contracts";
import { createHash } from "node:crypto";

const config: GatewayConfig = { issuer: "https://personal-os.example", resource: "https://personal-os.example/api/mcp", clientId: "personalos-codex" };
const ownerId = "10000000-0000-4000-8000-000000000001";
const requestId = "10000000-0000-4000-8000-000000000002";
const grantId = "10000000-0000-4000-8000-000000000003";
const verifier = "a".repeat(43);
const challenge = createHash("sha256").update(verifier).digest("base64url");
const rawCode = "c".repeat(43);
const client: GatewayClient = { id: config.clientId, name: "Codex", ownerId, allowedScopes: ["notes:read", "notes:write"], resource: config.resource, enabled: true, redirectUris: ["http://127.0.0.1/callback"], grants: ["authorization_code"], accessTokenLifetime: 3600 };
const pending: GatewayRequest = { id: requestId, clientId: client.id, redirectUri: "http://127.0.0.1:54321/callback", scope: ["notes:read", "notes:write"], resource: config.resource, state: "random-client-state", codeChallenge: challenge, codeChallengeMethod: "S256", expiresAt: new Date(Date.now() + 300_000).toISOString(), consumedAt: null };
const code: GatewayCode = { clientId: client.id, ownerId, grantId, redirectUri: pending.redirectUri, codeChallenge: challenge, codeChallengeMethod: "S256", scope: ["notes:read"], resource: config.resource, expiresAt: pending.expiresAt, consumedAt: null };

function storeFixture() {
  let consumed = false;
  const store: GatewayStore = {
    getClient: vi.fn(async () => structuredClone(client)),
    createRequest: vi.fn(async () => structuredClone(pending)),
    getRequest: vi.fn(async () => structuredClone(pending)),
    getCode: vi.fn(async () => ({ ...structuredClone(code), consumedAt: consumed ? new Date().toISOString() : null })),
    consumeCode: vi.fn(async () => { if (consumed) return false; consumed = true; return true; }),
    saveToken: vi.fn(async () => ({ grantId, ownerId, clientId: client.id, scope: code.scope, resource: config.resource, expiresAt: new Date(Date.now() + 1800_000).toISOString() })),
    getToken: vi.fn(async () => null), revokeToken: vi.fn(async () => {}), readContent: vi.fn(), writeContent: vi.fn(),
  };
  return store;
}
function authRequest(overrides: Record<string, string> = {}) {
  return new Request(`${config.issuer}/api/oauth/authorize?${new URLSearchParams({ client_id: config.clientId, response_type: "code", redirect_uri: pending.redirectUri, resource: config.resource,
    state: pending.state, scope: "notes:read notes:write", code_challenge: challenge, code_challenge_method: "S256", ...overrides })}`);
}
const tokenFields = (overrides: Record<string, string> = {}) => ({ grant_type: "authorization_code", client_id: config.clientId, code: rawCode, redirect_uri: pending.redirectUri, code_verifier: verifier, resource: config.resource, ...overrides });
const decisionFields = { request_id: requestId, decision: "approve", scope: "notes:read" };
function decisionRequest(nonce = "n".repeat(43)) { return new Request(`${config.issuer}/api/oauth/decision`, { headers: { cookie: `${consentCookieName(requestId)}=${nonce}` } }); }

describe("Codex OAuth protocol", () => {
  it.each(["http://127.0.0.1:1/callback", "http://127.0.0.1:80/callback", "http://127.0.0.1:65535/callback"])("allows registered literal loopback URI %s", (uri) => expect(isCodexRedirectUri(uri)).toBe(true));
  it.each(["http://127.0.0.1/callback", "http://localhost/callback", "https://127.0.0.1/callback", "http://127.1/callback", "http://0x7f000001/callback", "http://127.0.0.1:0/callback", "http://127.0.0.1:65536/callback", "http://127.0.0.1:0123/callback", "http://127.0.0.1/callback/x", "http://127.0.0.1/callback?x=1", "http://127.0.0.1/callback#x", "http://x@127.0.0.1/callback", "http://127.0.0.1/%63allback", "http://127.0.0.1/callback/"])("rejects redirect widening %s", (uri) => expect(isCodexRedirectUri(uri)).toBe(false));
  it.each<Record<string, string>>([{ code_challenge_method: "plain" }, { code_challenge: "" }, { state: "" }, { resource: `${config.resource}/other` }, { scope: "notes:read notes:read" }, { scope: "admin" }, { client_id: "other" }])("rejects invalid authorization parameters", (fields) => expect(() => parseAuthorizationRequest(authRequest(fields), config)).toThrow(GatewayOAuthError));
  it("rejects duplicate and unknown authorization parameters", () => {
    expect(() => parseAuthorizationRequest(new Request(`${authRequest().url}&state=second`), config)).toThrow();
    expect(() => parseAuthorizationRequest(new Request(`${authRequest().url}&user_id=${ownerId}`), config)).toThrow();
  });
  it("stores a nonce hash and places only a request-specific nonce in a secure cookie", async () => {
    const store = storeFixture();
    const response = await prepareAuthorization(store, config, parseAuthorizationRequest(authRequest(), config), ownerId);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${config.issuer}/settings/connections/codex/authorize?request_id=${requestId}`);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly; Secure; SameSite=Lax; Max-Age=600");
    const nonce = cookie.split(";")[0].split("=")[1];
    expect(vi.mocked(store.createRequest).mock.calls[0][0].csrfHash).toBe(hashSecret(nonce));
    expect(cookie).not.toContain("sb-");
  });
  it("allows consent after six minutes within the advertised ten-minute request window", async () => {
    const started = Date.now();
    const store = storeFixture();
    vi.mocked(store.getRequest).mockResolvedValue({ ...pending, expiresAt: new Date(started + 600_000).toISOString() });
    const persistence = { approve: vi.fn(async () => {}), deny: vi.fn(async () => {}) };
    vi.useFakeTimers();
    try {
      vi.setSystemTime(started + 360_000);
      const response = await decideAuthorization(store, config, decisionRequest(), decisionFields, ownerId, persistence);
      expect(response.status).toBe(303);
      expect(persistence.approve).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
  it("issues a code through owner persistence and returns state plus exact issuer", async () => {
    const store = storeFixture();
    const persistence = { approve: vi.fn(async () => {}), deny: vi.fn(async () => {}) };
    const response = await decideAuthorization(store, config, decisionRequest(), decisionFields, ownerId, persistence);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(pending.redirectUri);
    expect(location.searchParams.get("iss")).toBe(config.issuer);
    expect(location.searchParams.get("state")).toBe(pending.state);
    const issuedCode = location.searchParams.get("code")!;
    expect(issuedCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(persistence.approve).toHaveBeenCalledWith(requestId, hashSecret("n".repeat(43)), hashSecret(issuedCode), ["notes:read"]);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("denies with issuer and never persists a code", async () => {
    const persistence = { approve: vi.fn(async () => {}), deny: vi.fn(async () => {}) };
    const response = await decideAuthorization(storeFixture(), config, decisionRequest(), { ...decisionFields, decision: "deny" }, ownerId, persistence);
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("iss")).toBe(config.issuer);
    expect(persistence.approve).not.toHaveBeenCalled();
    expect(persistence.deny).toHaveBeenCalledOnce();
  });
  it("rejects owner spoofing, missing nonce, scope escalation and expired requests", async () => {
    const persistence = { approve: vi.fn(async () => {}), deny: vi.fn(async () => {}) };
    await expect(decideAuthorization(storeFixture(), config, decisionRequest(), decisionFields, "other-owner", persistence)).rejects.toMatchObject({ code: "access_denied" });
    await expect(decideAuthorization(storeFixture(), config, new Request(config.issuer), decisionFields, ownerId, persistence)).rejects.toMatchObject({ code: "access_denied" });
    await expect(decideAuthorization(storeFixture(), config, decisionRequest(), { ...decisionFields, scope: "interview:append" }, ownerId, persistence)).rejects.toMatchObject({ code: "invalid_scope" });
    const expired = storeFixture();
    vi.mocked(expired.getRequest).mockResolvedValue({ ...pending, expiresAt: "2000-01-01T00:00:00Z" });
    await expect(decideAuthorization(expired, config, decisionRequest(), decisionFields, ownerId, persistence)).rejects.toMatchObject({ code: "invalid_request" });
    expect(persistence.approve).not.toHaveBeenCalled();
  });
  it("exchanges S256 code once, returning only opaque access token and actual expiry", async () => {
    const store = storeFixture();
    const result = await exchangeAuthorizationCode(store, config, tokenFields());
    expect(Object.keys(result).sort()).toEqual(["access_token", "expires_in", "scope", "token_type"]);
    expect(result.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.expires_in).toBeGreaterThanOrEqual(1798);
    expect(result.expires_in).toBeLessThanOrEqual(1800);
    expect(result.scope).toBe("notes:read");
    expect(store.saveToken).toHaveBeenCalledWith(hashSecret(rawCode), expect.stringMatching(/^[a-f0-9]{64}$/), hashSecret(result.access_token), expect.any(String));
    expect(vi.mocked(store.consumeCode).mock.calls[0][1]).toBe(vi.mocked(store.saveToken).mock.calls[0][1]);
    await expect(exchangeAuthorizationCode(store, config, tokenFields())).rejects.toMatchObject({ code: "invalid_grant" });
    expect(store.saveToken).toHaveBeenCalledOnce();
  });
  it("preserves explicit :80 through parsing, pending storage, redirect and token exchange", async () => {
    const redirectUri = "http://127.0.0.1:80/callback";
    expect(new URL(redirectUri).href).toBe("http://127.0.0.1/callback");
    const input = parseAuthorizationRequest(authRequest({ redirect_uri: redirectUri }), config);
    expect(input.redirectUri).toBe(redirectUri);
    const store = storeFixture();
    vi.mocked(store.getRequest).mockResolvedValue({ ...pending, redirectUri });
    vi.mocked(store.getCode).mockResolvedValue({ ...code, redirectUri });
    await prepareAuthorization(store, config, input, ownerId);
    expect(vi.mocked(store.createRequest).mock.calls[0][0].redirectUri).toBe(redirectUri);
    const persistence = { approve: vi.fn(async () => {}), deny: vi.fn(async () => {}) };
    const approved = await decideAuthorization(store, config, decisionRequest(), decisionFields, ownerId, persistence);
    expect(approved.headers.get("location")).toMatch(/^http:\/\/127\.0\.0\.1:80\/callback\?code=/);
    const denied = await decideAuthorization(store, config, decisionRequest(), { ...decisionFields, decision: "deny" }, ownerId, persistence);
    expect(denied.headers.get("location")).toMatch(/^http:\/\/127\.0\.0\.1:80\/callback\?error=access_denied/);
    expect((await exchangeAuthorizationCode(store, config, tokenFields({ redirect_uri: redirectUri }))).scope).toBe("notes:read");
  });
  it("consumes incorrect PKCE without creating an access token", async () => {
    const store = storeFixture();
    await expect(exchangeAuthorizationCode(store, config, tokenFields({ code_verifier: "b".repeat(43) }))).rejects.toMatchObject({ code: "invalid_grant" });
    expect(store.consumeCode).toHaveBeenCalledOnce();
    expect(store.saveToken).not.toHaveBeenCalled();
    await expect(exchangeAuthorizationCode(store, config, tokenFields())).rejects.toMatchObject({ code: "invalid_grant" });
  });
  it.each<Record<string, string>>([{ grant_type: "refresh_token" }, { grant_type: "password" }, { code_verifier: "" }, { resource: "https://other.example/mcp" }, { redirect_uri: "https://evil.example" }, { client_id: "other" }])("rejects unsupported or malformed exchanges before code consumption", async (overrides) => {
    const store = storeFixture();
    await expect(exchangeAuthorizationCode(store, config, tokenFields(overrides))).rejects.toBeInstanceOf(GatewayOAuthError);
    expect(store.consumeCode).not.toHaveBeenCalled();
  });
  it("rejects stored audience mismatch and PKCE-less codes", async () => {
    for (const changed of [{ resource: "https://other.example" }, { codeChallenge: "" }]) {
      const store = storeFixture();
      vi.mocked(store.getCode).mockResolvedValue({ ...code, ...changed });
      await expect(exchangeAuthorizationCode(store, config, tokenFields())).rejects.toMatchObject({ code: "invalid_grant" });
      expect(store.consumeCode).not.toHaveBeenCalled();
    }
  });
  it("revokes using a hash and public client identifier, never a cookie identity", async () => {
    const store = storeFixture(); const token = opaqueValue();
    await revokeGatewayToken(store, config, { client_id: config.clientId, token, token_type_hint: "access_token" });
    expect(store.revokeToken).toHaveBeenCalledWith(hashSecret(token), config.clientId);
  });
});

describe("bounded OAuth form parser", () => {
  const form = (body: string, headers = {}) => new Request(`${config.issuer}/api/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body });
  it("accepts repeated checkbox scopes only for consent", async () => {
    expect(await readOAuthForm(form("scope=notes%3Aread&scope=notes%3Awrite"), ["scope"], true)).toEqual({ scope: "notes:read notes:write" });
    await expect(readOAuthForm(form("code=a&code=b"), ["code"])).rejects.toBeInstanceOf(GatewayOAuthError);
    await expect(readOAuthForm(form("request_id=a&request_id=b"), ["request_id"], true)).rejects.toBeInstanceOf(GatewayOAuthError);
  });
  it("rejects unknown fields, wrong media type, bad escapes and oversized actual body", async () => {
    await expect(readOAuthForm(form("user_id=owner"), ["code"])).rejects.toBeInstanceOf(GatewayOAuthError);
    await expect(readOAuthForm(form("code=x", { "content-type": "application/json" }), ["code"])).rejects.toMatchObject({ status: 415 });
    await expect(readOAuthForm(form("code=%zz"), ["code"])).rejects.toBeInstanceOf(GatewayOAuthError);
    await expect(readOAuthForm(form(`code=${"x".repeat(4096)}`, { "content-length": "1" }), ["code"])).rejects.toMatchObject({ status: 413 });
  });
});

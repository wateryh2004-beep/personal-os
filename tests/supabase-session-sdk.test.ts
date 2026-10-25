import { generateKeyPairSync, sign, verify } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  headers: new Headers(), cookies: [] as { name: string; value: string }[], writes: [] as string[],
}));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: true, env: { supabaseUrl: "https://project.supabase.test", supabasePublishableKey: "synthetic-publishable" } }));
vi.mock("next/headers", () => ({
  headers: async () => state.headers,
  cookies: async () => ({ getAll: () => state.cookies, set: (name: string) => { state.writes.push(name); } }),
}));
import { createClient } from "@/lib/supabase/server";
import { updateSession, verifiedOwnerEmailHeader, verifiedOwnerIdHeader } from "@/lib/supabase/proxy";
import { requireOwnerApi } from "@/lib/auth/require-owner";

const ownerId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const ownerEmail = "owner@example.test";
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const foreignKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey;
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "synthetic-es256", alg: "ES256", use: "sig" };
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
function jwt(sub = ownerId, email = ownerEmail, expired = false, invalidSignature = false) {
  const claims = { iss: "https://project.supabase.test/auth/v1", sub, email, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + (expired ? -30 : 3600), iat: Math.floor(Date.now() / 1000) - 60 };
  const payload = `${b64({ alg: "ES256", typ: "JWT", kid: jwk.kid })}.${b64(claims)}`;
  return `${payload}.${sign("sha256", Buffer.from(payload), { key: invalidSignature ? foreignKey : privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}
function user(sub = ownerId, email = ownerEmail) { return { id: sub, email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" }; }
function session(token: string, forceStorageFuture = false) {
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  return { access_token: token, refresh_token: "synthetic-refresh", expires_at: forceStorageFuture ? Math.floor(Date.now() / 1000) + 3600 : claims.exp, expires_in: 3600, token_type: "bearer", user: user(claims.sub, claims.email) };
}
function installCookie(token: string, forceStorageFuture = false) {
  state.cookies = [{ name: "sb-project-auth-token", value: `base64-${b64(session(token, forceStorageFuture))}` }];
}
let originalToken: string;
let refreshedToken: string;
let failures = 1;
let revoked = false;
const calls: { path: string; method: string; authorization: string | null }[] = [];
const seen = new Map<string, number>();
const fixtureFetch: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  expect(url.origin).toBe("https://project.supabase.test");
  const headers = new Headers(init?.headers);
  const authorization = headers.get("authorization");
  const method = init?.method ?? "GET";
  calls.push({ path: url.pathname, method, authorization });
  if (url.pathname === "/auth/v1/.well-known/jwks.json") return Response.json({ keys: [jwk] });
  if (url.pathname === "/auth/v1/token") {
    expect(method).toBe("POST");
    expect(JSON.parse(String(init?.body)).refresh_token).toBe("synthetic-refresh");
    return Response.json(session(refreshedToken));
  }
  if (url.pathname === "/auth/v1/user") {
    if (revoked) return Response.json({ code: "session_not_found", message: "Synthetic revoked session" }, { status: 401 });
    const token = authorization?.slice(7) ?? "", parts = token.split(".");
    expect(verify("sha256", Buffer.from(parts.slice(0, 2).join(".")), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(parts[2], "base64url"))).toBe(true);
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    expect(claims.exp).toBeGreaterThan(Date.now() / 1000);
    return Response.json(user(claims.sub, claims.email));
  }
  if (url.pathname.startsWith("/rest/v1/")) {
    const count = (seen.get(url.pathname) ?? 0) + 1; seen.set(url.pathname, count);
    if (count <= failures) return Response.json({ code: "PGRST303", message: "Synthetic claim rejection" }, { status: 401 });
    expect(authorization).toMatch(/^Bearer /);
    return Response.json([{ id: ownerId }]);
  }
  throw Error(`Unexpected synthetic path: ${url.pathname}`);
};
function forward(response: Response) {
  const headers = new Headers();
  for (const key of (response.headers.get("x-middleware-override-headers") ?? "").split(",").map(s => s.trim()).filter(Boolean)) {
    const value = response.headers.get(`x-middleware-request-${key}`); if (value !== null) headers.set(key, value);
  }
  state.headers = headers;
  state.cookies = new NextRequest("https://app.test/api/search", { headers }).cookies.getAll();
}
beforeEach(() => {
  vi.stubEnv("OWNER_EMAIL", ownerEmail); vi.stubGlobal("fetch", fixtureFetch);
  originalToken = jwt(); refreshedToken = jwt(ownerId, ownerEmail);
  state.headers = new Headers({ [verifiedOwnerIdHeader]: ownerId, [verifiedOwnerEmailHeader]: ownerEmail });
  state.writes = []; installCookie(originalToken); calls.length = 0; seen.clear(); failures = 1; revoked = false;
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("real SSR/Auth SDK and signed JWT recovery boundary", () => {
  it("recovers concurrent SELECT reads after verifying the same JWT cryptographically and against Auth, without rotating cookies", async () => {
    const client = await createClient();
    const results = await Promise.all([client.from("notes").select("id"), client.from("note_folders").select("id")]);
    for (const result of results) { expect(result.error).toBeNull(); expect(result.data).toEqual([{ id: ownerId }]); }
    expect(calls.filter(c => c.path === "/auth/v1/user")).toHaveLength(1);
    expect(calls.filter(c => c.path === "/auth/v1/token")).toHaveLength(0);
    expect(calls.filter(c => c.path.startsWith("/rest/v1/")).map(c => c.authorization)).toEqual(Array(4).fill(`Bearer ${originalToken}`));
    expect(state.writes).toEqual([]);
  });
  it.each(["list_notes_workspace", "search_personal_os"])("recovers only the audited read RPC %s", async name => {
    const result = await (await createClient()).rpc(name, name === "search_personal_os" ? { p_query: "合成" } : { p_limit: 10 });
    expect(result.error).toBeNull(); expect(seen.get(`/rest/v1/rpc/${name}`)).toBe(2);
  });
  it.each(["revoked", "foreign-signature", "expired", "non-owner", "missing-bridge"])("keeps %s callers rejected and does not replay", async mode => {
    if (mode === "revoked") revoked = true;
    if (mode === "foreign-signature") installCookie(jwt(ownerId, ownerEmail, false, true));
    if (mode === "expired") installCookie(jwt(ownerId, ownerEmail, true), true);
    if (mode === "non-owner") installCookie(jwt(otherId, "other@example.test"));
    if (mode === "missing-bridge") state.headers = new Headers();
    const result = await (await createClient()).from("notes").select("id");
    expect(result.status).toBe(401); expect(result.error?.code).toBe("PGRST303");
    expect(seen.get("/rest/v1/notes")).toBe(1);
    expect(calls.filter(c => c.path === "/auth/v1/token")).toHaveLength(0);
  });
  it("keeps a persistent provider rejection visible and bounded", async () => {
    failures = Infinity;
    const result = await (await createClient()).from("notes").select("id");
    expect(result.status).toBe(401); expect(seen.get("/rest/v1/notes")).toBe(2);
  });
  it("refreshes truly expired sessions in Proxy and forwards fresh cookies and cache headers to both downstream and browser", async () => {
    installCookie(jwt(ownerId, ownerEmail, true)); failures = 0;
    const request = new NextRequest("https://app.test/api/search", { headers: { cookie: state.cookies.map(c => `${c.name}=${c.value}`).join("; "), [verifiedOwnerIdHeader]: otherId, [verifiedOwnerEmailHeader]: "other@example.test" } });
    const response = await updateSession(request); forward(response);
    expect(state.headers.get(verifiedOwnerIdHeader)).toBe(ownerId);
    expect(state.headers.get("cookie")).not.toContain("synthetic-refresh;");
    expect(response.cookies.getAll().some(c => c.name.startsWith("sb-project-auth-token"))).toBe(true);
    expect(response.headers.get("cache-control")).toMatch(/private.*no-store/);
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("expires")).toBe("0");
    const owner = await requireOwnerApi();
    expect(owner.userId).toBe(ownerId);
    expect((await owner.supabase.from("notes").select("id")).error).toBeNull();
    expect(calls.filter(c => c.path === "/auth/v1/token")).toHaveLength(1);
    expect(calls.find(c => c.path === "/rest/v1/notes")?.authorization).toBe(`Bearer ${refreshedToken}`);
  });
  it.each(["anonymous", "non-owner"])("real Proxy rejects forged bridge headers from %s", async mode => {
    if (mode === "anonymous") state.cookies = [];
    else installCookie(jwt(otherId, "other@example.test"));
    forward(await updateSession(new NextRequest("https://app.test/api/search", { headers: { cookie: state.cookies.map(c => `${c.name}=${c.value}`).join("; "), [verifiedOwnerIdHeader]: ownerId, [verifiedOwnerEmailHeader]: ownerEmail } })));
    expect(state.headers.has(verifiedOwnerIdHeader)).toBe(false);
    expect(state.headers.has(verifiedOwnerEmailHeader)).toBe(false);
    await expect(requireOwnerApi()).rejects.toMatchObject({ code: mode === "anonymous" ? "unauthenticated" : "not-authorized" });
    expect(calls.filter(c => c.path.startsWith("/rest/v1/"))).toHaveLength(0);
  });
});

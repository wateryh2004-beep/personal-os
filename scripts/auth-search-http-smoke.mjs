// Real Next Proxy -> Route Handler -> SSR/Auth SDK -> localhost HTTP fixture.
// Synthetic keys and users only. No production credentials or browser bypass.
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile, open } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const ownerId = "11111111-1111-4111-8111-111111111111";
const itemId = "33333333-3333-4333-8333-333333333333";
const ownerEmail = "owner@example.test";
const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = { ...pair.publicKey.export({ format: "jwk" }), kid: "synthetic-http-key", alg: "ES256", use: "sig" };
const b64 = value => Buffer.from(JSON.stringify(value)).toString("base64url");
let fixtureOrigin, freshToken, mode = "transient";
const calls = [], checks = [];
function jwt(sub = ownerId, email = ownerEmail, expired = false, invalid = false) {
  const payload = `${b64({ alg: "ES256", kid: jwk.kid, typ: "JWT" })}.${b64({ iss: fixtureOrigin + "/auth/v1", sub, email, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + (expired ? -60 : 3600), iat: Math.floor(Date.now() / 1000) - 90 })}`;
  const key = invalid ? generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey : pair.privateKey;
  return `${payload}.${sign("sha256", Buffer.from(payload), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}
function claims(token) {
  const parts = token.split(".");
  assert.equal(verify("sha256", Buffer.from(parts.slice(0, 2).join(".")), { key: pair.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(parts[2], "base64url")), true);
  const data = JSON.parse(Buffer.from(parts[1], "base64url"));
  assert.ok(data.exp > Date.now() / 1000);
  return data;
}
const user = (id = ownerId, email = ownerEmail) => ({ id, email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
function session(token) {
  const data = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
  return { access_token: token, refresh_token: "synthetic-http-refresh", expires_in: 3600, expires_at: data.exp, token_type: "bearer", user: user(data.sub, data.email) };
}
const cookie = token => `sb-127-auth-token=base64-${b64(session(token))}`;
const fixture = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, fixtureOrigin), chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : null;
    const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    calls.push({ path: url.pathname, method: req.method, bearer });
    let status = 200, result;
    if (url.pathname === "/auth/v1/.well-known/jwks.json") result = { keys: [jwk] };
    else if (url.pathname === "/auth/v1/token") {
      assert.equal(body.refresh_token, "synthetic-http-refresh");
      if (mode === "refresh-denied") { status = 400; result = { code: "refresh_token_not_found", msg: "Synthetic revoked refresh" }; }
      else result = session(freshToken);
    } else if (url.pathname === "/auth/v1/user") {
      const data = claims(bearer);
      if (mode === "revoked") { status = 401; result = { code: "session_not_found", message: "Synthetic revoked session" }; }
      else result = user(data.sub, data.email);
    } else if (url.pathname === "/rest/v1/rpc/search_personal_os") {
      const data = claims(bearer);
      assert.equal(data.sub, ownerId); assert.equal(data.email, ownerEmail);
      assert.equal(body.p_query, "合成");
      const attempts = calls.filter(c => c.path === url.pathname).length;
      if (mode === "outage") { status = 500; result = { code: "XX000", message: "Synthetic outage" }; }
      else if (mode !== "healthy" && (mode !== "transient" || attempts === 1)) { status = 401; result = { code: "PGRST303", message: "Synthetic JWT claims refusal" }; }
      else result = [{ domain: "notes", entity_type: "note", entity_id: itemId, title: "合成", subtitle: "", snippet: "HTTP fixture", metadata: {}, source_updated_at: null, score: 40 }];
    } else throw Error(`Unexpected fixture route ${url.pathname}`);
    res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(result));
  } catch (error) { res.writeHead(500); res.end(JSON.stringify({ error: String(error) })); }
});
await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve));
fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`;
freshToken = jwt();
const reservation = createServer();
await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
const appPort = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
await mkdir("test-results/auth-search", { recursive: true });
const log = await open("test-results/auth-search/app.log", "w");
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(appPort)], {
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: fixtureOrigin, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-http-publishable", OWNER_EMAIL: ownerEmail, VERCEL_ENV: "preview", NEXT_TELEMETRY_DISABLED: "1", NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost" },
  stdio: ["ignore", log.fd, log.fd],
});
const endpoint = `http://127.0.0.1:${appPort}`;
function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(endpoint + path, { method: "GET", headers }, res => {
      const chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.setTimeout(15000, () => req.destroy(Error("Synthetic request timeout"))); req.on("error", reject); req.end();
  });
}
function refusal(response, status) {
  assert.equal(response.status, status); assert.equal(response.headers.location, undefined);
  assert.match(response.headers["content-type"], /application\/json/);
  assert.match(response.headers["cache-control"], /private.*no-store/);
  assert.ok(JSON.parse(response.body).error);
}
const count = path => calls.filter(c => c.path === path).length;
const rpcPath = "/rest/v1/rpc/search_personal_os";
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await get("/api/version")).status === 200) { ready = true; break; } } catch { /* wait for this owned local process */ }
    assert.equal(app.exitCode, null, "Local app exited; see test-results/auth-search/app.log"); await delay(200);
  }
  assert.ok(ready, "Local app starts");
  const forged = { "x-personal-os-verified-owner-id": ownerId, "x-personal-os-verified-owner-email": ownerEmail };
  for (const query of ["q=" + encodeURIComponent("合成"), "q=", "q=%20%20"]) refusal(await get("/api/search?" + query, forged), 401);
  assert.equal(count(rpcPath), 0); checks.push("anonymous-and-empty-search-401-no-private-read-no-redirect");
  const other = cookie(jwt("22222222-2222-4222-8222-222222222222", "other@example.test"));
  refusal(await get("/api/search?q=x", { ...forged, Cookie: other }), 403);
  refusal(await get("/api/search?q=x", { ...forged, Cookie: cookie(jwt(ownerId, ownerEmail, false, true)) }), 401);
  assert.equal(count(rpcPath), 0); checks.push("non-owner-and-invalid-signature-forgery-rejected-before-data");

  calls.length = 0;
  const response = await get("/api/search?q=" + encodeURIComponent("合成"), { ...forged, Cookie: cookie(jwt(ownerId, ownerEmail, true)) });
  assert.equal(response.status, 200);
  assert.match(response.headers["cache-control"], /private.*no-store/);
  assert.equal(response.headers.pragma, "no-cache"); assert.equal(response.headers.expires, "0");
  assert.ok(response.headers["set-cookie"]?.some(value => value.startsWith("sb-127-auth-token=")));
  const result = JSON.parse(response.body); assert.equal(result.results[0].href, `/notes/${itemId}`);
  assert.equal(count("/auth/v1/token"), 1); assert.equal(count("/auth/v1/user"), 1); assert.equal(count(rpcPath), 2);
  assert.ok(calls.filter(c => c.path === rpcPath).every(c => c.bearer === freshToken));
  for (const secret of [freshToken, "synthetic-http-refresh", ownerId, ownerEmail]) assert.equal(response.body.includes(secret), false);
  for (const name of Object.keys(response.headers)) assert.equal(name.includes("verified-owner"), false);
  checks.push("expired-session-proxy-refresh-both-cookie-transports-and-cache-headers", "signed-owner-read-revalidation-one-replay-no-second-rotation-no-secret-leak");

  for (const scenario of ["revoked", "persistent", "outage", "refresh-denied"]) {
    mode = scenario; calls.length = 0;
    const token = scenario === "refresh-denied" ? jwt(ownerId, ownerEmail, true) : freshToken;
    const response = await get("/api/search?q=" + encodeURIComponent("合成"), { Cookie: cookie(token) });
    refusal(response, scenario === "outage" ? 503 : 401);
    assert.equal(count(rpcPath), scenario === "persistent" ? 2 : scenario === "refresh-denied" ? 0 : 1);
    assert.equal(count("/auth/v1/token"), scenario === "refresh-denied" ? 1 : 0);
    checks.push(`${scenario}-preserves-actual-refusal-and-bounded-calls`);
  }
  await writeFile("test-results/auth-search/checks.json", JSON.stringify({ environment: "localhost Next production build + real SSR/Auth SDK + signed ES256 fixtures", passed: true, checks }, null, 2) + "\n");
  console.log(JSON.stringify({ passed: true, checks }));
} finally {
  app.kill("SIGTERM"); await Promise.race([once(app, "exit"), delay(5000)]);
  if (app.exitCode === null) app.kill("SIGKILL");
  await log.close(); await new Promise(resolve => fixture.close(resolve));
}

import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
const realAuth = vi.hoisted(() => vi.fn(async () => new Response("real-auth-boundary", { status: 401 })));
vi.mock("@/lib/supabase/proxy", () => ({ updateSession: realAuth }));
const cookie = "personal-os-continuous-fixture=synthetic-v3";
async function configured(compiled: string = "1") {
  vi.resetModules(); vi.stubEnv("CONTINUOUS_FIXTURE_COMPILED", compiled); vi.stubEnv("CONTINUOUS_WORKFLOWS_E2E_RUNTIME", "1"); vi.stubEnv("CI", "true"); vi.stubEnv("VERCEL", ""); vi.stubEnv("VERCEL_ENV", "");
  return import("@/features/testing/continuous-fixture-gate");
}
afterEach(() => { vi.unstubAllEnvs(); realAuth.mockClear(); });
it("ordinary build remains disabled even when a browser supplies every runtime flag and header", async () => {
  const gate = await configured("0"); expect(gate.isContinuousFixtureRequest("http://127.0.0.1:3000/notes", cookie)).toBe(false);
  const { proxy } = await import("@/proxy");
  const result = await proxy(new NextRequest("http://127.0.0.1:3000/notes", { headers: { cookie, "x-user-id": "synthetic", "x-fixture": "true" } }));
  expect(result.status).toBe(401); expect(result.headers.has("x-middleware-rewrite")).toBe(false); expect(realAuth).toHaveBeenCalledTimes(1);
});
it("requires build, runtime, CI, nonproduction, actual loopback selection and explicit fixture cookie together", async () => {
  const gate = await configured(); const url = "http://127.0.0.1:3000/notes";
  expect(gate.isContinuousFixtureRequest(url, cookie)).toBe(true);
  expect(gate.isContinuousFixtureRequest(url, null)).toBe(false); expect(gate.isContinuousFixtureRequest("https://personal.example/notes", cookie)).toBe(false);
  vi.stubEnv("CONTINUOUS_WORKFLOWS_E2E_RUNTIME", "0"); expect(gate.isContinuousFixtureRequest(url, cookie)).toBe(false);
  vi.stubEnv("CONTINUOUS_WORKFLOWS_E2E_RUNTIME", "1"); vi.stubEnv("CI", "false"); expect(gate.isContinuousFixtureRequest(url, cookie)).toBe(false);
  vi.stubEnv("CI", "true"); vi.stubEnv("VERCEL_ENV", "production"); expect(gate.isContinuousFixtureRequest(url, cookie)).toBe(false);
  vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("VERCEL", "1"); expect(gate.isContinuousFixtureRequest(url, cookie)).toBe(false);
});
it("rewrites canonical application routes only within the synthetic persistent layout", async () => {
  await configured(); const { proxy } = await import("@/proxy");
  const request = new NextRequest("http://127.0.0.1:3000/notes?q=synthetic", { headers: { cookie } });
  const result = await proxy(request);
  expect(result.headers.get("x-middleware-rewrite")).toBe(`${new URL(request.url).origin}/continuous-workflows-e2e/notes?q=synthetic`); expect(realAuth).not.toHaveBeenCalled();
});
it("denies real backend/Next Action writes instead of granting cookie-based user identity", async () => {
  await configured(); const { proxy } = await import("@/proxy");
  for (const request of [new NextRequest("http://127.0.0.1:3000/api/files/actual-admin-write", { method: "POST", headers: { cookie } }), new NextRequest("http://127.0.0.1:3000/notes", { method: "POST", headers: { cookie, "next-action": "real-action-id" } })]) {
    const response = await proxy(request); expect(response.status).toBe(403); expect(response.headers.has("x-middleware-rewrite")).toBe(false);
  }
  expect(realAuth).not.toHaveBeenCalled();
});
it("maps explicitly allowed existing HTTP boundaries to synthetic transport without forwarding them to real auth", async () => {
  await configured(); const { proxy } = await import("@/proxy");
  const request = new NextRequest("http://127.0.0.1:3000/api/assistant", { method: "POST", headers: { cookie } });
  const response = await proxy(request);
  expect(response.headers.get("x-middleware-rewrite")).toBe(`${new URL(request.url).origin}/api/continuous-workflows-fixture/api/assistant`); expect(realAuth).not.toHaveBeenCalled();
});

it("never falls through to real session/database reads for an unimplemented route in the selected fixture realm", async () => {
  await configured(); const { proxy } = await import("@/proxy");
  for (const path of ["/settings", "/login", "/unimplemented", "/continuous-workflows-e2e/unimplemented"]) { const response = await proxy(new NextRequest(`http://127.0.0.1:3000${path}`, { headers: { cookie } })); expect(response.status).toBe(404); }
  expect(realAuth).not.toHaveBeenCalled();
});

it("new upload mutation boundaries are rewritten only to isolated synthetic handlers, never actual storage/auth",async()=>{await configured();const{proxy}=await import("@/proxy");const request=new NextRequest("http://127.0.0.1:3000/api/files/upload-url",{method:"POST",headers:{cookie}});const response=await proxy(request);expect(response.headers.get("x-middleware-rewrite")).toBe(`${new URL(request.url).origin}/api/continuous-workflows-fixture/api/files/upload-url`);expect(realAuth).not.toHaveBeenCalled();});

it("matches extension-shaped dynamic API and canonical parameters before denying unknown synthetic targets", async () => {
  await configured(); const { proxy, config } = await import("@/proxy");
  for (const path of ["/api/assistant/runs/unlisted.png", "/api/files/private.svg", "/notes/unlisted.jpg", "/career/interview/questions/unlisted.webp", "/continuous-workflows-e2e/notes/unlisted.gif"]) {
    const request = new NextRequest(`http://127.0.0.1:3000${path}`, { headers: { cookie } });
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: request.url })).toBe(true);
    const response = await proxy(request);
    expect(response.status).toBe(path.startsWith("/api/") ? 403 : 404);
    expect(response.headers.has("x-middleware-rewrite")).toBe(false);
  }
  expect(realAuth).not.toHaveBeenCalled();
});
it("still excludes public static/runtime assets without intercepting their requests for auth", async () => {
  await configured(); const { config } = await import("@/proxy");
  for (const path of ["/logo.png", "/icons/logo.svg", "/photo.jpg", "/_next/static/chunk.js", "/_next/image?url=%2Flogo.png&w=32&q=75", "/ocr/v1/model.bin", "/favicon.ico", "/sw.js", "/offline.html", "/manifest.webmanifest"]) {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: `http://127.0.0.1:3000${path}` })).toBe(false);
  }
  expect(realAuth).not.toHaveBeenCalled();
});
it("ordinary builds keep dynamic API auth even for an extension-shaped ID and a synthetic cookie", async () => {
  await configured("0"); const { proxy, config } = await import("@/proxy");
  const request = new NextRequest("http://127.0.0.1:3000/api/assistant/runs/unlisted.png", { headers: { cookie } });
  expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: request.url })).toBe(true);
  const response = await proxy(request);
  expect(response.status).toBe(401); expect(response.headers.has("x-middleware-rewrite")).toBe(false);
  expect(realAuth).toHaveBeenCalledExactlyOnceWith(request);
});

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ownerId = "11111111-1111-4111-8111-111111111111";
const nonOwnerId = "22222222-2222-4222-8222-222222222222";
const mocks = vi.hoisted(() => ({
  claims: { sub: "22222222-2222-4222-8222-222222222222", email: "other@example.com" },
  requestHeaders: new Headers(),
  claimsCalls: 0,
  refresh: true,
}));

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: true, env: { supabaseUrl: "https://supabase.example.test", supabasePublishableKey: "test-publishable-key" } }));
vi.mock("@/lib/performance/server-perf", () => ({ withPerfSpan: async (_name: string, run: () => unknown) => run() }));
vi.mock("next/headers", () => ({
  headers: async () => mocks.requestHeaders,
  cookies: async () => ({ getAll: () => [], set: vi.fn() }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (items: unknown[]) => void } }) => ({
    auth: {
      getClaims: async () => {
        mocks.claimsCalls += 1;
        if (mocks.refresh) options.cookies.setAll([{ name: "sb-test-auth-token", value: "refreshed-session", options: { path: "/", httpOnly: true, secure: true, sameSite: "lax" } }]);
        return { data: { claims: mocks.claims }, error: null };
      },
    },
  }),
}));

import { requireOwnerApi } from "@/lib/auth/require-owner";
import { updateSession, verifiedOwnerEmailHeader, verifiedOwnerIdHeader } from "@/lib/supabase/proxy";

function spoofedRequest(path = "/api/content") {
  return new NextRequest(`https://personal-os.test${path}`, { headers: {
    [verifiedOwnerIdHeader]: ownerId,
    [verifiedOwnerEmailHeader]: "owner@example.com",
    cookie: "sb-test-auth-token=old-session; preference=dark",
  } });
}

/** Apply NextResponse's documented request-header override transport. */
function forwardedHeaders(response: Response) {
  const result = new Headers();
  for (const key of (response.headers.get("x-middleware-override-headers") ?? "").split(",").map((key) => key.trim()).filter(Boolean)) {
    const value = response.headers.get(`x-middleware-request-${key}`);
    if (value !== null) result.set(key, value);
  }
  return result;
}

beforeEach(() => {
  vi.stubEnv("OWNER_EMAIL", "owner@example.com");
  mocks.claims = { sub: nonOwnerId, email: "other@example.com" };
  mocks.claimsCalls = 0;
  mocks.refresh = true;
  mocks.requestHeaders = new Headers();
});
afterEach(() => vi.unstubAllEnvs());

describe("refreshed session preserves owner boundary", () => {
  it("removes forged owner headers after non-owner refresh and the API rejects that caller", async () => {
    const response = await updateSession(spoofedRequest());
    mocks.requestHeaders = forwardedHeaders(response);
    expect(mocks.requestHeaders.has(verifiedOwnerIdHeader)).toBe(false);
    expect(mocks.requestHeaders.has(verifiedOwnerEmailHeader)).toBe(false);
    expect(mocks.requestHeaders.get("cookie")).toContain("sb-test-auth-token=refreshed-session");
    expect(mocks.requestHeaders.get("cookie")).toContain("preference=dark");
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("refreshed-session");
    await expect(requireOwnerApi()).rejects.toMatchObject({ code: "not-authorized" });
    expect(mocks.claimsCalls).toBe(2);
  });

  it("forwards refreshed owner cookies and only server-verified owner identity", async () => {
    mocks.claims = { sub: ownerId, email: "OWNER@example.com" };
    const response = await updateSession(spoofedRequest());
    mocks.requestHeaders = forwardedHeaders(response);
    expect(mocks.requestHeaders.get(verifiedOwnerIdHeader)).toBe(ownerId);
    expect(mocks.requestHeaders.get(verifiedOwnerEmailHeader)).toBe("OWNER@example.com");
    expect(mocks.requestHeaders.get("cookie")).toContain("refreshed-session");
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("refreshed-session");
    expect(response.cookies.get("sb-test-auth-token")?.httpOnly).toBe(true);
    await expect(requireOwnerApi()).resolves.toMatchObject({ userId: ownerId, email: "OWNER@example.com" });
    expect(mocks.claimsCalls).toBe(1);
  });

  it("also removes forged owner headers when rendering a non-owner login notice", async () => {
    const response = await updateSession(spoofedRequest("/login"));
    const headers = forwardedHeaders(response);
    expect(headers.has(verifiedOwnerIdHeader)).toBe(false);
    expect(headers.has(verifiedOwnerEmailHeader)).toBe(false);
    expect(headers.get("x-personal-os-auth-notice")).toBe("not-authorized");
    expect(response.cookies.get("sb-test-auth-token")?.maxAge).toBe(0);
  });

  it("keeps unrefreshed non-owner requests sanitized too", async () => {
    mocks.refresh = false;
    const response = await updateSession(spoofedRequest());
    mocks.requestHeaders = forwardedHeaders(response);
    expect(mocks.requestHeaders.has(verifiedOwnerIdHeader)).toBe(false);
    expect(mocks.requestHeaders.get("cookie")).toContain("old-session");
    await expect(requireOwnerApi()).rejects.toMatchObject({ code: "not-authorized" });
  });
});

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { OwnerAuthenticationError, apiAuthenticationFailure } from "@/lib/auth/require-owner";
import { updateSession } from "@/lib/supabase/proxy";

describe("private route boundary", () => {
  it.each(["/", "/today", "/notes", "/notes/00000000-0000-4000-8000-000000000001", "/career", "/career/experiences/00000000-0000-4000-8000-000000000001", "/calendar"])("redirects an unauthenticated %s request before rendering", async (pathname) => {
    const response = await updateSession(new NextRequest(`http://personal-os.test${pathname}`));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe("http://personal-os.test/login");
    expect(location.searchParams.get("error")).toBe("configuration");
    expect(location.searchParams.get("next")).toBe(pathname);
    expect(await response.text()).not.toMatch(/Life of HANG|Notes|Career|Investing|Calendar/);
  });

  it("returns JSON authentication failures for APIs instead of an HTML redirect", async () => {
    const response = apiAuthenticationFailure(new OwnerAuthenticationError("unauthenticated"));

    expect(response?.status).toBe(401);
    expect(response?.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    await expect(response?.json()).resolves.toEqual({ error: "需要登录。" });
  });

  it("rejects an authenticated but non-owner API caller", async () => {
    const response = apiAuthenticationFailure(new OwnerAuthenticationError("not-authorized"));

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({ error: "无权访问此资源。" });
  });
});

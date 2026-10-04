import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), claims: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: true, env: {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signInWithPassword: mocks.signIn, getClaims: mocks.claims } }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props, children) }));

import { loginAction } from "@/features/auth/actions";
import Login from "@/app/(auth)/login/page";

const next = "/settings/connections/codex/authorize?request_id=11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OWNER_EMAIL", "owner@example.com");
  mocks.signIn.mockResolvedValue({ error: null });
  mocks.claims.mockResolvedValue({ data: { claims: {} }, error: null });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
});
afterEach(() => vi.unstubAllEnvs());

describe("Codex cold-login return", () => {
  it("preserves the consent request in the login form", async () => {
    const html = renderToStaticMarkup(await Login({ searchParams: Promise.resolve({ next }) }));
    expect(html).toContain(`type="hidden" name="next" value="${next}"`);
  });

  it("returns to consent after a successful owner password login", async () => {
    const form = new FormData();
    form.set("email", "owner@example.com");
    form.set("password", "synthetic-test-only");
    form.set("next", next);
    await expect(loginAction({}, form)).rejects.toThrow(`redirect:${next}`);
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "owner@example.com", password: "synthetic-test-only" });
  });

  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/%5cevil.test", "/login", "/login?next=/login", undefined])("rejects unsafe return URLs at login action time", async (value) => {
    const form = new FormData();
    form.set("email", "owner@example.com");
    form.set("password", "synthetic-test-only");
    if (value) form.set("next", value);
    await expect(loginAction({}, form)).rejects.toThrow("redirect:/today");
  });

  it("returns an existing owner session to consent without swallowing the redirect", async () => {
    mocks.claims.mockResolvedValue({ data: { claims: { sub: "owner", email: "owner@example.com" } }, error: null });
    await expect(Login({ searchParams: Promise.resolve({ next }) })).rejects.toThrow(`redirect:${next}`);
  });

  it("sanitizes malformed query arrays before rendering the login form", async () => {
    const html = renderToStaticMarkup(await Login({ searchParams: Promise.resolve({ next: [next, "https://evil.test"] }) }));
    expect(html).toContain('name="next" value="/today"');
    expect(html).not.toContain("evil.test");
  });

  it("keeps a failed login on the same form instead of navigating", async () => {
    mocks.signIn.mockResolvedValue({ error: { message: "synthetic failed login" } });
    const form = new FormData();
    form.set("email", "owner@example.com");
    form.set("password", "synthetic-test-only");
    form.set("next", next);
    expect(await loginAction({}, form)).toEqual({ error: "登录失败，请检查邮箱和密码。" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

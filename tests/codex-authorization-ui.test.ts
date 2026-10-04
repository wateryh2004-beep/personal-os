import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayClient, GatewayGrant, GatewayRequest } from "@/features/content-gateway/contracts";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), rpc: vi.fn(), config: vi.fn(), request: vi.fn(), client: vi.fn(), store: vi.fn(), revalidate: vi.fn(), redirect: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props, children) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.owner }));
vi.mock("@/features/content-gateway/config", () => ({ getGatewayConfig: mocks.config }));
vi.mock("@/lib/adapters/content-gateway/postgres-store", () => ({ withGatewayStore: mocks.store }));

import { CodexAuthorizationsView, CodexConsentView } from "@/components/settings/codex-authorization-view";
import CodexAuthorizationPage from "@/app/(app)/settings/connections/codex/authorize/page";
import CodexConnectionsPage from "@/app/(app)/settings/connections/codex/page";
import { revokeCodexAuthorization } from "@/features/content-gateway/owner-actions";

const ownerId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const resource = "https://personal-os.test/api/mcp";
const scopes = ["notes:read", "notes:write", "interview:read", "interview:append"] as const;
const request: GatewayRequest = { id: requestId, clientId: "personalos-codex", redirectUri: "http://127.0.0.1:1455/callback", scope: [...scopes], resource, state: "do-not-render-state", codeChallenge: "a".repeat(43), codeChallengeMethod: "S256", expiresAt: "2026-10-04T20:00:00Z", consumedAt: null };
const client: GatewayClient = { id: "personalos-codex", name: "PersonalOS Codex", ownerId, enabled: true, resource, allowedScopes: [...scopes], redirectUris: ["http://127.0.0.1/callback"], grants: ["authorization_code"], accessTokenLifetime: 3600 };
const grant: GatewayGrant = { id: requestId, clientName: "PersonalOS Codex", scope: [...scopes], resource, createdAt: "2026-10-04T18:30:00Z", expiresAt: "2026-10-04T19:30:00Z", revokedAt: null };
const consentPage = (id: string | string[] = requestId) => CodexAuthorizationPage({ searchParams: Promise.resolve({ request_id: id }) });
const managementPage = () => CodexConnectionsPage({ searchParams: Promise.resolve({}) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T19:00:00Z"));
  mocks.owner.mockResolvedValue({ userId: ownerId, supabase: { rpc: mocks.rpc } });
  mocks.config.mockReturnValue({ issuer: "https://personal-os.test", resource, clientId: "personalos-codex" });
  mocks.request.mockResolvedValue({ ...request });
  mocks.client.mockResolvedValue({ ...client });
  mocks.store.mockImplementation((work) => work({ getRequest: mocks.request, getClient: mocks.client }));
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
});
afterEach(() => vi.useRealTimers());

describe("Codex consent review", () => {
  it("renders only reviewed permissions and a native approval or denial POST", async () => {
    const html = renderToStaticMarkup(await consentPage());
    expect(mocks.owner).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenCalledWith(requestId);
    expect(html).toContain("PersonalOS Codex");
    expect(html).toContain('action="/api/oauth/decision"');
    expect(html).toContain('method="POST"');
    expect(html).toContain(`name="request_id" value="${requestId}"`);
    expect(html.match(/name="scope"/g)).toHaveLength(4);
    expect(html.match(/checked=""/g)).toHaveLength(4);
    for (const scope of scopes) expect(html).toContain(`value="${scope}"`);
    expect(html).toMatch(/<button[^>]*value="approve"[^>]*name="decision"/);
    expect(html).toMatch(/<button[^>]*value="deny"[^>]*name="decision"/);
    expect(html).toContain("1 小时，不自动续期");
    expect(html).toContain("保留版本历史");
    expect(html).toContain("普通笔记不包括标记为敏感或“永不供 AI 使用”的笔记");
    expect(html).toContain("采用前仍需你在 PersonalOS 中确认");
    expect(html).toContain("min-h-11");
    expect(html).toContain("text-base");
    expect(html).not.toMatch(/do-not-render|access_token|refresh_token|csrf|user_id/);
    expect(html).not.toContain(request.codeChallenge);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("offers only the scopes actually requested", async () => {
    mocks.request.mockResolvedValue({ ...request, scope: ["notes:read"] });
    const html = renderToStaticMarkup(await consentPage());
    expect(html.match(/name="scope"/g)).toHaveLength(1);
    expect(html).not.toContain('value="notes:write"');
  });

  it.each(["not-a-uuid", [requestId, requestId]])("rejects malformed or repeated request IDs before database access", async (id) => {
    const html = renderToStaticMarkup(await consentPage(id));
    expect(html).toContain("无法确认这次授权请求");
    expect(html).not.toContain("<form");
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it.each([
    { ...client, ownerId: "33333333-3333-4333-8333-333333333333" },
    { ...client, enabled: false },
    { ...client, id: "unregistered" },
    { ...client, allowedScopes: ["notes:read"] },
    { ...client, resource: "https://elsewhere.test/api/mcp" },
    { ...client, redirectUris: [] },
    null,
  ])("does not render a grant form for an unverified client", async (value) => {
    mocks.client.mockResolvedValue(value);
    const html = renderToStaticMarkup(await consentPage());
    expect(html).toContain("无法确认这次授权请求");
    expect(html).not.toContain("<form");
  });

  it.each([
    { ...request, clientId: "other-client" },
    { ...request, resource: "https://elsewhere.test/api/mcp" },
    { ...request, scope: ["admin:all"] },
    { ...request, scope: [] },
    { ...request, scope: ["notes:read", "notes:read"] },
    { ...request, expiresAt: "invalid" },
    { ...request, redirectUri: "http://127.0.0.1:1455/other" },
    { ...request, codeChallengeMethod: "plain" },
    { ...request, codeChallenge: "invalid" },
    null,
  ])("does not render a grant form for an invalid request", async (value) => {
    mocks.request.mockResolvedValue(value);
    expect(renderToStaticMarkup(await consentPage())).not.toContain("<form");
  });

  it.each([
    [{ ...request, expiresAt: "2026-10-04T19:00:00Z" }, "授权请求已过期"],
    [{ ...request, consumedAt: "2026-10-04T18:59:00Z" }, "授权请求已处理"],
  ])("gives an explicit restart route for expired or repeated consent", async (value, message) => {
    mocks.request.mockResolvedValue(value);
    const html = renderToStaticMarkup(await consentPage());
    expect(html).toContain(message);
    expect(html).toContain("重新发起登录");
    expect(html).not.toContain("<form");
  });

  it("renders a safe unavailable state for setup or database failures", async () => {
    mocks.store.mockRejectedValue(new Error("secret database connection string"));
    let html = renderToStaticMarkup(await consentPage());
    expect(html).toContain("Codex 授权暂不可用");
    expect(html).not.toContain("secret");
    mocks.config.mockImplementation(() => { throw new Error("secret configuration"); });
    html = renderToStaticMarkup(await consentPage());
    expect(html).toContain("Codex 授权暂不可用");
    expect(html).not.toContain("<form");
  });

  it("does not swallow owner-authentication redirects", async () => {
    mocks.owner.mockRejectedValue(new Error("redirect:/login"));
    await expect(consentPage()).rejects.toThrow("redirect:/login");
    expect(mocks.store).not.toHaveBeenCalled();
  });
});

describe("owner authorization management", () => {
  it("lists active, expired, and revoked grants with only active revoke controls", () => {
    const html = renderToStaticMarkup(createElement(CodexAuthorizationsView, { available: true, configured: true, now: Date.now(), revokeAction: async () => {}, grants: [grant, { ...grant, id: "expired", expiresAt: "2026-10-04T18:00:00Z" }, { ...grant, id: "revoked", revokedAt: "2026-10-04T18:45:00Z" }] }));
    expect(html).toContain("有效");
    expect(html).toContain("已过期");
    expect(html).toContain("已撤销");
    expect(html.match(/name="grant_id"/g)).toHaveLength(1);
    expect(html).toContain("撤销这次授权");
  });

  it("loads only the owner RPC DTO and strips unneeded record fields", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...grant, tokenHash: "secret-token-hash", ownerId: "never-render-owner" }], error: null });
    const page = await managementPage();
    expect(mocks.rpc).toHaveBeenCalledWith("list_content_authorizations");
    expect(page.props.grants).toEqual([grant]);
    expect(renderToStaticMarkup(page)).not.toContain("secret-token-hash");
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it("retains revocation access when new connections are disabled", async () => {
    mocks.config.mockImplementation(() => { throw new Error("disabled"); });
    mocks.rpc.mockResolvedValue({ data: [grant], error: null });
    const html = renderToStaticMarkup(await managementPage());
    expect(html).toContain("尚未完成服务器配置");
    expect(html).toContain("撤销这次授权");
  });

  it.each([{ data: null, error: { message: "private internal database error" } }, { data: [{ ...grant, scope: ["admin"] }], error: null }, { data: null, error: null }])("does not report missing or invalid data as connected or empty", async (result) => {
    mocks.rpc.mockResolvedValue(result);
    const html = renderToStaticMarkup(await managementPage());
    expect(html).toContain("暂时无法读取授权记录");
    expect(html).not.toContain("还没有 Codex 授权");
    expect(html).not.toContain("private internal");
  });

  it("shows a genuine empty state only after a successful empty query", async () => {
    expect(renderToStaticMarkup(await managementPage())).toContain("还没有 Codex 授权");
  });

  it("revokes only the validated grant ID through the authenticated RPC", async () => {
    const form = new FormData();
    form.set("grant_id", requestId);
    form.set("user_id", "attacker-selected-owner");
    await expect(revokeCodexAuthorization(form)).rejects.toThrow("redirect:/settings/connections/codex");
    expect(mocks.owner).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_content_authorization", { p_grant_id: requestId });
    expect(mocks.revalidate).toHaveBeenCalledWith("/settings/connections/codex");
  });

  it("rejects invalid revoke IDs before any write", async () => {
    const form = new FormData();
    form.set("grant_id", "wrong");
    await expect(revokeCodexAuthorization(form)).rejects.toThrow("?error=revoke");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("surfaces failed revocation without reporting success or leaking errors", async () => {
    mocks.rpc.mockRejectedValue(new Error("database secret"));
    const form = new FormData();
    form.set("grant_id", requestId);
    await expect(revokeCodexAuthorization(form)).rejects.toThrow("?error=revoke");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("authenticates direct revoke requests before writing", async () => {
    mocks.owner.mockRejectedValue(new Error("redirect:/login"));
    const form = new FormData();
    form.set("grant_id", requestId);
    await expect(revokeCodexAuthorization(form)).rejects.toThrow("redirect:/login");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

it("does not offer consent controls in unavailable states", () => {
  expect(renderToStaticMarkup(createElement(CodexConsentView, { state: { status: "unavailable" } }))).not.toContain("<form");
});

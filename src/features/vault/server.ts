import "server-only";
import { cookies } from "next/headers";
import { requireOwnerApi } from "@/lib/auth/require-owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenHash, validVaultToken, vaultCookie, vaultSessionActive } from "./crypto";

export const vaultHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
export class VaultError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new VaultError(403, "请从当前页面操作。");
  }
}
export async function vaultOwner() {
  const owner = await requireOwnerApi();
  // Bind the additional capability to the actual verified login session, not
  // just an owner UUID that survives logout/re-login.
  const { data, error } = await owner.supabase.auth.getClaims();
  const session = data?.claims.session_id;
  if (error || data?.claims.sub !== owner.userId || typeof session !== "string") throw new VaultError(401, "请重新登录。");
  return { ...owner, admin: createAdminClient(), login: tokenHash(session) };
}
export async function requireVault(request: Request) {
  const owner = await vaultOwner();
  const token = (await cookies()).get(vaultCookie)?.value;
  if (!validVaultToken(token)) throw new VaultError(423, "需要重新验证。");
  const tab = request.headers.get("x-vault-tab");
  if (!validVaultToken(tab)) throw new VaultError(423, "需要重新验证。");
  const hash = tokenHash(token);
  const { data, error } = await owner.admin.from("vault_sessions").select("expires_at,last_seen_at")
    .eq("user_id", owner.userId).eq("token_hash", hash).eq("login_session", owner.login).eq("tab_hash", tokenHash(tab)).maybeSingle();
  if (error) throw new VaultError(503, "此功能尚未就绪，请检查数据库迁移和服务端配置。");
  if (!data || !vaultSessionActive(data)) throw new VaultError(423, "需要重新验证。");
  return { ...owner, hash };
}
export function sessionArgs(owner: Awaited<ReturnType<typeof requireVault>>) {
  return { p_user_id: owner.userId, p_token: owner.hash, p_login: owner.login };
}
export function vaultFailure(error: unknown) {
  if (error instanceof VaultError) return Response.json({ error: error.message }, { status: error.status, headers: vaultHeaders });
  return Response.json({ error: "操作未完成，请稍后重试。" }, { status: 500, headers: vaultHeaders });
}

/** Bounded parsing also covers chunked requests without Content-Length. */
export async function readVaultJson(request: Request, limit = 850000): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json" || !request.body) throw new VaultError(400, "请求格式无效。");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new VaultError(413, "输入过长。");
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new VaultError(400, "请求格式无效。"); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

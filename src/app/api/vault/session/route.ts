import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { apiAuthenticationFailure } from "@/lib/auth/require-owner";
import { env } from "@/lib/env";
import { hashVaultPassword, newVaultToken, tokenHash, validVaultPassword, validVaultToken, vaultCookie, vaultLifetimeMs } from "@/features/vault/crypto";
import { verifyVaultPassword } from "@/features/vault/crypto";
import { readVaultJson, requireVault, sameOrigin, sessionArgs, VaultError, vaultFailure, vaultHeaders, vaultOwner } from "@/features/vault/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ password: z.string().min(12).max(256), loginPassword: z.string().min(1).max(1024).optional() });

export async function GET() {
  try {
    const { admin, userId } = await vaultOwner();
    const { data, error } = await admin.from("vault_credentials").select("user_id").eq("user_id", userId).maybeSingle();
    if (error) throw new VaultError(503, "此功能尚未就绪，请先完成数据库迁移。");
    return Response.json({ configured: Boolean(data) }, { headers: vaultHeaders });
  } catch (error) { return apiAuthenticationFailure(error) ?? vaultFailure(error); }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const owner = await vaultOwner();
    if (Number(request.headers.get("content-length")) > 4096) throw new VaultError(400, "输入过长。");
    const input = schema.safeParse(await readVaultJson(request, 8192));
    if (!input.success || !validVaultPassword(input.data.password)) throw new VaultError(400, "独立口令需为 12–256 个字符。");
    const attempt = await owner.admin.rpc("vault_consume_attempt", { p_user_id: owner.userId });
    if (attempt.error) throw new VaultError(503, "验证暂时不可用。");
    if (!attempt.data) throw new VaultError(429, "尝试次数过多，请 15 分钟后再试。");
    const result = await owner.admin.from("vault_credentials").select("password_hash,draft_salt").eq("user_id", owner.userId).maybeSingle();
    if (result.error) throw new VaultError(503, "验证暂时不可用。");
    let credential = result.data;
    if (!credential) {
      // First-time setup requires fresh proof of the ordinary account password.
      // This isolated client never installs its tokens into the app's cookies.
      if (!input.data.loginPassword) throw new VaultError(400, "首次设置需要当前登录密码。");
      const verifier = createClient(env.supabaseUrl!, env.supabasePublishableKey!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const proof = await verifier.auth.signInWithPassword({ email: owner.email, password: input.data.loginPassword });
      const proven = !proof.error && proof.data.user?.id === owner.userId;
      if (proof.data.session) await verifier.auth.signOut({ scope: "local" });
      if (!proven) throw new VaultError(403, "登录密码验证失败。");
      if (input.data.password === input.data.loginPassword) throw new VaultError(400, "请使用与登录密码不同的独立口令。");
      credential = { password_hash: await hashVaultPassword(input.data.password), draft_salt: newVaultToken() };
      const inserted = await owner.admin.from("vault_credentials").insert({ user_id: owner.userId, ...credential });
      if (inserted.error) throw new VaultError(409, "设置状态已变化，请重新验证。");
    } else if (!await verifyVaultPassword(input.data.password, credential.password_hash)) {
      throw new VaultError(403, "口令不正确。");
    }
    const cleared = await owner.admin.from("vault_attempts").update({ attempts: 0 }).eq("user_id", owner.userId);
    if (cleared.error) throw new VaultError(503, "验证暂时不可用。");
    const token = newVaultToken();
    const tabToken = newVaultToken();
    // Only one additional session per owner; old tabs cannot keep an old lease.
    const removed = await owner.admin.from("vault_sessions").delete().eq("user_id", owner.userId);
    if (removed.error) throw new VaultError(503, "验证暂时不可用。");
    const saved = await owner.admin.from("vault_sessions").insert({ user_id: owner.userId, token_hash: tokenHash(token), login_session: owner.login, tab_hash: tokenHash(tabToken),
      expires_at: new Date(Date.now() + vaultLifetimeMs).toISOString() });
    if (saved.error) throw new VaultError(503, "验证暂时不可用。");
    (await cookies()).set(vaultCookie, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/vault", maxAge: vaultLifetimeMs / 1000 });
    return Response.json({ unlocked: true, tabToken, draftSalt: credential.draft_salt, owner: owner.userId }, { headers: vaultHeaders });
  } catch (error) { return apiAuthenticationFailure(error) ?? vaultFailure(error); }
}

export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const owner = await requireVault(request);
    const checked = await owner.admin.rpc("vault_assert_session", sessionArgs(owner));
    if (checked.error) throw new VaultError(423, "需要重新验证。");
    const result = await owner.admin.from("vault_sessions").update({ last_seen_at: new Date().toISOString() })
      .eq("user_id", owner.userId).eq("token_hash", owner.hash).eq("login_session", owner.login).select("token_hash").maybeSingle();
    if (result.error || !result.data) throw new VaultError(423, "需要重新验证。");
    return Response.json({ unlocked: true }, { headers: vaultHeaders });
  } catch (error) { return apiAuthenticationFailure(error) ?? vaultFailure(error); }
}

export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const owner = await vaultOwner();
    const cookieStore = await cookies();
    const token = cookieStore.get(vaultCookie)?.value;
    if (validVaultToken(token)) {
      const result = await owner.admin.from("vault_sessions").delete().eq("user_id", owner.userId).eq("token_hash", tokenHash(token));
      if (result.error) throw new VaultError(503, "服务端锁定尚未完成，请关闭此页面并稍后重试。");
    }
    cookieStore.set(vaultCookie, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/vault", maxAge: 0 });
    return Response.json({ locked: true }, { headers: vaultHeaders });
  } catch (error) { return apiAuthenticationFailure(error) ?? vaultFailure(error); }
}

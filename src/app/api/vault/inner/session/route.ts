import { z } from "zod";
import { apiAuthenticationFailure } from "@/lib/auth/require-owner";
import { hashVaultPassword, newVaultToken, tokenHash, validVaultToken, vaultLifetimeMs, verifyVaultPassword } from "@/features/vault/crypto";
import { innerFailure, InnerLocked, requireInnerVault } from "@/features/vault/inner-session";
import { readVaultJson, requireVault, sameOrigin, sessionArgs, VaultError, vaultFailure, vaultHeaders } from "@/features/vault/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const owner = await requireVault(request);
    const result = await owner.admin.from("inner_vault_credentials").select("user_id").eq("user_id", owner.userId).maybeSingle();
    if (result.error) throw new VaultError(503, "内层文件暂不可用。");
    return Response.json({ configured: Boolean(result.data) }, { headers: vaultHeaders });
  } catch (error) { return apiAuthenticationFailure(error) ?? vaultFailure(error); }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const owner = await requireVault(request);
    const value = z.object({ password: z.string().min(12).max(256) }).strict().safeParse(await readVaultJson(request, 4096));
    if (!value.success) throw new VaultError(400, "内层口令需为 12–256 个字符。");
    const attempt = await owner.admin.rpc("inner_vault_consume_attempt", { p_user_id: owner.userId });
    if (attempt.error) throw new VaultError(503, "验证暂时不可用。");
    if (attempt.data !== true) throw new VaultError(429, "尝试次数过多，请 15 分钟后再试。");
    const credential = await owner.admin.from("inner_vault_credentials").select("password_hash").eq("user_id", owner.userId).maybeSingle();
    if (credential.error) throw new VaultError(503, "验证暂时不可用。");
    const { password } = value.data;
    if (!credential.data) {
      const outer = await owner.admin.from("vault_credentials").select("password_hash").eq("user_id", owner.userId).maybeSingle();
      if (outer.error || !outer.data) throw new VaultError(503, "验证暂时不可用。");
      if (await verifyVaultPassword(password, outer.data.password_hash)) throw new VaultError(400, "请设置与外层不同的口令。");
      const hash = await hashVaultPassword(password);
      const checked = await owner.admin.rpc("vault_assert_session", sessionArgs(owner));
      if (checked.error) throw new VaultError(423, "需要重新验证。");
      const inserted = await owner.admin.from("inner_vault_credentials").insert({ user_id: owner.userId, password_hash: hash });
      if (inserted.error) throw new VaultError(409, "设置状态已变化，请重新打开内层文件。");
    } else if (!await verifyVaultPassword(password, credential.data.password_hash)) {
      throw new VaultError(403, "内层口令不正确。");
    }
    const token = newVaultToken();
    const checked = await owner.admin.rpc("vault_assert_session", sessionArgs(owner));
    if (checked.error) throw new VaultError(423, "需要重新验证。");
    const saved = await owner.admin.from("inner_vault_sessions").upsert({
      user_id: owner.userId, outer_token_hash: owner.hash, token_hash: tokenHash(token),
      expires_at: new Date(Date.now() + vaultLifetimeMs).toISOString(), last_seen_at: new Date().toISOString(),
    });
    if (saved.error) throw new VaultError(503, "验证暂时不可用。");
    const cleared = await owner.admin.from("inner_vault_attempts").update({ attempts: 0 }).eq("user_id", owner.userId);
    if (cleared.error) throw new VaultError(503, "验证暂时不可用。");
    return Response.json({ token }, { headers: vaultHeaders });
  } catch (error) { return apiAuthenticationFailure(error) ?? vaultFailure(error); }
}

export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const owner = await requireInnerVault(request);
    const now = Date.now();
    const result = await owner.admin.from("inner_vault_sessions").update({ last_seen_at: new Date(now).toISOString() })
      .eq("user_id", owner.userId).eq("outer_token_hash", owner.hash).eq("token_hash", owner.innerHash)
      .gt("last_seen_at", new Date(now - 300_000).toISOString()).gt("expires_at", new Date(now).toISOString())
      .select("user_id").maybeSingle();
    if (result.error) throw new VaultError(503, "验证暂时不可用。");
    if (!result.data) throw new InnerLocked();
    return Response.json({ unlocked: true }, { headers: vaultHeaders });
  } catch (error) { return apiAuthenticationFailure(error) ?? innerFailure(error) ?? vaultFailure(error); }
}

export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const owner = await requireVault(request);
    const token = request.headers.get("x-vault-inner");
    if (validVaultToken(token)) {
      const result = await owner.admin.from("inner_vault_sessions").delete()
        .eq("user_id", owner.userId).eq("outer_token_hash", owner.hash).eq("token_hash", tokenHash(token));
      if (result.error) throw new VaultError(503, "服务端锁定尚未确认。");
    }
    return Response.json({ locked: true }, { headers: vaultHeaders });
  } catch (error) { return apiAuthenticationFailure(error) ?? vaultFailure(error); }
}

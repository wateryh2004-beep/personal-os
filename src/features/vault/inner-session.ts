import "server-only";
import { tokenHash, validVaultToken, vaultSessionActive } from "./crypto";
import { requireVault, VaultError } from "./server";

export class InnerLocked extends VaultError {
  constructor() { super(423, "请重新验证内层口令。"); }
}

export async function requireInnerVault(request: Request) {
  const outer = await requireVault(request);
  const token = request.headers.get("x-vault-inner");
  if (!validVaultToken(token)) throw new InnerLocked();
  const hash = tokenHash(token);
  const result = await outer.admin.from("inner_vault_sessions").select("expires_at,last_seen_at")
    .eq("user_id", outer.userId).eq("outer_token_hash", outer.hash).eq("token_hash", hash).maybeSingle();
  if (result.error) throw new VaultError(503, "内层文件暂不可用。");
  if (!result.data || !vaultSessionActive(result.data)) throw new InnerLocked();
  return { ...outer, innerHash: hash };
}

export type InnerOwner = Awaited<ReturnType<typeof requireInnerVault>>;
export const innerSessionArgs = (owner: InnerOwner) => ({
  p_user_id: owner.userId, p_outer: owner.hash, p_login: owner.login, p_inner: owner.innerHash,
});

export async function assertInnerVault(owner: InnerOwner) {
  const result = await owner.admin.rpc("inner_vault_assert_session", innerSessionArgs(owner));
  if (result.error) throwInnerDatabaseError(result.error.message);
}

export function throwInnerDatabaseError(message: string): never {
  if (message.includes("inner_vault_locked")) throw new InnerLocked();
  if (message.includes("vault_locked")) throw new VaultError(423, "需要重新验证。");
  if (message.includes("inner_vault_upload_limit")) throw new VaultError(409, "待上传文件已达上限，请先完成或取消旧上传。");
  throw new VaultError(503, "内层文件暂不可用，请稍后重试。");
}

export function innerFailure(error: unknown) {
  return error instanceof InnerLocked
    ? Response.json({ error: error.message }, { status: error.status, headers: {
      "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer", "X-Vault-Locked": "inner",
    } })
    : null;
}

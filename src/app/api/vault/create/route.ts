import { z } from "zod";
import { apiAuthenticationFailure } from "@/lib/auth/require-owner";
import { readVaultJson, requireVault, sameOrigin, sessionArgs, VaultError, vaultFailure, vaultHeaders } from "@/features/vault/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ kind: z.enum(["note", "note_folder", "file_folder"]), folderId: z.string().uuid().nullable(), name: z.string().trim().min(1).max(120) });
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const owner = await requireVault(request);
    const input = schema.safeParse(await readVaultJson(request, 4096));
    if (!input.success) throw new VaultError(400, "名称或文件夹无效。");
    const result = await owner.admin.rpc("vault_create_item", { ...sessionArgs(owner), p_kind: input.data.kind, p_folder: input.data.folderId, p_name: input.data.name });
    if (result.error) throw new VaultError(result.error.message.includes("vault_locked") ? 423 : 409, "新建未完成，请检查名称和当前状态。");
    return Response.json({ id: result.data }, { headers: vaultHeaders });
  } catch (error) { return apiAuthenticationFailure(error) ?? vaultFailure(error); }
}

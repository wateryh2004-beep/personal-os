import { z } from "zod";
import { apiAuthenticationFailure } from "@/lib/auth/require-owner";
import { readR2ObjectStream } from "@/lib/adapters/cloudflare-r2";
import { requireVault, VaultError, vaultFailure, vaultHeaders } from "@/features/vault/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const owner = await requireVault(request);
    const { documentId } = await params;
    if (!z.string().uuid().safeParse(documentId).success) throw new VaultError(404, "文件不可用。");
    const result = await owner.admin.from("documents").select("id,storage_path,storage_bucket,storage_provider,mime_type,file_size")
      .eq("id", documentId).eq("user_id", owner.userId).not("vault_group_id", "is", null).eq("storage_state", "available").maybeSingle();
    if (result.error) throw new VaultError(503, "读取失败。");
    const file = result.data;
    if (!file || !file.storage_path.startsWith(`${owner.userId}/`)) throw new VaultError(404, "文件不可用。");
    if (file.storage_provider !== "cloudflare_r2") throw new VaultError(415, "此历史存储来源暂不支持暗格预览。");
    const object = await readR2ObjectStream(file.storage_path, request.signal);
    return new Response(object.body, { headers: { ...vaultHeaders, "Content-Type": file.mime_type, "Content-Length": String(object.size),
      "Content-Security-Policy": "sandbox", "Content-Disposition": "attachment; filename=\"document\"" } });
  } catch (error) { return apiAuthenticationFailure(error) ?? vaultFailure(error); }
}

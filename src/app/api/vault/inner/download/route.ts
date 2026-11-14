import { z } from "zod";
import { apiAuthenticationFailure } from "@/lib/auth/require-owner";
import { innerFailure, requireInnerVault } from "@/features/vault/inner-session";
import { innerUploads } from "@/features/vault/inner-uploads";
import { readVaultJson, sameOrigin, vaultFailure, VaultError, vaultHeaders } from "@/features/vault/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const owner = await requireInnerVault(request);
    const input = z.object({ id: z.uuid() }).strict().safeParse(await readVaultJson(request, 4096));
    if (!input.success) throw new VaultError(400, "文件标识无效。");
    return Response.json({ url: await innerUploads(owner).download(input.data.id) }, { headers: vaultHeaders });
  } catch (error) { return apiAuthenticationFailure(error) ?? innerFailure(error) ?? vaultFailure(error); }
}

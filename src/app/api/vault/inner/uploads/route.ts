import { z } from "zod";
import { apiAuthenticationFailure } from "@/lib/auth/require-owner";
import { innerPartLimit } from "@/features/vault/inner-contract";
import { innerFailure, requireInnerVault } from "@/features/vault/inner-session";
import { innerUploads } from "@/features/vault/inner-uploads";
import { readVaultJson, sameOrigin, vaultFailure, VaultError, vaultHeaders } from "@/features/vault/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const id = z.uuid();
const operation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sign"), id, partNumber: z.number().int().min(1).max(innerPartLimit) }).strict(),
  z.object({ action: z.literal("complete"), id }).strict(),
  z.object({ action: z.literal("cancel"), id }).strict(),
]);
const cursor = z.object({ created: z.iso.datetime({ offset: true }), id });

export async function GET(request: Request) {
  try {
    const owner = await requireInnerVault(request);
    const params = new URL(request.url).searchParams;
    const page = params.has("created") || params.has("id")
      ? cursor.safeParse({ created: params.get("created"), id: params.get("id") }) : undefined;
    if (page && !page.success) throw new VaultError(400, "分页参数无效。");
    return Response.json(await innerUploads(owner).list(page?.data), { headers: vaultHeaders });
  } catch (error) { return apiAuthenticationFailure(error) ?? innerFailure(error) ?? vaultFailure(error); }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const owner = await requireInnerVault(request);
    return Response.json(await innerUploads(owner).create(await readVaultJson(request, 4096)), { headers: vaultHeaders });
  } catch (error) { return apiAuthenticationFailure(error) ?? innerFailure(error) ?? vaultFailure(error); }
}

export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const owner = await requireInnerVault(request);
    const input = operation.safeParse(await readVaultJson(request, 4096));
    if (!input.success) throw new VaultError(400, "上传请求无效。");
    const value = input.data, uploads = innerUploads(owner);
    if (value.action === "sign") return Response.json(await uploads.sign(value.id, value.partNumber), { headers: vaultHeaders });
    if (value.action === "complete") {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(285_000)]);
      return Response.json(await uploads.complete(value.id, signal), { headers: vaultHeaders });
    }
    await uploads.cancel(value.id);
    return Response.json({ cancelled: true }, { headers: vaultHeaders });
  } catch (error) { return apiAuthenticationFailure(error) ?? innerFailure(error) ?? vaultFailure(error); }
}

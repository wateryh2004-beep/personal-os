import { z } from "zod";
import { NextResponse } from "next/server";
import { apiAuthenticationFailure } from "@/lib/auth/require-owner";
import { issueInnerDownload, innerDownloadCookie, innerDownloadLifetime } from "@/features/vault/inner-download";
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
    await innerUploads(owner).downloadFile(input.data.id);
    const { path, grant } = issueInnerDownload(owner, input.data.id);
    const response = NextResponse.json({ url: new URL(path, request.url).href }, { headers: vaultHeaders });
    response.cookies.set(innerDownloadCookie, grant, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path, maxAge: innerDownloadLifetime,
    });
    return response;
  } catch (error) { return apiAuthenticationFailure(error) ?? innerFailure(error) ?? vaultFailure(error); }
}

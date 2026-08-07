import { NextResponse } from "next/server";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { createDownloadUrl, isR2Configured } from "@/lib/adapters/cloudflare-r2";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { documentId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(documentId) || !isR2Configured()) return NextResponse.json({ error: "文件暂时不可用。" }, { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } });
    const { supabase } = await requireOwnerApi();
    const { data: file } = await supabase.from("documents").select("storage_path,original_filename").eq("id", documentId).eq("storage_provider", "cloudflare_r2").eq("storage_state", "available").is("archived_at", null).maybeSingle();
    if (!file) return NextResponse.json({ error: "文件不存在或无权访问。" }, { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } });
    return NextResponse.redirect(await createDownloadUrl(file.storage_path, file.original_filename), { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ error: "文件下载暂时不可用。" }, { status: 500, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}

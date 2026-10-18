import { NextResponse } from "next/server";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { readR2ObjectStream, isR2Configured } from "@/lib/adapters/cloudflare-r2";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { documentId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(documentId) || !isR2Configured()) return NextResponse.json({ error: "文件暂时不可用。" }, { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } });
    const { supabase } = await requireOwnerApi();
    const { data: file } = await supabase.from("documents").select("storage_path,original_filename,mime_type").eq("id", documentId).eq("storage_provider", "cloudflare_r2").eq("storage_state", "available").is("archived_at", null).maybeSingle();
    if (!file) return NextResponse.json({ error: "文件不存在或无权访问。" }, { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } });
    const inline = new URL(request.url).searchParams.get("inline") === "1";
    const object = await readR2ObjectStream(file.storage_path, request.signal);
    const safeInline = inline && ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"].includes(file.mime_type);
    return new Response(object.body, { headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox", "Content-Type": file.mime_type, "Content-Length": String(object.size), "Content-Disposition": `${safeInline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.original_filename)}` } });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ error: "文件下载暂时不可用。" }, { status: 500, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}

import { NextResponse } from "next/server";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { extractDocumentForOwner } from "@/features/files/extraction-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(documentId))
      return NextResponse.json({ error: "文件标识无效。" }, { status: 400, headers });
    const { supabase, userId } = await requireOwnerApi();
    const result = await extractDocumentForOwner({ supabase, userId, documentId });
    const status = result.status === "failed" ? 422 : 200;
    return NextResponse.json(result, { status, headers });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json(
      { error: "文件不存在、尚未上传完成或无权访问。" },
      { status: 404, headers },
    );
  }
}

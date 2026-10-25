import { NextResponse } from "next/server";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { getNoteDocument } from "@/features/notes/queries";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
export async function GET(_request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  try {
    const owner = await requireOwnerApi();
    const { noteId } = await params;
    const data = await getNoteDocument(noteId, owner);
    return data ? NextResponse.json(data, { headers }) : NextResponse.json({ error: "笔记不存在。" }, { status: 404, headers });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ error: "笔记暂时无法读取，请重试。" }, { status: 503, headers });
  }
}

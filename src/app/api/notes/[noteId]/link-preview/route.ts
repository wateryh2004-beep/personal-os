import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { getNoteLinkPreview } from "@/features/notes/links/queries";

const noteIdSchema = z.string().uuid();

export async function GET(_: Request, { params }: { params: Promise<{ noteId: string }> }) {
  try {
    const { noteId } = await params;
    if (!noteIdSchema.safeParse(noteId).success) return NextResponse.json({ error: "笔记标识无效。" }, { status: 400 });
    const { supabase, userId } = await requireOwnerApi();
    const note = await getNoteLinkPreview(supabase, userId, noteId);
    if (!note) return NextResponse.json({ error: "笔记不存在或已删除。" }, { status: 404 });
    return NextResponse.json({ note }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ error: "暂时无法读取笔记预览。" }, { status: 503 });
  }
}

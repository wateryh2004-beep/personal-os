import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerApi, apiAuthenticationFailure } from "@/lib/auth/require-owner";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const uuid = z.string().uuid();

/** Read-only, owner-scoped history comparison. Never return versions in list metadata. */
export async function GET(request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  try {
    const { noteId } = await params;
    const versionId = new URL(request.url).searchParams.get("versionId");
    if (!uuid.safeParse(noteId).success || !uuid.safeParse(versionId).success)
      return NextResponse.json({ error: "无效的版本标识。" }, { status: 400, headers });
    const { supabase, userId } = await requireOwnerApi();
    const [current, saved] = await Promise.all([
      supabase.from("notes").select("id,title,body_markdown,revision")
        .eq("user_id", userId).eq("id", noteId).maybeSingle(),
      supabase.from("note_versions").select("id,title,body_markdown,version_number,created_at")
        .eq("user_id", userId).eq("note_id", noteId).eq("id", versionId!).maybeSingle(),
    ]);
    if (current.error || saved.error)
      return NextResponse.json({ error: "暂时无法读取历史版本。" }, { status: 503, headers });
    if (!current.data || !saved.data)
      return NextResponse.json({ error: "笔记或历史版本不存在。" }, { status: 404, headers });
    return NextResponse.json({
      current: { title: current.data.title, body: current.data.body_markdown, revision: current.data.revision ?? 0 },
      historical: { id: saved.data.id, title: saved.data.title, body: saved.data.body_markdown,
        versionNumber: saved.data.version_number, createdAt: saved.data.created_at },
    }, { headers });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ error: "历史版本读取失败。" }, { status: 503, headers });
  }
}

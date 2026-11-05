import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerApi, apiAuthenticationFailure } from "@/lib/auth/require-owner";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const uuid = z.string().uuid();

/** Versions are private read-only snapshots. Never cache or expose cross-owner bodies. */
export async function GET(_request: Request, { params }: { params: Promise<{ noteId: string; versionId: string }> }) {
  try {
    const { supabase, userId } = await requireOwnerApi();
    const { noteId, versionId } = await params;
    if (!uuid.safeParse(noteId).success || !uuid.safeParse(versionId).success)
      return NextResponse.json({ error: "无效版本标识。" }, { status: 400, headers });
    const note = await supabase.from("notes").select("id").eq("id", noteId).eq("user_id", userId).maybeSingle();
    if (note.error) throw new Error("note_lookup_failed");
    if (!note.data) return NextResponse.json({ error: "笔记不存在。" }, { status: 404, headers });
    const { data: version, error } = await supabase.from("note_versions")
      .select("id,title,body_markdown,version_number,created_at,reason")
      .eq("id", versionId).eq("note_id", noteId).eq("user_id", userId).maybeSingle();
    if (error) throw new Error("version_read_failed");
    if (!version) return NextResponse.json({ error: "版本不存在。" }, { status: 404, headers });
    return NextResponse.json({
      version: { id: version.id, title: version.title, body: version.body_markdown,
        versionNumber: version.version_number, createdAt: version.created_at, reason: version.reason ?? "snapshot" },
    }, { headers });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ error: "无法读取版本正文。" }, { status: 503, headers });
  }
}

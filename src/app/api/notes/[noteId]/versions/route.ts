import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerApi, apiAuthenticationFailure } from "@/lib/auth/require-owner";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const uuid = z.string().uuid();
const pageSize = 20;

/** Only metadata is listed; historical private bodies load on deliberate click. */
export async function GET(request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  try {
    const { supabase, userId } = await requireOwnerApi();
    const { noteId } = await params;
    if (!uuid.safeParse(noteId).success) return NextResponse.json({ error: "无效笔记标识。" }, { status: 400, headers });
    const url = new URL(request.url);
    const rawBefore = url.searchParams.get("before");
    const before = rawBefore && /^[1-9]\d{0,9}$/.test(rawBefore) ? Number(rawBefore) : null;
    if (rawBefore && before === null) return NextResponse.json({ error: "无效分页游标。" }, { status: 400, headers });
    const note = await supabase.from("notes").select("id").eq("id", noteId).eq("user_id", userId).maybeSingle();
    if (note.error) throw new Error("note_lookup_failed");
    if (!note.data) return NextResponse.json({ error: "笔记不存在。" }, { status: 404, headers });
    let query = supabase.from("note_versions").select("id,version_number,reason,created_at,revision")
      .eq("note_id", noteId).eq("user_id", userId)
      .order("version_number", { ascending: false }).limit(pageSize + 1);
    if (before !== null) query = query.lt("version_number", before);
    const { data, error } = await query;
    if (error) throw new Error("version_list_failed");
    const versions = (data ?? []).slice(0, pageSize);
    return NextResponse.json({
      versions: versions.map(version => ({
        id: version.id, versionNumber: version.version_number,
        reason: version.reason ?? "snapshot", createdAt: version.created_at, revision: version.revision ?? null,
      })),
      nextBefore: (data?.length ?? 0) > pageSize ? versions.at(-1)?.version_number ?? null : null,
    }, { headers });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ error: "无法读取版本历史。" }, { status: 503, headers });
  }
}

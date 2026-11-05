import { NextResponse } from "next/server";
import { requireOwnerApi, apiAuthenticationFailure } from "@/lib/auth/require-owner";
import { markdownFilename } from "@/features/notes/utils";
import { renderNoteHtml } from "@/features/notes/export/html";

/** Export only a verified owner's persisted original Markdown. */
export async function GET(request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; img-src 'self' https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
  };
  try {
    const { supabase, userId } = await requireOwnerApi();
    const { noteId } = await params;
    const { data: note, error } = await supabase.from("notes")
      .select("id,title,body_markdown").eq("user_id", userId).eq("id", noteId).maybeSingle();
    if (error || !note) return NextResponse.json({ error: "笔记不存在或不可访问" }, { status: 404, headers });
    const { error: auditError } = await supabase.from("audit_logs").insert({
      user_id: userId, action: "export", entity_type: "note",
      entity_id: note.id, actor_type: "user", after_data: { format: "html" },
    });
    if (auditError) return NextResponse.json({ error: "导出审计失败" }, { status: 500, headers });
    const inline = new URL(request.url).searchParams.get("view") === "1";
    const document = renderNoteHtml({ title: note.title, markdown: note.body_markdown, printable: inline });
    const filename = markdownFilename(note.title).replace(/\.md$/i, ".html");
    return new Response(document, { headers: {
      ...headers, "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": inline ? "inline" : `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    } });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ error: "导出暂不可用" }, { status: 500, headers });
  }
}
